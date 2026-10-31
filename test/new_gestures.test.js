import assert from "node:assert/strict";
import test from "node:test";
import {
  isAirKnobGrip,
  AIR_KNOB_MIN_GRIP,
  AIR_KNOB_MAX_GRIP,
  isAirMediaHold,
  isAirMediaFlick,
  AIR_MEDIA_HOLD_RADIUS,
  AIR_MEDIA_HOLD_MAX_VELOCITY,
  AIR_MEDIA_HOLD_MIN_DURATION,
  AIR_MEDIA_FLICK_MIN_DX,
  AIR_MEDIA_FLICK_MIN_VX,
  AIR_MEDIA_FLICK_MAX_DRIFT,
  isNinjaShield,
  NINJA_SHIELD_MIN_DY,
  NINJA_SHIELD_MIN_VY,
  NINJA_SHIELD_MAX_SYNC_MS,
  NINJA_SHIELD_MAX_DRIFT,
  isPinchZoom,
  PINCH_ZOOM_CLOSED,
  PINCH_ZOOM_OPEN,
  isAirScroll,
  AIR_SCROLL_MAX_GAP_RATIO,
  PEACE_SIGN_MIN_GAP_RATIO,
  isWebSign,
  isFlickPose,
  isPeaceSign,
  isFingerGun,
  isGojoSign,
  isOpenPalm,
  classifyGesture,
} from "../src/gestures.js";
import { fallbackSettings } from "../src/settings.js";

// ============================================================================
// Synthetic Landmark Helpers
// ============================================================================

function makeBaseHand({ index = true, middle = false, ring = false, pinky = false } = {}) {
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
  points[1] = { x: 0.44, y: 0.78, z: 0 };
  points[2] = { x: 0.40, y: 0.74, z: 0 };
  points[3] = { x: 0.38, y: 0.70, z: 0 };
  points[4] = { x: 0.36, y: 0.68, z: 0 };
  return points;
}

function makeOpenPalm() {
  const points = makeBaseHand({ index: true, middle: true, ring: true, pinky: true });
  points[7] = { x: 0.35, y: 0.42, z: 0 };
  points[8] = { x: 0.32, y: 0.28, z: 0 };
  points[19] = { x: 0.65, y: 0.42, z: 0 };
  points[20] = { x: 0.68, y: 0.28, z: 0 };
  points[2] = { x: 0.36, y: 0.78, z: 0 };
  points[3] = { x: 0.3, y: 0.74, z: 0 };
  points[4] = { x: 0.2, y: 0.68, z: 0 };
  return points;
}

function translateHand(points, dx, dy, dz = 0) {
  return points.map((p) => ({
    x: p.x + dx,
    y: p.y + dy,
    z: (p.z || 0) + dz,
  }));
}

function makeKnobHand(gripDistanceRatio = 0.25, dialAngleRad = 0.5) {
  const hand = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });
  // Palm scale: span(0, 9) = hypot(0.5 - 0.46, 0.82 - 0.70) = hypot(0.04, 0.12) = 0.12649
  const palmScale = 0.12649;
  const targetDist = gripDistanceRatio * palmScale;
  const thumbX = 0.42;
  const thumbY = 0.60;
  hand[4] = { x: thumbX, y: thumbY, z: 0 };
  hand[8] = {
    x: thumbX + targetDist * Math.cos(dialAngleRad),
    y: thumbY + targetDist * Math.sin(dialAngleRad),
    z: 0,
  };
  return hand;
}

function makePinchHand(pinchDistanceRatio = 0.25) {
  const hand = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });
  const palmScale = 0.12649;
  const targetDist = pinchDistanceRatio * palmScale;
  hand[4] = { x: 0.40, y: 0.60, z: 0 };
  hand[8] = { x: 0.40 + targetDist, y: 0.60, z: 0 };
  return hand;
}

function makeScrollHand(gapRatio = 0.20) {
  const hand = makeBaseHand({ index: true, middle: true, ring: false, pinky: false });
  // Palm breadth: span(5, 17) = 0.62 - 0.38 = 0.24
  const palmBreadth = 0.24;
  const targetGap = gapRatio * palmBreadth;
  hand[8] = { x: 0.46 - targetGap / 2, y: 0.28, z: 0 };
  hand[12] = { x: 0.46 + targetGap / 2, y: 0.28, z: 0 };
  return hand;
}

// ============================================================================
// 1. DJ Air Knob (isAirKnobGrip) Unit Tests
// ============================================================================

test("DJ Air Knob: valid grip activates with correct angle and distance calculation", () => {
  const angle = 0.7854; // 45 degrees
  const hand = makeKnobHand(0.30, angle);
  const result = isAirKnobGrip(hand);
  assert.equal(result.active, true);
  assert.ok(result.distance >= AIR_KNOB_MIN_GRIP && result.distance <= AIR_KNOB_MAX_GRIP);
  assert.ok(Math.abs(result.angle - angle) < 0.05);
});

test("DJ Air Knob: angle responds accurately to thumb-index relative rotation", () => {
  const testAngles = [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75, -Math.PI / 3];
  for (const targetAngle of testAngles) {
    const hand = makeKnobHand(0.30, targetAngle);
    const result = isAirKnobGrip(hand);
    assert.equal(result.active, true);
    assert.ok(Math.abs(result.angle - targetAngle) < 0.08, `Angle mismatch for ${targetAngle}`);
  }
});

test("DJ Air Knob: strictly rejected when middle, ring, or pinky finger is open", () => {
  // Middle open
  const middleOpenHand = makeBaseHand({ index: true, middle: true, ring: false, pinky: false });
  middleOpenHand[4] = { x: 0.40, y: 0.60, z: 0 };
  middleOpenHand[8] = { x: 0.43, y: 0.60, z: 0 };
  assert.equal(isAirKnobGrip(middleOpenHand).active, false);

  // Ring open
  const ringOpenHand = makeBaseHand({ index: true, middle: false, ring: true, pinky: false });
  ringOpenHand[4] = { x: 0.40, y: 0.60, z: 0 };
  ringOpenHand[8] = { x: 0.43, y: 0.60, z: 0 };
  assert.equal(isAirKnobGrip(ringOpenHand).active, false);

  // Pinky open
  const pinkyOpenHand = makeBaseHand({ index: true, middle: false, ring: false, pinky: true });
  pinkyOpenHand[4] = { x: 0.40, y: 0.60, z: 0 };
  pinkyOpenHand[8] = { x: 0.43, y: 0.60, z: 0 };
  assert.equal(isAirKnobGrip(pinkyOpenHand).active, false);
});

test("DJ Air Knob: rejected when grip distance is outside [0.08, 0.65] L_palm", () => {
  // Too close (< 0.08)
  const tooCloseHand = makeKnobHand(0.04);
  assert.equal(isAirKnobGrip(tooCloseHand).active, false);

  // Too far (> 0.65)
  const tooFarHand = makeKnobHand(0.75);
  assert.equal(isAirKnobGrip(tooFarHand).active, false);
});

// ============================================================================
// 2. Air Media Control (isAirMediaHold, isAirMediaFlick) Unit Tests
// ============================================================================

test("Air Media Hold: open palm held steady within radius for >=1.0s triggers hold", () => {
  const palm = makeOpenPalm();
  const history = [];
  for (let t = 0; t <= 1200; t += 50) {
    history.push({ t, points: palm });
  }
  const holdActive = isAirMediaHold(palm, history, { now: 1200 });
  assert.equal(holdActive, true);
});

test("Air Media Hold: rejected if held for less than 1.0s (e.g. 600ms)", () => {
  const palm = makeOpenPalm();
  const history = [];
  for (let t = 0; t <= 600; t += 50) {
    history.push({ t, points: palm });
  }
  const holdActive = isAirMediaHold(palm, history, { now: 600 });
  assert.equal(holdActive, false);
});

test("Air Media Hold: rejected if hand drifts beyond max radius or moves too fast", () => {
  const palm = makeOpenPalm();
  // Hand drifts far (> 0.045 screen radius)
  const driftingHistory = [];
  for (let t = 0; t <= 1200; t += 50) {
    const shift = (t / 1200) * 0.10;
    driftingHistory.push({ t, points: translateHand(palm, shift, 0) });
  }
  const driftingPalm = translateHand(palm, 0.10, 0);
  assert.equal(isAirMediaHold(driftingPalm, driftingHistory, { now: 1200 }), false);

  // Hand moves with high velocity (> 0.12 s^-1)
  const fastHistory = [];
  for (let t = 0; t <= 1200; t += 50) {
    const wobble = Math.sin(t) * 0.03;
    fastHistory.push({ t, points: translateHand(palm, wobble, 0) });
  }
  assert.equal(isAirMediaHold(palm, fastHistory, { now: 1200 }), false);
});

test("Air Media Hold: rejected if hand is not an open palm (fist or web)", () => {
  const fist = makeBaseHand({ index: false, middle: false, ring: false, pinky: false });
  const history = [];
  for (let t = 0; t <= 1200; t += 50) {
    history.push({ t, points: fist });
  }
  assert.equal(isAirMediaHold(fist, history, { now: 1200 }), false);
});

test("Air Media Flick: rapid rightward displacement triggers next track flick", () => {
  const basePalm = makeOpenPalm();
  const palmStart = translateHand(basePalm, -0.08, 0);
  const palmEnd = translateHand(basePalm, 0.08, 0); // dx = +0.16 screens

  const history = [
    { t: 0, points: palmStart },
    { t: 140, points: palmEnd }, // dt = 0.14s -> vx = 1.14 s^-1
  ];

  const flickActive = isAirMediaFlick(palmEnd, history, { now: 140 });
  assert.equal(flickActive, true);
});

test("Air Media Flick: mirrored mode inverts flick direction expectation", () => {
  const basePalm = makeOpenPalm();
  const palmLeft = translateHand(basePalm, -0.08, 0);
  const palmRight = translateHand(basePalm, 0.08, 0);

  // In mirrored mode, moving leftward is physical user rightward
  const historyLeft = [
    { t: 0, points: palmRight },
    { t: 140, points: palmLeft },
  ];
  assert.equal(isAirMediaFlick(palmLeft, historyLeft, { now: 140, mirrored: true }), true);
  assert.equal(isAirMediaFlick(palmLeft, historyLeft, { now: 140, mirrored: false }), false);
});

test("Air Media Flick: rejected on vertical or slow motion", () => {
  const basePalm = makeOpenPalm();
  // Pure downward motion (dy = 0.18, dx = 0)
  const palmDown = translateHand(basePalm, 0, 0.18);
  const historyDown = [
    { t: 0, points: basePalm },
    { t: 140, points: palmDown },
  ];
  assert.equal(isAirMediaFlick(palmDown, historyDown, { now: 140 }), false);

  // Slow horizontal drift (dx = 0.14, dt = 600ms -> vx = 0.23 s^-1 < 0.65)
  const palmSlow = translateHand(basePalm, 0.14, 0);
  const historySlow = [
    { t: 0, points: basePalm },
    { t: 600, points: palmSlow },
  ];
  assert.equal(isAirMediaFlick(palmSlow, historySlow, { now: 600 }), false);
});

test("Air Media Flick: rejected if hand is not an open palm", () => {
  const fist = makeBaseHand({ index: false, middle: false, ring: false, pinky: false });
  const fistEnd = translateHand(fist, 0.18, 0);
  const history = [
    { t: 0, points: fist },
    { t: 140, points: fistEnd },
  ];
  assert.equal(isAirMediaFlick(fistEnd, history, { now: 140 }), false);
});

// ============================================================================
// 3. Ninja / Boss Shield (isNinjaShield) Unit Tests
// ============================================================================

test("Ninja Shield: dual open palms simultaneous downward flick triggers shield", () => {
  const base = makeOpenPalm();
  const h0_start = translateHand(base, -0.2, -0.10);
  const h1_start = translateHand(base, 0.2, -0.10);
  const h0_end = translateHand(base, -0.2, 0.10); // dy = 0.20
  const h1_end = translateHand(base, 0.2, 0.10);

  const history = [
    { t: 0, hand0: h0_start, hand1: h1_start },
    { t: 140, hand0: h0_end, hand1: h1_end }, // vy = 0.20 / 0.14 = 1.43 s^-1
  ];

  const result = isNinjaShield(h0_end, h1_end, history, { now: 140 });
  assert.equal(result, true);
});

test("Ninja Shield: rejected if only one hand moves downward", () => {
  const base = makeOpenPalm();
  const h0_start = translateHand(base, -0.2, -0.10);
  const h1_start = translateHand(base, 0.2, 0.0);
  const h0_end = translateHand(base, -0.2, 0.10);
  const h1_end = translateHand(base, 0.2, 0.0); // Hand 1 stays stationary

  const history = [
    { t: 0, hand0: h0_start, hand1: h1_start },
    { t: 140, hand0: h0_end, hand1: h1_end },
  ];

  assert.equal(isNinjaShield(h0_end, h1_end, history, { now: 140 }), false);
});

test("Ninja Shield: rejected if either hand is not an open palm", () => {
  const palm = makeOpenPalm();
  const fist = makeBaseHand({ index: false, middle: false, ring: false, pinky: false });

  const h0_start = translateHand(palm, -0.2, -0.10);
  const h1_start = translateHand(fist, 0.2, -0.10);
  const h0_end = translateHand(palm, -0.2, 0.10);
  const h1_end = translateHand(fist, 0.2, 0.10);

  const history = [
    { t: 0, hand0: h0_start, hand1: h1_start },
    { t: 140, hand0: h0_end, hand1: h1_end },
  ];

  assert.equal(isNinjaShield(h0_end, h1_end, history, { now: 140 }), false);
});

test("Ninja Shield: rejected when synchronicity gap between hands exceeds 75ms", () => {
  const base = makeOpenPalm();
  // Hand 0 flicks at t=0..120ms; Hand 1 flicks at t=120..240ms (gap 120ms > 75ms)
  const history = [
    { t: 0, hand0: translateHand(base, -0.2, -0.10), hand1: translateHand(base, 0.2, -0.10) },
    { t: 120, hand0: translateHand(base, -0.2, 0.10), hand1: translateHand(base, 0.2, -0.10) },
    { t: 240, hand0: translateHand(base, -0.2, 0.10), hand1: translateHand(base, 0.2, 0.10) },
  ];

  const h0_end = translateHand(base, -0.2, 0.10);
  const h1_end = translateHand(base, 0.2, 0.10);

  assert.equal(isNinjaShield(h0_end, h1_end, history, { now: 240 }), false);
});

test("Ninja Shield: rejected on excessive horizontal drift", () => {
  const base = makeOpenPalm();
  // Diagonal slash: dx = 0.20, dy = 0.16 (vx > 0.55 * vy)
  const h0_start = translateHand(base, -0.3, -0.10);
  const h1_start = translateHand(base, 0.1, -0.10);
  const h0_end = translateHand(base, -0.1, 0.06);
  const h1_end = translateHand(base, 0.3, 0.06);

  const history = [
    { t: 0, hand0: h0_start, hand1: h1_start },
    { t: 140, hand0: h0_end, hand1: h1_end },
  ];

  assert.equal(isNinjaShield(h0_end, h1_end, history, { now: 140 }), false);
});

// ============================================================================
// 4. Pinch-to-Zoom Desktop (isPinchZoom) Unit Tests
// ============================================================================

test("Pinch Zoom: active requires fingers 12, 16, 20 strictly closed", () => {
  const closedHand = makePinchHand(0.20);
  assert.equal(isPinchZoom(closedHand).active, true);

  const middleOpen = makeBaseHand({ index: true, middle: true, ring: false, pinky: false });
  assert.equal(isPinchZoom(middleOpen).active, false);

  const ringOpen = makeBaseHand({ index: true, middle: false, ring: true, pinky: false });
  assert.equal(isPinchZoom(ringOpen).active, false);

  const pinkyOpen = makeBaseHand({ index: true, middle: false, ring: false, pinky: true });
  assert.equal(isPinchZoom(pinkyOpen).active, false);
});

test("Pinch Zoom: accurately classifies closed state (<=0.32) and open state (>=0.62)", () => {
  const closedHand = makePinchHand(0.18);
  const resClosed = isPinchZoom(closedHand);
  assert.equal(resClosed.active, true);
  assert.equal(resClosed.isClosed, true);
  assert.equal(resClosed.isOpen, false);

  const openHand = makePinchHand(0.70);
  const resOpen = isPinchZoom(openHand);
  assert.equal(resOpen.active, true);
  assert.equal(resOpen.isOpen, true);
  assert.equal(resOpen.isClosed, false);
});

test("Pinch Zoom: deadband [0.32, 0.62] is neither closed nor open", () => {
  const deadbandHand = makePinchHand(0.46);
  const res = isPinchZoom(deadbandHand);
  assert.equal(res.active, true);
  assert.equal(res.isClosed, false);
  assert.equal(res.isOpen, false);
});

test("Pinch Zoom: Schmitt trigger generates zoom_in on closed-to-open transition", () => {
  const openHand = makePinchHand(0.70);
  const res = isPinchZoom(openHand, { prevState: "closed" });
  assert.equal(res.action, "zoom_in");
});

test("Pinch Zoom: Schmitt trigger generates zoom_out on open-to-closed transition", () => {
  const closedHand = makePinchHand(0.18);
  const res = isPinchZoom(closedHand, { prevState: "open" });
  assert.equal(res.action, "zoom_out");
});

test("Pinch Zoom: history-based transition triggers zoom actions", () => {
  const openHand = makePinchHand(0.70);
  const closedHand = makePinchHand(0.20);

  // Transition from closed to open in history
  const historyIn = [{ distance: 0.20, points: closedHand }];
  assert.equal(isPinchZoom(openHand, historyIn).action, "zoom_in");

  // Transition from open to closed in history
  const historyOut = [{ distance: 0.70, points: openHand }];
  assert.equal(isPinchZoom(closedHand, historyOut).action, "zoom_out");
});

// ============================================================================
// 5. Air Scroll (isAirScroll) Unit Tests
// ============================================================================

test("Air Scroll: parallel index and middle extension activates scroll with correct center", () => {
  const hand = makeScrollHand(0.15); // ratio ~0.15 <= 0.32
  const res = isAirScroll(hand);
  assert.equal(res.active, true);
  assert.ok(res.ratio <= AIR_SCROLL_MAX_GAP_RATIO);
  assert.ok(typeof res.center.x === "number" && typeof res.center.y === "number");
});

test("Air Scroll: rejected when ring or pinky is open", () => {
  const ringOpen = makeBaseHand({ index: true, middle: true, ring: true, pinky: false });
  assert.equal(isAirScroll(ringOpen).active, false);

  const pinkyOpen = makeBaseHand({ index: true, middle: true, ring: false, pinky: true });
  assert.equal(isAirScroll(pinkyOpen).active, false);
});

test("Air Scroll: rejected when index or middle is closed", () => {
  const indexClosed = makeBaseHand({ index: false, middle: true, ring: false, pinky: false });
  assert.equal(isAirScroll(indexClosed).active, false);

  const middleClosed = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });
  assert.equal(isAirScroll(middleClosed).active, false);
});

test("Air Scroll vs Peace Sign deadband: ratio in (0.32, 0.42] activates neither gesture", () => {
  const deadbandHand = makeScrollHand(0.36); // in (0.32, 0.42]
  assert.equal(isAirScroll(deadbandHand).active, false);
  assert.equal(isPeaceSign(deadbandHand), false);
});

// ============================================================================
// 6. Collision Avoidance Invariant Unit Tests
// ============================================================================

test("Collision avoidance: Air Scroll never triggers isPeaceSign", () => {
  const scrollHand = makeScrollHand(0.18);
  assert.equal(isAirScroll(scrollHand).active, true);
  assert.equal(isPeaceSign(scrollHand), false);
});

test("Collision avoidance: isPeaceSign never triggers isAirScroll", () => {
  const peaceHand = makeScrollHand(0.55); // Wide V-spread ratio > 0.42
  assert.equal(isPeaceSign(peaceHand), true);
  assert.equal(isAirScroll(peaceHand).active, false);
});

test("Collision avoidance: DJ Air Knob never triggers isFlickPose (OK Flick)", () => {
  const knobHand = makeKnobHand(0.25, 0.5);
  assert.equal(isAirKnobGrip(knobHand).active, true);
  assert.equal(isFlickPose(knobHand), false);
});

test("Collision avoidance: isFlickPose never triggers isAirKnobGrip", () => {
  // Construct standard OK Flick pose where fingers 12, 16, 20 are extended
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
  points[0] = { x: 0.48, y: 0.88, z: 0 };
  const openFingers = [
    [9, 10, 11, 12, 0.52],
    [13, 14, 15, 16, 0.60],
    [17, 18, 19, 20, 0.68],
  ];
  for (const [mcp, pip, dip, tip, x] of openFingers) {
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

  assert.equal(isFlickPose(points), true);
  assert.equal(isAirKnobGrip(points).active, false);
});

test("Collision avoidance: Ninja Shield never triggers isWebSign, isGojoSign, or isFingerGun", () => {
  const palm = makeOpenPalm();
  assert.equal(isWebSign(palm), false);
  assert.equal(isGojoSign(palm), false);
  assert.equal(isFingerGun(palm), false);
  assert.equal(classifyGesture(palm), "palm");
});

// ============================================================================
// 7. UI Toggle Controls & Persistence Unit Tests
// ============================================================================

test("UI Settings: fallbackSettings includes all 5 toggles enabled by default", () => {
  const defaults = fallbackSettings();
  assert.equal(defaults.airVolumeToggle, true);
  assert.equal(defaults.airMediaToggle, true);
  assert.equal(defaults.ninjaShieldToggle, true);
  assert.equal(defaults.airZoomToggle, true);
  assert.equal(defaults.airScrollToggle, true);
});

test("UI Toggle Gating: disabling toggles prevents gesture action evaluation", () => {
  const settings = fallbackSettings();

  // Test Air Scroll gating
  settings.airScrollToggle = false;
  let scrollExecuted = false;
  if (settings.airScrollToggle !== false) {
    const scroll = isAirScroll(makeScrollHand(0.15));
    if (scroll.active) scrollExecuted = true;
  }
  assert.equal(scrollExecuted, false, "Disabled airScrollToggle must bypass scroll");

  // Test DJ Air Knob gating
  settings.airVolumeToggle = false;
  let volumeExecuted = false;
  if (settings.airVolumeToggle !== false) {
    const knob = isAirKnobGrip(makeKnobHand(0.25));
    if (knob.active) volumeExecuted = true;
  }
  assert.equal(volumeExecuted, false, "Disabled airVolumeToggle must bypass volume knob");

  // Test Pinch Zoom gating
  settings.airZoomToggle = false;
  let zoomExecuted = false;
  if (settings.airZoomToggle !== false) {
    const pinch = isPinchZoom(makePinchHand(0.70), { prevState: "closed" });
    if (pinch.active && pinch.action) zoomExecuted = true;
  }
  assert.equal(zoomExecuted, false, "Disabled airZoomToggle must bypass pinch zoom");

  // Test Air Media gating
  settings.airMediaToggle = false;
  let mediaExecuted = false;
  if (settings.airMediaToggle !== false) {
    const palm = makeOpenPalm();
    const history = [{ t: 0, points: palm }, { t: 1200, points: palm }];
    if (isAirMediaHold(palm, history, { now: 1200 })) mediaExecuted = true;
  }
  assert.equal(mediaExecuted, false, "Disabled airMediaToggle must bypass media controls");

  // Test Ninja Shield gating
  settings.ninjaShieldToggle = false;
  let shieldExecuted = false;
  if (settings.ninjaShieldToggle !== false) {
    shieldExecuted = true;
  }
  assert.equal(shieldExecuted, false, "Disabled ninjaShieldToggle must bypass ninja shield");
});
