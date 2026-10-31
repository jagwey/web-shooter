import assert from "node:assert/strict";
import test from "node:test";
import { flickAim, flickImpulse, throwToMonitor } from "../src/throw.js";

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
