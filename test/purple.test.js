import { test } from "node:test";
import assert from "node:assert/strict";
import { hollowPurpleReady, purpleFrontHand } from "../src/gestures.js";

// 21 landmarks spread over a square of side `size` at (x, y).
function hand(x, y, size) {
  return Array.from({ length: 21 }, (_, i) => ({ x: x + (size * (i % 5)) / 4, y: y + (size * Math.floor(i / 5)) / 4 }));
}

test("big front hand + small back hand is the stance", () => {
  assert.equal(purpleFrontHand([hand(0.2, 0.4, 0.3), hand(0.6, 0.5, 0.15)], [null, "fist"]), 0);
  assert.equal(purpleFrontHand([hand(0.6, 0.5, 0.15), hand(0.2, 0.4, 0.3)], ["fist", "point"]), 1);
});

function gojoHand(x, y, size) {
  const hand = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  hand[0] = { x: x + size * 0.5, y: y + size, z: 0 };
  const fingers = [
    [5, 6, 7, 8, true, 0.35],
    [9, 10, 11, 12, true, 0.48],
    [13, 14, 15, 16, false, 0.58],
    [17, 18, 19, 20, false, 0.7],
  ];
  for (const [mcp, pip, dip, tip, open, fx] of fingers) {
    const px = x + size * fx;
    hand[mcp] = { x: px, y: y + size * 0.72, z: 0 };
    if (open) {
      hand[pip] = { x: px, y: y + size * 0.48, z: 0 };
      hand[dip] = { x: px, y: y + size * 0.28, z: 0 };
      hand[tip] = { x: px, y: y + size * 0.08, z: 0 };
    } else {
      hand[pip] = { x: px, y: y + size * 0.62, z: 0 };
      hand[dip] = { x: px, y: y + size * 0.78, z: 0 };
      hand[tip] = { x: px, y: y + size * 0.9, z: 0 };
    }
  }
  return hand;
}

test("hollow purple needs both Gojo signs and a clearly closer hand", () => {
  const front = gojoHand(0.1, 0.15, 0.55);
  const back = gojoHand(0.55, 0.45, 0.28);
  assert.equal(hollowPurpleReady([front, back], ["flick", "flick"]), 0);
  assert.equal(hollowPurpleReady([back, front], ["flick", "flick"]), 1);
  assert.equal(hollowPurpleReady([front, back], ["flick", "web"]), -1);
  assert.equal(hollowPurpleReady([front, back], ["palm", "flick"]), -1);
  assert.equal(hollowPurpleReady([front], ["flick"]), -1);
  assert.equal(hollowPurpleReady([gojoHand(0.1, 0.2, 0.4), gojoHand(0.5, 0.2, 0.36)], ["flick", "flick"]), -1);
});

test("same-size hands, one hand, or a web-aiming front hand are not", () => {
  assert.equal(purpleFrontHand([hand(0.2, 0.4, 0.2), hand(0.6, 0.4, 0.18)], [null, null]), -1);
  assert.equal(purpleFrontHand([hand(0.2, 0.4, 0.3)], [null]), -1);
  assert.equal(purpleFrontHand([hand(0.2, 0.4, 0.3), hand(0.6, 0.5, 0.15)], ["web", null]), -1);
});
