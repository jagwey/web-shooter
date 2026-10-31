import assert from "node:assert/strict";
import test from "node:test";
import { classifyGesture, countExtendedFingers, isWebSign } from "../src/gestures.js";

function makeHand({ index, middle, ring, pinky }) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.82, z: 0 }));
  points[0] = { x: 0.5, y: 0.82, z: 0 };
  const fingers = [
    [5, 6, 7, 8, index, 0.38],
    [9, 10, 11, 12, middle, 0.46],
    [13, 14, 15, 16, ring, 0.54],
    [17, 18, 19, 20, pinky, 0.62],
  ];
  for (const [mcp, pip, dip, tip, open, x] of fingers) {
    points[mcp] = { x, y: 0.7, z: 0 };
    if (open) {
      points[pip] = { x, y: 0.55, z: 0 };
      points[dip] = { x, y: 0.42, z: 0 };
      points[tip] = { x, y: 0.28, z: 0 };
    } else {
      points[pip] = { x, y: 0.6, z: 0 };
      points[dip] = { x, y: 0.7, z: 0 };
      points[tip] = { x, y: 0.76, z: 0 };
    }
  }
  return points;
}

function rotate(points, degrees) {
  const wrist = points[0];
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map((point) => {
    const x = point.x - wrist.x;
    const y = point.y - wrist.y;
    return { x: wrist.x + x * cos - y * sin, y: wrist.y + x * sin + y * cos, z: 0 };
  });
}

const webSign = { index: true, middle: false, ring: false, pinky: true };

test("classic web sign is index and pinky only", () => {
  const hand = makeHand(webSign);
  assert.equal(isWebSign(hand), true);
  assert.equal(classifyGesture(hand), "web");
  assert.equal(countExtendedFingers(hand), 2);
});

test("web sign survives rotation", () => {
  const hand = makeHand(webSign);
  assert.equal(isWebSign(rotate(hand, 90)), true);
  assert.equal(isWebSign(rotate(hand, 180)), true);
  assert.equal(isWebSign(rotate(hand, -35)), true);
});

test("open palm, fist, and point stay distinct", () => {
  assert.equal(classifyGesture(makeHand({ index: true, middle: true, ring: true, pinky: true })), "palm");
  assert.equal(classifyGesture(makeHand({ index: false, middle: false, ring: false, pinky: false })), "fist");
  assert.equal(classifyGesture(makeHand({ index: true, middle: false, ring: false, pinky: false })), "point");
  assert.equal(isWebSign(makeHand({ index: true, middle: true, ring: true, pinky: true })), false);
});

test("short landmark lists are ignored", () => {
  assert.equal(isWebSign([{ x: 0, y: 0, z: 0 }]), false);
  assert.equal(classifyGesture(null), null);
});
