import { createWebFx, registerCustomLook } from "./effects.js";
import { emitTo, invoke, listen } from "./desktop.js";
import { canvasRect, clientOf } from "./target.js";

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
let showWebs = true;
let showFocusFrame = true;
let preset = "sakura";
let running = false;
let frames = 0;
let fpsStamp = performance.now();
let trackFlight = null;
let trackEpoch = 0;
// 1.25 keeps the overlay texture smaller than 1.5 so a 120Hz vsync can still draw the net.
const dprCap = { full: 1.25, low: 1 };
// Tether events arrive at camera rate (~30Hz); ease toward them every display frame instead.
const EASE_MS = 40;
const NET_GROW_MS = 160;
let lastNow = 0;
let slowStreak = 0;
let dprDowngraded = false;

function fit() {
  const cap = preset === "low" || preset === "light" || dprDowngraded ? dprCap.low : dprCap.full;
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
  // Drop a finished shot's window once the splash is gone. A held window stays until release.
  if (!fx.pin()) {
    for (const [id, win] of targetWindows) {
      if (!win.grabbed) targetWindows.delete(id);
    }
  }
  const busy = fx.hasWork() || tethers.size > 0 || targetWindows.size > 0;
  if (!busy) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    running = false;
    lastNow = 0;
    emitTo("control", "render-fps", { fps: 0, mode: "idle" });
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  pumpTracks();
  // Windows snap to their vsync-tracked bounds; only tethers ease.
  const k = lastNow ? 1 - Math.exp(-Math.min(100, now - lastNow) / EASE_MS) : 1;
  lastNow = now;
  for (const line of tethers.values()) ease(line.cur, line, k, ["x0", "y0", "x1", "y1"]);

  // Draw target window focus frames (Clean bounding boxes with contrast corner reticles)
  if (showFocusFrame || focusFrameOnly) {
    const rects = [...targetWindows.values()].map((win) => [win, windowRect(win)]).filter(([, r]) => r);
    drawSpotlight(rects.map(([, r]) => r));
    for (const [win, r] of rects) {
      drawNet(win, r, now);
      drawFocusFrame(win, r);
    }
  }

  // Draw web FX and tethers if enabled
  if (!focusFrameOnly || showWebs) {
    fx.draw(now);
    for (const line of tethers.values()) {
      drawTether(line.cur);
    }
  }
  frames += 1;
  if (now - fpsStamp >= 500) {
    const fps = Math.round((frames * 1000) / (now - fpsStamp));
    frames = 0;
    fpsStamp = now;
    emitTo("control", "render-fps", { fps, mode: "active" });
    // Weak GPU: two slow half-seconds in a row drop the canvas to 1x DPR for the rest of the session.
    slowStreak = fps < 50 ? slowStreak + 1 : 0;
    if (slowStreak >= 2 && !dprDowngraded) {
      dprDowngraded = true;
      fit();
    }
  }
  requestAnimationFrame(loop);
}

function ease(cur, target, k, keys) {
  for (const key of keys) cur[key] += (target[key] - cur[key]) * k;
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

function windowRect(win) {
  return canvasRect(win, frame, canvas.width, canvas.height);
}

function rememberWindow(id, win, grabbed) {
  const box = clientOf(win);
  if (!box) return;
  const prev = targetWindows.get(id);
  targetWindows.set(id, {
    ...box,
    title: win.title || prev?.title || "",
    grabbed: grabbed ?? prev?.grabbed ?? false,
    born: prev?.born ?? performance.now(),
    netCanvas: prev?.netCanvas,
    netKey: prev?.netKey,
  });
  const rect = windowRect(box);
  if (rect) fx.follow(rect, box.hwnd);
  kick();
}

// One in-flight bounds read per frame. A local move bumps trackEpoch so a stale sample cannot stick.
function pumpTracks() {
  if (trackFlight) return;
  const pending = [];
  for (const [id, win] of targetWindows) {
    if (win.hwnd) pending.push([id, win.hwnd]);
  }
  if (!pending.length) return;
  const epoch = trackEpoch;
  trackFlight = Promise.all(
    pending.map(async ([id, hwnd]) => {
      try {
        const fresh = await invoke("window_client", { hwnd });
        return [id, fresh, null];
      } catch (err) {
        return [id, null, err];
      }
    }),
  )
    .then((rows) => {
      if (epoch !== trackEpoch) return;
      for (const [id, fresh, err] of rows) {
        const prev = targetWindows.get(id);
        if (!prev) continue;
        if (err) {
          if (String(err).includes("gone")) targetWindows.delete(id);
          continue;
        }
        if (!fresh || fresh.unsupported) continue;
        if (!fresh.hwnd) {
          targetWindows.delete(id);
          continue;
        }
        rememberWindow(id, { ...fresh, title: fresh.title || prev.title }, prev.grabbed);
      }
    })
    .finally(() => {
      trackFlight = null;
    });
}

// Dim everything except the caught windows so the target pops.
function drawSpotlight(rects) {
  if (!rects.length) return;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

// Orb-weaver net: spokes from the tether anchor (window center) to the edges, sagging rings between them.
// Once grown, the net is drawn once into an offscreen canvas and blitted, so dragging costs one drawImage.
function drawNet(win, { x, y, w, h }, now) {
  const grow = Math.min(1, (now - (win.born || now)) / NET_GROW_MS);
  const isLow = preset === "low" || preset === "light";
  if (grow < 1) {
    ctx.save();
    ctx.translate(x, y);
    traceNet(ctx, w, h, grow, isLow);
    ctx.restore();
    return;
  }
  const key = `${Math.round(w)}x${Math.round(h)}:${isLow}`;
  if (win.netKey !== key) {
    win.netCanvas ??= document.createElement("canvas");
    win.netCanvas.width = Math.max(1, Math.round(w));
    win.netCanvas.height = Math.max(1, Math.round(h));
    traceNet(win.netCanvas.getContext("2d"), win.netCanvas.width, win.netCanvas.height, 1, isLow);
    win.netKey = key;
  }
  ctx.drawImage(win.netCanvas, x, y, w, h);
}

function traceNet(ctx, w, h, grow, isLow) {
  const x = 0;
  const y = 0;
  const cx = w / 2;
  const cy = h / 2;
  const spokes = isLow ? 10 : 16;
  const rings = isLow ? 5 : 8;
  const ends = [];
  for (let i = 0; i < spokes; i += 1) {
    const a = (i / spokes) * Math.PI * 2 + 0.2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // Distance from center to the rectangle edge along this ray.
    const t = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity);
    ends.push([dx * t, dy * t]);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.lineWidth = isLow ? 3.2 : 5.5;
  tracePass();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.94)";
  ctx.lineWidth = isLow ? 1.4 : 2.35;
  tracePass();
  ctx.restore();

  function tracePass() {
    ctx.beginPath();
    for (const [ex, ey] of ends) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + ex * grow, cy + ey * grow);
    }
    for (let k = 1; k <= rings; k += 1) {
      const f = (k / rings) ** 1.15;
      if (f > grow) break;
      for (let i = 0; i <= spokes; i += 1) {
        const [ex, ey] = ends[i % spokes];
        const px = cx + ex * f;
        const py = cy + ey * f;
        if (i === 0) {
          ctx.moveTo(px, py);
          continue;
        }
        const [qx, qy] = ends[(i - 1) % spokes];
        // Silk sags toward the hub between two spokes.
        const droop = f * Math.min(w, h) * 0.04;
        const mx = cx + ((qx + ex) / 2) * f * 0.78;
        const my = cy + ((qy + ey) / 2) * f * 0.78 + droop;
        ctx.quadraticCurveTo(mx, my, px, py);
      }
    }
    ctx.stroke();
  }
}

function drawFocusFrame(win, { x, y, w, h }) {
  const color = getThemeColor();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  // Crisp high-contrast outline: dark halo under a white line reads on any background.
  const radius = 8;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Corner Focus Brackets
  ctx.strokeStyle = color;
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

  // Plain silk strand: dark halo + thin white core, no glow.
  ctx.save();
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.96)";
  ctx.lineWidth = 2.4;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x0, y0, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function shootNormalized(nx, ny, win) {
  fit();
  fx.setPreset(preset);
  const box = win ? clientOf(win) : null;
  const rect = box ? windowRect(box) : null;
  fx.shoot(nx * canvas.width, ny * canvas.height, rect, box?.hwnd ?? null);
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
  const { x, y, win } = event.payload;
  shootNormalized(x, y, win);
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
  tethers.set(key, { ...event.payload, cur: tethers.get(key)?.cur ?? { ...event.payload } });
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
  trackEpoch += 1;
  if (clear) {
    if (id !== undefined) targetWindows.delete(id);
    else targetWindows.clear();
  } else if (win) {
    rememberWindow(id ?? 0, win, win.grabbed);
  }
});

listen("overlay-settings", (event) => {
  if (event.payload?.focusFrameOnly !== undefined) {
    focusFrameOnly = Boolean(event.payload.focusFrameOnly);
  }
  if (event.payload?.showWebs !== undefined) {
    showWebs = Boolean(event.payload.showWebs);
  }
  if (event.payload?.showFocusFrame !== undefined) {
    showFocusFrame = Boolean(event.payload.showFocusFrame);
  }
  if (event.payload?.customFx) {
    registerCustomLook(event.payload.customFx);
    if (preset === "custom") fx.setPreset("custom");
  }
});

window.addEventListener("resize", fit);
fit();
fx.setPreset(preset);
