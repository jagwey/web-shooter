import { createWebFx, registerCustomLook, strandControl } from "./effects.js";
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
let preset = "off";
// Theme accent for outline/ring, set by control.js via overlay-preset / overlay-settings { accent }.
let accent = "";
let customAccent = "";
let customThickness = 3;
let activeToast = null;
let running = false;
let frames = 0;
let fpsStamp = performance.now();
let trackFlight = null;
let trackEpoch = 0;
// 1.25 keeps the overlay texture smaller than 1.5 so a 120Hz vsync can still draw the net.
const dprCap = { full: 1.25, low: 1 };
// Tether events arrive at camera rate (~30Hz); ease toward them every display frame instead.
const EASE_MS = 6;
const NET_GROW_MS = 160;
let lastNow = 0;
let slowStreak = 0;
let dprDowngraded = false;
let cachedWidth = -1;
let cachedHeight = -1;
let cachedDpr = -1;

function fit() {
  const cap = preset === "low" || preset === "light" || dprDowngraded ? dprCap.low : dprCap.full;
  const ratio = Math.min(window.devicePixelRatio || 1, cap);
  const width = Math.max(2, Math.floor(window.innerWidth * ratio));
  const height = Math.max(2, Math.floor(window.innerHeight * ratio));
  if (width !== cachedWidth || height !== cachedHeight || ratio !== cachedDpr) {
    canvas.width = width;
    canvas.height = height;
    cachedWidth = width;
    cachedHeight = height;
    cachedDpr = ratio;
  }
}

function kick() {
  if (running) return;
  running = true;
  requestAnimationFrame(loop);
}

// Outline-only mode: no spotlight, net, strands, particles or tethers.
function minimal() {
  return preset === "off" || !showWebs || focusFrameOnly;
}

// Dirty rect of the last minimal frame; effect frames always need a full clear.
let dirtyFull = true;
let dx0 = Infinity;
let dy0 = Infinity;
let dx1 = -Infinity;
let dy1 = -Infinity;

function markDirty(x, y, w, h) {
  dx0 = Math.min(dx0, x);
  dy0 = Math.min(dy0, y);
  dx1 = Math.max(dx1, x + w);
  dy1 = Math.max(dy1, y + h);
}

function clearDirty() {
  if (dirtyFull) ctx.clearRect(0, 0, canvas.width, canvas.height);
  else if (dx1 > dx0 && dy1 > dy0) ctx.clearRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
  dirtyFull = false;
  dx0 = dy0 = Infinity;
  dx1 = dy1 = -Infinity;
}

function loop(now) {
  const lean = minimal();
  if (lean) {
    // Hover outlines live only while control.js keeps re-sending them (lost hand / missed clear never sticks).
    for (const [id, win] of targetWindows) {
      if (!win.grabbed && now - win.seen > HOVER_TTL_MS) targetWindows.delete(id);
    }
  } else if (!fx.pin()) {
    // Drop a finished shot's window once the splash is gone. A held window stays until release.
    for (const [id, win] of targetWindows) {
      if (!win.grabbed) targetWindows.delete(id);
    }
  }
  pruneRings(now);
  const toast = Boolean(activeToast && now < activeToast.until);
  const busy = rings.size > 0 || targetWindows.size > 0 || toast || (!lean && (fx.hasWork() || tethers.size > 0));
  clearDirty();
  if (!busy) {
    running = false;
    lastNow = 0;
    emitTo("control", "render-fps", { fps: 0, mode: "idle" });
    return;
  }
  if (lean) {
    // Grabbed rects come straight from control.js events; hover rects are refreshed at camera rate, so no Win32 polling.
    if (showFocusFrame) {
      for (const win of targetWindows.values()) {
        const r = windowRect(win);
        if (r) drawOutline(win, r);
      }
    }
  } else {
    drawEffects(now);
  }
  drawRings(now);
  if (toast) {
    drawToast(now);
  } else if (activeToast) {
    activeToast = null;
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

function drawEffects(now) {
  dirtyFull = true;
  pumpTracks();
  // Windows snap to their vsync-tracked bounds; only tethers ease.
  const k = lastNow ? 1 - Math.exp(-Math.min(100, now - lastNow) / EASE_MS) : 1;
  lastNow = now;
  for (const line of tethers.values()) ease(line.cur, line, k, ["x0", "y0", "x1", "y1"]);

  // Draw target window focus frames (Clean bounding boxes with contrast corner reticles)
  if (showFocusFrame) {
    const rects = [...targetWindows.values()].map((win) => [win, windowRect(win)]).filter(([, r]) => r);
    drawSpotlight(rects.map(([, r]) => r));
    for (const [win, r] of rects) {
      drawNet(win, r, now);
      drawFocusFrame(win, r);
    }
  }

  // Draw web FX and tethers
  {
    const held = tethers.values().next().value?.cur;
    fx.anchor(held ? held.x0 * canvas.width : 0, held ? held.y0 * canvas.height : 0, Boolean(held));
    fx.draw(now);
    // While the shot is still flying it is the strand; the tether takes over once it lands.
    if (!fx.flying()) {
      for (const line of tethers.values()) {
        drawTether(line.cur);
      }
    }
  }
}

// Dwell arm rings keyed by id; a ring not refreshed within RING_TTL_MS (lost hand) expires.
const rings = new Map();
const RING_TTL_MS = 300;
const RING_FLASH_MS = 150;
const RING_R = 22;
const HOVER_TTL_MS = 300;

function pruneRings(now) {
  for (const [id, ring] of rings) {
    if (ring.flashUntil ? now >= ring.flashUntil : now - ring.seen > RING_TTL_MS) rings.delete(id);
  }
}

function drawRings(now) {
  if (!rings.size) return;
  const color = getThemeColor();
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.font = "600 12px 'Segoe UI Variable Text', Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const ring of rings.values()) {
    const cx = ring.x * canvas.width;
    const cy = ring.y * canvas.height;
    const full = Boolean(ring.flashUntil);
    const alpha = full ? Math.max(0, (ring.flashUntil - now) / RING_FLASH_MS) : 1;
    ctx.globalAlpha = alpha;

    // Soft glowing ambient bloom around the ring
    ctx.shadowColor = color;
    ctx.shadowBlur = full ? 16 : 8;

    // Translucent dark frosted inner plate
    ctx.fillStyle = "rgba(10, 15, 26, 0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, RING_R - 2, 0, Math.PI * 2);
    ctx.fill();

    // Dark high-contrast track underneath
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.78)";
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.arc(cx, cy, RING_R, 0, Math.PI * 2);
    ctx.stroke();

    // Smooth progress arc with glowing bloom
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    const progressSweep = full ? 1 : Math.max(0, Math.min(1, ring.progress));
    ctx.arc(cx, cy, RING_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progressSweep);
    ctx.stroke();

    // Delicate landmark node at center
    ctx.shadowBlur = 4;
    ctx.shadowColor = color;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Sleek label pill beneath
    if (ring.label) {
      const text = ring.label;
      const textW = ctx.measureText(text).width;
      const pillW = textW + 18;
      const pillH = 22;
      const pillX = cx - pillW / 2;
      const pillY = cy + RING_R + 10;

      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(10, 15, 26, 0.88)";
      pathRoundRect(pillX, pillY, pillW, pillH, 999);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, cx, pillY + pillH / 2);
    }

    markDirty(cx - 90, cy - RING_R - 12, 180, RING_R * 2 + 54);
  }
  ctx.restore();
}

function ease(cur, target, k, keys) {
  for (const key of keys) cur[key] += (target[key] - cur[key]) * k;
}

function getThemeColor() {
  if (accent) return accent;
  if (preset === "off") return "#ffffff";
  if (preset === "custom" && customAccent) return customAccent;
  if (preset === "sakura") return "#f472b6";
  if (preset === "clean") return "#38bdf8";
  if (preset === "midnight") return "#22d3ee";
  if (preset === "sage") return "#6ee7b7";
  if (preset === "spiderman") return "#ff3b3b";
  if (preset === "miles") return "#ffd700";
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
    seen: prev?.seen ?? performance.now(),
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
    // Actively grabbed windows receive 120Hz coordinates directly from control.js; do not poll stale Win32 rects.
    if (win.hwnd && !win.grabbed) pending.push([id, win.hwnd]);
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

function pathRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// Minimal outline: accent (default white) 2px inside, dark 2px outside; hover dimmer than grabbed.
function drawOutline(win, { x, y, w, h }) {
  const lw = 2 * (cachedDpr > 0 ? cachedDpr : 1);
  const half = lw / 2;
  ctx.globalAlpha = win.grabbed ? 1 : 0.6;
  ctx.lineWidth = lw;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
  pathRoundRect(x - half, y - half, w + lw, h + lw, 6 + half);
  ctx.stroke();
  ctx.strokeStyle = getThemeColor();
  pathRoundRect(x + half, y + half, Math.max(0, w - lw), Math.max(0, h - lw), Math.max(0, 6 - half));
  ctx.stroke();
  ctx.globalAlpha = 1;
  markDirty(x - 2 * lw, y - 2 * lw, w + 4 * lw, h + 4 * lw);
}

function drawFocusFrame(win, { x, y, w, h }) {
  const color = getThemeColor();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  // Crisp high-contrast outline with soft rounded corners
  const radius = 10;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);

  // Layer 1: Dark halo with soft drop shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 8;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.lineWidth = 5.5;
  ctx.stroke();

  // Layer 2: White line
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Corner Reticle Brackets (Smooth rounded L-brackets in accent color with subtle glow)
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const bracket = Math.min(26, Math.min(w, h) / 4);
  ctx.lineWidth = 4;

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
    ctx.font = "600 12px 'Segoe UI Variable Text', Inter, system-ui, sans-serif";
    const textWidth = ctx.measureText(badgeText).width;
    const badgeW = textWidth + 24;
    const badgeH = 24;
    const badgeX = Math.max(10, Math.min(canvas.width - badgeW - 10, x + 12));
    const badgeY = Math.max(10, y - badgeH - 6);

    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    const bgGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
    bgGrad.addColorStop(0, "rgba(20, 28, 44, 0.92)");
    bgGrad.addColorStop(1, "rgba(12, 18, 30, 0.95)");
    ctx.fillStyle = bgGrad;

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
    else ctx.rect(badgeX, badgeY, badgeW, badgeH);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
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

  const { cx, cy } = strandControl(x0, y0, x1, y1);
  const color = getThemeColor();
  const scaleW = Math.max(0.5, (preset === "custom" ? customThickness : 3) / 3);

  ctx.save();
  ctx.lineCap = "round";

  // Layer 1: Contrast halo
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
  ctx.lineWidth = 7.5 * scaleW;
  ctx.stroke();

  // Layer 2: Glowing ambient sheath
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 * scaleW;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 4.5 * scaleW;
  ctx.stroke();

  // Layer 3: Radiant white core
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.98)";
  ctx.lineWidth = 2.2 * scaleW;
  ctx.stroke();

  // Hand Anchor: Concentric glowing nodes
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 * scaleW;

  // Outer glow aura
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(x0, y0, 6 * scaleW, 0, Math.PI * 2);
  ctx.fill();

  // Mid accent ring
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(x0, y0, 4 * scaleW, 0, Math.PI * 2);
  ctx.fill();

  // Inner bright core
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x0, y0, 2.2 * scaleW, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawToast(now) {
  if (!activeToast) return;
  const remain = Math.max(0, activeToast.until - now);
  const total = activeToast.duration || 1100;
  const elapsed = total - remain;
  const enterAlpha = Math.min(1, elapsed / 160);
  const exitAlpha = Math.min(1, remain / 220);
  const alpha = Math.max(0, Math.min(enterAlpha, exitAlpha));

  const slideY = 28 - (1 - Math.sin(Math.min(1, elapsed / 220) * (Math.PI / 2))) * 8;

  const color = getThemeColor();
  const text = activeToast.text || "";
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = "600 13.5px 'Segoe UI Variable Text', Inter, system-ui, sans-serif";
  const textW = ctx.measureText(text).width;
  const w = textW + 40;
  const h = 36;
  const x = (canvas.width - w) / 2;
  const y = slideY;

  // Soft ambient drop shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;

  // Translucent glassmorphic pill background
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "rgba(22, 30, 46, 0.90)");
  grad.addColorStop(1, "rgba(12, 17, 28, 0.92)");
  ctx.fillStyle = grad;

  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 999);
  else ctx.rect(x, y, w, h);
  ctx.fill();

  // Glowing accent border
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Top specular highlight line inside the pill
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x + 1, y + 1, w - 2, h / 2, [999, 999, 0, 0]);
  ctx.stroke();

  // Clean, crisp typography
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, y + h / 2);
  ctx.restore();

  markDirty(x - 14, y - 14, w + 28, h + 28);
}

function shootNormalized(nx, ny, win) {
  if (minimal()) return;
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
  preset = event.payload?.preset || "off";
  if (event.payload?.accent !== undefined) accent = String(event.payload.accent || "");
  fx.setPreset(preset);
  dirtyFull = true;
  kick();
});

listen("overlay-shot", (event) => {
  const { x, y, win } = event.payload;
  shootNormalized(x, y, win);
});

listen("overlay-purple", (event) => {
  if (minimal()) return;
  const { x, y } = event.payload;
  fx.triggerPurple(x * canvas.width, y * canvas.height);
  kick();
});

listen("overlay-arm", (event) => {
  const { id, x, y, progress, label } = event.payload || {};
  if (id === undefined || !(progress >= 0)) {
    rings.delete(id);
    return;
  }
  const now = performance.now();
  const prev = rings.get(id);
  if (prev?.flashUntil) return;
  rings.set(id, { x, y, progress, label, seen: now, flashUntil: progress >= 1 ? now + RING_FLASH_MS : 0 });
  kick();
});

listen("overlay-safety-shield", (event) => {
  if (minimal()) return;
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
    const kept = targetWindows.get(id ?? 0);
    if (kept) kept.seen = performance.now();
  }
});

listen("overlay-settings", (event) => {
  if (event.payload?.accent !== undefined) {
    accent = String(event.payload.accent || "");
  }
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
    customAccent = event.payload.customFx.primary || "#00f5ff";
    customThickness = Number(event.payload.customFx.thickness) || 3;
    if (preset === "custom") fx.setPreset("custom");
  }
  // A mode switch can leave effect pixels outside the minimal dirty rect.
  dirtyFull = true;
});

listen("overlay-toast", (event) => {
  const text = event.payload?.text;
  if (!text) return;
  const duration = event.payload?.duration || 1100;
  activeToast = { text, duration, until: performance.now() + duration };
  kick();
});

window.addEventListener("resize", fit);
fit();
fx.setPreset(preset);
