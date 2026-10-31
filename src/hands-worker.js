import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

let landmarker = null;

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "init") {
    try {
      const vision = await FilesetResolver.forVisionTasks(message.wasm);
      landmarker = await createLandmarker(vision, message.model, "GPU");
      let delegate = "GPU";
      if (!landmarker) {
        landmarker = await createLandmarker(vision, message.model, "CPU");
        delegate = "CPU";
      }
      if (!landmarker) throw new Error("model");
      self.postMessage({ type: "ready", delegate });
    } catch (error) {
      self.postMessage({ type: "error", message: String(error?.message || error) });
    }
    return;
  }

  if (message.type === "frame") {
    const started = performance.now();
    try {
      if (!landmarker) {
        message.bitmap?.close?.();
        self.postMessage({ type: "landmarks", landmarks: null, time: message.time, ms: 0 });
        return;
      }
      const result = landmarker.detectForVideo(message.bitmap, message.time);
      message.bitmap?.close?.();
      const landmarks = result.landmarks?.[0] ?? null;
      self.postMessage({
        type: "landmarks",
        landmarks,
        time: message.time,
        ms: performance.now() - started,
      });
    } catch (error) {
      message.bitmap?.close?.();
      self.postMessage({
        type: "landmarks",
        landmarks: null,
        time: message.time,
        ms: performance.now() - started,
        message: String(error?.message || error),
      });
    }
  }
};

async function createLandmarker(vision, model, delegate) {
  try {
    return await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: model,
        delegate,
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } catch {
    return null;
  }
}
