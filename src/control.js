import { BUILTIN_ACTIONS, GESTURES, actionFor, defaultBindings, removeBinding, upsertBinding } from "./bindings.js";
import { emitTo, inDesktop, invoke, listen } from "./desktop.js";
import { classifyGesture } from "./gestures.js";
import { getLang, initI18n, setLang, t } from "./i18n.js";
import "./style.css";

const video = document.getElementById("video");
const onboard = document.getElementById("onboarding");
const home = document.getElementById("home");

const state = {
  settings: null,
  monitors: [],
  overlay: null,
  cameraWanted: false,
  cameraPaused: false,
  controlVisible: true,
  stream: null,
  worker: null,
  workerReady: false,
  delegate: "",
  inFlight: false,
  missStreak: 0,
  detectTimer: 0,
  idleTimer: 0,
  lastGesture: null,
  grab: null,
  samples: [],
  lastHit: "",
  holders: [],
  windowCount: 0,
  win32: false,
  renderFps: 0,
  deviceLabel: "",
  hotkeyDraft: "",
  listening: false,
};

const ACTION_KEYS = {
  shoot: "actionShoot",
  grab: "actionGrab",
  cancel: "actionCancel",
  overlay_toggle: "actionOverlay",
  show_control: "actionShow",
};

const GESTURE_KEYS = {
  web: "gestureWeb",
  fist: "gestureFist",
  palm: "gesturePalm",
  point: "gesturePoint",
};

initI18n();
wireChrome();
boot();

function wireChrome() {
  document.getElementById("langTr").addEventListener("click", () => changeLang("tr"));
  document.getElementById("langEn").addEventListener("click", () => changeLang("en"));
  document.getElementById("welcomeNext").addEventListener("click", () => showStep("camera"));
  document.getElementById("onboardAllow").addEventListener("click", async () => {
    const ok = await startCamera();
    if (ok) showStep("display");
  });
  document.getElementById("onboardSkip").addEventListener("click", () => showStep("display"));
  document.getElementById("displayNext").addEventListener("click", () => showStep("play"));
  document.getElementById("playGo").addEventListener("click", finishOnboarding);
  document.getElementById("overlayToggle").addEventListener("click", toggleOverlay);
  document.getElementById("cameraToggle").addEventListener("click", () => {
    if (state.cameraWanted && !state.cameraPaused) stopCamera(true);
    else {
      state.cameraWanted = true;
      state.cameraPaused = false;
      startCamera();
    }
  });
  document.getElementById("cameraRetry").addEventListener("click", () => startCamera());
  document.getElementById("autostartToggle").addEventListener("click", () => {
    state.settings.startWithWindows = !state.settings.startWithWindows;
    persist();
  });
  document.getElementById("idleToggle").addEventListener("click", () => {
    state.settings.releaseCameraWhenIdle = !state.settings.releaseCameraWhenIdle;
    persist();
  });
  document.getElementById("testShot").addEventListener("click", async () => {
    if (!state.overlay?.visible) await toggleOverlay();
    emitTo("overlay", "overlay-shot", { x: 0.62, y: 0.72 });
  });
  document.getElementById("bindKind").addEventListener("change", syncBindForm);
  document.getElementById("bindAction").addEventListener("change", syncBindForm);
  document.getElementById("bindCapture").addEventListener("click", captureHotkey);
  document.getElementById("bindSave").addEventListener("click", saveBinding);
  document.addEventListener("jagwey:lang", render);
  document.addEventListener("visibilitychange", () => {
    state.controlVisible = document.visibilityState !== "hidden";
    considerCold();
  });
}

async function boot() {
  paintLang();
  const loaded = await invoke("get_settings");
  state.settings = loaded?.unsupported ? fallbackSettings() : loaded;
  if (state.settings.lang) initI18n(state.settings.lang);
  await refreshDesktop();
  listen("monitors-changed", (event) => {
    state.monitors = event.payload.monitors || [];
    if (event.payload.fallback) setMessage("monitorBanner", t("monitorGone"));
    if (event.payload.frame) state.overlay = { ...state.overlay, ...event.payload.frame };
    render();
  });
  listen("overlay-visibility", (event) => {
    state.overlay = { ...(state.overlay || {}), visible: event.payload.visible, ...event.payload.frame };
    if (event.payload.visible && state.cameraWanted) startCamera();
    considerCold();
    render();
  });
  listen("render-fps", (event) => {
    state.renderFps = event.payload.fps || 0;
    document.getElementById("fpsValue").textContent = String(state.renderFps);
  });
  listen("web-impact", (event) => hitAt(event.payload.x, event.payload.y, true));
  listen("binding-fired", (event) => runAction(event.payload, null, true));
  listen("shell-hidden", () => {
    state.controlVisible = false;
    considerCold();
  });
  listen("shell-shown", async () => {
    state.controlVisible = true;
    if (state.cameraWanted) await startCamera();
  });
  window.setInterval(async () => {
    if (!state.controlVisible || !state.settings) return;
    const before = state.monitors.map((item) => item.id).join("|");
    await refreshDesktop();
    const after = state.monitors.map((item) => item.id).join("|");
    if (before !== after && document.activeElement?.tagName !== "INPUT") render();
    else paintLiveStatus();
  }, 2000);
  if (!inDesktop()) document.getElementById("shellBanner").hidden = false;
  if (state.settings.onboarded) showHome();
  else showStep("welcome");
  render();
}

function fallbackSettings() {
  return {
    onboarded: false,
    lang: getLang(),
    startWithWindows: false,
    releaseCameraWhenIdle: false,
    idleReleaseSecs: 20,
    monitorMode: "one",
    monitorId: "",
    fxPreset: "mint",
    bindings: defaultBindings(),
  };
}

function showStep(step) {
  onboard.hidden = false;
  home.hidden = true;
  document.querySelectorAll(".step").forEach((el) => {
    el.hidden = el.dataset.step !== step;
  });
  if (step === "display") renderMonitors(document.getElementById("onboardMonitors"));
}

function showHome() {
  onboard.hidden = true;
  home.hidden = false;
  render();
}

async function finishOnboarding() {
  state.settings.onboarded = true;
  await persist();
  showHome();
  if (state.cameraWanted) await toggleOverlay();
}

async function changeLang(lang) {
  setLang(lang);
  if (state.settings) {
    state.settings.lang = lang;
    await persist();
  }
  paintLang();
}

function paintLang() {
  const lang = getLang();
  document.getElementById("langTr").setAttribute("aria-pressed", String(lang === "tr"));
  document.getElementById("langEn").setAttribute("aria-pressed", String(lang === "en"));
}

async function refreshDesktop() {
  const snap = await invoke("desktop_snapshot");
  if (!snap || snap.unsupported || snap.error) {
    state.win32 = false;
    state.monitors = state.monitors || [];
    return;
  }
  state.monitors = snap.monitors || [];
  state.win32 = Boolean(snap.win32);
  state.windowCount = snap.windowCount || 0;
  state.holders = snap.holders || [];
  if (snap.frame) state.overlay = snap.frame;
  if (!state.settings.monitorId && state.monitors[0]) {
    const primary = state.monitors.find((item) => item.primary) || state.monitors[0];
    state.settings.monitorId = primary.id;
  }
}

async function toggleOverlay() {
  const result = await invoke("toggle_overlay");
  if (!result || result.unsupported) return;
  state.overlay = result;
  if (result.visible) {
    emitTo("overlay", "overlay-preset", { preset: state.settings.fxPreset });
    emitTo("overlay", "overlay-frame", result);
    if (state.cameraWanted) await startCamera();
  }
  considerCold();
  render();
}

async function persist() {
  const saved = await invoke("save_settings", { settings: state.settings });
  if (saved?.unsupported) {
    render();
    return;
  }
  if (saved?.settings) state.settings = saved.settings;
  if (saved?.warnings?.length) setMessage("cameraMessage", t("hotkeyFail"));
  if (state.overlay?.visible) {
    const frame = await invoke("place_overlay");
    if (frame && !frame.unsupported) {
      state.overlay = frame;
      emitTo("overlay", "overlay-frame", frame);
      emitTo("overlay", "overlay-preset", { preset: state.settings.fxPreset });
    }
  }
  render();
}

async function startCamera() {
  state.cameraWanted = true;
  state.cameraPaused = false;
  setMessage("cameraMessage", "");
  setMessage("onboardCameraMessage", "");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
    });
    stopTracks();
    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    await ensureWorker();
    await describeCamera();
    scheduleDetect(0);
    render();
    return true;
  } catch (error) {
    state.cameraWanted = false;
    await describeHolders();
    const key = cameraErrorKey(error);
    const extra = key === "cameraBusy" ? holderSuffix() : "";
    setMessage("cameraMessage", `${t(key)} ${extra}`.trim());
    setMessage("onboardCameraMessage", `${t(key)} ${extra}`.trim());
    document.getElementById("cameraRetry").hidden = false;
    render();
    return false;
  }
}

function cameraErrorKey(error) {
  const name = error?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "cameraDenied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "cameraMissing";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "cameraBusy";
  return "cameraError";
}

function stopCamera(user) {
  if (user) state.cameraWanted = false;
  state.cameraPaused = !user && state.cameraWanted;
  clearTimeout(state.detectTimer);
  clearTimeout(state.idleTimer);
  stopTracks();
  cancelGrab(false);
  render();
}

function stopTracks() {
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  video.srcObject = null;
}

async function ensureWorker() {
  if (state.workerReady) return;
  if (state.worker) state.worker.terminate();
  const worker = new Worker(new URL("./hands-worker.js", import.meta.url), { type: "module" });
  state.worker = worker;
  worker.onmessage = onWorker;
  worker.postMessage({
    type: "init",
    wasm: new URL("/mediapipe/", window.location.href).toString(),
    model: new URL("/models/hand_landmarker.task", window.location.href).toString(),
  });
}

function onWorker(event) {
  const message = event.data;
  if (message.type === "ready") {
    state.workerReady = true;
    state.delegate = message.delegate;
    document.getElementById("modelLabel").textContent = `${t("modelReady")} · ${message.delegate}`;
    return;
  }
  if (message.type === "error") {
    document.getElementById("modelLabel").textContent = t("modelMissing");
    return;
  }
  if (message.type === "landmarks") {
    state.inFlight = false;
    onHand(message.landmarks, message.ms || 16);
  }
}

function scheduleDetect(delay) {
  clearTimeout(state.detectTimer);
  if (!state.stream) return;
  state.detectTimer = window.setTimeout(detectTick, delay);
}

async function detectTick() {
  if (!state.stream || !state.workerReady || state.inFlight) {
    scheduleDetect(40);
    return;
  }
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    scheduleDetect(40);
    return;
  }
  try {
    const bitmap = await createImageBitmap(video);
    state.inFlight = true;
    state.worker.postMessage({ type: "frame", bitmap, time: performance.now() }, [bitmap]);
  } catch {
    scheduleDetect(80);
  }
}

function onHand(landmarks, detectMs) {
  const gesture = classifyGesture(landmarks);
  const action = actionFor(state.settings.bindings, "gesture", gesture);
  const edge = gesture !== state.lastGesture;
  document.getElementById("handValue").textContent = landmarks ? t("handYes") : t("handNo");
  if (!landmarks) {
    state.missStreak += 1;
    if (state.grab) releaseGrab();
    armIdleRelease();
  } else {
    state.missStreak = 0;
    clearTimeout(state.idleTimer);
    const point = screenPoint(landmarks[8]);
    if (state.grab && action !== "grab") releaseGrab();
    else if (action === "grab" && !edge) moveGrab(point);
    else if (edge) runAction(action, point, true);
  }
  state.lastGesture = gesture;
  const gap = nextGap(Boolean(landmarks), detectMs);
  scheduleDetect(gap);
}

function nextGap(hand, detectMs) {
  if (!hand) return state.missStreak > 6 ? 250 : 80;
  if (state.settings.fxPreset === "low") return Math.max(33, detectMs);
  return Math.min(40, Math.max(8, detectMs * 1.15));
}

function armIdleRelease() {
  if (!state.settings.releaseCameraWhenIdle || state.idleTimer || !state.stream) return;
  const wait = Math.max(5, state.settings.idleReleaseSecs || 20) * 1000;
  state.idleTimer = window.setTimeout(() => {
    state.idleTimer = 0;
    if (state.missStreak > 6 && state.stream) stopCamera(false);
  }, wait);
}

function screenPoint(landmark) {
  const frame = state.overlay || { x: 0, y: 0, width: window.screen.width, height: window.screen.height };
  const xNorm = 1 - landmark.x;
  const yNorm = landmark.y;
  return {
    nx: xNorm,
    ny: yNorm,
    sx: Math.round(frame.x + xNorm * frame.width),
    sy: Math.round(frame.y + yNorm * frame.height),
  };
}

function runAction(action, point, edge) {
  if (!action || !edge) return;
  if (action === "shoot" && point) {
    emitTo("overlay", "overlay-shot", { x: point.nx, y: point.ny });
    return;
  }
  if (action === "grab" && point) {
    beginGrab(point);
    return;
  }
  if (action === "cancel") {
    cancelGrab(true);
    return;
  }
  if (action === "overlay_toggle") {
    toggleOverlay();
    return;
  }
  if (action === "show_control") invoke("show_control");
}

async function beginGrab(point) {
  const found = await invoke("window_at", { x: point.sx, y: point.sy });
  if (!found || found.unsupported || !found.hwnd) return;
  state.grab = {
    hwnd: found.hwnd,
    winX: found.x,
    winY: found.y,
    width: found.width,
    height: found.height,
    startSx: point.sx,
    startSy: point.sy,
  };
  state.samples = [{ t: performance.now(), x: point.sx, y: point.sy }];
  state.lastHit = found.title;
  sendTether(point, found);
  render();
}

async function moveGrab(point) {
  if (!state.grab) {
    await beginGrab(point);
    return;
  }
  const x = Math.round(state.grab.winX + (point.sx - state.grab.startSx));
  const y = Math.round(state.grab.winY + (point.sy - state.grab.startSy));
  const moved = await invoke("move_window", { hwnd: state.grab.hwnd, x, y });
  state.samples.push({ t: performance.now(), x: point.sx, y: point.sy });
  if (state.samples.length > 8) state.samples.shift();
  sendTether(point, moved && moved.hwnd ? moved : { ...state.grab, x, y });
}

function sendTether(point, win) {
  const frame = state.overlay || { x: 0, y: 0, width: 1, height: 1 };
  emitTo("overlay", "overlay-tether", {
    x0: point.nx,
    y0: point.ny,
    x1: (win.x + win.width / 2 - frame.x) / frame.width,
    y1: (win.y + win.height / 2 - frame.y) / frame.height,
  });
}

async function releaseGrab() {
  const grab = state.grab;
  state.grab = null;
  emitTo("overlay", "overlay-clear", {});
  if (!grab) return;
  const recent = state.samples.filter((sample) => performance.now() - sample.t < 120);
  const first = recent[0];
  const last = recent[recent.length - 1];
  let vx = 0;
  let vy = 0;
  if (first && last && last.t > first.t) {
    const dt = (last.t - first.t) / 16;
    vx = (last.x - first.x) / dt;
    vy = (last.y - first.y) / dt;
  }
  if (Math.hypot(vx, vy) > 4) await invoke("fling_window", { hwnd: grab.hwnd, vx, vy });
  render();
}

function cancelGrab(clearWeb) {
  state.grab = null;
  invoke("cancel_fling");
  if (clearWeb) emitTo("overlay", "overlay-clear", {});
  render();
}

async function hitAt(x, y, nudge) {
  const found = await invoke("window_at", { x: Math.round(x), y: Math.round(y) });
  if (!found || found.unsupported || !found.hwnd) return;
  state.lastHit = found.title || state.lastHit;
  if (nudge) await invoke("nudge_window", { hwnd: found.hwnd });
  render();
}

async function describeCamera() {
  const track = state.stream?.getVideoTracks?.()[0];
  if (!track) return;
  const settings = track.getSettings();
  const devices = await navigator.mediaDevices.enumerateDevices();
  const match = devices.find((device) => device.deviceId === settings.deviceId);
  state.deviceLabel = match?.label || track.label || t("deviceUnknown");
  await describeHolders();
}

async function describeHolders() {
  const listed = await invoke("camera_holders");
  state.holders = Array.isArray(listed) ? listed : [];
}

function holderSuffix() {
  const others = state.holders.filter((item) => !/jagwey/i.test(item.name));
  if (!others.length) return "";
  return `${t("holdersBusy")}: ${others.map((item) => item.name).join(", ")}`;
}

function considerCold() {
  const overlayOn = Boolean(state.overlay?.visible);
  if (!overlayOn && !state.controlVisible) {
    stopCamera(false);
    state.cameraPaused = state.cameraWanted;
    if (state.worker) {
      state.worker.terminate();
      state.worker = null;
      state.workerReady = false;
    }
  }
}

function paintLiveStatus() {
  document.getElementById("winValue").textContent = String(state.windowCount);
  const others = state.holders.filter((item) => !/jagwey/i.test(item.name));
  const holder = document.getElementById("holderLabel");
  if (holder) {
    holder.textContent = state.win32
      ? others.length
        ? `${t("holdersBusy")}: ${others.map((item) => item.name).join(", ")}`
        : t("holdersNone")
      : t("holdersWindowsOnly");
  }
}

function render() {
  if (!state.settings) return;
  paintLang();
  const overlayOn = Boolean(state.overlay?.visible);
  document.getElementById("overlayToggle").setAttribute("aria-pressed", String(overlayOn));
  document.getElementById("cameraToggle").setAttribute("aria-pressed", String(state.cameraWanted && !state.cameraPaused));
  document.getElementById("autostartToggle").setAttribute("aria-pressed", String(state.settings.startWithWindows));
  document.getElementById("idleToggle").setAttribute("aria-pressed", String(state.settings.releaseCameraWhenIdle));
  document.getElementById("cameraState").textContent = state.cameraPaused ? t("cameraPaused") : t("cameraHint");
  document.getElementById("deviceLabel").textContent = state.deviceLabel || t("deviceUnknown");
  paintLiveStatus();
  document.getElementById("hitLabel").textContent = `${t("lastHit")}: ${state.lastHit || t("noHit")}`;
  document.getElementById("win32Label").textContent = state.win32 ? t("win32Ready") : t("win32Stub");
  document.getElementById("fpsValue").textContent = String(state.renderFps);
  renderMonitors(document.getElementById("monitorList"));
  renderFx();
  renderBindings();
  syncBindForm();
}

function renderMonitors(root) {
  if (!root) return;
  root.replaceChildren();
  const span = document.createElement("button");
  span.type = "button";
  span.className = "monitor";
  span.textContent = t("spanAll");
  span.setAttribute("aria-pressed", String(state.settings.monitorMode === "all"));
  span.addEventListener("click", () => chooseMonitor("all", ""));
  root.append(span);
  for (const monitor of state.monitors) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "monitor";
    const name = monitor.name || t("displays");
    button.textContent = `${name} · ${monitor.width}×${monitor.height}${monitor.primary ? ` · ${t("primary")}` : ""}`;
    const selected = state.settings.monitorMode === "one" && state.settings.monitorId === monitor.id;
    button.setAttribute("aria-pressed", String(selected));
    button.addEventListener("click", () => chooseMonitor("one", monitor.id));
    root.append(button);
  }
}

async function chooseMonitor(mode, id) {
  state.settings.monitorMode = mode;
  if (id) state.settings.monitorId = id;
  await persist();
}

function renderFx() {
  const root = document.getElementById("fxChips");
  root.replaceChildren();
  const presets = [
    ["classic", "fxClassic"],
    ["mint", "fxMint"],
    ["neon", "fxNeon"],
    ["low", "fxLow"],
  ];
  for (const [id, key] of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = t(key);
    button.setAttribute("aria-pressed", String(state.settings.fxPreset === id));
    button.addEventListener("click", async () => {
      state.settings.fxPreset = id;
      emitTo("overlay", "overlay-preset", { preset: id });
      await persist();
    });
    root.append(button);
  }
}

function renderBindings() {
  const root = document.getElementById("bindingList");
  root.replaceChildren();
  for (const binding of state.settings.bindings) {
    const row = document.createElement("div");
    row.className = "binding";
    const label = document.createElement("span");
    label.textContent = `${actionLabel(binding.action)} · ${inputLabel(binding.input)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn ghost";
    remove.textContent = t("bindingsRemove");
    remove.addEventListener("click", async () => {
      state.settings.bindings = removeBinding(state.settings.bindings, binding.id);
      await persist();
    });
    row.append(label, remove);
    root.append(row);
  }
}

function actionLabel(action) {
  return ACTION_KEYS[action] ? t(ACTION_KEYS[action]) : action;
}

function inputLabel(input) {
  if (input.kind === "gesture") return t(GESTURE_KEYS[input.value] || "kindGesture");
  return input.value;
}

function syncBindForm() {
  const action = document.getElementById("bindAction");
  if (!action.childElementCount) {
    for (const name of BUILTIN_ACTIONS) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = actionLabel(name);
      action.append(option);
    }
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = t("customAction");
    action.append(custom);
  } else {
    [...action.options].forEach((option) => {
      if (option.value === "custom") option.textContent = t("customAction");
      else if (ACTION_KEYS[option.value]) option.textContent = t(ACTION_KEYS[option.value]);
    });
  }
  const gesture = document.getElementById("bindGesture");
  if (!gesture.childElementCount) {
    for (const name of GESTURES) {
      const option = document.createElement("option");
      option.value = name;
      gesture.append(option);
    }
  }
  [...gesture.options].forEach((option) => {
    option.textContent = t(GESTURE_KEYS[option.value]);
  });
  const kind = document.getElementById("bindKind").value;
  gesture.hidden = kind !== "gesture";
  document.getElementById("bindCapture").hidden = kind !== "hotkey";
  document.getElementById("bindCustom").hidden = action.value !== "custom";
  document.getElementById("bindKind").querySelector('[value="gesture"]').textContent = t("kindGesture");
  document.getElementById("bindKind").querySelector('[value="hotkey"]').textContent = t("kindHotkey");
}

function captureHotkey() {
  const button = document.getElementById("bindCapture");
  button.textContent = t("bindingsListening");
  state.listening = true;
  const onKey = (event) => {
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    event.preventDefault();
    const parts = [];
    if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    parts.push(event.code.startsWith("Key") ? event.code.slice(3) : event.code);
    state.hotkeyDraft = parts.join("+");
    button.textContent = state.hotkeyDraft;
    window.removeEventListener("keydown", onKey, true);
    state.listening = false;
  };
  window.addEventListener("keydown", onKey, true);
}

async function saveBinding() {
  const actionPick = document.getElementById("bindAction").value;
  const custom = document.getElementById("bindCustom").value.trim();
  const action = actionPick === "custom" ? custom : actionPick;
  if (!action) return;
  const kind = document.getElementById("bindKind").value;
  const value = kind === "gesture" ? document.getElementById("bindGesture").value : state.hotkeyDraft;
  if (!value) return;
  state.settings.bindings = upsertBinding(state.settings.bindings, {
    id: `b-${Date.now()}`,
    action,
    input: { kind, value },
  });
  state.hotkeyDraft = "";
  await persist();
}

function setMessage(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (id === "monitorBanner") el.hidden = !text;
}
