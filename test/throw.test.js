import assert from "node:assert/strict";
import test from "node:test";
import { flickAim, flickImpulse, snapToEdge, throwToMonitor, validThrow } from "../src/throw.js";

const left = { x: 0, y: 0, width: 1920, height: 1080 };
const right = { x: 1920, y: 0, width: 1920, height: 1080 };
const win = { x: 200, y: 120, width: 900, height: 700 };

test("a still OK hand is not a flick", () => {
  const samples = [];
  for (let i = 0; i < 8; i += 1) samples.push({ t: i * 20, x: 400 + (i % 2), y: 300 });
  assert.equal(flickImpulse(samples, 160), null);
});

test("a fast stroke toward the right is a flick and aims ahead of the hand", () => {
  const samples = [
    { t: 0, x: 100, y: 400 },
    { t: 40, x: 140, y: 398 },
    { t: 80, x: 220, y: 390 },
  ];
  const impulse = flickImpulse(samples, 80);
  assert.ok(impulse);
  assert.ok(impulse.dx > 0);
  const aim = flickAim(impulse);
  assert.ok(aim.x > impulse.x);
});

test("a throw toward the other monitor lands on that screen", () => {
  const dest = throwToMonitor([left, right], win, 18, 1);
  assert.ok(dest);
  assert.ok(dest.x >= right.x);
  assert.ok(dest.x + dest.width <= right.x + right.width);
});

test("one monitor, or a throw back into the same screen, does not teleport", () => {
  assert.equal(throwToMonitor([left], win, 18, 1), null);
  assert.equal(throwToMonitor([left, right], win, -12, 0), null);
  assert.equal(throwToMonitor([left, right], win, 1, 0), null);
});

test("validThrow needs a fast straight stroke and respects the refractory window", () => {
  const fast = [{ t: 900, x: 100, y: 500 }, { t: 1000, x: 300, y: 510 }];
  const v = validThrow(fast, 1000);
  assert.ok(v && v.vx > 1.9 && Math.abs(v.vy) < 0.2);
  assert.equal(validThrow([{ t: 900, x: 100, y: 500 }, { t: 1000, x: 130, y: 500 }], 1000), null, "short travel");
  assert.equal(validThrow([{ t: 900, x: 100, y: 500 }, { t: 1000, x: 200, y: 600 }], 1000), null, "diagonal");
  assert.equal(validThrow(fast, 1000, 800), null, "refractory");
  assert.equal(validThrow([{ t: 500, x: 0, y: 0 }, { t: 600, x: 400, y: 0 }], 1000), null, "stale samples");
  assert.equal(validThrow([{ t: 840, x: 100, y: 500 }, { t: 1000, x: 180, y: 500 }], 1000), null, "ordinary drag pace");
});

test("snapToEdge pulls a window flush to a nearby monitor edge only", () => {
  assert.deepEqual(snapToEdge([left, right], { x: 10, y: 1080 - 400 - 20, width: 600, height: 400 }), { x: 0, y: 680, width: 600, height: 400 });
  assert.deepEqual(snapToEdge([left, right], { x: 1920 + 1920 - 600 - 5, y: 300, width: 600, height: 400 }), { x: 3240, y: 300, width: 600, height: 400 });
  assert.equal(snapToEdge([left, right], { x: 500, y: 300, width: 600, height: 400 }), null);
  assert.equal(snapToEdge([], { x: 0, y: 0, width: 10, height: 10 }), null);
  assert.equal(snapToEdge([left, right], { x: -8, y: -8, width: 1936, height: 1096 }), null, "maximized");
});
