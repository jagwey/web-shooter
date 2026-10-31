import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";

// tasks-vision loads its wasm glue with importScripts when that exists; in a module worker it
// exists but throws. Sync XHR + global eval does the same job (CSP allows 'unsafe-eval').
self.importScripts = (...urls) => {
  for (const url of urls) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send();
    if (xhr.status && xhr.status >= 400) throw new Error(`importScripts ${url}: ${xhr.status}`);
    (0, eval)(xhr.responseText);
  }
};

const POSE_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const POSE_GAP_MS = 80;

let landmarker = null;
let pose = null;
let poseLoading = false;
let poseAt = 0;

async function createHands(vision, model, delegate) {
  try {
    return await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      // Higher than the old 0.3: fewer ghost hands, and tracking (cheap path) still holds a real hand.
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    });
  } catch {
    return null;
  }
}

async function ensurePose() {
  if (pose || poseLoading) return;
  poseLoading = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(POSE_WASM);
    for (const delegate of ["GPU", "CPU"]) {
      try {
        pose = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        break;
      } catch {
        // next delegate
      }
    }
  } catch {
    // pose stays optional
  }
  poseLoading = false;
}

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "init") {
    for (const src of message.sources || []) {
      try {
        const vision = await FilesetResolver.forVisionTasks(src.wasm);
        for (const delegate of ["GPU", "CPU"]) {
          landmarker = await createHands(vision, src.model, delegate);
          if (landmarker) {
            self.postMessage({ type: "ready", delegate, tag: src.tag });
            return;
          }
        }
      } catch {
        // next source
      }
    }
    self.postMessage({ type: "error", message: "model" });
    return;
  }

  if (message.type === "frame") {
    const { bitmap, time } = message;
    const started = performance.now();
    try {
      const result = landmarker.detectForVideo(bitmap, time);
      let body = null;
      if (message.body) {
        if (!pose) ensurePose();
        else if (time - poseAt >= POSE_GAP_MS) {
          body = pose.detectForVideo(bitmap, time + 1).landmarks?.[0] || null;
          poseAt = time;
        }
      }
      self.postMessage({
        type: "hands",
        hands: result.landmarks || [],
        world: result.worldLandmarks || [],
        pose: body,
        ms: performance.now() - started,
      });
    } catch (error) {
      self.postMessage({ type: "hands", hands: [], world: [], pose: null, ms: performance.now() - started, failed: String(error?.message || error) });
    } finally {
      bitmap.close();
    }
  }
};
