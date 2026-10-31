import { test } from "node:test";
import assert from "node:assert/strict";
import { purpleFrontHand } from "../src/gestures.js";

// 21 landmarks spread over a square of side `size` at (x, y).
function hand(x, y, size) {
  return Array.from({ length: 21 }, (_, i) => ({ x: x + (size * (i % 5)) / 4, y: y + (size * Math.floor(i / 5)) / 4 }));
}

test("big front hand + small back hand is the stance", () => {
  assert.equal(purpleFrontHand([hand(0.2, 0.4, 0.3), hand(0.6, 0.5, 0.15)], [null, "fist"]), 0);
  assert.equal(purpleFrontHand([hand(0.6, 0.5, 0.15), hand(0.2, 0.4, 0.3)], ["fist", "point"]), 1);
});

test("same-size hands, one hand, or a web-aiming front hand are not", () => {
  assert.equal(purpleFrontHand([hand(0.2, 0.4, 0.2), hand(0.6, 0.4, 0.18)], [null, null]), -1);
  assert.equal(purpleFrontHand([hand(0.2, 0.4, 0.3)], [null]), -1);
  assert.equal(purpleFrontHand([hand(0.2, 0.4, 0.3), hand(0.6, 0.5, 0.15)], ["web", null]), -1);
});
