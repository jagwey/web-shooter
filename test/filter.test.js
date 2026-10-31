import assert from "node:assert/strict";
import test from "node:test";
import { createHandFilter, filterLandmarks, predict } from "../src/filter.js";

const hand = (x, y) => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));

test("resting hand: jitter is damped", () => {
  const f = createHandFilter();
  let maxDev = 0;
  for (let i = 0; i < 120; i += 1) {
    const noise = i % 2 ? 0.004 : -0.004;
    const out = filterLandmarks(f, hand(0.5 + noise, 0.5), i * 16.7);
    if (i > 10) maxDev = Math.max(maxDev, Math.abs(out[8].x - 0.5));
  }
  assert.ok(maxDev < 0.002, `jitter ${maxDev}`);
});

test("fast move: output keeps up and prediction leads", () => {
  const f = createHandFilter();
  let out;
  let x = 0.1;
  for (let i = 0; i < 20; i += 1) {
    x = 0.1 + i * 0.03; // ~1.8 screen widths per second
    out = filterLandmarks(f, hand(x, 0.5), i * 16.7);
  }
  assert.ok(x - out[8].x < 0.03, `lag ${x - out[8].x}`);
  assert.ok(predict(f, 8, out[8], 16).x > out[8].x);
});

test("long gap resets instead of sliding from a stale point", () => {
  const f = createHandFilter();
  filterLandmarks(f, hand(0.1, 0.1), 0);
  const out = filterLandmarks(f, hand(0.9, 0.9), 2000);
  assert.equal(out[0].x, 0.9);
});
