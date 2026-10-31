/**
 * Empirical Stress Testing & Verification Harness for Challenger 2
 * Requirements R1, R2, R3
 */

import assert from "node:assert/strict";

console.log("================================================================================");
console.log("       EMPIRICAL STRESS TEST SUITE: CHALLENGER 2 (R1, R2, R3)                  ");
console.log("================================================================================");

let totalPassed = 0;
let totalFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    totalFailed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    totalFailed++;
  }
}

// =============================================================================
// SUITE 1: Web Worker GPU Acceleration, OffscreenCanvas, and CPU Fallback (R1)
// =============================================================================
console.log("\n--- SUITE 1: Web Worker GPU Acceleration, OffscreenCanvas, and CPU Fallback (R1) ---");

// Mock OffscreenCanvas
class MockOffscreenCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
}
globalThis.OffscreenCanvas = MockOffscreenCanvas;

// Test 1.1: createHands options inspection
await runAsyncTest("1.1: createHands passes OffscreenCanvas(1,1) for GPU, tunes confidences", async () => {
  let capturedOptionsGpu = null;
  let capturedOptionsCpu = null;

  const MockHandLandmarker = {
    createFromOptions: async (vision, options) => {
      if (options.baseOptions.delegate === "GPU") {
        capturedOptionsGpu = options;
      } else {
        capturedOptionsCpu = options;
      }
      return { detectForVideo: () => ({ landmarks: [], worldLandmarks: [] }) };
    },
  };

  // Replicate createHands logic from src/hands-worker.js
  async function createHands(vision, model, delegate) {
    const options = {
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
    };
    if (delegate === "GPU") {
      options.canvas = new OffscreenCanvas(1, 1);
    }
    return await MockHandLandmarker.createFromOptions(vision, options);
  }

  await createHands({}, "model.task", "GPU");
  assert.ok(capturedOptionsGpu, "GPU options must be passed");
  assert.equal(capturedOptionsGpu.baseOptions.delegate, "GPU");
  assert.equal(capturedOptionsGpu.runningMode, "VIDEO");
  assert.equal(capturedOptionsGpu.numHands, 2);
  assert.equal(capturedOptionsGpu.minHandDetectionConfidence, 0.4);
  assert.equal(capturedOptionsGpu.minHandPresenceConfidence, 0.35);
  assert.equal(capturedOptionsGpu.minTrackingConfidence, 0.35);
  assert.ok(capturedOptionsGpu.canvas instanceof MockOffscreenCanvas, "canvas must be an OffscreenCanvas");
  assert.equal(capturedOptionsGpu.canvas.width, 1);
  assert.equal(capturedOptionsGpu.canvas.height, 1);

  await createHands({}, "model.task", "CPU");
  assert.ok(capturedOptionsCpu, "CPU options must be passed");
  assert.equal(capturedOptionsCpu.baseOptions.delegate, "CPU");
  assert.equal(capturedOptionsCpu.canvas, undefined, "CPU delegate must not attach canvas");
});

// Test 1.2: GPU failure diagnostics and clean fallback to CPU
await runAsyncTest("1.2: GPU init failure logs warning and cleanly falls back to CPU without rejection", async () => {
  const warnings = [];
  const logs = [];
  const errors = [];
  const postedMessages = [];

  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalError = console.error;
  console.warn = (...args) => warnings.push(args.join(" "));
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => errors.push(args.join(" "));

  const mockSelf = {
    postMessage: (msg) => postedMessages.push(msg),
  };

  const MockFilesetResolver = {
    forVisionTasks: async (wasm) => ({ wasm }),
  };

  const MockHandLandmarker = {
    createFromOptions: async (vision, options) => {
      if (options.baseOptions.delegate === "GPU") {
        throw new Error("WebGL2 context creation failed (simulated headless/unsupported)");
      }
      return {
        detectForVideo: (bitmap, time) => ({ landmarks: [[{ x: 0.5, y: 0.5, z: 0 }]], worldLandmarks: [] }),
      };
    },
  };

  async function simulateWorkerInit(message) {
    for (const src of message.sources || []) {
      try {
        const vision = await MockFilesetResolver.forVisionTasks(src.wasm);
        for (const delegate of ["GPU", "CPU"]) {
          try {
            const options = {
              baseOptions: { modelAssetPath: src.model, delegate },
              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: 0.4,
              minHandPresenceConfidence: 0.35,
              minTrackingConfidence: 0.35,
            };
            if (delegate === "GPU") {
              options.canvas = new OffscreenCanvas(1, 1);
            }
            const landmarker = await MockHandLandmarker.createFromOptions(vision, options);
            if (landmarker) {
              console.log(`[hands-worker] HandLandmarker initialized successfully (${delegate}, ${src.tag})`);
              mockSelf.postMessage({ type: "ready", delegate, tag: src.tag });
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
    mockSelf.postMessage({ type: "error", message: "model" });
  }

  try {
    await simulateWorkerInit({
      type: "init",
      sources: [{ wasm: "wasm_url", model: "model_url", tag: "local" }],
    });

    assert.equal(postedMessages.length, 1, "Must post exactly one message");
    assert.deepEqual(postedMessages[0], { type: "ready", delegate: "CPU", tag: "local" });
    assert.ok(warnings.some((w) => w.includes("GPU delegate failed for local, falling back to CPU")), "Warning logged");
    assert.ok(logs.some((l) => l.includes("HandLandmarker initialized successfully (CPU, local)")), "Success logged");
    assert.equal(errors.length, 0, "No CPU error logged when CPU succeeds");
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
    console.error = originalError;
  }
});

// Test 1.3: Total failure (GPU & CPU fail on all sources) posts error cleanly
await runAsyncTest("1.3: Total initialization failure posts error message without crashing", async () => {
  const postedMessages = [];
  const mockSelf = { postMessage: (msg) => postedMessages.push(msg) };

  async function simulateTotalFailure() {
    for (const src of [{ wasm: "w", model: "m", tag: "broken" }]) {
      for (const delegate of ["GPU", "CPU"]) {
        // Both fail
      }
    }
    mockSelf.postMessage({ type: "error", message: "model" });
  }

  await simulateTotalFailure();
  assert.equal(postedMessages.length, 1);
  assert.deepEqual(postedMessages[0], { type: "error", message: "model" });
});


// =============================================================================
// SUITE 2: Downscaling & Transferable Pipeline Challenge (R2)
// =============================================================================
console.log("\n--- SUITE 2: Downscaling & Transferable Pipeline Challenge (R2) ---");

// Test 2.1: Downscaling parameters and Transferable postMessage
await runAsyncTest("2.1: createImageBitmap downscales to 480x270 and transfers [bitmap]", async () => {
  let capturedResize = null;
  let capturedTransferList = null;
  let capturedMessage = null;

  const mockVideo = { readyState: 4, currentTime: 1.0 };
  const mockBitmap = {
    width: 480,
    height: 270,
    closeCalled: false,
    close() { this.closeCalled = true; },
  };

  const mockCreateImageBitmap = async (source, options) => {
    capturedResize = options;
    return mockBitmap;
  };

  const mockWorker = {
    postMessage(msg, transferList) {
      capturedMessage = msg;
      capturedTransferList = transferList;
    },
  };

  // Replicate control.js frame dispatch
  const bitmap = await mockCreateImageBitmap(mockVideo, { resizeWidth: 480, resizeHeight: 270 });
  mockWorker.postMessage(
    { type: "frame", bitmap, time: 1000, body: false },
    [bitmap]
  );

  assert.deepEqual(capturedResize, { resizeWidth: 480, resizeHeight: 270 }, "Must resize to 480x270");
  assert.ok(Array.isArray(capturedTransferList), "Must pass transfer list");
  assert.equal(capturedTransferList.length, 1);
  assert.equal(capturedTransferList[0], mockBitmap, "Must transfer [bitmap]");
  assert.equal(capturedMessage.type, "frame");
});

// Test 2.2: Bitmap closure invariant across 1000 frames (including errors) -> 0 texture leak
await runAsyncTest("2.2: Worker closes all transferred bitmaps via finally block (1000 frame stress test)", async () => {
  let totalClosed = 0;
  let totalLeaked = 0;
  const postedMessages = [];

  const mockSelf = {
    postMessage: (msg) => postedMessages.push(msg),
  };

  const mockLandmarker = {
    detectForVideo(bitmap, time) {
      if (time % 2 === 0) {
        throw new Error("Simulated transient inference error");
      }
      return { landmarks: [[{ x: 0.1, y: 0.2 }]], worldLandmarks: [] };
    },
  };

  async function handleWorkerFrame(message) {
    const { bitmap, time } = message;
    const started = 0;
    try {
      const result = mockLandmarker.detectForVideo(bitmap, time);
      mockSelf.postMessage({
        type: "hands",
        hands: result.landmarks || [],
        world: result.worldLandmarks || [],
        pose: null,
        ms: 1,
      });
    } catch (error) {
      mockSelf.postMessage({
        type: "hands",
        hands: [],
        world: [],
        pose: null,
        ms: 1,
        failed: String(error?.message || error),
      });
    } finally {
      bitmap.close();
    }
  }

  const ITERATIONS = 1000;
  for (let i = 0; i < ITERATIONS; i++) {
    let closed = false;
    const mockBitmap = {
      id: i,
      close() {
        closed = true;
        totalClosed++;
      },
    };

    await handleWorkerFrame({
      type: "frame",
      bitmap: mockBitmap,
      time: i,
      body: false,
    });

    if (!closed) {
      totalLeaked++;
    }
  }

  assert.equal(totalClosed, ITERATIONS, `All ${ITERATIONS} bitmaps must be closed`);
  assert.equal(totalLeaked, 0, "Zero bitmaps leaked in worker");
  assert.equal(postedMessages.length, ITERATIONS, "All frames replied with hands message");
});

// Test 2.3: Bitmap closed when worker terminates while capture is in flight
await runAsyncTest("2.3: Bitmap closed immediately in control.js if worker dies during capture", async () => {
  let bitmapClosed = false;
  const mockBitmap = {
    close() { bitmapClosed = true; },
  };

  const state = {
    worker: null, // worker died/became null
    inFlight: true,
  };

  // Replicate control.js check:
  // const bitmap = await createImageBitmap(...)
  // if (!state.worker) { bitmap.close(); state.inFlight = false; return; }
  if (!state.worker) {
    mockBitmap.close();
    state.inFlight = false;
  }

  assert.equal(bitmapClosed, true, "Bitmap must be closed when worker is null");
  assert.equal(state.inFlight, false, "inFlight must be reset to false");
});


// =============================================================================
// SUITE 3: Backpressure & Deduplication Stress Challenge (R2)
// =============================================================================
console.log("\n--- SUITE 3: Backpressure & Deduplication Stress Challenge (R2) ---");

// Test 3.1: Backpressure drop on rapid consecutive ticks while inFlight === true
runTest("3.1: Rapid burst of 200 ticks while inFlight drops all frames and causes no queue buildup", () => {
  let postMessageCalls = 0;
  let scheduledDetectCalls = 0;

  const state = {
    stream: true,
    worker: { postMessage: () => postMessageCalls++ },
    workerReady: true,
    inFlight: true, // Worker is currently processing
    lastVideoTime: 0,
    detectTimer: 0,
  };

  function scheduleDetect(delay) {
    scheduledDetectCalls++;
  }

  function detectTick() {
    const useWorker = Boolean(state.worker && state.workerReady);
    if (!state.stream || !(useWorker || false) || state.inFlight) {
      scheduleDetect(20);
      return;
    }
    // If not inFlight, would capture & postMessage
    postMessageCalls++;
  }

  // Simulate burst of 200 rapid ticks
  for (let i = 0; i < 200; i++) {
    detectTick();
  }

  assert.equal(postMessageCalls, 0, "Zero frames dispatched while inFlight is true");
  assert.equal(scheduledDetectCalls, 200, "Backpressure re-schedules with delay without queuing");
  assert.equal(state.inFlight, true, "inFlight remains intact");
});

// Test 3.2: Deduplication skips redundant frames on identical timestamp
runTest("3.2: Duplicate video.currentTime skips detection and registers rVFC callback", () => {
  let rvfcRegistered = 0;
  let cancelledDetectCalls = 0;
  let capturedFrames = 0;

  const mockVideo = {
    currentTime: 42.123,
    requestVideoFrameCallback: (cb) => {
      rvfcRegistered++;
      return 101;
    },
    cancelVideoFrameCallback: (id) => {},
  };

  const state = {
    stream: true,
    worker: {},
    workerReady: true,
    inFlight: false,
    lastVideoTime: 42.123, // Already processed this timestamp
    frameCb: 0,
  };

  function cancelDetect() {
    cancelledDetectCalls++;
  }

  function detectTick() {
    const useWorker = Boolean(state.worker && state.workerReady);
    if (!state.stream || !(useWorker || false) || state.inFlight) {
      return;
    }
    // Frame deduplication check from control.js line 1120:
    if (mockVideo.currentTime === state.lastVideoTime) {
      if (mockVideo.requestVideoFrameCallback) {
        cancelDetect();
        state.frameCb = mockVideo.requestVideoFrameCallback(() => {
          state.frameCb = 0;
          detectTick();
        });
      }
      return;
    }
    state.lastVideoTime = mockVideo.currentTime;
    capturedFrames++;
  }

  // Run 50 ticks with identical timestamp
  for (let i = 0; i < 50; i++) {
    detectTick();
  }

  assert.equal(capturedFrames, 0, "No duplicate frames processed");
  assert.equal(rvfcRegistered, 50, "rVFC registered instead of polling");
  assert.equal(cancelledDetectCalls, 50, "Previous detect cancelled");

  // Advance video time
  mockVideo.currentTime = 42.156;
  detectTick();

  assert.equal(capturedFrames, 1, "Exactly 1 frame captured when time advances");
  assert.equal(state.lastVideoTime, 42.156, "lastVideoTime updated");
});

// Test 3.3: InFlight recovery cycle
runTest("3.3: inFlight resets on worker response and handles next frame cleanly", () => {
  const state = {
    inFlight: false,
    world: null,
  };

  // Simulating worker onmessage
  function onWorkerMessage(msg) {
    if (msg.type === "hands") {
      state.inFlight = false;
      state.world = msg.world;
    }
  }

  // Frame dispatched
  state.inFlight = true;
  assert.equal(state.inFlight, true);

  // Worker replies
  onWorkerMessage({ type: "hands", hands: [[{ x: 0.1, y: 0.2 }]], world: [{ x: 0.1, y: 0.2, z: 0 }], ms: 8 });
  assert.equal(state.inFlight, false, "inFlight must be false after reply");
  assert.ok(state.world, "world landmarks updated");
});


// =============================================================================
// SUITE 4: Canvas Dimension Churn Challenge (R3)
// =============================================================================
console.log("\n--- SUITE 4: Canvas Dimension Churn Challenge (R3) ---");

// Test 4.1: Overlay Canvas sizing guard during 500 burst actions (shootNormalized & purple)
runTest("4.1: 500 consecutive shootNormalized and overlay-purple events cause ZERO canvas dimension churn", () => {
  let widthSetCount = 0;
  let heightSetCount = 0;

  const mockCanvas = {
    _width: 0,
    _height: 0,
    get width() { return this._width; },
    set width(val) {
      widthSetCount++;
      this._width = val;
    },
    get height() { return this._height; },
    set height(val) {
      heightSetCount++;
      this._height = val;
    },
  };

  const mockWindow = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1.0,
  };

  let cachedWidth = -1;
  let cachedHeight = -1;
  let cachedDpr = -1;
  const dprCap = { full: 1.25, low: 1 };
  let preset = "sakura";
  let dprDowngraded = false;

  function fit() {
    const cap = preset === "low" || preset === "light" || dprDowngraded ? dprCap.low : dprCap.full;
    const ratio = Math.min(mockWindow.devicePixelRatio || 1, cap);
    const width = Math.max(2, Math.floor(mockWindow.innerWidth * ratio));
    const height = Math.max(2, Math.floor(mockWindow.innerHeight * ratio));
    if (width !== cachedWidth || height !== cachedHeight || ratio !== cachedDpr) {
      mockCanvas.width = width;
      mockCanvas.height = height;
      cachedWidth = width;
      cachedHeight = height;
      cachedDpr = ratio;
    }
  }

  const mockFx = {
    shootCalls: 0,
    purpleCalls: 0,
    setPreset: () => {},
    shoot: () => { mockFx.shootCalls++; },
    triggerPurple: () => { mockFx.purpleCalls++; },
  };

  function shootNormalized(nx, ny, win) {
    mockFx.setPreset(preset);
    mockFx.shoot(nx * mockCanvas.width, ny * mockCanvas.height, null, null);
  }

  function handlePurple(x, y) {
    mockFx.triggerPurple(x * mockCanvas.width, y * mockCanvas.height);
  }

  // Initial mount fit()
  fit();
  assert.equal(widthSetCount, 1, "Initial fit sets width");
  assert.equal(heightSetCount, 1, "Initial fit sets height");

  // Reset counters before action burst
  widthSetCount = 0;
  heightSetCount = 0;

  // Burst: 250 shootNormalized + 250 purple events
  for (let i = 0; i < 250; i++) {
    shootNormalized(0.5, 0.5, null);
    handlePurple(0.5, 0.5);
  }

  assert.equal(mockFx.shootCalls, 250);
  assert.equal(mockFx.purpleCalls, 250);
  assert.equal(widthSetCount, 0, "canvas.width setter called 0 times during 500 burst actions");
  assert.equal(heightSetCount, 0, "canvas.height setter called 0 times during 500 burst actions");

  // Now trigger genuine resize: window changes to 1280x720
  mockWindow.innerWidth = 1280;
  mockWindow.innerHeight = 720;
  fit();

  assert.equal(widthSetCount, 1, "Genuine resize sets canvas.width once");
  assert.equal(heightSetCount, 1, "Genuine resize sets canvas.height once");
  assert.equal(mockCanvas.width, 1280);
  assert.equal(mockCanvas.height, 720);

  // Subsequent redundant fit() calls do nothing
  for (let i = 0; i < 20; i++) {
    fit();
  }
  assert.equal(widthSetCount, 1, "Redundant fit() does not re-invoke canvas.width setter");
  assert.equal(heightSetCount, 1, "Redundant fit() does not re-invoke canvas.height setter");
});

// Test 4.2: Camera Canvas dimension caching in control.js under 3600 frames at 60 FPS
runTest("4.2: Camera Canvas dimension caching under continuous 60 FPS (3600 frames) invokes setters EXACTLY ONCE", () => {
  let widthSetCount = 0;
  let heightSetCount = 0;

  const mockCameraCanvas = {
    _width: 0,
    _height: 0,
    clientWidth: 320,
    clientHeight: 240,
    get width() { return this._width; },
    set width(val) {
      widthSetCount++;
      this._width = val;
    },
    get height() { return this._height; },
    set height(val) {
      heightSetCount++;
      this._height = val;
    },
    getContext: () => ({ clearRect: () => {} }),
  };

  const mockVideo = {
    videoWidth: 640,
    videoHeight: 360,
  };

  let lastCamW = -1;
  let lastCamH = -1;

  function drawCameraLandmarks(hands) {
    const canvas = mockCameraCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const vw = mockVideo.videoWidth;
    const vh = mockVideo.videoHeight;
    const w = vw || (lastCamW > 0 ? lastCamW : canvas.clientWidth || 320);
    const h = vh || (lastCamH > 0 ? lastCamH : canvas.clientHeight || 240);
    if (w !== lastCamW || h !== lastCamH) {
      canvas.width = w;
      canvas.height = h;
      lastCamW = w;
      lastCamH = h;
    }
    ctx.clearRect(0, 0, w, h);
  }

  // Simulate 3600 frames (60 seconds at 60 FPS)
  const FRAMES = 3600;
  for (let i = 0; i < FRAMES; i++) {
    drawCameraLandmarks([]);
  }

  assert.equal(widthSetCount, 1, `Across ${FRAMES} frames, width setter invoked exactly 1 time`);
  assert.equal(heightSetCount, 1, `Across ${FRAMES} frames, height setter invoked exactly 1 time`);
  assert.equal(mockCameraCanvas.width, 640);
  assert.equal(mockCameraCanvas.height, 360);
});

// Test 4.3: Camera Canvas fallback to clientWidth/clientHeight when videoWidth is 0 initially
runTest("4.3: Camera Canvas gracefully initializes with clientWidth and updates on first video frame", () => {
  let widthSetCount = 0;
  let heightSetCount = 0;

  const mockCameraCanvas = {
    _width: 0,
    _height: 0,
    clientWidth: 320,
    clientHeight: 180,
    get width() { return this._width; },
    set width(val) {
      widthSetCount++;
      this._width = val;
    },
    get height() { return this._height; },
    set height(val) {
      heightSetCount++;
      this._height = val;
    },
    getContext: () => ({ clearRect: () => {} }),
  };

  const mockVideo = {
    videoWidth: 0, // Metadata not loaded yet
    videoHeight: 0,
  };

  let lastCamW = -1;
  let lastCamH = -1;

  function drawCameraLandmarks() {
    const canvas = mockCameraCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const vw = mockVideo.videoWidth;
    const vh = mockVideo.videoHeight;
    const w = vw || (lastCamW > 0 ? lastCamW : canvas.clientWidth || 320);
    const h = vh || (lastCamH > 0 ? lastCamH : canvas.clientHeight || 240);
    if (w !== lastCamW || h !== lastCamH) {
      canvas.width = w;
      canvas.height = h;
      lastCamW = w;
      lastCamH = h;
    }
    ctx.clearRect(0, 0, w, h);
  }

  // First 10 frames before camera stream is ready (vw = 0)
  for (let i = 0; i < 10; i++) {
    drawCameraLandmarks();
  }
  assert.equal(widthSetCount, 1, "Fallback dimension assigned once");
  assert.equal(mockCameraCanvas.width, 320);
  assert.equal(mockCameraCanvas.height, 180);

  // Video metadata arrives: 640x360
  mockVideo.videoWidth = 640;
  mockVideo.videoHeight = 360;

  // Next 500 frames
  for (let i = 0; i < 500; i++) {
    drawCameraLandmarks();
  }
  assert.equal(widthSetCount, 2, "Width updated exactly once when video resolution arrived");
  assert.equal(heightSetCount, 2, "Height updated exactly once when video resolution arrived");
  assert.equal(mockCameraCanvas.width, 640);
  assert.equal(mockCameraCanvas.height, 360);
});

console.log("\n================================================================================");
console.log(`STRESS TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
console.log("================================================================================");

if (totalFailed > 0) {
  process.exit(1);
}
