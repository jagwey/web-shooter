import assert from "node:assert/strict";
import test from "node:test";
import { GRAB_CONFIRM_FRAMES, RELEASE_CONFIRM_FRAMES } from "../src/gesture-runtime.js";
import { normalizeHandShape, fingerStates, isPinchPose, isFlickRelease, classifyGesture, countExtendedFingers, isFlickPose, isWebSign, isPeaceSign, isFingerGun, isPowerFist, isInFaceDeadzone, matchCustomGesture, jointAngle, voteGesture } from "../src/gestures.js";

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

function mirror(points) {
  return points.map((point) => ({ ...point, x: 1 - point.x }));
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

function stopHand() {
  const hand = makeHand({ index: true, middle: true, ring: true, pinky: true });
  hand[7] = { x: 0.35, y: 0.42, z: 0 };
  hand[8] = { x: 0.32, y: 0.28, z: 0 };
  hand[19] = { x: 0.65, y: 0.42, z: 0 };
  hand[20] = { x: 0.68, y: 0.28, z: 0 };
  hand[2] = { x: 0.36, y: 0.78, z: 0 };
  hand[3] = { x: 0.3, y: 0.74, z: 0 };
  hand[4] = { x: 0.2, y: 0.68, z: 0 };
  return hand;
}

test("open palm, fist, and index-only hands stay distinct", () => {
  assert.equal(classifyGesture(stopHand()), "palm");
  // Fingers open but parallel, thumb tucked: a relaxed hand, not a cancel.
  assert.equal(classifyGesture(makeHand({ index: true, middle: true, ring: true, pinky: true })), null);
  assert.equal(classifyGesture(makeHand({ index: false, middle: false, ring: false, pinky: false })), "fist");
  // v0.6 has no point gesture: an index-only hand is no gesture at all.
  const pointHand = makeHand({ index: true, middle: false, ring: false, pinky: false });
  pointHand[4] = { x: 0.42, y: 0.72, z: 0 };
  assert.equal(classifyGesture(pointHand), null);
  assert.equal(isWebSign(makeHand({ index: true, middle: true, ring: true, pinky: true })), false);
});

test("half-bent finger is neither extended nor closed", () => {
  // Index tip pushed sideways at the PIP: still far from the wrist, but the joint bends ~90°.
  const hand = makeHand({ index: true, middle: true, ring: true, pinky: true });
  hand[7] = { x: 0.3, y: 0.55, z: 0 };
  hand[8] = { x: 0.2, y: 0.55, z: 0 };
  assert.ok(jointAngle(hand[5], hand[6], hand[8]) < 100);
  assert.equal(classifyGesture(hand), null);
});

test("short landmark lists are ignored", () => {
  assert.equal(isWebSign([{ x: 0, y: 0, z: 0 }]), false);
  assert.equal(classifyGesture(null), null);
});

function okFlick() {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
  points[0] = { x: 0.48, y: 0.88, z: 0 };
  const open = [
    [9, 10, 11, 12, 0.52],
    [13, 14, 15, 16, 0.6],
    [17, 18, 19, 20, 0.68],
  ];
  for (const [mcp, pip, dip, tip, x] of open) {
    points[mcp] = { x, y: 0.7, z: 0 };
    points[pip] = { x, y: 0.55, z: 0 };
    points[dip] = { x, y: 0.42, z: 0 };
    points[tip] = { x, y: 0.28, z: 0 };
  }
  points[5] = { x: 0.4, y: 0.72, z: 0 };
  points[6] = { x: 0.34, y: 0.64, z: 0 };
  points[7] = { x: 0.3, y: 0.68, z: 0 };
  points[8] = { x: 0.33, y: 0.74, z: 0 };
  points[1] = { x: 0.4, y: 0.8, z: 0 };
  points[2] = { x: 0.33, y: 0.76, z: 0 };
  points[3] = { x: 0.31, y: 0.74, z: 0 };
  points[4] = { x: 0.335, y: 0.735, z: 0 };
  return points;
}

test("OK flick is a circle plus three fingers, not a web or a close", () => {
  const hand = okFlick();
  assert.equal(isFlickPose(hand), true);
  // Flick is no longer a classified gesture (v0.6): the OK hand is neither web, fist nor palm.
  assert.equal(classifyGesture(hand), null);
  assert.equal(isWebSign(hand), false);
  const palm = makeHand({ index: true, middle: true, ring: true, pinky: true });
  assert.equal(isFlickPose(palm), false);
});

test("a collapsed or half-open hand does not fire a web", () => {
  const collapsed = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  assert.equal(classifyGesture(collapsed), null);
  assert.equal(isWebSign(collapsed), false);
  const pinched = makeHand(webSign);
  pinched[20] = { ...pinched[8] };
  pinched[18] = { ...pinched[6] };
  assert.equal(isWebSign(pinched), false);
});

test("world landmarks classify the same shape at any scale and depth", () => {
  const hand = makeHand({ index: true, middle: false, ring: false, pinky: true });
  // Metric world hand: tiny (metres) and offset in z, like MediaPipe worldLandmarks.
  const world = hand.map((p) => ({ x: (p.x - 0.5) * 0.3, y: (p.y - 0.82) * 0.3, z: 0.02 }));
  assert.equal(classifyGesture(hand, world), classifyGesture(hand));
  // The image hand still gates size: a speck in the frame is not a gesture even with world data.
  const speck = hand.map((p) => ({ x: 0.5 + (p.x - 0.5) * 0.1, y: 0.5 + (p.y - 0.82) * 0.1, z: 0 }));
  assert.equal(classifyGesture(speck, world), null);
});

test("vote needs 3 of the last 5 frames to switch", () => {
  const votes = [];
  assert.equal(voteGesture(votes, "web", null), null);
  assert.equal(voteGesture(votes, "fist", null), null);
  assert.equal(voteGesture(votes, "web", null), null);
  assert.equal(voteGesture(votes, "web", null), "web");
  // One stray frame does not drop the held pose.
  assert.equal(voteGesture(votes, null, "web"), "web");
  assert.equal(votes.length, 5);
});

test("peace sign is index and middle in V-spread", () => {
  const hand = makeHand({ index: true, middle: true, ring: false, pinky: false });
  // Spread index and middle tips apart (V shape)
  hand[8] = { x: 0.28, y: 0.28, z: 0 };
  hand[12] = { x: 0.56, y: 0.28, z: 0 };
  assert.equal(isPeaceSign(hand), true);
  assert.equal(classifyGesture(hand), "peace");
});

test("finger gun is index forward and thumb up", () => {
  const hand = makeHand({ index: true, middle: false, ring: false, pinky: false });
  // Extend thumb away from palm (upward/outward)
  hand[4] = { x: 0.15, y: 0.65, z: 0 };
  assert.equal(isFingerGun(hand), true);
  // finger_gun stays as a helper but is not a v0.6 gesture.
  assert.equal(classifyGesture(hand), null);
});

test("power fist distinguishes grip from resting hand", () => {
  const fist = makeHand({ index: false, middle: false, ring: false, pinky: false });
  // Loose resting hand: thumb loose at 0.5, 0.82
  assert.equal(isPowerFist(fist), false);
  // Clamped power grip: thumb locked over index knuckle
  fist[4] = { x: 0.38, y: 0.62, z: 0 };
  assert.equal(isPowerFist(fist), true);
});

test("face deadzone detects hands near chin/head", () => {
  const chinHand = makeHand({ index: false, middle: false, ring: false, pinky: false });
  chinHand[0] = { x: 0.5, y: 0.32, z: 0 };
  chinHand[9] = { x: 0.5, y: 0.25, z: 0 };
  assert.equal(isInFaceDeadzone(chinHand), true);

  const deskHand = makeHand({ index: false, middle: false, ring: false, pinky: false });
  deskHand[0] = { x: 0.5, y: 0.75, z: 0 };
  deskHand[9] = { x: 0.5, y: 0.65, z: 0 };
  assert.equal(isInFaceDeadzone(deskHand), false);
});

test("custom gesture template matching recognizes learned poses", () => {
  const template = makeHand({ index: true, middle: false, ring: false, pinky: true });
  const samePose = makeHand({ index: true, middle: false, ring: false, pinky: true });
  const diffPose = makeHand({ index: false, middle: false, ring: false, pinky: false });
  assert.equal(matchCustomGesture(samePose, template), true);
  assert.equal(matchCustomGesture(diffPose, template), false);
});

// ---- G1: hysteresis, pinch, normalized custom match, finger states, flick release ----

function twoUp(gapX) {
  const h = makeHand({ index: true, middle: true, ring: false, pinky: false });
  h[8] = { x: 0.46 - gapX / 2, y: 0.28, z: 0 };
  h[12] = { x: 0.46 + gapX / 2, y: 0.28, z: 0 };
  return h;
}

test("peace is any two-finger-up hand, fingers together or spread, thumb ignored", () => {
  for (const gap of [0.02, 0.05, 0.084, 0.108, 0.14]) assert.equal(classifyGesture(twoUp(gap)), "peace");
  const thumbOut = twoUp(0.1);
  thumbOut[4] = { x: 0.15, y: 0.65, z: 0 };
  assert.equal(classifyGesture(thumbOut), "peace");
  // Mirrored (other hand, or back of the hand to the camera) reads the same.
  assert.equal(classifyGesture(mirror(twoUp(0.1))), "peace");
});

test("a pinch-like hand never returns the removed pinch label", () => {
  const h = makeHand({ index: false, middle: false, ring: false, pinky: false });
  h[6] = { x: 0.38, y: 0.58, z: 0 };
  h[7] = { x: 0.4, y: 0.5, z: 0 };
  h[8] = { x: 0.42, y: 0.46, z: 0 };
  h[4] = { x: 0.43, y: 0.47, z: 0 };
  assert.equal(isPinchPose(h), true);
  assert.notEqual(classifyGesture(h), "pinch");
});

// Realistic proportions, knuckles toward the camera: fingers collapse to short straight stubs.
function knuckles(tipY) {
  const p = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8, z: 0 }));
  for (const [m, x] of [[5, 0.42], [9, 0.48], [13, 0.54], [17, 0.6]]) {
    p[m] = { x, y: 0.62, z: 0 };
    p[m + 1] = { x, y: 0.59, z: 0 };
    p[m + 2] = { x, y: (0.59 + tipY) / 2, z: 0 };
    p[m + 3] = { x, y: tipY, z: 0 };
  }
  return p;
}

test("tolerant fist: a loose finger or foreshortened knuckles still grab", () => {
  const loose = makeHand({ index: false, middle: false, ring: false, pinky: false });
  loose[19] = { x: 0.66, y: 0.6, z: 0 };
  loose[20] = { x: 0.7, y: 0.6, z: 0 };
  assert.equal(classifyGesture(loose), "fist");
  assert.equal(classifyGesture(mirror(loose)), "fist");
  assert.equal(classifyGesture(rotate(loose, 180)), "fist");
  // No finger reads as closed here; tips pulled in toward the wrist decide it.
  assert.equal(classifyGesture(knuckles(0.585)), "fist");
  // Looser claw: not a fresh grab, but a held fist does not drop.
  assert.equal(classifyGesture(knuckles(0.56)), null);
  assert.equal(classifyGesture(knuckles(0.56), null, [], { lastGesture: "fist" }), "fist");
  // An extended finger always vetoes the fist.
  assert.equal(classifyGesture(knuckles(0.5), null, [], { lastGesture: "fist" }), null);
});

test("fast vote: fist and palm confirm on 2 consecutive frames, a stale majority cannot flip back", () => {
  assert.equal(GRAB_CONFIRM_FRAMES, 2);
  assert.equal(RELEASE_CONFIRM_FRAMES, 2);
  const votes = [];
  for (let i = 0; i < 3; i += 1) voteGesture(votes, "peace", null);
  assert.equal(voteGesture(votes, "fist", "peace"), "peace");
  assert.equal(voteGesture(votes, "fist", "peace"), "fist");
  assert.equal(voteGesture(votes, null, "fist"), "fist");
  assert.equal(voteGesture(votes, "palm", "fist"), "fist");
  assert.equal(voteGesture(votes, "palm", "fist"), "palm");
  // Dwell poses stay on the stricter 3-of-5 majority.
  const slow = [];
  assert.equal(voteGesture(slow, "web", null), null);
  assert.equal(voteGesture(slow, "web", null), null);
  assert.equal(voteGesture(slow, "web", null), "web");
});

test("normalizeHandShape: custom match is translation, scale and roll invariant", () => {
  const base = makeHand({ index: true, middle: false, ring: false, pinky: true });
  const moved = rotate(base, 40).map((p) => ({ x: (p.x - 0.5) * 0.6 + 0.2, y: (p.y - 0.82) * 0.6 + 0.3, z: 0 }));
  assert.equal(matchCustomGesture(moved, base), true);
  assert.equal(matchCustomGesture(makeHand({ index: false, middle: false, ring: false, pinky: false }), base), false);
  assert.equal(normalizeHandShape(base)[0].x, 0);
});

test("custom templates are a fallback and cannot shadow built-ins", () => {
  const fist = makeHand({ index: false, middle: false, ring: false, pinky: false });
  assert.equal(classifyGesture(fist, null, [{ name: "mine", points: fist }]), "fist");
  const odd = makeHand({ index: true, middle: true, ring: false, pinky: true });
  assert.equal(classifyGesture(odd, null, [{ name: "mine", points: odd }]), "mine");
});

test("fingerStates reports per-finger extension", () => {
  const f = fingerStates(makeHand({ index: true, middle: false, ring: false, pinky: true }));
  assert.deepEqual([f.index, f.middle, f.ring, f.pinky], [true, false, false, true]);
});

test("isFlickRelease: OK held then index snaps open", () => {
  const ok = okFlick();
  const open = makeHand({ index: true, middle: true, ring: true, pinky: true });
  open[4] = { x: 0.2, y: 0.68, z: 0 };
  const hist = [];
  for (let t = 0; t <= 200; t += 40) hist.push({ t, points: ok });
  hist.push({ t: 260, points: open });
  assert.equal(isFlickRelease(hist, { now: 260 }), true);
  assert.equal(isFlickRelease(hist.slice(-2), { now: 260 }), false); // not held long enough
});
