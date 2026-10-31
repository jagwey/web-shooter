import { createWebFx } from "./effects.js";
import { emitTo, listen } from "./desktop.js";
import "./style.css";

const canvas = document.getElementById("overlayCanvas");
const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
const fx = createWebFx(ctx, {
  onImpact(x, y) {
    if (!frame) return;
    emitTo("control", "web-impact", {
      x: frame.x + (x / canvas.width) * frame.width,
      y: frame.y + (y / canvas.height) * frame.height,
    });
  },
});

let frame = { x: 0, y: 0, width: 1, height: 1 };
const tethers = new Map();
let preset = "spiderman";
let running = false;
let frames = 0;
let fpsStamp = performance.now();
const dprCap = { full: 1.5, low: 1 };

function fit() {
  const cap = preset === "low" || preset === "light" ? dprCap.low : dprCap.full;
  const ratio = Math.min(window.devicePixelRatio || 1, cap);
  const width = Math.max(2, Math.floor(window.innerWidth * ratio));
  const height = Math.max(2, Math.floor(window.innerHeight * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function kick() {
  if (running) return;
  running = true;
  requestAnimationFrame(loop);
}

function loop(now) {
  const busy = fx.hasWork() || tethers.size > 0;
  if (!busy) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    running = false;
    emitTo("control", "render-fps", { fps: 0, mode: "idle" });
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  fx.draw(now);
  for (const line of tethers.values()) {
    drawTether(line);
  }
  frames += 1;
  if (now - fpsStamp >= 500) {
    const fps = Math.round((frames * 1000) / (now - fpsStamp));
    frames = 0;
    fpsStamp = now;
    emitTo("control", "render-fps", { fps, mode: "active" });
  }
  requestAnimationFrame(loop);
}

function drawTether(line) {
  const x0 = line.x0 * canvas.width;
  const y0 = line.y0 * canvas.height;
  const x1 = line.x1 * canvas.width;
  const y1 = line.y1 * canvas.height;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy) || 1;
  const perpX = -dy / dist;
  const perpY = dx / dist;

  const sag = Math.min(dist * 0.04, 25);
  const cx = (x0 + x1) / 2 + perpX * (sag * 0.4);
  const cy = (y0 + y1) / 2 + Math.abs(perpY * sag) + 4;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const isLow = preset === "low" || preset === "light";
  let glowColor = "#9cf0c4";
  let coreColor = "rgba(216, 255, 233, 0.95)";
  if (preset === "spiderman") {
    glowColor = "#ff3b3b";
    coreColor = "rgba(255, 255, 255, 0.98)";
  } else if (preset === "miles") {
    glowColor = "#ff0055";
    coreColor = "rgba(255, 220, 100, 0.95)";
  } else if (preset === "symbiote") {
    glowColor = "#c084fc";
    coreColor = "rgba(235, 215, 255, 0.95)";
  } else if (preset === "neon") {
    glowColor = "#ff4dff";
    coreColor = "rgba(124, 255, 107, 0.9)";
  } else if (preset === "classic") {
    glowColor = "#00d9ff";
    coreColor = "rgba(210, 245, 255, 0.95)";
  }

  ctx.strokeStyle = glowColor;
  ctx.lineWidth = isLow ? 3 : 6;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = isLow ? 0 : 16;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.stroke();

  ctx.strokeStyle = coreColor;
  ctx.lineWidth = isLow ? 2 : 2.5;
  ctx.shadowBlur = isLow ? 0 : 6;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x0, y0, 5, 0, Math.PI * 2);
  ctx.arc(x1, y1, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function shootNormalized(nx, ny) {
  fit();
  fx.setPreset(preset);
  fx.shoot(nx * canvas.width, ny * canvas.height);
  kick();
}

listen("overlay-frame", (event) => {
  frame = event.payload;
  fit();
});

listen("overlay-preset", (event) => {
  preset = event.payload?.preset || "spiderman";
  fx.setPreset(preset);
});

listen("overlay-shot", (event) => {
  const { x, y } = event.payload;
  shootNormalized(x, y);
});

listen("overlay-tether", (event) => {
  const key = event.payload?.id ?? 0;
  tethers.set(key, event.payload);
  kick();
});

listen("overlay-clear", (event) => {
  if (event.payload?.id !== undefined) {
    tethers.delete(event.payload.id);
  } else {
    tethers.clear();
  }
});

window.addEventListener("resize", fit);
fit();
fx.setPreset(preset);
