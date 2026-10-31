// One Euro filter (Casiez et al. 2012): low jitter while the hand rests, low lag while it moves fast.
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export function createHandFilter() {
  return { t: 0, x: null, dx: null };
}

// t in ms. Returns smoothed landmarks; velocity (units/s) stays in f.dx for predict().
export function filterLandmarks(f, raw, t, { minCutoff = 2.6, beta = 10, dCutoff = 1 } = {}) {
  const n = raw.length * 3;
  const dt = (t - f.t) / 1000;
  f.t = t;
  if (!f.x || f.x.length !== n || !(dt > 0) || dt > 0.5) {
    f.x = new Float64Array(n);
    f.dx = new Float64Array(n);
    raw.forEach((p, i) => {
      f.x[i * 3] = p.x;
      f.x[i * 3 + 1] = p.y;
      f.x[i * 3 + 2] = p.z || 0;
    });
    return raw.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
  }
  const ad = alpha(dCutoff, dt);
  return raw.map((p, i) => {
    const v = [p.x, p.y, p.z || 0];
    for (let k = 0; k < 3; k += 1) {
      const j = i * 3 + k;
      f.dx[j] += ad * ((v[k] - f.x[j]) / dt - f.dx[j]);
      f.x[j] += alpha(minCutoff + beta * Math.abs(f.dx[j]), dt) * (v[k] - f.x[j]);
    }
    return { x: f.x[i * 3], y: f.x[i * 3 + 1], z: f.x[i * 3 + 2] };
  });
}

// Extrapolate landmark idx along its filtered velocity to hide pipeline latency.
export function predict(f, idx, point, ms) {
  if (!f.dx) return point;
  const s = ms / 1000;
  return { x: point.x + f.dx[idx * 3] * s, y: point.y + f.dx[idx * 3 + 1] * s, z: point.z };
}
