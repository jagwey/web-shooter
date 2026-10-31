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
const targetWindows = new Map();
let focusFrameOnly = false;
let preset = "sakura";
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
  const busy = fx.hasWork() || tethers.size > 0 || targetWindows.size > 0;
  if (!busy) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    running = false;
    emitTo("control", "render-fps", { fps: 0, mode: "idle" });
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw target window focus frames (Clean bounding boxes with contrast corner reticles)
  for (const win of targetWindows.values()) {
    drawFocusFrame(win);
  }

  // Draw web FX unless in clean frame-only mode
  if (!focusFrameOnly) {
    fx.draw(now);
    for (const line of tethers.values()) {
      drawTether(line);
    }
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

function getThemeColor() {
  if (preset === "sakura") return "#f472b6";
  if (preset === "clean") return "#38bdf8";
  if (preset === "midnight") return "#22d3ee";
  if (preset === "sage") return "#6ee7b7";
  if (preset === "spiderman") return "#ff3b3b";
  if (preset === "miles") return "#ff0055";
  if (preset === "symbiote") return "#c084fc";
  if (preset === "neon") return "#ff4dff";
  if (preset === "gojo") return "#a855f7";
  return "#9cf0c4";
}

function drawFocusFrame(win) {
  if (!frame) return;
  const scaleX = canvas.width / (frame.width || window.innerWidth);
  const scaleY = canvas.height / (frame.height || window.innerHeight);

  const x = (win.x - frame.x) * scaleX;
  const y = (win.y - frame.y) * scaleY;
  const w = win.width * scaleX;
  const h = win.height * scaleY;

  if (w <= 0 || h <= 0) return;

  const color = getThemeColor();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  // High-contrast glowing outline
  ctx.strokeStyle = color;
  ctx.lineWidth = win.grabbed ? 3.5 : 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = win.grabbed ? 20 : 12;

  const radius = 10;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.stroke();

  // Corner Focus Brackets
  const bracket = Math.min(24, Math.min(w, h) / 4);
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(x, y + bracket);
  ctx.lineTo(x, y);
  ctx.lineTo(x + bracket, y);

  ctx.moveTo(x + w - bracket, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + bracket);

  ctx.moveTo(x, y + h - bracket);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + bracket, y + h);

  ctx.moveTo(x + w - bracket, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h - bracket);
  ctx.stroke();

  // Window title badge
  if (win.title) {
    ctx.shadowBlur = 0;
    const badgeText = (win.grabbed ? "✊ " : "🎯 ") + (win.title.length > 32 ? win.title.slice(0, 30) + "…" : win.title);
    ctx.font = "bold 12px system-ui, sans-serif";
    const textWidth = ctx.measureText(badgeText).width;
    const badgeW = textWidth + 24;
    const badgeH = 22;
    const badgeX = Math.max(10, Math.min(canvas.width - badgeW - 10, x + 12));
    const badgeY = Math.max(10, y - badgeH - 6);

    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    else ctx.rect(badgeX, badgeY, badgeW, badgeH);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, badgeX + 12, badgeY + badgeH / 2);
  }

  ctx.restore();
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
  if (preset === "sakura") {
    glowColor = "#f472b6";
    coreColor = "rgba(255, 241, 242, 0.98)";
  } else if (preset === "clean") {
    glowColor = "#38bdf8";
    coreColor = "rgba(248, 250, 252, 0.98)";
  } else if (preset === "midnight") {
    glowColor = "#22d3ee";
    coreColor = "rgba(236, 254, 255, 0.98)";
  } else if (preset === "sage") {
    glowColor = "#6ee7b7";
    coreColor = "rgba(240, 253, 244, 0.98)";
  } else if (preset === "spiderman") {
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
  } else if (preset === "gojo") {
    glowColor = "#a855f7";
    coreColor = "rgba(235, 215, 255, 0.98)";
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

listen("overlay-purple", (event) => {
  fit();
  const { x, y } = event.payload;
  fx.triggerPurple(x * canvas.width, y * canvas.height);
  kick();
});

listen("overlay-safety-shield", (event) => {
  fit();
  const { x, y, title, duration } = event.payload;
  fx.triggerShield(x * canvas.width, y * canvas.height, title || "Hassas Çalışma", duration || 2400);
  kick();
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

listen("overlay-target-window", (event) => {
  const { id, window: win, clear } = event.payload;
  if (clear) {
    if (id !== undefined) targetWindows.delete(id);
    else targetWindows.clear();
  } else if (win) {
    targetWindows.set(id ?? 0, win);
    kick();
  }
});

listen("overlay-settings", (event) => {
  if (event.payload?.focusFrameOnly !== undefined) {
    focusFrameOnly = Boolean(event.payload.focusFrameOnly);
  }
});

window.addEventListener("resize", fit);
fit();
fx.setPreset(preset);
