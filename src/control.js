import { BUILTIN_ACTIONS, GESTURES, actionFor, defaultBindings, removeBinding, upsertBinding } from "./bindings.js";
import { autoTileWorkspace, testAiConnection } from "./ai.js";
import { emitTo, inDesktop, invoke, listen } from "./desktop.js";
import { classifyGesture } from "./gestures.js";
import { getLang, initI18n, setLang, t } from "./i18n.js";
import {
  isAudioEnabled,
  playFling,
  playGrab,
  playHollowPurple,
  playImpact,
  playInfinityShield,
  playThwip,
  setAudioEnabled,
} from "./sound.js";
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
  hands: [
    { lastGesture: null, grab: null, samples: [], smoothed: null },
    { lastGesture: null, grab: null, samples: [], smoothed: null },
  ],
  pendingCloses: new Map(),
  lastHit: "",
  holders: [],
  windowCount: 0,
  win32: false,
  renderFps: 0,
  deviceLabel: "",
  videoDevices: [],
  hotkeyDraft: "",
  listening: false,
};

const ACTION_KEYS = {
  shoot: "actionShoot",
  grab: "actionGrab",
  cancel: "actionCancel",
  hollow_purple: "hollowPurple",
  overlay_toggle: "actionOverlay",
  show_control: "actionShow",
};

const GESTURE_KEYS = {
  web: "gestureWeb",
  fist: "gestureFist",
  palm: "gesturePalm",
  flick: "gestureFlick",
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

  const camSelect = document.getElementById("cameraSelect");
  if (camSelect) {
    camSelect.addEventListener("change", async (e) => {
      const deviceId = e.target.value;
      if (state.settings) {
        state.settings.cameraDeviceId = deviceId;
        await persist();
      }
      if (state.cameraWanted) {
        stopCamera(false);
        state.cameraWanted = true;
        await startCamera();
      }
    });
  }

  const soundToggle = document.getElementById("soundToggle");
  if (soundToggle) {
    soundToggle.addEventListener("click", () => {
      state.settings.soundEnabled = !state.settings.soundEnabled;
      setAudioEnabled(state.settings.soundEnabled);
      persist();
    });
  }

  const purpleToggle = document.getElementById("purpleToggle");
  if (purpleToggle) {
    purpleToggle.addEventListener("click", () => {
      state.settings.hollowPurpleEnabled = !state.settings.hollowPurpleEnabled;
      persist();
    });
  }

  const safetyToggle = document.getElementById("safetyToggle");
  if (safetyToggle) {
    safetyToggle.addEventListener("click", () => {
      state.settings.safetyGuard = !state.settings.safetyGuard;
      persist();
    });
  }

  const focusFrameToggle = document.getElementById("focusFrameToggle");
  if (focusFrameToggle) {
    focusFrameToggle.addEventListener("click", () => {
      state.settings.focusFrameOnly = !state.settings.focusFrameOnly;
      emitTo("overlay", "overlay-settings", { focusFrameOnly: state.settings.focusFrameOnly });
      persist();
    });
  }

  const refreshCamerasBtn = document.getElementById("refreshCamerasBtn");
  if (refreshCamerasBtn) {
    refreshCamerasBtn.addEventListener("click", async () => {
      await describeCamera();
      renderCameraSelect();
    });
  }

  const testPurple = document.getElementById("testPurple");
  if (testPurple) {
    testPurple.addEventListener("click", async () => {
      if (!state.overlay?.visible) await toggleOverlay();
      emitTo("overlay", "overlay-purple", { x: 0.5, y: 0.45 });
      playHollowPurple();
    });
  }

  const aiApiKey = document.getElementById("aiApiKey");
  if (aiApiKey) {
    aiApiKey.addEventListener("change", (e) => {
      state.settings.aiApiKey = e.target.value;
      persist();
    });
  }

  const aiEndpoint = document.getElementById("aiEndpoint");
  if (aiEndpoint) {
    aiEndpoint.addEventListener("change", (e) => {
      state.settings.aiEndpoint = e.target.value;
      persist();
    });
  }

  const aiModel = document.getElementById("aiModel");
  if (aiModel) {
    aiModel.addEventListener("change", (e) => {
      state.settings.aiModel = e.target.value;
      persist();
    });
  }

  const aiTestBtn = document.getElementById("aiTestBtn");
  if (aiTestBtn) {
    aiTestBtn.addEventListener("click", async () => {
      const msg = document.getElementById("aiStatusMessage");
      if (msg) msg.textContent = "Bağlanıyor / Testing...";
      const res = await testAiConnection(state.settings);
      if (msg) msg.textContent = res.message;
    });
  }

  const aiTileBtn = document.getElementById("aiTileBtn");
  if (aiTileBtn) {
    aiTileBtn.addEventListener("click", async () => {
      const msg = document.getElementById("aiStatusMessage");
      if (msg) msg.textContent = "Pencereler taranıyor...";
      const windows = await invoke("list_windows");
      const snap = await invoke("desktop_snapshot");
      const res = await autoTileWorkspace(state.settings, windows, snap?.monitors || state.monitors);
      if (msg) msg.textContent = res.message;
    });
  }

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
    playThwip();
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

  // Guarantee clean camera teardown when page/app unloads
  window.addEventListener("beforeunload", () => stopCamera(true));
  window.addEventListener("pagehide", () => stopCamera(true));
}

async function boot() {
  paintLang();
  const loaded = await invoke("get_settings");
  state.settings = loaded?.unsupported ? fallbackSettings() : loaded;
  if (state.settings.lang) initI18n(state.settings.lang);
  applyTheme(state.settings.theme || "sakura");
  setAudioEnabled(state.settings.soundEnabled !== false);
  emitTo("overlay", "overlay-settings", { focusFrameOnly: Boolean(state.settings.focusFrameOnly) });

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
  listen("binding-fired", (event) => runActionForHand(0, event.payload, null, true));
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
    fxPreset: "spiderman",
    bindings: defaultBindings(),
    cameraDeviceId: "",
    targetFps: 120,
    soundEnabled: true,
    theme: "spiderman",
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
    emitTo("overlay", "overlay-preset", { preset: state.settings.theme || state.settings.fxPreset });
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
      emitTo("overlay", "overlay-preset", { preset: state.settings.theme || state.settings.fxPreset });
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
    const targetFps = state.settings?.targetFps || 120;
    const videoConstraints = {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: targetFps >= 120 ? 60 : 30, max: targetFps >= 120 ? 120 : 60 },
    };
    if (state.settings?.cameraDeviceId) {
      videoConstraints.deviceId = { exact: state.settings.cameraDeviceId };
    } else {
      videoConstraints.facingMode = "user";
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints,
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
  for (let i = 0; i < state.hands.length; i += 1) {
    cancelGrab(i, false);
  }
  render();
}

function stopTracks() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    });
  }
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
    const hands = message.hands && message.hands.length ? message.hands : message.landmarks ? [message.landmarks] : [];
    onHands(hands, message.ms || 16);
  }
}

function scheduleDetect(delay) {
  clearTimeout(state.detectTimer);
  if (!state.stream) return;
  state.detectTimer = window.setTimeout(detectTick, delay);
}

async function detectTick() {
  if (!state.stream || !state.workerReady || state.inFlight) {
    scheduleDetect(35);
    return;
  }
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    scheduleDetect(35);
    return;
  }
  try {
    const bitmap = await createImageBitmap(video);
    state.inFlight = true;
    state.worker.postMessage({ type: "frame", bitmap, time: performance.now() }, [bitmap]);
  } catch {
    scheduleDetect(70);
  }
}

function onHands(hands, detectMs) {
  if (!hands || hands.length === 0) {
    state.missStreak += 1;
    document.getElementById("handValue").textContent = t("handNo");
    for (let i = 0; i < state.hands.length; i += 1) {
      if (state.hands[i].grab) releaseGrab(i);
      state.hands[i].lastGesture = null;
    }
    armIdleRelease();
  } else {
    state.missStreak = 0;
    clearTimeout(state.idleTimer);
    document.getElementById("handValue").textContent = hands.length >= 2 ? t("handBoth") : t("handOne");

    for (let i = 0; i < Math.min(hands.length, 2); i += 1) {
      const rawLandmarks = hands[i];
      const handState = state.hands[i];

      // Jitter Reduction Filter (EMA smoothing):
      const SMOOTH = 0.65;
      const landmarks = rawLandmarks.map((curr, idx) => {
        const prev = handState.smoothed?.[idx];
        if (!prev) return { ...curr };
        return {
          x: prev.x * (1 - SMOOTH) + curr.x * SMOOTH,
          y: prev.y * (1 - SMOOTH) + curr.y * SMOOTH,
          z: (prev.z || 0) * (1 - SMOOTH) + (curr.z || 0) * SMOOTH,
        };
      });
      handState.smoothed = landmarks;

      const gesture = classifyGesture(landmarks);
      const action = actionFor(state.settings.bindings, "gesture", gesture);
      const edge = gesture !== handState.lastGesture;
      const point = screenPoint(landmarks[8]);

      if (handState.grab && action !== "grab") {
        releaseGrab(i);
      } else if (action === "grab" && !edge) {
        moveGrab(i, point);
      } else if (edge) {
        runActionForHand(i, action, point, true);
      }
      handState.lastGesture = gesture;
    }

    for (let i = hands.length; i < state.hands.length; i += 1) {
      if (state.hands[i].grab) releaseGrab(i);
      state.hands[i].lastGesture = null;
    }
  }

  const gap = nextGap(hands.length > 0, detectMs);
  scheduleDetect(gap);
}

function nextGap(hand, detectMs) {
  if (!hand) return state.missStreak > 6 ? 250 : 80;
  const targetFps = state.settings?.targetFps || 120;
  if (targetFps <= 60 || state.settings?.fxPreset === "low" || state.settings?.fxPreset === "light") {
    return Math.max(16, detectMs);
  }
  return Math.min(30, Math.max(6, detectMs * 1.05));
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

function runActionForHand(handIndex, action, point, edge) {
  if (!action || !edge) return;
  if (action === "shoot" && point) {
    emitTo("overlay", "overlay-shot", { x: point.nx, y: point.ny });
    playThwip();
    return;
  }
  if (action === "hollow_purple" && point) {
    triggerHollowPurple(point);
    return;
  }
  if (action === "grab" && point) {
    beginGrab(handIndex, point);
    return;
  }
  if (action === "cancel") {
    cancelGrab(handIndex, true);
    if (state.pendingCloses.size > 0) {
      for (const timer of state.pendingCloses.values()) {
        clearTimeout(timer);
      }
      state.pendingCloses.clear();
      setMessage("shellBanner", "Kapatma iptal edildi / Cancelled.");
    }
    return;
  }
  if (action === "overlay_toggle") {
    toggleOverlay();
    return;
  }
  if (action === "show_control") invoke("show_control");
}

async function triggerHollowPurple(point) {
  if (state.settings.hollowPurpleEnabled === false) return;

  emitTo("overlay", "overlay-purple", { x: point.nx, y: point.ny });
  playHollowPurple();

  let targetWin = await invoke("window_at", { x: point.sx, y: point.sy });
  if (!targetWin || targetWin.unsupported || !targetWin.hwnd) {
    targetWin = await invoke("get_foreground_window");
  }

  if (!targetWin || targetWin.unsupported || !targetWin.hwnd) {
    if (state.settings.closeMode === "tab") {
      await invoke("close_active_tab");
    }
    return;
  }

  const sensitiveRegex =
    /github|gitlab|google docs|google sheets|sheets\.google|docs\.google|notion|figma|visual studio|code|vscode|jira|trello|bank|pay|checkout|save|unsaved|draft|taslak|kaydedilmedi/i;

  if (state.settings.safetyGuard !== false && sensitiveRegex.test(targetWin.title)) {
    playInfinityShield();
    emitTo("overlay", "overlay-safety-shield", {
      x: point.nx,
      y: point.ny,
      title: targetWin.title,
      duration: 2500,
    });
    setMessage(
      "shellBanner",
      `🛡️ Infinity Shield: "${targetWin.title}" korundu. İptal için elinizi açın.`
    );

    const timer = window.setTimeout(async () => {
      if (state.pendingCloses.has(targetWin.hwnd)) {
        state.pendingCloses.delete(targetWin.hwnd);
        executeClose(targetWin);
      }
    }, 2400);

    state.pendingCloses.set(targetWin.hwnd, timer);
    return;
  }

  executeClose(targetWin);
}

async function executeClose(win) {
  if (state.settings.closeMode === "window") {
    await invoke("close_window", { hwnd: win.hwnd });
  } else {
    await invoke("close_active_tab");
  }
}

async function beginGrab(handIndex, point) {
  const found = await invoke("window_at", { x: point.sx, y: point.sy });
  if (!found || found.unsupported || !found.hwnd) return;
  state.hands[handIndex].grab = {
    hwnd: found.hwnd,
    winX: found.x,
    winY: found.y,
    width: found.width,
    height: found.height,
    startSx: point.sx,
    startSy: point.sy,
  };
  state.hands[handIndex].samples = [{ t: performance.now(), x: point.sx, y: point.sy }];
  state.lastHit = found.title;
  sendTether(handIndex, point, found);
  emitTo("overlay", "overlay-target-window", {
    id: handIndex,
    window: {
      x: found.x,
      y: found.y,
      width: found.width,
      height: found.height,
      title: found.title,
      grabbed: true,
    },
  });
  playGrab();
  render();
}

async function moveGrab(handIndex, point) {
  const handState = state.hands[handIndex];
  if (!handState.grab) {
    await beginGrab(handIndex, point);
    return;
  }
  const x = Math.round(handState.grab.winX + (point.sx - handState.grab.startSx));
  const y = Math.round(handState.grab.winY + (point.sy - handState.grab.startSy));
  const moved = await invoke("move_window", { hwnd: handState.grab.hwnd, x, y });
  handState.samples.push({ t: performance.now(), x: point.sx, y: point.sy });
  if (handState.samples.length > 8) handState.samples.shift();
  sendTether(handIndex, point, moved && moved.hwnd ? moved : { ...handState.grab, x, y });
  emitTo("overlay", "overlay-target-window", {
    id: handIndex,
    window: {
      x,
      y,
      width: handState.grab.width,
      height: handState.grab.height,
      title: state.lastHit,
      grabbed: true,
    },
  });
}

function sendTether(handIndex, point, win) {
  const frame = state.overlay || { x: 0, y: 0, width: 1, height: 1 };
  emitTo("overlay", "overlay-tether", {
    id: handIndex,
    x0: point.nx,
    y0: point.ny,
    x1: (win.x + win.width / 2 - frame.x) / frame.width,
    y1: (win.y + win.height / 2 - frame.y) / frame.height,
  });
}

async function releaseGrab(handIndex) {
  const handState = state.hands[handIndex];
  const grab = handState.grab;
  handState.grab = null;
  emitTo("overlay", "overlay-clear", { id: handIndex });
  emitTo("overlay", "overlay-target-window", { id: handIndex, clear: true });
  if (!grab) return;

  const now = performance.now();
  let recent = handState.samples.filter((sample) => now - sample.t < 160);
  if (recent.length < 2 && handState.samples.length >= 2) {
    recent = handState.samples.slice(-3);
  }

  let vx = 0;
  let vy = 0;
  if (recent.length >= 2) {
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dtMs = last.t - first.t;
    if (dtMs > 4) {
      const dtFrames = dtMs / 16;
      vx = ((last.x - first.x) / dtFrames) * 1.35;
      vy = ((last.y - first.y) / dtFrames) * 1.35;
    }
  }

  const speed = Math.hypot(vx, vy);
  if (speed > 3) {
    const maxSpeed = 75;
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed;
      vy = (vy / speed) * maxSpeed;
    }
    playFling(speed);
    await invoke("fling_window", { hwnd: grab.hwnd, vx, vy });
  }
  render();
}

function cancelGrab(handIndex, clearWeb) {
  if (handIndex !== undefined && state.hands[handIndex]) {
    state.hands[handIndex].grab = null;
    if (clearWeb) {
      emitTo("overlay", "overlay-clear", { id: handIndex });
      emitTo("overlay", "overlay-target-window", { id: handIndex, clear: true });
    }
  } else {
    for (let i = 0; i < state.hands.length; i += 1) {
      state.hands[i].grab = null;
    }
    if (clearWeb) {
      emitTo("overlay", "overlay-clear", {});
      emitTo("overlay", "overlay-target-window", { clear: true });
    }
  }
  invoke("cancel_fling");
  render();
}

async function hitAt(x, y, nudge) {
  let found = await invoke("window_at", { x: Math.round(x), y: Math.max(35, Math.round(y)) });
  if (!found || found.unsupported || !found.hwnd) {
    const list = await invoke("list_windows");
    if (Array.isArray(list) && list.length > 0) {
      found = list[0];
    }
  }
  if (!found || !found.hwnd) return;
  state.lastHit = found.title || state.lastHit;
  playImpact();
  if (nudge) await invoke("nudge_window", { hwnd: found.hwnd });
  render();
}

async function describeCamera() {
  const track = state.stream?.getVideoTracks?.()[0];
  if (!track) return;
  const settings = track.getSettings();
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter((d) => d.kind === "videoinput");
  state.videoDevices = videoDevices;
  const match = devices.find((device) => device.deviceId === settings.deviceId);
  state.deviceLabel = match?.label || track.label || t("deviceUnknown");
  renderCameraSelect();
  await describeHolders();
}

function renderCameraSelect() {
  const select = document.getElementById("cameraSelect");
  if (!select) return;
  if (!state.videoDevices || state.videoDevices.length <= 1) {
    select.hidden = true;
    return;
  }
  select.hidden = false;
  select.replaceChildren();
  for (const device of state.videoDevices) {
    const opt = document.createElement("option");
    opt.value = device.deviceId;
    opt.textContent = device.label || `${t("camera")} ${select.childElementCount + 1}`;
    if (device.deviceId === state.settings?.cameraDeviceId) {
      opt.selected = true;
    }
    select.append(opt);
  }
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
  applyTheme(state.settings.theme || "spiderman");

  const overlayOn = Boolean(state.overlay?.visible);
  document.getElementById("overlayToggle").setAttribute("aria-pressed", String(overlayOn));
  document.getElementById("cameraToggle").setAttribute("aria-pressed", String(state.cameraWanted && !state.cameraPaused));

  const soundToggle = document.getElementById("soundToggle");
  if (soundToggle) {
    soundToggle.setAttribute("aria-pressed", String(state.settings.soundEnabled !== false));
  }

  const purpleToggle = document.getElementById("purpleToggle");
  if (purpleToggle) {
    purpleToggle.setAttribute("aria-pressed", String(state.settings.hollowPurpleEnabled !== false));
  }

  const safetyToggle = document.getElementById("safetyToggle");
  if (safetyToggle) {
    safetyToggle.setAttribute("aria-pressed", String(state.settings.safetyGuard !== false));
  }

  const focusFrameToggle = document.getElementById("focusFrameToggle");
  if (focusFrameToggle) {
    focusFrameToggle.setAttribute("aria-pressed", String(Boolean(state.settings.focusFrameOnly)));
  }

  document.getElementById("autostartToggle").setAttribute("aria-pressed", String(state.settings.startWithWindows));
  document.getElementById("idleToggle").setAttribute("aria-pressed", String(state.settings.releaseCameraWhenIdle));
  document.getElementById("cameraState").textContent = state.cameraPaused ? t("cameraPaused") : t("cameraHint");
  document.getElementById("deviceLabel").textContent = state.deviceLabel || t("deviceUnknown");
  paintLiveStatus();
  document.getElementById("hitLabel").textContent = `${t("lastHit")}: ${state.lastHit || t("noHit")}`;
  document.getElementById("win32Label").textContent = state.win32 ? t("win32Ready") : t("win32Stub");
  document.getElementById("fpsValue").textContent = String(state.renderFps);

  renderTheme();
  renderCloseModeChips();
  renderAiProviderChips();
  renderFpsChips();
  renderMonitors(document.getElementById("monitorList"));
  renderBindings();
  syncBindForm();
}

function applyTheme(themeId) {
  document.documentElement.dataset.theme = themeId || "sakura";
}

function renderTheme() {
  const root = document.getElementById("themeChips");
  if (!root) return;
  root.replaceChildren();
  const themes = [
    ["sakura", "themeSakura"],
    ["clean", "themeClean"],
    ["midnight", "themeMidnight"],
    ["sage", "themeSage"],
    ["mint", "themeMint"],
    ["spiderman", "themeSpiderman"],
    ["miles", "themeMiles"],
    ["symbiote", "themeSymbiote"],
    ["neon", "themeNeon"],
    ["gojo", "themeGojo"],
  ];
  for (const [id, key] of themes) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = t(key);
    const active = (state.settings.theme || "sakura") === id;
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", async () => {
      state.settings.theme = id;
      state.settings.fxPreset = id;
      applyTheme(id);
      emitTo("overlay", "overlay-preset", { preset: id });
      await persist();
    });
    root.append(button);
  }
}

function renderCloseModeChips() {
  const root = document.getElementById("closeModeChips");
  if (!root) return;
  root.replaceChildren();
  const modes = [
    ["tab", "closeModeTab"],
    ["window", "closeModeWindow"],
  ];
  for (const [mode, key] of modes) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = t(key);
    const active = (state.settings.closeMode || "tab") === mode;
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", async () => {
      state.settings.closeMode = mode;
      await persist();
    });
    root.append(button);
  }
}

function renderAiProviderChips() {
  const root = document.getElementById("aiProviderChips");
  if (!root) return;
  root.replaceChildren();
  const providers = [
    ["none", "aiNone"],
    ["gemini", "aiGemini"],
    ["ollama", "aiOllama"],
    ["custom", "aiCustom"],
  ];
  const current = state.settings.aiProvider || "none";
  for (const [prov, key] of providers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = t(key);
    const active = current === prov;
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", async () => {
      state.settings.aiProvider = prov;
      if (prov === "gemini" && !state.settings.aiModel) state.settings.aiModel = "gemini-2.5-flash";
      if (prov === "ollama" && !state.settings.aiModel) state.settings.aiModel = "llama3.2";
      await persist();
    });
    root.append(button);
  }

  const keyRow = document.getElementById("aiKeyRow");
  const endpointRow = document.getElementById("aiEndpointRow");
  const modelRow = document.getElementById("aiModelRow");

  if (keyRow) keyRow.hidden = current === "none" || current === "ollama";
  if (endpointRow) endpointRow.hidden = current === "none" || current === "gemini";
  if (modelRow) modelRow.hidden = current === "none";

  const keyInput = document.getElementById("aiApiKey");
  if (keyInput && keyInput !== document.activeElement) keyInput.value = state.settings.aiApiKey || "";
  const endInput = document.getElementById("aiEndpoint");
  if (endInput && endInput !== document.activeElement) endInput.value = state.settings.aiEndpoint || "http://localhost:11434";
  const modInput = document.getElementById("aiModel");
  if (modInput && modInput !== document.activeElement) modInput.value = state.settings.aiModel || "gemini-2.5-flash";
}

function renderFpsChips() {
  const root = document.getElementById("fpsChips");
  if (!root) return;
  root.replaceChildren();
  const options = [
    [60, "fpsOption60"],
    [120, "fpsOption120"],
  ];
  for (const [fps, key] of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = t(key);
    const active = (state.settings.targetFps || 120) === fps;
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", async () => {
      state.settings.targetFps = fps;
      await persist();
    });
    root.append(button);
  }
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
