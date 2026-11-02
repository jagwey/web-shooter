import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/control.js", import.meta.url), "utf8");
function functionSource(name) {
  const starts = [...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
  const index = starts.findIndex(m => m[1] === name);
  assert.ok(index >= 0, `function ${name} exists`);
  return source.slice(starts[index].index, starts[index + 1]?.index ?? source.length)
    .replaceAll("import.meta.url", "location.href");
}

function harness(names, overrides = {}) {
  let timerId = 0;
  const timers = new Map();
  const workers = [];
  const elements = new Map();
  const state = { settings: { cameraDeviceId: "camera", targetFps: 60 }, stream: { getTracks: () => [] }, hands: [], worker: null, workerReady: false, cameraWanted: true, cameraToken: 1 };
  class FakeWorker {
    constructor() { workers.push(this); }
    postMessage(message) {
      this.lastMessage = message;
      if (message.type === "init") queueMicrotask(() => this.onmessage({ data: { type: "ready", tag: "test", delegate: "CPU" } }));
    }
    terminate() { this.terminated = true; }
  }
  const ctx = vm.createContext({
    state, URL, location: { href: "http://localhost/" }, performance,
    console: { log() {}, warn() {}, error() {} },
    Worker: FakeWorker, WORKER_BOOT_MS: 15000, WORKER_FRAME_MS: 3000,
    landmarker: null, landmarkerPromise: null, workerFrameTimer: 0, activeFrame: 0,
    workerFailures: 0, cancelWorkerBoot: null,
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
    t: x => x, cancelGrab() {}, render() {}, setMessage() {},
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    video: { srcObject: null, play: async () => {}, currentTime: 1, readyState: 2 },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    cancelDetect() {}, scheduleDetect() {}, describeCamera: async () => {},
    listCameras: async () => {}, describeHolders: async () => {},
    ...overrides,
  });
  ctx.window = ctx;
  for (const name of names) vm.runInContext(functionSource(name), ctx);
  return { ctx, state, timers, workers, elements };
}

const tracking = ["stopWorker", "recoverWorker", "startWorker", "ensureLandmarker"];
const camera = ["startCamera", "stopCamera", "stopTracks", "cameraErrorKey"];
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("concurrent model requests share a boot; a terminated worker is replaced", async () => {
  const { ctx, workers } = harness(tracking);
  const [a, b] = await Promise.all([ctx.ensureLandmarker(), ctx.ensureLandmarker()]);
  assert.equal(a, b);
  assert.equal(workers.length, 1);
  assert.equal(ctx.landmarkerPromise, null);
  ctx.stopWorker();
  const replacement = await ctx.ensureLandmarker();
  assert.notEqual(replacement, a);
  assert.equal(a.terminated, true);
  assert.equal(workers.length, 2);
});

test("worker crashes retry on CPU and stop safely after the bounded retry budget", async () => {
  const { ctx, state, workers } = harness([...tracking, ...camera]);
  await ctx.ensureLandmarker();
  workers[0].onerror({ message: "GPU lost" });
  await flush();
  assert.equal(workers[1].lastMessage.cpuOnly, true);
  workers[1].onerror({ message: "failed again" });
  await flush();
  assert.equal(workers.length, 3);
  workers[2].onerror({ message: "still failed" });
  await flush();
  assert.equal(state.stream, null);
  assert.equal(state.worker, null);
});

test("stop during a pending camera permission request closes the late stream", async () => {
  let resolve;
  let stops = 0;
  const { ctx, state } = harness(camera, { openStream: () => new Promise(r => { resolve = r; }) });
  const pending = ctx.startCamera();
  ctx.stopCamera(true);
  resolve({ getTracks: () => [{ stop() { stops++; } }] });
  assert.equal(await pending, false);
  assert.equal(stops, 1);
  assert.equal(state.stream, null);
  assert.equal(state.cameraWanted, false);
});

test("a camera stopped while video.play waits cannot restart tracking", async () => {
  let resolvePlay;
  let modelStarts = 0;
  const track = { stop() {}, addEventListener() {} };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const { ctx, state } = harness(camera, {
    openStream: async () => stream,
    video: { play: () => new Promise(r => { resolvePlay = r; }) },
    ensureLandmarker: async () => { modelStarts++; return {}; },
  });
  state.stream = null;
  const pending = ctx.startCamera();
  await flush();
  ctx.stopCamera(true);
  resolvePlay();
  assert.equal(await pending, false);
  assert.equal(modelStarts, 0);
  assert.equal(state.stream, null);
});

test("a bitmap created after camera stop is closed and never dispatched", async () => {
  let resolveBitmap;
  let closes = 0;
  let dispatched = 0;
  const { ctx, state } = harness(["detectTick", "stopTracks"], {
    createImageBitmap: () => new Promise(r => { resolveBitmap = r; }),
  });
  state.worker = { postMessage() { dispatched++; } };
  state.workerReady = true;
  const pending = ctx.detectTick();
  ctx.stopTracks();
  resolveBitmap({ close() { closes++; } });
  await pending;
  assert.equal(closes, 1);
  assert.equal(dispatched, 0);
  assert.equal(state.inFlight, false);
});

test("a nonresponding frame triggers recovery; stale sessions cannot unlock a new frame", async () => {
  const { ctx, state, timers, workers } = harness([...tracking, "detectTick"], {
    createImageBitmap: async () => ({ close() {} }),
  });
  await ctx.ensureLandmarker();
  await ctx.detectTick();
  const first = workers[0].lastMessage;
  assert.equal(state.inFlight, true);
  workers[0].onmessage({ data: { type: "hands", frameId: first.frameId, session: first.session - 1 } });
  assert.equal(state.inFlight, true);
  const watchdog = [...timers.values()].find(t => t.delay === 3000);
  assert.ok(watchdog);
  watchdog.fn();
  await flush();
  assert.equal(workers[0].terminated, true);
  assert.equal(workers.length, 2);
  assert.equal(state.inFlight, false);
});

test("close does nothing without an explicit target and never sends hwnd zero", async () => {
  const calls = [];
  const { ctx } = harness(["closeActiveTabAt"], {
    invoke: async (name, args) => { calls.push({ name, args }); return null; },
    SENSITIVE_WINDOW_RE: /unsaved/,
  });
  await ctx.closeActiveTabAt(10, 20);
  assert.deepEqual(calls.map(c => c.name), ["window_at"]);
});

test("tracking limit respects actual camera FPS and processing time", () => {
  const { ctx, state } = harness(["nextGap"]);
  state.cameraFps = 30;
  state.settings.targetFps = 120;
  assert.ok(Math.abs(ctx.nextGap(true, 5) - (1000 / 30 - 5)) < 0.001);
  state.cameraFps = 60;
  state.settings.targetFps = 60;
  assert.equal(ctx.nextGap(true, 30), 0);
});

test("a pending close lookup is discarded when the camera session ends", async () => {
  let resolve;
  const calls = [];
  const { ctx } = harness(["closeActiveTabAt", ...camera], {
    invoke: (name) => { calls.push(name); return new Promise(r => { resolve = r; }); },
    SENSITIVE_WINDOW_RE: /unsaved/,
  });
  const pending = ctx.closeActiveTabAt(10, 20);
  ctx.stopCamera(true);
  resolve({ hwnd: 123, title: "test" });
  await pending;
  assert.deepEqual(calls, ["window_at"]);
});

test("custom gesture names remain text rather than HTML", () => {
  const nodes = [];
  const makeNode = () => ({
    children: [], style: {},
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); },
    addEventListener() {},
    set innerHTML(value) { assert.equal(value, ""); },
  });
  const container = makeNode();
  const { ctx, state } = harness(["renderCustomGesturesList"], {
    document: { getElementById: () => container, createElement: () => { const n = makeNode(); nodes.push(n); return n; } },
  });
  const name = '<img src=x onerror="bad()">';
  state.settings.customGestures = [{ name, action: "grab" }];
  ctx.renderCustomGesturesList();
  assert.equal(container.children[0].children[0].textContent, `${name} (grab)`);
});

test("worker transfers landmarks once and echoes frame/session identifiers", async () => {
  const workerSource = fs.readFileSync(new URL("../src/hands-worker.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/, "");
  const hand = Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: 0.5, z: 0 }));
  let result;
  let closed = false;
  const self = { postMessage(message, transfer) { result = structuredClone(message, { transfer: transfer || [] }); } };
  const model = { detectForVideo: () => ({ landmarks: [hand], worldLandmarks: [hand], handedness: [[{ categoryName: "Left" }]] }) };
  vm.runInNewContext(workerSource, { self, performance, console: { log() {} }, OffscreenCanvas: class {},
    FilesetResolver: { forVisionTasks: async () => ({}) }, HandLandmarker: { createFromOptions: async () => model } });
  await self.onmessage({ data: { type: "init", sources: [{ wasm: "local", model: "local" }] } });
  assert.equal(result.type, "ready");
  await self.onmessage({ data: { type: "frame", numHands: 2, frameId: 7, session: 3, time: 100, bitmap: { close() { closed = true; } } } });
  assert.equal(result.frameId, 7);
  assert.equal(result.session, 3);
  assert.equal(result.landmarkFlat.length, 63);
  assert.equal(result.worldFlat.length, 63);
  assert.equal(result.hands, undefined);
  assert.equal(result.world, undefined);
  assert.equal(result.handedness[0], "Left");
  assert.equal(closed, true);
});
