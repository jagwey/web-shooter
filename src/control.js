import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { BUILTIN_ACTIONS, GESTURES, actionFor, defaultBindings, migrateBindings, removeBinding, upsertBinding } from "./bindings.js";
import { DEFAULT_MODELS, OPENAI_PRESETS, autoTileWorkspace, chatWithAi, fetchOllamaModels, optimizeSettingsWithAi, sendAiGreeting, testAiConnection } from "./ai.js";
import { checkForUpdate, emitTo, inDesktop, installUpdate, invoke, listen } from "./desktop.js";
import { classifyGesture, hollowPurpleReady, isFingerExtended, isPeaceSign, isFingerGun, isPowerFist, isInFaceDeadzone, voteGesture, wristDepths } from "./gestures.js";
import { createHandFilter, filterLandmarks, predict } from "./filter.js";
import { registerCustomLook } from "./effects.js";
import { clientOf } from "./target.js";
import { flickAim, flickImpulse, throwToMonitor } from "./throw.js";
import { getLang, initI18n, setLang, t } from "./i18n.js";
import { activeProfile, createProfile, loadProfiles, recordMs, recordShot, removeProfile, saveProfiles } from "./profiles.js";
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
  cameraExpanded: false,
  cameraMirrored: true,
  hands: [
    { lastGesture: null, grab: null, samples: [], filter: null, votes: [] },
    { lastGesture: null, grab: null, samples: [], filter: null, votes: [] },
  ],
  pendingCloses: new Map(),
  lastHit: "",
  holders: [],
  windowCount: 0,
  win32: false,
  renderFps: 0,
  detectMs: 0,
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
  minimize: "actionMinimize",
  overlay_toggle: "actionOverlay",
  show_control: "actionShow",
};

const GESTURE_KEYS = {
  web: "gestureWeb",
  fist: "gestureFist",
  palm: "gesturePalm",
  flick: "gestureFlick",
  gojo: "gestureGojo",
  point: "gesturePoint",
};
const ACTION_COOLDOWN_MS = 600;
// Fast motion blurs the hand for a few frames; keep grabs alive instead of dropping the window.
const MISS_GRACE_MS = 300;
// Pointer lead along hand velocity; roughly one camera frame of hidden latency.
const PREDICT_MS = 12;
// Hollow Purple: the two-hand stance must hold this long, and the webbed tab stays a target this long after release.
const PURPLE_HOLD_MS = 420;
const PURPLE_TARGET_MS = 3000;

let profiles = null;
let profileSaveTimer = 0;

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
      if (!state.settings) return;
      const previous = state.settings.cameraDeviceId;
      state.settings.cameraDeviceId = deviceId;
      camSelect.disabled = true;
      // startCamera opens the new device before closing the old one, so a failed switch keeps the old image.
      const ok = await startCamera();
      if (!ok && state.stream) state.settings.cameraDeviceId = previous;
      await persist();
      camSelect.disabled = false;
      renderCameraSelect();
    });
  }
  navigator.mediaDevices?.addEventListener?.("devicechange", () => listCameras());

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

  const aiSniperBtn = document.getElementById("aiSniperBtn");
  if (aiSniperBtn) {
    aiSniperBtn.addEventListener("click", () => askAiAt(null));
  }
  const aiOcrBtn = document.getElementById("aiOcrBtn");
  if (aiOcrBtn) {
    aiOcrBtn.addEventListener("click", () => scanCameraDocument());
  }
  const recordGestureBtn = document.getElementById("recordCustomGestureBtn");
  if (recordGestureBtn) {
    recordGestureBtn.addEventListener("click", () => {
      const nameInput = document.getElementById("customGestureName");
      const actionSelect = document.getElementById("customGestureAction");
      saveCurrentCustomGesture(nameInput?.value, actionSelect?.value);
      if (nameInput) nameInput.value = "";
    });
  }
  renderCustomGesturesList();

  const safetyToggle = document.getElementById("safetyToggle");
  if (safetyToggle) {
    safetyToggle.addEventListener("click", () => {
      state.settings.safetyGuard = !state.settings.safetyGuard;
      persist();
    });
  }

  const cameraExpandBtn = document.getElementById("cameraExpandBtn");
  if (cameraExpandBtn) {
    cameraExpandBtn.addEventListener("click", () => {
      state.cameraExpanded = !state.cameraExpanded;
      document.getElementById("cameraStage")?.classList.toggle("expanded", state.cameraExpanded);
    });
  }

  const cameraMirrorBtn = document.getElementById("cameraMirrorBtn");
  if (cameraMirrorBtn) {
    cameraMirrorBtn.addEventListener("click", () => {
      state.cameraMirrored = !state.cameraMirrored;
      document.getElementById("cameraStage")?.classList.toggle("mirrored", state.cameraMirrored);
    });
  }

  const fullscreenToggleBtn = document.getElementById("fullscreenToggleBtn");
  if (fullscreenToggleBtn) {
    fullscreenToggleBtn.addEventListener("click", async () => {
      try {
        if (inDesktop()) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          const isMax = await win.isMaximized();
          if (isMax) {
            await win.unmaximize();
          } else {
            await win.maximize();
          }
          return;
        }
      } catch (err) {
        console.warn("Tauri window maximize error:", err);
      }
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });
  }

  const websToggle = document.getElementById("websToggle");
  if (websToggle) {
    websToggle.addEventListener("click", () => {
      state.settings.showWebs = !state.settings.showWebs;
      emitTo("overlay", "overlay-settings", { showWebs: state.settings.showWebs });
      persist();
      render();
    });
  }

  const focusFrameToggle = document.getElementById("focusFrameToggle");
  if (focusFrameToggle) {
    focusFrameToggle.addEventListener("click", () => {
      state.settings.showFocusFrame = !state.settings.showFocusFrame;
      state.settings.focusFrameOnly = !state.settings.showWebs && state.settings.showFocusFrame;
      emitTo("overlay", "overlay-settings", {
        showFocusFrame: state.settings.showFocusFrame,
        focusFrameOnly: state.settings.focusFrameOnly,
      });
      persist();
      render();
    });
  }

  const dualHandsToggle = document.getElementById("dualHandsToggle");
  if (dualHandsToggle) {
    dualHandsToggle.addEventListener("click", () => {
      state.settings.dualHands = !state.settings.dualHands;
      persist();
      render();
    });
  }

  const bodyTrackingToggle = document.getElementById("bodyTrackingToggle");
  if (bodyTrackingToggle) {
    bodyTrackingToggle.addEventListener("click", () => {
      state.settings.bodyTracking = !state.settings.bodyTracking;
      persist();
      render();
    });
  }

  wireCustomFx();
  wireAi();

  const refreshCamerasBtn = document.getElementById("refreshCamerasBtn");
  if (refreshCamerasBtn) {
    refreshCamerasBtn.addEventListener("click", async () => {
      await listCameras();
      if (!state.stream) startCamera();
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

function wireCustomFx() {
  const pInput = document.getElementById("customPrimary");
  const gInput = document.getElementById("customGlow");
  const partInput = document.getElementById("customParticle");
  const styleSelect = document.getElementById("customStyle");
  const thickSlider = document.getElementById("customThickness");
  const previewBtn = document.getElementById("customPreviewBtn");
  const saveBtn = document.getElementById("customSaveBtn");

  const syncToUI = () => {
    const fx = state.settings?.customFx || {
      primary: "#00f5ff",
      glow: "#a855f7",
      particle: "#ffffff",
      style: "sparks",
      thickness: 3,
    };
    if (pInput && fx.primary) pInput.value = fx.primary;
    if (gInput && fx.glow) gInput.value = fx.glow;
    if (partInput && fx.particle) partInput.value = fx.particle;
    if (styleSelect && fx.style) styleSelect.value = fx.style;
    if (thickSlider && fx.thickness) thickSlider.value = fx.thickness;
  };

  if (previewBtn) {
    previewBtn.addEventListener("click", async () => {
      const custom = {
        primary: pInput?.value || "#00f5ff",
        glow: gInput?.value || "#a855f7",
        particle: partInput?.value || "#ffffff",
        style: styleSelect?.value || "sparks",
        thickness: Number(thickSlider?.value) || 3,
      };
      registerCustomLook(custom);
      emitTo("overlay", "overlay-settings", { customFx: custom });
      emitTo("overlay", "overlay-preset", { preset: "custom" });
      if (!state.overlay?.visible) await toggleOverlay();
      emitTo("overlay", "overlay-shot", { x: 0.5, y: 0.5 });
      playThwip();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const custom = {
        primary: pInput?.value || "#00f5ff",
        glow: gInput?.value || "#a855f7",
        particle: partInput?.value || "#ffffff",
        style: styleSelect?.value || "sparks",
        thickness: Number(thickSlider?.value) || 3,
      };
      state.settings.customFx = custom;
      state.settings.theme = "custom";
      state.settings.fxPreset = "custom";
      registerCustomLook(custom);
      emitTo("overlay", "overlay-settings", { customFx: custom });
      emitTo("overlay", "overlay-preset", { preset: "custom" });
      applyTheme("custom");
      await persist();
      render();
    });
  }

  state._syncCustomFxUI = syncToUI;
}

function wireAi() {
  const greetingBtn = document.getElementById("aiGreetingBtn");
  if (greetingBtn) {
    greetingBtn.addEventListener("click", async () => {
      appendAiChat("user", "👋 Merhaba! Sistem durumunu kontrol et.");
      const res = await sendAiGreeting(state.settings, {
        fps: state.renderFps,
        delegate: state.delegate,
        monitors: state.monitors,
      });
      appendAiChat("bot", res.text);
    });
  }

  const optimizeBtn = document.getElementById("aiOptimizeBtn");
  if (optimizeBtn) {
    optimizeBtn.addEventListener("click", async () => {
      appendAiChat("user", "⚡ Sistemi otomatik optimize et");
      const res = await chatWithAi(state.settings, "optimize et", {
        fps: state.renderFps,
        delegate: state.delegate,
        monitors: state.monitors,
      });
      if (res.appliedSettings) {
        state.settings = { ...state.settings, ...res.appliedSettings };
        await persist();
        render();
      }
      appendAiChat("bot", res.text);
    });
  }

  const tileBtn = document.getElementById("aiTileBtn");
  if (tileBtn) {
    tileBtn.addEventListener("click", async () => {
      appendAiChat("user", "🗂️ Pencereleri ekrana yerleştir");
      const windows = await invoke("list_windows").catch(() => []);
      const snap = await invoke("desktop_snapshot").catch(() => ({}));
      const res = await autoTileWorkspace(state.settings, windows, snap?.monitors || state.monitors);
      appendAiChat("bot", res.message);
    });
  }

  const chatForm = document.getElementById("aiChatForm");
  const chatInput = document.getElementById("aiChatInput");
  if (chatForm && chatInput) {
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = chatInput.value.trim();
      if (!val) return;
      chatInput.value = "";
      appendAiChat("user", val);
      const res = await chatWithAi(state.settings, val, {
        fps: state.renderFps,
        delegate: state.delegate,
        monitors: state.monitors,
        windows: await invoke("list_windows").catch(() => []),
      });
      if (res.appliedSettings) {
        state.settings = { ...state.settings, ...res.appliedSettings };
        await persist();
        render();
      }
      appendAiChat("bot", res.text);
    });
  }

  document.getElementById("aiSuggestChips")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ask]");
    if (!btn || !chatForm || !chatInput) return;
    chatInput.value = btn.dataset.ask;
    chatForm.requestSubmit();
  });

  const fetchModelsBtn = document.getElementById("aiFetchModelsBtn");
  if (fetchModelsBtn) {
    fetchModelsBtn.addEventListener("click", async () => {
      appendAiChat("user", "Ollama modelleri taranıyor...");
      const models = await fetchOllamaModels(state.settings.aiEndpoint);
      appendAiChat("bot", `Bulunan yerel modeller: ${models.join(", ")}`);
      if (models.length > 0) {
        state.settings.aiModel = models[0];
        const modelInput = document.getElementById("aiModel");
        if (modelInput) modelInput.value = models[0];
        persist();
      }
    });
  }
}

function appendAiChat(role, text) {
  const log = document.getElementById("aiChatLog");
  if (!log) return;
  const msgEl = document.createElement("div");
  msgEl.className = `ai-msg ${role === "user" ? "ai-user" : "ai-bot"}`;
  const strong = document.createElement("strong");
  strong.textContent = role === "user" ? "Sen: " : "Jagwey AI: ";
  const span = document.createElement("span");
  span.textContent = text;
  span.style.whiteSpace = "pre-wrap";
  msgEl.appendChild(strong);
  msgEl.appendChild(span);
  log.appendChild(msgEl);
  log.scrollTop = log.scrollHeight;
}

function applySettingsEffects() {
  if (state.settings.lang) initI18n(state.settings.lang);
  if (state.settings.customFx) {
    registerCustomLook(state.settings.customFx);
  }
  applyTheme(state.settings.theme || "sakura");
  setAudioEnabled(state.settings.soundEnabled !== false);
  emitTo("overlay", "overlay-settings", {
    showWebs: state.settings.showWebs !== false,
    showFocusFrame: state.settings.showFocusFrame !== false,
    focusFrameOnly: Boolean(state.settings.focusFrameOnly),
    customFx: state.settings.customFx,
  });
}

// Shots and best ms change many times a second; write storage at most every 2 s.
function queueProfileSave() {
  if (profileSaveTimer) return;
  profileSaveTimer = setTimeout(() => {
    profileSaveTimer = 0;
    saveProfiles(localStorage, profiles);
    renderProfiles();
  }, 2000);
}

function snapshotProfile() {
  if (!profiles || !state.settings) return;
  activeProfile(profiles).settings = structuredClone(state.settings);
  saveProfiles(localStorage, profiles);
}

async function switchProfile(id) {
  snapshotProfile();
  profiles.activeId = id;
  const next = activeProfile(profiles);
  if (next.settings) state.settings = { ...state.settings, ...structuredClone(next.settings) };
  applySettingsEffects();
  await persist();
}

function wireProfiles() {
  const select = document.getElementById("profileSelect");
  const nameInput = document.getElementById("profileName");
  select.addEventListener("change", () => switchProfile(select.value));
  document.getElementById("profileAdd").addEventListener("click", async () => {
    snapshotProfile();
    const created = createProfile(profiles, nameInput.value, state.settings);
    nameInput.value = "";
    await switchProfile(created.id);
  });
  document.getElementById("profileDelete").addEventListener("click", async () => {
    const current = activeProfile(profiles);
    if (!window.confirm(`${t("profileDelete")}: ${current.name}?`)) return;
    if (!removeProfile(profiles, current.id)) return;
    const next = activeProfile(profiles);
    if (next.settings) state.settings = { ...state.settings, ...structuredClone(next.settings) };
    applySettingsEffects();
    await persist();
  });
}

function renderProfiles() {
  const select = document.getElementById("profileSelect");
  if (!profiles || !select) return;
  const active = activeProfile(profiles);
  const signature = profiles.list.map((p) => `${p.id}:${p.name}`).join("|");
  if (select.dataset.sig !== signature) {
    select.replaceChildren(...profiles.list.map((p) => new Option(p.name, p.id)));
    select.dataset.sig = signature;
  }
  select.value = active.id;
  document.getElementById("profileDelete").disabled = profiles.list.length <= 1;
  document.getElementById("profileName").placeholder = t("profileNamePh");
  document.getElementById("profileStats").textContent = t("profileStats")
    .replace("{shots}", active.stats.shots)
    .replace("{best}", active.stats.bestMs == null ? "—" : `${active.stats.bestMs}ms`);
}

async function boot() {
  paintLang();
  const loaded = await invoke("get_settings");
  state.settings = loaded?.unsupported ? fallbackSettings() : loaded;
  profiles = loadProfiles(localStorage);
  const startProfile = activeProfile(profiles);
  if (startProfile.settings) {
    state.settings = { ...state.settings, ...startProfile.settings };
    invoke("save_settings", { settings: state.settings });
  }
  if (state.settings) state.settings.bindings = migrateBindings(state.settings.bindings);
  wireProfiles();
  applySettingsEffects();

  await refreshDesktop();
  offerUpdate();
  document.getElementById("checkUpdateBtn").addEventListener("click", manualUpdateCheck);
  listen("monitors-changed", (event) => {
    state.monitors = event.payload.monitors || [];
    if (event.payload.fallback) setMessage("monitorBanner", t("monitorGone"));
    if (event.payload.frame) {
      state.overlay = { ...state.overlay, ...event.payload.frame };
      emitTo("overlay", "overlay-frame", state.overlay);
    }
    render();
  });
  listen("overlay-visibility", (event) => {
    state.overlay = { ...(state.overlay || {}), visible: event.payload.visible, ...event.payload.frame };
    if (event.payload.frame) emitTo("overlay", "overlay-frame", state.overlay);
    if (event.payload.visible && state.cameraWanted) startCamera();
    considerCold();
    render();
  });
  listen("render-fps", (event) => {
    state.renderFps = event.payload.fps || 0;
    const fpsEl = document.getElementById("fpsValue");
    if (fpsEl) fpsEl.textContent = String(state.renderFps);
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
  if (state.settings.onboarded) {
    // Start the camera first so a UI paint error can never block hand tracking.
    state.cameraWanted = true;
    startCamera();
    showHome();
  } else {
    showStep("welcome");
  }
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
    fxPreset: "sakura",
    bindings: defaultBindings(),
    cameraDeviceId: "",
    targetFps: 120,
    soundEnabled: true,
    showWebs: true,
    showFocusFrame: true,
    dualHands: true,
    bodyTracking: false,
    customFx: null,
    theme: "sakura",
    sniperTarget: "gemini_web",
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
  snapshotProfile();
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

let landmarker = null;
let landmarkerLoading = false;

// Optional body tracking (settings.bodyTracking): pose lite model, used only for arm depth.
let poseLandmarker = null;
let poseLoading = false;
const POSE_GAP_MS = 80;
const POSE_FRESH_MS = 300;

async function ensurePose() {
  if (poseLandmarker || poseLoading) return;
  poseLoading = true;
  // shortcut: CDN only (no bundled pose model), offline means span-ratio fallback; bundle the .task if offline use matters.
  const wasm = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
  const model = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
  try {
    const vision = await FilesetResolver.forVisionTasks(wasm);
    for (const delegate of ["GPU", "CPU"]) {
      try {
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: model, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        break;
      } catch (err) {
        console.warn(`[MediaPipe] Pose ${delegate} failed`, err);
      }
    }
  } catch (err) {
    console.warn("[MediaPipe] Pose load failed", err);
  }
  poseLoading = false;
}

const WORKER_BOOT_MS = 25000;

/** Resolves {tag} once the worker's model is ready, or null (then the main-thread path runs). */
function startWorker(sources) {
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL("./hands-worker.js", import.meta.url), { type: "module" });
    } catch (err) {
      console.warn("[MediaPipe] Worker unavailable", err);
      resolve(null);
      return;
    }
    const fail = (why) => {
      console.warn("[MediaPipe] Worker failed, main thread fallback:", why);
      clearTimeout(timer);
      worker.terminate();
      if (state.worker === worker) state.worker = null;
      state.workerReady = false;
      state.inFlight = false;
      resolve(null);
    };
    const timer = setTimeout(() => fail("timeout"), WORKER_BOOT_MS);
    worker.onerror = (event) => fail(event.message || "error");
    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "ready") {
        clearTimeout(timer);
        state.worker = worker;
        state.workerReady = true;
        state.delegate = msg.delegate;
        worker.onerror = (e) => {
          // A crash after boot: drop to the main thread and keep the camera loop alive.
          console.warn("[MediaPipe] Worker crashed", e.message);
          worker.terminate();
          state.worker = null;
          state.workerReady = false;
          state.inFlight = false;
          ensureLandmarker().then((lm) => lm && scheduleDetect(0));
        };
        resolve({ tag: msg.tag });
      } else if (msg.type === "error") {
        fail(msg.message);
      } else if (msg.type === "hands") {
        if (state.worker !== worker) return;
        state.inFlight = false;
        state.world = msg.world;
        if (msg.pose) state.pose = { landmarks: msg.pose, at: performance.now() };
        if (!state.stream) return;
        // Round trip, not just inference: what the user actually feels.
        onHands(msg.hands, performance.now() - state.sentAt);
      }
    };
    worker.postMessage({ type: "init", sources });
  });
}

async function ensureLandmarker() {
  if (state.worker && state.workerReady) return state.worker;
  if (landmarker) return landmarker;
  if (landmarkerLoading) return null;
  landmarkerLoading = true;

  const modelLabel = document.getElementById("modelLabel");
  if (modelLabel) modelLabel.textContent = "El modeli yükleniyor…";

  // Sources to try: 1) Local wasm & model, 2) Official CDN
  const sources = [
    {
      wasm: new URL("/mediapipe", location.href).href,
      model: new URL("/models/hand_landmarker.task", location.href).href,
      tag: "Yerel",
    },
    {
      wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm",
      model: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      tag: "CDN",
    },
  ];

  // Worker first: detection off the main thread keeps UI, overlay and cursor smooth.
  const ready = await startWorker(sources);
  if (ready) {
    landmarkerLoading = false;
    if (modelLabel) modelLabel.textContent = `${t("modelReady")} · ${state.delegate} (${ready.tag}, worker)`;
    return state.worker;
  }

  for (const src of sources) {
    try {
      console.log(`[MediaPipe] Initializing with ${src.tag}...`);
      const vision = await FilesetResolver.forVisionTasks(src.wasm);

      // Attempt GPU first, then CPU
      try {
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: src.model,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });
        state.delegate = "GPU";
      } catch (gpuErr) {
        console.warn("[MediaPipe] GPU failed, falling back to CPU", gpuErr);
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: src.model,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });
        state.delegate = "CPU";
      }

      if (landmarker) {
        state.workerReady = true;
        landmarkerLoading = false;
        if (modelLabel) {
          modelLabel.textContent = `${t("modelReady")} · ${state.delegate} (${src.tag})`;
        }
        return landmarker;
      }
    } catch (err) {
      console.warn(`[MediaPipe] Failed with ${src.tag}:`, err);
    }
  }

  landmarkerLoading = false;
  if (modelLabel) modelLabel.textContent = t("modelMissing");
  return null;
}

async function openStream(deviceId) {
  // Configure video constraints for ideal resolution 640x360 (16:9 widescreen) at 30-60 FPS
  // with fallback to 640x480 (4:3) if overconstrained.
  const sizes = [
    { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 } },
    { width: { ideal: 640 }, height: { ideal: 360 } },
    { width: { ideal: 640 }, height: { ideal: 480 } },
  ];
  const rates = [
    { ideal: 60, min: 30 },
    { ideal: 30, min: 15 },
    { ideal: 30 },
  ];
  let lastError;
  for (const size of sizes) {
    for (const rate of rates) {
      const videoConstraints = {
        ...size,
        frameRate: rate,
      };
      if (deviceId) videoConstraints.deviceId = { exact: deviceId };
      else videoConstraints.facingMode = "user";
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      } catch (error) {
        lastError = error;
        if (error?.name !== "OverconstrainedError") throw error;
      }
    }
  }
  throw lastError;
}

const VIRTUAL_CAMERA = /droidcam|obs|virtual|manycam|xsplit|snap camera|iriun|epoccam|camo/i;

// Virtual cams (DroidCam, OBS...) give a blank frame when their source is off, so default to a real camera.
async function preferRealCamera(stream) {
  if (!VIRTUAL_CAMERA.test(stream.getVideoTracks()[0]?.label || "")) return stream;
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const real = devices.find((d) => d.kind === "videoinput" && d.deviceId && !VIRTUAL_CAMERA.test(d.label));
  if (!real) return stream;
  try {
    const next = await openStream(real.deviceId);
    stream.getTracks().forEach((track) => track.stop());
    return next;
  } catch {
    return stream;
  }
}

async function startCamera() {
  // Rapid switches: only the latest call may attach its stream.
  const token = (state.cameraToken = (state.cameraToken || 0) + 1);
  state.cameraWanted = true;
  state.cameraPaused = false;
  setMessage("cameraMessage", "");
  setMessage("onboardCameraMessage", "");
  try {
    const wanted = state.settings?.cameraDeviceId;
    let stream;
    try {
      stream = await openStream(wanted);
    } catch (error) {
      // Saved device unplugged: fall back to the default camera instead of failing forever.
      const missing = error?.name === "NotFoundError" || error?.name === "OverconstrainedError";
      if (!wanted || !missing || state.stream) throw error;
      stream = await openStream(null);
      state.settings.cameraDeviceId = "";
    }
    if (!state.settings?.cameraDeviceId) stream = await preferRealCamera(stream);
    if (token !== state.cameraToken) {
      stream.getTracks().forEach((track) => track.stop());
      return true; // superseded, not failed: the caller must not revert the newer choice

    }
    cancelDetect();
    stopTracks();
    state.stream = stream;
    state.lastVideoTime = -1;
    video.srcObject = stream;
    await video.play();
    document.getElementById("cameraRetry").hidden = true;
    await describeCamera();
    render();

    ensureLandmarker().then((lm) => {
      if (lm) {
        scheduleDetect(0);
      }
    }).catch((e) => {
      console.error("[MediaPipe] ensureLandmarker error:", e);
    });

    return true;
  } catch (error) {
    // A failed switch keeps the camera that is already running.
    if (!state.stream) state.cameraWanted = false;
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
  cancelDetect();
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

function cancelDetect() {
  clearTimeout(state.detectTimer);
  if (state.frameCb) video.cancelVideoFrameCallback?.(state.frameCb);
  state.frameCb = 0;
}

function scheduleDetect(delay) {
  cancelDetect();
  if (!state.stream) return;
  state.detectTimer = window.setTimeout(detectTick, delay);
}

async function detectTick() {
  const useWorker = Boolean(state.worker && state.workerReady);
  // Backpressure: skip capture if pipeline is already processing a frame
  if (!state.stream || !(useWorker || landmarker) || state.inFlight) {
    scheduleDetect(20);
    return;
  }
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    scheduleDetect(20);
    return;
  }
  // Frame deduplication: skip redundant frames if camera timestamp has not advanced
  if (video.currentTime === state.lastVideoTime) {
    // Wait for the camera's next frame instead of polling, so detection starts the moment it lands.
    if (video.requestVideoFrameCallback) {
      cancelDetect();
      state.frameCb = video.requestVideoFrameCallback(() => {
        state.frameCb = 0;
        detectTick();
      });
    } else {
      scheduleDetect(10);
    }
    return;
  }
  state.lastVideoTime = video.currentTime;
  if (useWorker) {
    // One frame in flight; the worker's reply runs onHands, which schedules the next tick.
    state.inFlight = true;
    try {
      // Downscale frame to 480x270 for zero-copy transmission to worker
      const bitmap = await createImageBitmap(video, { resizeWidth: 480, resizeHeight: 270 });
      if (!state.worker) {
        bitmap.close();
        state.inFlight = false;
        return;
      }
      state.sentAt = performance.now();
      state.worker.postMessage(
        { type: "frame", bitmap, time: state.sentAt, body: Boolean(state.settings?.bodyTracking) },
        [bitmap]
      );
    } catch {
      state.inFlight = false;
      scheduleDetect(30);
    }
    return;
  }
  try {
    state.inFlight = true;
    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);
    const detectMs = performance.now() - now;

    const hands = result.landmarks || [];
    state.world = result.worldLandmarks || [];
    if (state.settings?.bodyTracking) {
      if (!poseLandmarker) ensurePose();
      else if (now - (state.pose?.at || 0) >= POSE_GAP_MS) {
        const pose = poseLandmarker.detectForVideo(video, now + 1).landmarks?.[0];
        state.pose = pose ? { landmarks: pose, at: now } : state.pose;
      }
    }
    state.inFlight = false;
    // onHands schedules the next tick via nextGap().
    onHands(hands, detectMs);
  } catch (err) {
    state.inFlight = false;
    scheduleDetect(50);
  }
}

function onHands(hands, detectMs) {
  state.detectMs = detectMs;
  const msEl = document.getElementById("msValue");
  if (msEl) msEl.textContent = `${Math.round(detectMs)}ms`;

  drawCameraLandmarks(hands);
  updateGestureHud(hands);

  if (!hands || hands.length === 0) {
    state.missStreak += 1;
    document.getElementById("handValue").textContent = t("handNo");
    if (performance.now() - (state.lastHandAt || 0) > MISS_GRACE_MS) {
      for (let i = 0; i < state.hands.length; i += 1) {
        if (state.hands[i].grab) releaseGrab(i);
        state.hands[i].lastGesture = null;
        state.hands[i].filter = null;
        state.hands[i].votes = [];
      }
    }
    armIdleRelease();
  } else {
    state.missStreak = 0;
    state.lastHandAt = performance.now();
    if (profiles && recordMs(activeProfile(profiles), detectMs)) queueProfileSave();
    clearTimeout(state.idleTimer);
    document.getElementById("handValue").textContent = hands.length >= 2 ? t("handBoth") : t("handOne");

    const maxHands = state.settings?.dualHands === false ? 1 : Math.min(hands.length, 2);
    for (let i = 0; i < maxHands; i += 1) {
      const rawLandmarks = hands[i];
      const handState = state.hands[i];

      const now = performance.now();
      // Higher smoothing setting = more responsive, so it scales the filter's resting cutoff.
      handState.filter ||= createHandFilter();
      const smoothing = state.settings?.smoothing || 0.65;
      const landmarks = filterLandmarks(handState.filter, rawLandmarks, now, {
        minCutoff: 3.0 * smoothing,
        beta: 13.0,
        dCutoff: 1.2,
      });

      handState.landmarks = landmarks;

      const ar = (video?.videoWidth && video?.videoHeight) ? (video.videoWidth / video.videoHeight) : (16 / 9);
      // 3D world shape + 3-of-5 frame vote: one noisy frame can neither fire nor drop a pose.
      const raw = classifyGesture(landmarks, state.world?.[i], state.settings?.customGestures || [], {
        wasActive: handState.lastGesture === "web",
        aspectRatio: ar,
      });
      handState.votes ||= [];
      const gesture = voteGesture(handState.votes, raw, handState.lastGesture);
      const bound = actionFor(state.settings.bindings, "gesture", gesture);
      const flickOwned = gesture === "flick" && (bound == null || bound === "minimize");
      let action = bound === "hollow_purple" || flickOwned ? null : bound;

      // Chin / Face resting deadzone guard:
      const restingInFace = isInFaceDeadzone(landmarks);
      // Transition guard: A grab is ONLY allowed if the hand was previously open (palm/web) or already holding.
      if (gesture === "palm" || gesture === "web") {
        handState.wasOpen = true;
      } else if (gesture !== "fist") {
        handState.wasOpen = false;
      }
      const validPowerGrip = gesture === "fist" ? isPowerFist(landmarks) : true;

      if (action === "grab") {
        if (restingInFace || !handState.wasOpen || !validPowerGrip) {
          action = null;
        }
      }
      if (restingInFace && action === "close_tab") {
        action = null;
      }

      const edge = gesture !== handState.lastGesture;
      const point = screenPoint(predict(handState.filter, 8, landmarks[8], PREDICT_MS));

      // Web and grab are holds: the webbed tab follows the hand until the pose ends.
      const holds = action === "grab" || action === "shoot";
      if (handState.grab && !holds) {
        releaseGrab(i);
      } else if (holds && !edge) {
        moveGrab(i, point);
      } else if (edge && (action === "grab" || !(now - (handState.lastFireAt || 0) < ACTION_COOLDOWN_MS))) {
        if (action && action !== "grab") handState.lastFireAt = now;
        runActionForHand(i, action, point, true);
        if (action === "shoot") beginGrab(i, point);
      }
      handState.lastGesture = gesture;
      if (raw === "flick") trackFlick(i, landmarks, now, flickOwned && gesture === "flick");
      else if (gesture !== "flick") {
        handState.flickSamples = [];
        handState.flickFired = false;
      }
    }

    for (let i = maxHands; i < state.hands.length; i += 1) {
      if (state.hands[i].grab) releaseGrab(i);
      state.hands[i].lastGesture = null;
      state.hands[i].votes = [];
    }
    checkPurpleStance(maxHands);
    checkSniperStance(maxHands);
  }

  const gap = nextGap(hands.length > 0, detectMs);
  scheduleDetect(gap);
}

// Dual Finger Gun stance: both hands form a finger gun, held for SNIPER_HOLD_MS (350ms).
// Crosshair is the midpoint between both index fingertips. Triggers askAiAt(crosshair).
const SNIPER_HOLD_MS = 350;

function checkSniperStance(handCount) {
  if (handCount < 2) {
    state.sniperSince = 0;
    state.sniperFired = false;
    return;
  }
  const hands = state.hands.slice(0, handCount);
  const now = performance.now();
  const points = hands.map((h) => h.landmarks);
  if (!points[0] || !points[1]) return;
  const isGun0 = isFingerGun(points[0]);
  const isGun1 = isFingerGun(points[1]);
  if (!isGun0 || !isGun1) {
    state.sniperSince = 0;
    state.sniperFired = false;
    return;
  }
  state.sniperSince ||= now;
  if (state.sniperFired || now - state.sniperSince < SNIPER_HOLD_MS) return;
  state.sniperFired = true;

  const tip0 = points[0][8];
  const tip1 = points[1][8];
  const midPoint = {
    x: (tip0.x + tip1.x) / 2,
    y: (tip0.y + tip1.y) / 2,
  };
  const targetPoint = screenPoint(midPoint);
  targetPoint.nx = midPoint.x;
  targetPoint.ny = midPoint.y;
  askAiAt(targetPoint);
}

// Gojo stance: one hand thrust at the camera, the other back at the chest, held PURPLE_HOLD_MS.
// Fires once per stance, and only at a webbed tab (held by the back hand, or released moments ago).
function checkPurpleStance(handCount) {
  const hands = state.hands.slice(0, handCount);
  const now = performance.now();
  const points = hands.map((h) => h.landmarks);
  const pose = state.settings?.bodyTracking && now - (state.pose?.at || 0) < POSE_FRESH_MS ? state.pose.landmarks : null;
  const front = handCount === 2 ? hollowPurpleReady(points, hands.map((h) => h.lastGesture), wristDepths(points, pose)) : -1;
  const grabbing = state.hands.some((h) => h.grab);
  // Both hands must hold the Gojo sign, one closer to the lens. A grab is not the combo.
  if (front < 0 || grabbing) {
    state.purpleSince = 0;
    state.purpleFired = false;
    return;
  }
  state.purpleSince ||= now;
  if (state.purpleFired || now - state.purpleSince < PURPLE_HOLD_MS) return;
  state.purpleFired = true;

  let webbed = null;
  for (const h of state.hands) {
    if (h.lastWebbed && now - h.lastWebbed.at < PURPLE_TARGET_MS) webbed = h.lastWebbed;
  }
  for (const h of state.hands) h.lastWebbed = null;
  cancelGrab(undefined, true);
  triggerHollowPurple(screenPoint(state.hands[front].landmarks[9]), webbed, { closeWindow: true });
}

let lastCamW = -1;
let lastCamH = -1;

function drawCameraLandmarks(hands) {
  const canvas = document.getElementById("cameraCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const w = vw || (lastCamW > 0 ? lastCamW : canvas.clientWidth || 320);
  const h = vh || (lastCamH > 0 ? lastCamH : canvas.clientHeight || 240);
  if (w !== lastCamW || h !== lastCamH) {
    canvas.width = w;
    canvas.height = h;
    lastCamW = w;
    lastCamH = h;
  }

  ctx.clearRect(0, 0, w, h);
  if (!hands || hands.length === 0) return;

  const BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index
    [0, 9], [9, 10], [10, 11], [11, 12], // Middle
    [0, 13], [13, 14], [14, 15], [15, 16], // Ring
    [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [5, 9], [9, 13], [13, 17], // Knuckles
  ];

  const colors = [
    { bone: "rgba(0, 245, 255, 0.75)", joint: "#00f5ff", tip: "#39ff14" },
    { bone: "rgba(244, 114, 182, 0.75)", joint: "#f472b6", tip: "#ffd700" },
  ];

  hands.forEach((hand, hIdx) => {
    const c = colors[hIdx % colors.length];

    ctx.lineWidth = 3;
    ctx.strokeStyle = c.bone;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const [start, end] of BONES) {
      const p1 = hand[start];
      const p2 = hand[end];
      if (!p1 || !p2) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.stroke();
    }

    for (let i = 0; i < hand.length; i += 1) {
      const p = hand[i];
      if (!p) continue;
      const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, isTip ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? c.tip : c.joint;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  });
}

function updateGestureHud(hands) {
  const badge = document.getElementById("gestureBadge");
  const icon = badge?.querySelector(".gesture-icon");
  const name = badge?.querySelector(".gesture-name");
  const liveDot = document.getElementById("liveCameraDot");

  if (!hands || hands.length === 0) {
    if (icon) icon.textContent = "✨";
    if (name) name.textContent = t("noGesture");
    if (liveDot) liveDot.style.background = "#eab308";
    updateFingerPills(null);
    return;
  }

  if (liveDot) liveDot.style.background = "#22c55e";
  const primaryHand = hands[0];
  const gesture = classifyGesture(primaryHand);

  const ICONS = {
    web: { icon: "🕸️", title: "AĞ ATIŞI (Spider-Man)" },
    fist: { icon: "✊", title: "PENCERE TUTMA (Yumruk)" },
    palm: { icon: "🖐️", title: "SERBEST BIRAK / İPTAL" },
    flick: { icon: "👌", title: "FİSKE — GÖREV ÇUBUĞU" },
    peace: { icon: "✌️", title: "SEKME KAPAT (Makas / V)" },
    gun: { icon: "👉", title: "NİŞAN AL (AI Soru)" },
    gojo: { icon: "🤌", title: "GOJO İŞARETİ" },
    point: { icon: "👆", title: "HEDEFLEME (İşaret)" },
  };

  let info = ICONS[gesture] || { icon: "👋", title: "El Algılandı" };
  if (hands.length >= 2) {
    if (isFingerGun(hands[0]) && isFingerGun(hands[1])) {
      info = { icon: "🎯", title: "AI SNIPER (Çift El Nişan)" };
    } else if (hollowPurpleReady(hands, hands.map((hand) => classifyGesture(hand))) >= 0) {
      info = { icon: "🟣", title: "HOLLOW PURPLE" };
    }
  }
  if (icon) icon.textContent = info.icon;
  if (name) name.textContent = info.title;

  updateFingerPills(primaryHand);
}

function updateFingerPills(landmarks) {
  const container = document.getElementById("fingerStatusBar");
  if (!container) return;
  const pills = container.querySelectorAll(".finger-pill");
  if (!landmarks) {
    pills.forEach((p) => p.classList.remove("active"));
    return;
  }

  const wrist = landmarks[0];
  const extended = [
    isFingerExtended(landmarks[4], landmarks[2], wrist),
    isFingerExtended(landmarks[8], landmarks[6], wrist),
    isFingerExtended(landmarks[12], landmarks[10], wrist),
    isFingerExtended(landmarks[16], landmarks[14], wrist),
    isFingerExtended(landmarks[20], landmarks[18], wrist),
  ];

  pills.forEach((pill, idx) => {
    if (extended[idx]) pill.classList.add("active");
    else pill.classList.remove("active");
  });
}

function nextGap(hand, detectMs) {
  // Right after losing the hand, re-detect on the very next camera frame.
  if (!hand) return state.missStreak > 6 ? 120 : 8;
  const targetFps = state.settings?.targetFps || 120;
  if (targetFps < 60 || state.settings?.fxPreset === "low" || state.settings?.fxPreset === "light") {
    return Math.max(33, detectMs * 1.5);
  }
  // detectTick already waits for the next camera frame; only a slow detector gets breathing room for the UI.
  return detectMs > 12 ? detectMs * 0.5 : 0;
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
    if (profiles) {
      recordShot(activeProfile(profiles));
      queueProfileSave();
    }
    playThwip();
    invoke("window_at", { x: point.sx, y: point.sy })
      .catch(() => null)
      .then((found) => {
        const win = found && !found.unsupported && found.hwnd ? clientOf(found) : null;
        emitTo("overlay", "overlay-shot", { x: point.nx, y: point.ny, win });
        if (win) {
          emitTo("overlay", "overlay-target-window", {
            id: handIndex,
            window: { ...win, title: found.title, grabbed: false },
          });
        }
      });
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
  if (action === "minimize" && point) {
    minimizeAt(point.sx, point.sy);
    return;
  }
  if (action === "close_tab" && point) {
    closeActiveTabAt(point.sx, point.sy);
    return;
  }
  if (action === "ask_ai" && point) {
    askAiAt(point);
    return;
  }
  if (action === "scan_document") {
    scanCameraDocument();
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
  if (action === "show_control") invoke("show_control_cmd").catch(() => {});
}

async function triggerHollowPurple(point, knownWin, opts = {}) {
  if (state.settings.hollowPurpleEnabled === false) return;

  emitTo("overlay", "overlay-purple", { x: point.nx, y: point.ny });
  playHollowPurple();

  let targetWin = knownWin || null;
  if (!targetWin?.hwnd && point) {
    targetWin = await invoke("window_at", { x: point.sx, y: point.sy });
  }
  // The combo closes the hit window only. No foreground fallback, so a miss does not close whatever is in front.
  if (!opts.closeWindow && (!targetWin || targetWin.unsupported || !targetWin.hwnd)) {
    targetWin = await invoke("get_foreground_window");
  }

  if (!targetWin || targetWin.unsupported || !targetWin.hwnd) {
    if (opts.closeWindow) setMessage("shellBanner", "Mor at hedef pencere bulamadı.");
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

    const forceWindow = Boolean(opts.closeWindow);
    const timer = window.setTimeout(async () => {
      if (state.pendingCloses.has(targetWin.hwnd)) {
        state.pendingCloses.delete(targetWin.hwnd);
        executeClose(targetWin, { forceWindow });
      }
    }, 2400);

    state.pendingCloses.set(targetWin.hwnd, timer);
    return;
  }

  executeClose(targetWin, { forceWindow: Boolean(opts.closeWindow) });
}

function trackFlick(handIndex, landmarks, now, armed) {
  const handState = state.hands[handIndex];
  const wrist = screenPoint(landmarks[0]);
  handState.flickSamples ||= [];
  handState.flickSamples.push({ t: now, x: wrist.sx, y: wrist.sy });
  if (handState.flickSamples.length > 10) handState.flickSamples.shift();
  if (!armed || handState.flickFired) return;
  if (now - (handState.lastFireAt || 0) < ACTION_COOLDOWN_MS) return;
  handState.flickFired = true;
  handState.lastFireAt = now;
  minimizeAt(wrist.sx, wrist.sy);
}

async function minimizeAt(x, y) {
  let found = null;
  try {
    found = await invoke("window_at", { x: Math.round(x), y: Math.round(y) });
  } catch {
    found = null;
  }
  if (!found || found.unsupported || !found.hwnd) {
    try {
      found = await invoke("get_foreground_window");
    } catch {
      found = null;
    }
  }
  if (!found || found.unsupported || !found.hwnd) {
    setMessage("shellBanner", "Simge durumuna indirilecek aktif pencere bulunamadı.");
    return;
  }
  try {
    await invoke("minimize_window", { hwnd: found.hwnd });
    setMessage("shellBanner", `🔻 Görev çubuğuna indirildi: ${found.title}`);
  } catch (err) {
    setMessage("shellBanner", `İndirilmedi: ${err}`);
  }
}

async function closeActiveTabAt(x, y) {
  let found = null;
  try {
    found = await invoke("window_at", { x: Math.round(x), y: Math.round(y) });
  } catch {
    found = null;
  }
  if (!found || found.unsupported || !found.hwnd) {
    try {
      found = await invoke("get_foreground_window");
    } catch {
      found = null;
    }
  }
  if (!found || found.unsupported || !found.hwnd) {
    setMessage("shellBanner", "Kapatılacak aktif pencere / sekme bulunamadı.");
    return;
  }
  const sensitiveRegex =
    /github|gitlab|google docs|google sheets|sheets\.google|docs\.google|notion|figma|visual studio|code|vscode|jira|trello|bank|pay|checkout|save|unsaved|draft|taslak|kaydedilmedi/i;
  if (state.settings?.safetyGuard !== false && sensitiveRegex.test(found.title)) {
    setMessage("shellBanner", `🛡️ Hassas Koruma: "${found.title}" açık, kapatma engellendi.`);
    return;
  }
  try {
    await invoke("close_active_tab", { hwnd: found.hwnd });
    setMessage("shellBanner", `✂️ Sekme kapatıldı: ${found.title}`);
  } catch (err) {
    try {
      await invoke("close_window", { hwnd: found.hwnd });
      setMessage("shellBanner", `✂️ Pencere kapatıldı: ${found.title}`);
    } catch (e2) {
      setMessage("shellBanner", `Kapatılamadı: ${err}`);
    }
  }
}

async function askAiAt(point) {
  let found = null;
  if (point) {
    try {
      found = await invoke("window_at", { x: Math.round(point.sx), y: Math.round(point.sy) });
    } catch {}
  }
  if (!found || found.unsupported || !found.hwnd) {
    try {
      found = await invoke("get_foreground_window");
    } catch {}
  }
  const title = found?.title || "Aktif Pencere";
  emitTo("overlay", "overlay-purple", { x: point?.nx ?? 0.5, y: point?.ny ?? 0.5 });
  setMessage("shellBanner", `🎯 Hedefe Nişan Alındı: ${title}`);

  const prompt = `🎯 Hedef Pencere: "${title}". Bu pencere hakkında hızlı özet çıkar, neler yapılabileceğini anlat.`;

  if (state.settings?.sniperTarget === "gemini_web") {
    try {
      navigator.clipboard?.writeText?.(prompt);
      window.open("https://gemini.google.com/app", "_blank");
      setMessage("shellBanner", "🚀 Gemini açıldı ve hedef bilgi panoya kopyalandı!");
    } catch {
      window.open("https://gemini.google.com/app", "_blank");
    }
    return;
  }

  const chatInput = document.getElementById("aiChatInput");
  if (chatInput) chatInput.value = prompt;
  appendAiMessage("user", prompt);
  const loadingId = appendAiMessage("bot", "⏳ Hedef pencere analiz ediliyor…");
  try {
    const res = await chatWithAi(state.settings, prompt, { windows: [found].filter(Boolean) });
    updateAiMessage(loadingId, res.text || "Hedef incelendi.");
  } catch (err) {
    updateAiMessage(loadingId, `Hata: ${err.message}`);
  }
}

async function scanCameraDocument() {
  const video = document.getElementById("cameraVideo");
  if (!video || !video.videoWidth) {
    setMessage("shellBanner", "Kamera görüntüsü henüz hazır değil.");
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);
  const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];

  appendAiMessage("user", "📄 [Kameradan Belge / Metin Oku]");
  const loadingId = appendAiMessage("bot", "🔍 Belgedeki metinler taranıyor…");

  const apiKey = state.settings?.aiApiKey?.trim();
  if (apiKey) {
    const model = state.settings?.aiModel?.trim() || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: "Lütfen bu resimde kameraya tutulan belgedeki veya ekrandaki tüm metinleri harfiyen oku. Başlıkları, maddeleri ve satırları koruyarak Türkçe/İngilizce tam metni çıkar." },
                { inlineData: { mimeType: "image/jpeg", data: base64 } }
              ]
            }
          ]
        })
      });
      const data = await res.json();
      const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Metin bulunamadı.";
      updateAiMessage(loadingId, extractedText);
      try {
        await navigator.clipboard.writeText(extractedText);
        setMessage("shellBanner", "📄 Belge okundu ve metin panoya kopyalandı!");
      } catch {}
      return;
    } catch (err) {
      updateAiMessage(loadingId, `Görsel okuma hatası: ${err.message}`);
      return;
    }
  }

  updateAiMessage(loadingId, "💡 Kameradan optik metin okuma (OCR) için Ayarlar'dan ücretsiz Gemini API Key ekleyin.");
  setMessage("shellBanner", "Kameradan metin okumak için Gemini API Key gereklidir.");
}

function saveCurrentCustomGesture(name, action) {
  if (!name?.trim()) {
    setMessage("shellBanner", "Lütfen hareket için bir isim giriniz.");
    return;
  }
  const hand = state.hands.find((h) => h.landmarks && h.landmarks.length >= 21);
  if (!hand) {
    setMessage("shellBanner", "Kamerada el algılanamadı. Elinizi kadrajda tutun.");
    return;
  }
  state.settings.customGestures ||= [];
  const points = hand.landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
  state.settings.customGestures.push({
    name: name.trim(),
    action: action || "close_tab",
    points,
  });
  persist();
  renderCustomGesturesList();
  setMessage("shellBanner", "Yeni el hareketi başarıyla kaydedildi!");
}

function renderCustomGesturesList() {
  const container = document.getElementById("customGestureList");
  if (!container) return;
  const list = state.settings.customGestures || [];
  if (list.length === 0) {
    container.innerHTML = '<span style="font-size:0.75rem; color:var(--muted);">Henüz özel hareket kaydedilmedi.</span>';
    return;
  }
  container.innerHTML = "";
  list.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "row";
    row.style.justifyContent = "space-between";
    row.style.fontSize = "0.78rem";
    row.style.padding = "4px 0";
    row.style.borderBottom = "1px solid rgba(255,255,255,0.06)";
    row.innerHTML = `<span>✨ ${item.name} (${item.action})</span><button type="button" class="btn ghost danger" style="padding:2px 6px; font-size:0.7rem;">Sil</button>`;
    row.querySelector("button").addEventListener("click", () => {
      state.settings.customGestures.splice(idx, 1);
      persist();
      renderCustomGesturesList();
    });
    container.appendChild(row);
  });
}

async function executeClose(win, { forceWindow = false } = {}) {
  const useWindow = forceWindow || state.settings.closeMode === "window";
  const command = useWindow ? "close_window" : "close_active_tab";
  try {
    await invoke(command, { hwnd: win.hwnd });
  } catch (err) {
    setMessage("shellBanner", `Kapatılmadı: "${win.title}" (${err})`);
  }
}

async function beginGrab(handIndex, point) {
  // One window_at lookup at a time; moveGrab calls this every frame until it lands.
  if (state.hands[handIndex].grabbing) return;
  state.hands[handIndex].grabbing = true;
  let found;
  try {
    found = await invoke("window_at", { x: point.sx, y: point.sy });
  } finally {
    state.hands[handIndex].grabbing = false;
  }
  if (!found || found.unsupported || !found.hwnd) return;
  const box = clientOf(found);
  state.hands[handIndex].grab = {
    hwnd: found.hwnd,
    winX: found.x,
    winY: found.y,
    width: found.width,
    height: found.height,
    startSx: point.sx,
    startSy: point.sy,
    shown: box,
  };
  state.hands[handIndex].samples = [{ t: performance.now(), x: point.sx, y: point.sy }];
  state.lastHit = found.title;
  sendTether(handIndex, point, box || found);
  emitTo("overlay", "overlay-target-window", {
    id: handIndex,
    window: { ...(box || found), title: found.title, grabbed: true },
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
  // One move in flight. The next call applies the whole delta since the last real position.
  if (handState.moving) return;
  const grab = handState.grab;
  handState.moving = true;
  const x = Math.round(grab.winX + (point.sx - grab.startSx));
  const y = Math.round(grab.winY + (point.sy - grab.startSy));
  try {
    const moved = await invoke("move_window", { hwnd: grab.hwnd, x, y });
    if (handState.grab !== grab) return;
    const live = moved && moved.hwnd ? moved : null;
    const shown = clientOf(live) || grab.shown || { x, y, width: grab.width, height: grab.height, hwnd: grab.hwnd, title: state.lastHit };
    if (live) {
      grab.winX = live.x;
      grab.winY = live.y;
      grab.startSx = point.sx;
      grab.startSy = point.sy;
      grab.shown = shown;
    }
    handState.samples.push({ t: performance.now(), x: point.sx, y: point.sy });
    if (handState.samples.length > 8) handState.samples.shift();
    sendTether(handIndex, point, shown);
    emitTo("overlay", "overlay-target-window", {
      id: handIndex,
      window: { ...shown, title: state.lastHit, grabbed: true },
    });
  } finally {
    handState.moving = false;
  }
}

function sendTether(handIndex, point, win) {
  const frame = state.overlay || { x: 0, y: 0, width: 1, height: 1 };
  const box = clientOf(win) || win;
  emitTo("overlay", "overlay-tether", {
    id: handIndex,
    x0: point.nx,
    y0: point.ny,
    x1: (box.x + box.width / 2 - frame.x) / frame.width,
    y1: (box.y + box.height / 2 - frame.y) / frame.height,
  });
}

async function releaseGrab(handIndex) {
  const handState = state.hands[handIndex];
  const grab = handState.grab;
  handState.grab = null;
  handState.moving = false;
  emitTo("overlay", "overlay-clear", { id: handIndex });
  // Keep the net on the window until the splash ends; the overlay drops it when the effect is gone.
  if (grab?.hwnd) {
    emitTo("overlay", "overlay-target-window", {
      id: handIndex,
      window: {
        ...(grab.shown || {
          x: grab.winX,
          y: grab.winY,
          width: grab.width,
          height: grab.height,
          hwnd: grab.hwnd,
        }),
        hwnd: grab.hwnd,
        title: state.lastHit,
        grabbed: false,
      },
    });
  } else {
    emitTo("overlay", "overlay-target-window", { id: handIndex, clear: true });
  }
  if (!grab) return;
  handState.lastWebbed = { hwnd: grab.hwnd, title: state.lastHit, at: performance.now() };

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
    const dest = throwToMonitor(
      state.monitors,
      { x: grab.winX, y: grab.winY, width: grab.width, height: grab.height },
      vx,
      vy,
    );
    playFling(speed);
    if (dest) {
      await invoke("place_window", { hwnd: grab.hwnd, ...dest });
      setMessage("shellBanner", "Pencere diğer ekrana atıldı.");
    } else {
      await invoke("fling_window", { hwnd: grab.hwnd, vx, vy });
    }
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
  state.activeDeviceId = track.getSettings().deviceId || "";
  await listCameras();
  const match = state.videoDevices.find((device) => device.deviceId === state.activeDeviceId);
  state.deviceLabel = match?.label || track.label || t("deviceUnknown");
  render();
  await describeHolders();
}

async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.videoDevices = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  } catch {
    state.videoDevices = [];
  }
  renderCameraSelect();
}

function renderCameraSelect() {
  const select = document.getElementById("cameraSelect");
  if (!select) return;
  const devices = state.videoDevices || [];
  select.hidden = devices.length === 0;
  const current = state.activeDeviceId || state.settings?.cameraDeviceId;
  select.replaceChildren();
  devices.forEach((device, index) => {
    const opt = document.createElement("option");
    opt.value = device.deviceId;
    opt.textContent = device.label || `${t("camera")} ${index + 1}`;
    opt.selected = device.deviceId === current;
    select.append(opt);
  });
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
      state.inFlight = false;
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
  renderProfiles();

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

  const websToggle = document.getElementById("websToggle");
  if (websToggle) {
    websToggle.setAttribute("aria-pressed", String(state.settings.showWebs !== false));
  }

  const focusFrameToggle = document.getElementById("focusFrameToggle");
  if (focusFrameToggle) {
    focusFrameToggle.setAttribute("aria-pressed", String(state.settings.showFocusFrame !== false));
  }

  const dualHandsToggle = document.getElementById("dualHandsToggle");
  if (dualHandsToggle) {
    dualHandsToggle.setAttribute("aria-pressed", String(state.settings.dualHands !== false));
  }
  const bodyTrackingToggle = document.getElementById("bodyTrackingToggle");
  if (bodyTrackingToggle) {
    bodyTrackingToggle.setAttribute("aria-pressed", String(!!state.settings.bodyTracking));
  }

  if (state._syncCustomFxUI) state._syncCustomFxUI();

  // Missing elements must never abort render (a crash here used to stop the camera from starting).
  const setAttr = (id, name, value) => document.getElementById(id)?.setAttribute(name, value);
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setAttr("autostartToggle", "aria-pressed", String(state.settings.startWithWindows));
  setAttr("idleToggle", "aria-pressed", String(state.settings.releaseCameraWhenIdle));
  setText("cameraState", state.cameraPaused ? t("cameraPaused") : t("cameraHint"));
  setText("deviceLabel", state.deviceLabel || t("deviceUnknown"));
  paintLiveStatus();
  setText("hitLabel", `${t("lastHit")}: ${state.lastHit || t("noHit")}`);
  setText("win32Label", state.win32 ? t("win32Ready") : t("win32Stub"));
  setText("fpsValue", String(state.renderFps));

  renderTheme();
  renderCloseModeChips();
  renderSniperTargetChips();
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
    ["custom", "themeCustom"],
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

function renderSniperTargetChips() {
  const root = document.getElementById("sniperTargetChips");
  if (!root) return;
  root.replaceChildren();
  const targets = [
    ["gemini_web", "sniperTargetGemini"],
    ["chat", "sniperTargetChat"],
  ];
  const current = state.settings.sniperTarget || "gemini_web";
  for (const [target, key] of targets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = t(key);
    const active = current === target;
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", async () => {
      state.settings.sniperTarget = target;
      await persist();
      renderSniperTargetChips();
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
    ["groq", "aiGroq"],
    ["openrouter", "aiOpenRouter"],
    ["pollinations", "aiPollinations"],
    ["lmstudio", "aiLmStudio"],
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
      // A model name from another provider would just 404, so switch to this one's default.
      if (prov !== current) state.settings.aiModel = DEFAULT_MODELS[prov] || "";
      state.settings.aiProvider = prov;
      await persist();
    });
    root.append(button);
  }

  const keyRow = document.getElementById("aiKeyRow");
  const endpointRow = document.getElementById("aiEndpointRow");
  const modelRow = document.getElementById("aiModelRow");

  const preset = OPENAI_PRESETS[current];
  if (keyRow) keyRow.hidden = current === "none" || current === "ollama" || preset?.key === false;
  if (endpointRow) endpointRow.hidden = current === "none" || current === "gemini" || Boolean(preset);
  if (modelRow) modelRow.hidden = current === "none";

  const keyInput = document.getElementById("aiApiKey");
  if (keyInput && keyInput !== document.activeElement) keyInput.value = state.settings.aiApiKey || "";
  const endInput = document.getElementById("aiEndpoint");
  if (endInput && endInput !== document.activeElement) endInput.value = state.settings.aiEndpoint || "http://localhost:11434";
  const modInput = document.getElementById("aiModel");
  if (modInput && modInput !== document.activeElement) modInput.value = state.settings.aiModel || DEFAULT_MODELS[current] || "";
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
  renderMonitors(document.getElementById("onboardMonitors"));
  renderMonitors(document.getElementById("monitorList"));
  await persist();
}

function renderBindings() {
  const root = document.getElementById("bindingList");
  root.replaceChildren();
  for (const binding of state.settings.bindings) {
    const row = document.createElement("div");
    row.className = "binding";
    const label = document.createElement("span");
    label.className = "binding-action";
    label.textContent = actionLabel(binding.action);
    const trigger = document.createElement("kbd");
    trigger.className = "binding-trigger";
    trigger.textContent = `${binding.input.kind === "gesture" ? "✋" : "⌨"} ${inputLabel(binding.input)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn ghost";
    remove.textContent = t("bindingsRemove");
    remove.addEventListener("click", async () => {
      state.settings.bindings = removeBinding(state.settings.bindings, binding.id);
      await persist();
    });
    row.append(label, trigger, remove);
    root.append(row);
  }
}

function actionLabel(action) {
  return ACTION_KEYS[action] ? t(ACTION_KEYS[action]) : action;
}

function inputLabel(input) {
  if (input.kind === "gesture") return t(GESTURE_KEYS[input.value] || "kindGesture");
  // Stored as Tauri accelerator ("CommandOrControl+Alt+J"); show it the way users read keys.
  return input.value.replace("CommandOrControl", "Ctrl").split("+").join(" + ");
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

async function manualUpdateCheck() {
  const bar = document.getElementById("updateBar");
  const text = document.getElementById("updateText");
  const button = document.getElementById("updateBtn");
  const check = document.getElementById("checkUpdateBtn");
  check.disabled = true;
  bar.hidden = false;
  button.hidden = true;
  text.textContent = t("updateChecking");
  try {
    const update = await checkForUpdate({ loud: true });
    if (update) return showUpdate(update);
    let version = "";
    try { version = await (await import("@tauri-apps/api/app")).getVersion(); } catch {}
    text.textContent = t("updateLatest").replace("{v}", version);
    setTimeout(() => { if (button.hidden) bar.hidden = true; }, 4000);
  } catch {
    text.textContent = t("updateCheckFailed");
  } finally {
    check.disabled = false;
  }
}

async function offerUpdate() {
  const update = await checkForUpdate();
  if (update) showUpdate(update);
}

function showUpdate(update) {
  const bar = document.getElementById("updateBar");
  const text = document.getElementById("updateText");
  const button = document.getElementById("updateBtn");
  text.textContent = t("updateReady").replace("{v}", update.version);
  bar.hidden = false;
  button.hidden = false;
  button.disabled = false;
  button.onclick = async () => {
    button.disabled = true;
    try {
      await installUpdate(update, (pct) => {
        text.textContent = pct == null ? t("updateDownloading") : `${t("updateDownloading")} %${pct}`;
      });
    } catch {
      text.textContent = t("updateFailed");
      button.disabled = false;
    }
  };
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
    button.textContent = inputLabel({ kind: "hotkey", value: state.hotkeyDraft });
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
