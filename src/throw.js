/** Flick motion and cross-monitor throw. Pose detection lives in gestures.js. */

const FLICK_WINDOW_MS = 180;
const FLICK_MIN_DT = 36;
const FLICK_MIN_TRAVEL = 64;
const FLICK_MIN_SPEED = 1.05;

/**
 * A flick is a short, fast stroke — not a hand that happens to be in the OK pose.
 * Returns the fastest segment inside the window, or null.
 */
export function flickImpulse(samples, now, opts = {}) {
  const windowMs = opts.windowMs ?? FLICK_WINDOW_MS;
  const minDt = opts.minDt ?? FLICK_MIN_DT;
  const minTravel = opts.minTravel ?? FLICK_MIN_TRAVEL;
  const minSpeed = opts.minSpeed ?? FLICK_MIN_SPEED;
  const recent = (samples || []).filter((sample) => now - sample.t <= windowMs && now - sample.t >= 0);
  if (recent.length < 2) return null;
  let best = null;
  for (let i = 0; i < recent.length; i += 1) {
    for (let j = i + 1; j < recent.length; j += 1) {
      const dt = recent[j].t - recent[i].t;
      if (dt < minDt) continue;
      const dx = recent[j].x - recent[i].x;
      const dy = recent[j].y - recent[i].y;
      const travel = Math.hypot(dx, dy);
      const speed = travel / dt;
      if (travel < minTravel || speed < minSpeed) continue;
      if (!best || speed > best.speed) {
        best = { dx, dy, travel, speed, x: recent[j].x, y: recent[j].y };
      }
    }
  }
  return best;
}

/** Point ahead of the stroke, so a resting hand on a window is not the target. */
export function flickAim(impulse, lead = 180) {
  const travel = impulse.travel || Math.hypot(impulse.dx, impulse.dy) || 1;
  const scale = Math.max(lead, travel * 0.85) / travel;
  return {
    x: Math.round(impulse.x + impulse.dx * scale),
    y: Math.round(impulse.y + impulse.dy * scale),
  };
}

function contains(monitor, x, y) {
  return x >= monitor.x && x < monitor.x + monitor.width && y >= monitor.y && y < monitor.y + monitor.height;
}

/**
 * Where a flung window should land on another monitor.
 * Null when there is one screen, the throw is weak, or it does not aim at the other display.
 */
export function throwToMonitor(monitors, win, vx, vy) {
  if (!monitors || monitors.length < 2 || !win) return null;
  const speed = Math.hypot(vx, vy);
  if (!(speed >= 6)) return null;
  const cx = win.x + win.width / 2;
  const cy = win.y + win.height / 2;
  const home = monitors.find((monitor) => contains(monitor, cx, cy)) || monitors[0];
  let best = null;
  let bestDot = 0.45;
  for (const monitor of monitors) {
    if (monitor === home) continue;
    const mx = monitor.x + monitor.width / 2 - cx;
    const my = monitor.y + monitor.height / 2 - cy;
    const mag = Math.hypot(mx, my) || 1;
    const dot = (vx * mx + vy * my) / (speed * mag);
    if (dot > bestDot) {
      bestDot = dot;
      best = monitor;
    }
  }
  if (!best) return null;
  const margin = 48;
  const width = Math.max(320, Math.min(win.width, best.width - margin * 2));
  const height = Math.max(240, Math.min(win.height, best.height - margin * 2));
  const horiz = Math.abs(vx) >= Math.abs(vy);
  const x = horiz
    ? (vx >= 0 ? best.x + margin : best.x + best.width - width - margin)
    : Math.min(Math.max(win.x, best.x + margin), best.x + best.width - width - margin);
  const y = horiz
    ? Math.min(Math.max(win.y, best.y + margin), best.y + best.height - height - margin)
    : (vy >= 0 ? best.y + margin : best.y + best.height - height - margin);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
