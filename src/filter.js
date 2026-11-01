// 2nd-Order Kinematic One Euro Filter (Casiez et al. 2012 + Acceleration/Braking Taylor Predictor)
// Low jitter while the hand rests, zero phase lag during acceleration, zero overshoot on sudden stops.
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

// filterLandmarks returns a POOLED array reused every frame, so callers that keep frames must copy them.
export function cloneLandmarks(points) {
  return points ? points.map((p) => ({ ...p })) : [];
}

export function createHandFilter() {
  return { t: 0, x: null, dx: null, ddx: null };
}

// t in ms. Returns smoothed landmarks; velocity (units/s) stays in f.dx and acceleration in f.ddx for predict().
function poolOf(f, raw) {
  if (!f.pool || f.pool.length !== raw.length) {
    f.pool = Array.from({ length: raw.length }, () => ({ x: 0, y: 0, z: 0 }));
  }
  return f.pool;
}

function writePool(pool, xs) {
  for (let i = 0; i < pool.length; i += 1) {
    pool[i].x = xs[i * 3];
    pool[i].y = xs[i * 3 + 1];
    pool[i].z = xs[i * 3 + 2];
  }
  return pool;
}

export function filterLandmarks(f, raw, t, { minCutoff = 1.8, beta = 18.0, dCutoff = 3.0, aCutoff = 4.0 } = {}) {
  const n = raw.length * 3;
  const dt = (t - f.t) / 1000;
  f.t = t;
  const pool = poolOf(f, raw);
  if (!f.x || f.x.length !== n || !(dt > 0) || dt > 0.5) {
    f.x = new Float64Array(n);
    f.dx = new Float64Array(n);
    f.ddx = new Float64Array(n);
    raw.forEach((p, i) => {
      f.x[i * 3] = p.x;
      f.x[i * 3 + 1] = p.y;
      f.x[i * 3 + 2] = p.z || 0;
    });
    return writePool(pool, f.x);
  }
  const ad = alpha(dCutoff, dt);
  const aa = alpha(aCutoff, dt);
  for (let i = 0; i < raw.length; i += 1) {
    const p = raw[i];
    const v = [p.x, p.y, p.z || 0];
    for (let k = 0; k < 3; k += 1) {
      const j = i * 3 + k;
      const prevDx = f.dx[j];
      const rawDx = (v[k] - f.x[j]) / dt;
      f.dx[j] = prevDx + ad * (rawDx - prevDx);
      if (f.ddx) {
        const rawDdx = (f.dx[j] - prevDx) / dt;
        f.ddx[j] += aa * (rawDdx - f.ddx[j]);
      }
      f.x[j] += alpha(minCutoff + beta * Math.abs(f.dx[j]), dt) * (v[k] - f.x[j]);
    }
  }
  return writePool(pool, f.x);
}

// Braking-aware 2nd-order kinematic extrapolation along filtered velocity & acceleration to hide pipeline latency.
export function predict(f, idx, point, ms) {
  if (!f?.dx) return point;
  const s = Math.max(0, Math.min(0.08, ms / 1000));
  const j = idx * 3;
  const vx = f.dx[j] || 0;
  const vy = f.dx[j + 1] || 0;
  const ax = f.ddx ? (f.ddx[j] || 0) : 0;
  const ay = f.ddx ? (f.ddx[j + 1] || 0) : 0;

  const vMag = Math.hypot(vx, vy);
  const aMag = Math.hypot(ax, ay);
  const align = (vMag > 1e-4 && aMag > 1e-4) ? (vx * ax + vy * ay) / (vMag * aMag) : 0;
  const effS = align < 0 ? s * Math.max(0.25, 1 + 0.75 * align) : s;
  const accelGain = align > 0 ? 0.25 * align : 0;

  return {
    x: point.x + vx * effS + 0.5 * accelGain * ax * effS * effS,
    y: point.y + vy * effS + 0.5 * accelGain * ay * effS * effS,
    z: point.z,
  };
}

// Braking-aware 2nd-order kinematic extrapolation for the rigid palm anchor (midpoint of wrist 0 and middle MCP 9).
export function predictPalmAnchor(f, landmarks, ms) {
  const p0 = landmarks[0];
  const p9 = landmarks[9];
  const anchor = {
    x: (p0.x + p9.x) * 0.5,
    y: (p0.y + p9.y) * 0.5,
    z: ((p0.z || 0) + (p9.z || 0)) * 0.5,
  };
  if (!f?.dx) return anchor;
  const s = Math.max(0, Math.min(0.08, ms / 1000));
  const vx = (f.dx[0] + f.dx[27]) * 0.5;
  const vy = (f.dx[1] + f.dx[28]) * 0.5;
  const ax = f.ddx ? (f.ddx[0] + f.ddx[27]) * 0.5 : 0;
  const ay = f.ddx ? (f.ddx[1] + f.ddx[28]) * 0.5 : 0;

  const vMag = Math.hypot(vx, vy);
  const aMag = Math.hypot(ax, ay);
  const align = (vMag > 1e-4 && aMag > 1e-4) ? (vx * ax + vy * ay) / (vMag * aMag) : 0;
  const effS = align < 0 ? s * Math.max(0.25, 1 + 0.75 * align) : s;
  const accelGain = align > 0 ? 0.25 * align : 0;

  return {
    x: anchor.x + vx * effS + 0.5 * accelGain * ax * effS * effS,
    y: anchor.y + vy * effS + 0.5 * accelGain * ay * effS * effS,
    z: anchor.z,
  };
}

// Instantaneous 2D speed (normalized screen widths/sec) of landmark idx.
export function handSpeed(f, idx = 9) {
  if (!f || !f.dx) return 0;
  return Math.hypot(f.dx[idx * 3] || 0, f.dx[idx * 3 + 1] || 0);
}
