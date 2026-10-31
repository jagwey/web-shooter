import { createBridge } from "./bridge.js";
import { createWebFx } from "./effects.js";
import { countExtendedFingers, isWebSign } from "./gestures.js";
import { getLang, initI18n, setLang, t } from "./i18n.js";
import {
  currentWindowScreen,
  loadScreens,
  openStage,
  screenApiAvailable,
  screenButtonLabel,
} from "./screens.js";
import "./style.css";

const SHOT_COOLDOWN_MS = 650;
const LINK_STALE_MS = 5000;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fx = createWebFx(ctx);

const startButton = document.getElementById("startCamera");
const stopButton = document.getElementById("stopCamera");
const placeholder = document.getElementById("placeholder");
const cameraMessage = document.getElementById("cameraMessage");
const handStatus = document.getElementById("handStatus");
const fingerCount = document.getElementById("fingerCount");
const fpsCounter = document.getElementById("fpsCounter");
const webStatus = document.getElementById("webStatus");
const modelMessage = document.getElementById("modelMessage");
const testShotButton = document.getElementById("testShot");
const detectButton = document.getElementById("detectScreens");
const openLooseButton = document.getElementById("openLoose");
const screenList = document.getElementById("screenList");
const screenMessage = document.getElementById("screenMessage");
const linkDot = document.getElementById("linkDot");
const linkLabel = document.getElementById("linkLabel");
const liveTag = document.getElementById("liveTag");

const bridge = createBridge();

let cameraStream = null;
let cameraRunning = false;
let hands = null;
let handsMissing = false;
let modelReady = false;
let screenRequest = 0;
let latestLandmarks = null;
let firing = false;
let lastShot = 0;
let lastFrameTime = performance.now();
let lastStagePing = 0;
let knownScreens = [];
let stageWindow = null;

initI18n();
wireLanguage();
wireCamera();
wireScreens();
wireBridge();
syncLink();
resizeCanvas();
requestAnimationFrame(renderLoop);
bootHands();

function setMessage(el, key) {
  if (!key) {
    delete el.dataset.i18n;
    el.textContent = "";
    return;
  }
  el.dataset.i18n = key;
  el.textContent = t(key);
}

function wireLanguage() {
  document.getElementById("langTr").addEventListener("click", () => setLang("tr"));
  document.getElementById("langEn").addEventListener("click", () => setLang("en"));
  document.addEventListener("jagwey:lang", () => {
    paintLangButtons();
    renderScreenList();
    syncLink();
  });
  paintLangButtons();
}

function paintLangButtons() {
  const lang = getLang();
  document.getElementById("langTr").setAttribute("aria-pressed", String(lang === "tr"));
  document.getElementById("langEn").setAttribute("aria-pressed", String(lang === "en"));
}

function wireCamera() {
  startButton.addEventListener("click", () => {
    startCamera();
  });
  stopButton.addEventListener("click", stopCamera);
  testShotButton.addEventListener("click", () => {
    resizeCanvas();
    const x = canvas.width * 0.62;
    const y = canvas.height * 0.72;
    fireAt(x, y);
  });
  window.addEventListener("pagehide", stopCamera);
}

function wireScreens() {
  detectButton.addEventListener("click", detectScreens);
  openLooseButton.addEventListener("click", () => {
    const screen = knownScreens[0] ?? currentWindowScreen();
    rememberStage(openStage(screen));
  });
  if (!screenApiAvailable()) {
    knownScreens = [currentWindowScreen()];
    setMessage(screenMessage, "screensUnsupported");
    renderScreenList();
  }
}

function wireBridge() {
  bridge.listen((message) => {
    if (!message || typeof message !== "object") return;
    switch (message.type) {
      case "hello":
      case "ping":
        if (message.role === "stage") {
          lastStagePing = Date.now();
          syncLink();
        }
        break;
      case "shot":
        break;
      default: {
        const unknown = message.type;
        console.warn("Unknown bridge message", unknown);
      }
    }
  });
  bridge.post({ type: "hello", role: "control", t: Date.now() });
  window.setInterval(() => {
    bridge.post({ type: "ping", role: "control", t: Date.now() });
    syncLink();
  }, 2000);
}

function bootHands() {
  const HandsCtor = window.Hands;
  if (typeof HandsCtor !== "function") {
    handsMissing = true;
    setMessage(modelMessage, "modelMissing");
    modelMessage.classList.add("error");
    return;
  }

  hands = new HandsCtor({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`,
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });

  hands.onResults((results) => {
    if (!modelReady) {
      modelReady = true;
      setMessage(modelMessage, "modelReady");
      modelMessage.classList.remove("error");
    }

    const now = performance.now();
    const delta = now - lastFrameTime;
    if (delta > 0) fpsCounter.textContent = String(Math.min(60, Math.round(1000 / delta)));
    lastFrameTime = now;

    const landmarks = results.multiHandLandmarks?.[0] ?? null;
    latestLandmarks = landmarks;
    if (!landmarks) {
      firing = false;
      setMessage(handStatus, "handNo");
      fingerCount.textContent = "0";
      setShooter(false);
      return;
    }

    setMessage(handStatus, "handYes");
    fingerCount.textContent = String(countExtendedFingers(landmarks));
    const webSign = isWebSign(landmarks);
    firing = webSign;
    setShooter(webSign);
    if (!webSign) return;

    const indexTip = landmarks[8];
    resizeCanvas();
    if (Date.now() - lastShot <= SHOT_COOLDOWN_MS) return;
    fireAt(indexTip.x * canvas.width, indexTip.y * canvas.height);
  });
}

async function startCamera() {
  if (cameraRunning) return;
  setMessage(cameraMessage, "cameraWait");
  cameraMessage.classList.remove("error");
  startButton.disabled = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    video.srcObject = cameraStream;
    await video.play();
    cameraRunning = true;
    placeholder.hidden = true;
    stopButton.hidden = false;
    if (!modelReady) setMessage(modelMessage, "modelLoading");
    liveTag.textContent = "LIVE";
    setMessage(cameraMessage, "cameraLive");
    resizeCanvas();
    processFrames();
  } catch (error) {
    console.error(error);
    setMessage(cameraMessage, cameraErrorKey(error));
    cameraMessage.classList.add("error");
    startButton.disabled = false;
    setMessage(startButton, "cameraRetry");
  }
}

function cameraErrorKey(error) {
  const name = error && error.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "cameraDenied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "cameraMissing";
  if (name === "NotReadableError") return "cameraBusy";
  return "cameraError";
}

function stopCamera() {
  cameraRunning = false;
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
  }
  cameraStream = null;
  video.srcObject = null;
  latestLandmarks = null;
  firing = false;
  placeholder.hidden = false;
  stopButton.hidden = true;
  startButton.disabled = false;
  setMessage(startButton, "cameraStart");
  liveTag.textContent = "CAM";
  if (!handsMissing) setMessage(modelMessage, modelReady ? "modelReady" : "modelIdle");
  setMessage(handStatus, "handNo");
  fingerCount.textContent = "0";
  setShooter(false);
  cameraMessage.classList.remove("error");
  setMessage(cameraMessage, "cameraIdle");
}

async function processFrames() {
  if (!cameraRunning) return;
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && hands) {
    try {
      await hands.send({ image: video });
    } catch (error) {
      console.error(error);
    }
  }
  requestAnimationFrame(processFrames);
}

function renderLoop(now) {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (latestLandmarks) drawSkeleton(latestLandmarks);
  fx.draw(now);
  requestAnimationFrame(renderLoop);
}

function resizeCanvas() {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function drawSkeleton(landmarks) {
  const drawConnectors = window.drawConnectors;
  const drawLandmarks = window.drawLandmarks;
  const connections = window.HAND_CONNECTIONS;
  ctx.save();
  if (typeof drawConnectors === "function" && connections) {
    drawConnectors(ctx, landmarks, connections, {
      color: "#9cf0c4",
      lineWidth: 3,
    });
  }
  if (typeof drawLandmarks === "function") {
    drawLandmarks(ctx, landmarks, {
      color: "#f3fff8",
      radius: 4,
      lineWidth: 2,
    });
  }
  ctx.restore();
}

function fireAt(x, y) {
  if (canvas.width < 2 || canvas.height < 2) return;
  lastShot = Date.now();
  fx.shoot(x, y);
  setShooter(true);
  bridge.post({
    type: "shot",
    x: x / canvas.width,
    y: y / canvas.height,
    t: Date.now(),
  });
  window.setTimeout(() => {
    if (!firing) setShooter(false);
  }, 280);
}

function setShooter(active) {
  setMessage(webStatus, active ? "firing" : "ready");
  webStatus.dataset.hot = active ? "true" : "false";
}

function showScreenResult(result) {
  knownScreens = result.screens;
  renderScreenList();
  screenMessage.classList.remove("error");
  if (!result.supported) setMessage(screenMessage, "screensUnsupported");
  else if (!result.isExtended) setMessage(screenMessage, "screensSingle");
  else setMessage(screenMessage, "");
}

async function detectScreens() {
  const request = ++screenRequest;
  detectButton.disabled = true;
  screenMessage.classList.remove("error");
  setMessage(screenMessage, "screensDetecting");
  const pending = loadScreens();
  const timer = window.setTimeout(() => {
    if (request !== screenRequest || !detectButton.disabled) return;
    detectButton.disabled = false;
    setMessage(screenMessage, "screensTimeout");
    screenMessage.classList.add("error");
  }, 8000);
  try {
    const result = await pending;
    if (request !== screenRequest) return;
    window.clearTimeout(timer);
    showScreenResult(result);
  } catch (error) {
    if (request !== screenRequest) return;
    window.clearTimeout(timer);
    console.error(error);
    knownScreens = [currentWindowScreen()];
    renderScreenList();
    setMessage(screenMessage, "screensDenied");
    screenMessage.classList.add("error");
  } finally {
    if (request === screenRequest) detectButton.disabled = false;
  }
}

function renderScreenList() {
  screenList.replaceChildren();
  knownScreens.forEach((screen, index) => {
    const row = document.createElement("div");
    row.className = "screen-row";
    const label = document.createElement("span");
    label.textContent = screenButtonLabel(screen, index);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn small";
    button.textContent = t("screensOpen");
    button.addEventListener("click", () => {
      rememberStage(openStage(screen));
    });
    row.append(label, button);
    screenList.append(row);
  });
}

function rememberStage(child) {
  if (!child) {
    setMessage(screenMessage, "popupBlocked");
    screenMessage.classList.add("error");
    return;
  }
  screenMessage.classList.remove("error");
  stageWindow = child;
  lastStagePing = Date.now();
  syncLink();
}

function syncLink() {
  const open = stageWindow && !stageWindow.closed;
  const fresh = Date.now() - lastStagePing < LINK_STALE_MS;
  const linked = Boolean(open || fresh);
  linkDot.classList.toggle("live", linked);
  setMessage(linkLabel, linked ? "screensLinked" : "screensIdle");
  if (stageWindow && stageWindow.closed) stageWindow = null;
}
