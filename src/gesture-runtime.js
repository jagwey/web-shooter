// Pure runtime helpers for control.js (no DOM / Tauri) so they can run under node --test.

const MODES = ["scroll", "knob", "zoom", "media"];

export function createAirModeLock({ releaseMs = 400 } = {}) {
  const lock = {
    mode: null,
    exitAt: -Infinity,
    enter(name, now) {
      if (!MODES.includes(name)) return false;
      if (lock.mode !== null && lock.mode !== name) return false;
      lock.mode = name;
      return true;
    },
    exit(now) {
      if (lock.mode !== null) lock.exitAt = now;
      lock.mode = null;
    },
    active() {
      return lock.mode !== null;
    },
    suppressDiscrete(now) {
      return lock.mode !== null || now - lock.exitAt < releaseMs;
    },
  };
  return lock;
}

/** progress 0..1 while key is held; returns 1 exactly once per continuous hold. */
export function createDwell() {
  const timers = new Map();
  return {
    update(key, present, now, ms) {
      if (!present) {
        timers.delete(key);
        return 0;
      }
      let e = timers.get(key);
      if (!e) {
        e = { since: now, fired: false };
        timers.set(key, e);
      }
      if (e.fired) return 0;
      const p = Math.min(1, (now - e.since) / ms);
      if (p >= 1) {
        e.fired = true;
        return 1;
      }
      return p;
    },
    reset(key) {
      timers.delete(key);
    },
  };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Map each slot to an incoming hand index (null when nothing fits).
 * prevSlots: [{label, wrist}|null]; hands: landmarks[]; handedness: string[].
 * resetSlots lists slots whose label changed.
 */
export function alignHandSlots(prevSlots, hands, handedness = []) {
  const slots = [];
  const used = new Set();
  const n = Math.max(prevSlots.length, 2);
  for (let s = 0; s < n; s += 1) slots[s] = null;
  const labelOf = (i) => handedness?.[i] || "";
  const wristOf = (i) => hands[i]?.[0];
  // pass 1: same label
  for (let s = 0; s < prevSlots.length; s += 1) {
    const prev = prevSlots[s];
    if (!prev?.label) continue;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < hands.length; i += 1) {
      if (used.has(i) || labelOf(i) !== prev.label) continue;
      const d = prev.wrist && wristOf(i) ? dist(prev.wrist, wristOf(i)) : 0;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      slots[s] = best;
      used.add(best);
    }
  }
  // pass 2: nearest wrist for the remaining slots
  for (let s = 0; s < prevSlots.length; s += 1) {
    if (slots[s] !== null) continue;
    const prev = prevSlots[s];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < hands.length; i += 1) {
      if (used.has(i)) continue;
      const d = prev?.wrist && wristOf(i) ? dist(prev.wrist, wristOf(i)) : 0.5;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      slots[s] = best;
      used.add(best);
    }
  }
  // fresh slots take leftovers
  for (let s = 0; s < n; s += 1) {
    if (slots[s] !== null) continue;
    const i = [...hands.keys()].find((k) => !used.has(k));
    if (i !== undefined) {
      slots[s] = i;
      used.add(i);
    }
  }
  const resetSlots = [];
  for (let s = 0; s < n; s += 1) {
    const prev = prevSlots[s];
    const i = slots[s];
    if (prev?.label && i !== null && labelOf(i) && labelOf(i) !== prev.label) resetSlots.push(s);
  }
  return { slots, resetSlots };
}

const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/** start/cur: {angle (deg), distance (palm units)}. */
export function resolvePinchIntent(start, cur, { rotDeg = 20, distPalm = 0.15 } = {}) {
  if (!start || !cur) return null;
  const rot = Math.abs(wrapDeg(cur.angle - start.angle)) / rotDeg;
  const dd = Math.abs(cur.distance - start.distance) / distPalm;
  if (rot < 1 && dd < 1) return null;
  if (rot >= 1 && (dd < 1 || rot >= dd)) return "knob";
  return "zoom";
}

export function trimHistory(history, now, keepMs = 1600) {
  let n = 0;
  while (n < history.length && now - history[n].t > keepMs) n += 1;
  if (n > 0) history.splice(0, n);
  return history;
}
