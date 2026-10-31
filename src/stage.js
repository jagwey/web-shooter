import { createBridge } from "./bridge.js";
import { createWebFx } from "./effects.js";
import { getLang, initI18n, t } from "./i18n.js";
import "./style.css";

const LINK_STALE_MS = 5000;

const canvas = document.getElementById("stageCanvas");
const ctx = canvas.getContext("2d");
const fx = createWebFx(ctx);
const bridge = createBridge();

const fullscreenButton = document.getElementById("fullscreenBtn");
const prompt = document.getElementById("fsPrompt");
const promptButton = document.getElementById("promptFullscreen");
const dismissPromptButton = document.getElementById("dismissPrompt");
const cleanButton = document.getElementById("cleanBtn");
const stageStatus = document.getElementById("stageStatus");
const stageLink = document.getElementById("stageLink");
const stageDot = document.getElementById("stageDot");

let lastControlPing = 0;
let clean = false;
let promptDismissed = false;
const wantsFullscreen = new URLSearchParams(window.location.search).get("fs") === "1";

function setMessage(el, key) {
  el.dataset.i18n = key;
  el.textContent = t(key);
}

initI18n();
fit();
syncChrome();
window.addEventListener("resize", fit);
document.addEventListener("fullscreenchange", syncChrome);
document.addEventListener("jagwey:lang", syncChrome);

fullscreenButton.addEventListener("click", toggleFullscreen);
promptButton.addEventListener("click", () => {
  enterFullscreen();
});
dismissPromptButton.addEventListener("click", () => {
  promptDismissed = true;
  syncChrome();
});
cleanButton.addEventListener("click", () => {
  clean = !clean;
  document.body.classList.toggle("clean", clean);
  syncChrome();
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "h" && event.key !== "H") return;
  clean = !clean;
  document.body.classList.toggle("clean", clean);
  syncChrome();
});

bridge.listen((message) => {
  if (!message || typeof message !== "object") return;
  switch (message.type) {
    case "shot":
      fit();
      fx.shoot(message.x * canvas.width, message.y * canvas.height);
      setMessage(stageStatus, "firing");
      window.setTimeout(() => {
        if (stageStatus.dataset.i18n === "firing") setMessage(stageStatus, "ready");
      }, 700);
      break;
    case "hello":
    case "ping":
      if (message.role === "control") {
        lastControlPing = Date.now();
        syncLink();
      }
      break;
    default: {
      const unknown = message.type;
      console.warn("Unknown bridge message", unknown);
    }
  }
});

bridge.post({ type: "hello", role: "stage", t: Date.now() });
window.setInterval(() => {
  bridge.post({ type: "ping", role: "stage", t: Date.now() });
  syncLink();
}, 2000);

if (wantsFullscreen && !document.fullscreenElement) prompt.hidden = false;

requestAnimationFrame(function loop(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  fx.draw(now);
  requestAnimationFrame(loop);
});

function fit() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(2, Math.floor(window.innerWidth * ratio));
  const height = Math.max(2, Math.floor(window.innerHeight * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function enterFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || typeof root.requestFullscreen !== "function") return;
  root.requestFullscreen().catch(() => {
    prompt.hidden = false;
  });
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  enterFullscreen();
}

function syncChrome() {
  const fullscreen = Boolean(document.fullscreenElement);
  prompt.hidden = fullscreen || !wantsFullscreen || promptDismissed;
  setMessage(fullscreenButton, fullscreen ? "stageExit" : "stageFullscreen");
  setMessage(cleanButton, clean ? "stageShow" : "stageClean");
  document.documentElement.lang = getLang() === "tr" ? "tr" : "en";
  syncLink();
}

function syncLink() {
  const linked = Date.now() - lastControlPing < LINK_STALE_MS;
  stageDot.classList.toggle("live", linked);
  setMessage(stageLink, linked ? "stageLinked" : "stageAlone");
}

window.addEventListener("storage", (event) => {
  if (event.key !== "jagwey-lang") return;
  initI18n();
});
