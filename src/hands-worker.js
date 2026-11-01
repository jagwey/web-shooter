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
let currentNumHands = 1;
let lastTimestampMs = 0;

async function createHands(vision, model, delegate) {
  const options = {
    baseOptions: { modelAssetPath: model, delegate },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
  };
  if (delegate === "GPU") {
    // When delegate === "GPU", pass options.canvas = new OffscreenCanvas(1, 1)
    // Ensures WebGL2 texture binding succeeds in Chromium Worker / WebView2.
    options.canvas = new OffscreenCanvas(1, 1);
  }
  return await HandLandmarker.createFromOptions(vision, options);
}

async function ensurePose() {
  if (pose || poseLoading) return;
  poseLoading = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(POSE_WASM);
    for (const delegate of ["GPU", "CPU"]) {
      try {
        const options = {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        };
        if (delegate === "GPU") {
          options.canvas = new OffscreenCanvas(1, 1);
        }
        pose = await PoseLandmarker.createFromOptions(vision, options);
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
    try {
      for (const src of message.sources || []) {
        try {
          const vision = await FilesetResolver.forVisionTasks(src.wasm);
          for (const delegate of ["GPU", "CPU"]) {
            try {
              landmarker = await createHands(vision, src.model, delegate);
              currentNumHands = 1;
              if (landmarker) {
                console.log(`[hands-worker] HandLandmarker initialized successfully (${delegate}, ${src.tag})`);
                self.postMessage({ type: "ready", delegate, tag: src.tag });
                return;
              }
            } catch (err) {
              if (delegate === "GPU") {
                console.warn(`[hands-worker] GPU delegate failed for ${src.tag}, falling back to CPU:`, err?.message || err);
              } else {
                console.error(`[hands-worker] CPU delegate failed for ${src.tag}:`, err?.message || err);
              }
            }
          }
        } catch (srcErr) {
          console.warn(`[hands-worker] Vision tasks resolver failed for ${src.tag}:`, srcErr?.message || srcErr);
        }
      }
    } catch (fatalErr) {
      console.error("[hands-worker] Fatal init error:", fatalErr);
    }
    self.postMessage({ type: "error", message: "model" });
    return;
  }

  if (message.type === "frame") {
    const { bitmap, time } = message;
    const started = performance.now();
    try {
      const numHands = message.numHands === 1 ? 1 : 2;
      if (numHands !== currentNumHands) {
        await landmarker.setOptions({ numHands });
        currentNumHands = numHands;
      }
      // detectForVideo throws on non-increasing timestamps (two frames inside the same ms).
      const safeTime = Math.max(lastTimestampMs + 1, Math.floor(time ?? performance.now()));
      lastTimestampMs = safeTime;
      const result = landmarker.detectForVideo(bitmap, safeTime);
      let body = null;
      if (message.body) {
        if (!pose) ensurePose();
        else if (safeTime - poseAt >= POSE_GAP_MS) {
          body = pose.detectForVideo(bitmap, safeTime + 1).landmarks?.[0] || null;
          poseAt = safeTime;
        }
      }
      self.postMessage({
        type: "hands",
        hands: result.landmarks || [],
        world: result.worldLandmarks || [],
        pose: body,
        ms: performance.now() - started,
        handedness: (result.handedness || result.handednesses || []).map((c) => (c && c[0] && c[0].categoryName) || ""),
        time: time ?? performance.now(),
      });
    } catch (error) {
      self.postMessage({ type: "hands", hands: [], world: [], pose: null, ms: performance.now() - started, failed: String(error?.message || error) });
    } finally {
      bitmap.close();
    }
  }
};
