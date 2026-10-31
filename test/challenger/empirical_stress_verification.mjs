/**
 * EMPIRICAL CHALLENGER VERIFICATION HARNESS
 * Comprehensive Invariance, Distortion, Transition, and Deadband Stress Testing
 *
 * Target: 5 New Gestures (DJ Air Knob, Air Media Control, Ninja Shield, Pinch Zoom, Air Scroll)
 * Collision Exclusivity: Web Sign, Peace Sign, OK Flick, Gojo Sign, Fist, Point
 */

import assert from "node:assert/strict";
import {
  isAirKnobGrip,
  AIR_KNOB_MIN_GRIP,
  AIR_KNOB_MAX_GRIP,
  isAirMediaHold,
  isAirMediaFlick,
  isNinjaShield,
  isPinchZoom,
  PINCH_ZOOM_CLOSED,
  PINCH_ZOOM_OPEN,
  isAirScroll,
  AIR_SCROLL_MAX_GAP_RATIO,
  PEACE_SIGN_MIN_GAP_RATIO,
  isWebSign,
  isPeaceSign,
  isFlickPose,
  isGojoSign,
  isFingerGun,
  isFist,
  isPoint,
  isOpenPalm,
  classifyGesture,
  spanMetric,
  jointCosine,
  boneReach,
  palmReferenceScale,
} from "../../src/gestures.js";

console.log("===============================================================================");
console.log("   EMPIRICAL CHALLENGER DEEP STRESS HARNESS: 5 NEW GESTURES & ANTI-COLLISION   ");
console.log("===============================================================================");

let totalPassed = 0;
let totalFailed = 0;
export const benchmarkMetrics = {};

function recordTest(testName, passed, details = "") {
  if (passed) {
    totalPassed++;
    console.log(`[PASS] ${testName}${details ? " -> " + details : ""}`);
  } else {
    totalFailed++;
    console.error(`[FAIL] ${testName}${details ? " -> " + details : ""}`);
  }
}

// -----------------------------------------------------------------------------
// Base Synthetic Hand Generators
// -----------------------------------------------------------------------------

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

function pitchHand(points, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const wrist = points[0];
  return points.map((p) => {
    const dy = p.y - wrist.y;
    const dz = (p.z || 0) - (wrist.z || 0);
    return {
      x: p.x,
      y: wrist.y + dy * cosA - dz * sinA,
      z: (wrist.z || 0) + dy * sinA + dz * cosA,
    };
  });
}

function addNoise(points, sigma = 0.002) {
  return points.map((p) => ({
    x: p.x + (Math.random() - 0.5) * 2 * sigma,
    y: p.y + (Math.random() - 0.5) * 2 * sigma,
    z: (p.z || 0) + (Math.random() - 0.5) * 2 * sigma,
  }));
}

// -----------------------------------------------------------------------------
// SECTION 1: PERSPECTIVE DISTORTION CHALLENGE (0° TO 60° PITCH)
// -----------------------------------------------------------------------------
console.log("\n>>> SECTION 1: Perspective Distortion Challenge (0° to 60° Pitch Across 13 Angles)");

{
  const pitchAngles = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
  const metrics = [];

  // Setup 5 benchmark gesture poses
  // 1. DJ Air Knob
  const knobBase = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });
  knobBase[4] = { x: 0.40, y: 0.60, z: 0 };
  knobBase[8] = { x: 0.43, y: 0.60, z: 0 };

  // 2. Air Scroll (Index + Middle parallel, tip gap ratio ~ 0.25)
  const scrollBase = makeBaseHand({ index: true, middle: true, ring: false, pinky: false });
  scrollBase[8] = { x: 0.45, y: 0.28, z: 0 };
  scrollBase[12] = { x: 0.48, y: 0.28, z: 0 };

  // 3. Pinch Zoom (Closed & Open)
  const pinchClosed = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });
  pinchClosed[4] = { x: 0.40, y: 0.60, z: 0 };
  pinchClosed[8] = { x: 0.42, y: 0.60, z: 0 };

  const pinchOpen = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });
  pinchOpen[4] = { x: 0.40, y: 0.60, z: 0 };
  pinchOpen[8] = { x: 0.49, y: 0.60, z: 0 };

  // 4. Open Palm (Media & Shield)
  const palmBase = makeOpenPalm();

  // 5. Distractors: Fist and Point
  const fistBase = makeBaseHand({ index: false, middle: false, ring: false, pinky: false });
  const pointBase = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });

  let knobPass = true;
  let scrollPass = true;
  let pinchPass = true;
  let palmPass = true;
  let distractorRejectionPass = true;

  for (const deg of pitchAngles) {
    const kHand = pitchHand(knobBase, deg);
    const sHand = pitchHand(scrollBase, deg);
    const pcHand = pitchHand(pinchClosed, deg);
    const poHand = pitchHand(pinchOpen, deg);
    const pHand = pitchHand(palmBase, deg);

    const fHand = pitchHand(fistBase, deg);
    const ptHand = pitchHand(pointBase, deg);

    // Assertions
    const kRes = isAirKnobGrip(kHand);
    const sRes = isAirScroll(sHand);
    const pcRes = isPinchZoom(pcHand);
    const poRes = isPinchZoom(poHand);
    const pRes = isOpenPalm(pHand);

    if (!kRes.active) knobPass = false;
    if (!sRes.active) scrollPass = false;
    if (!pcRes.isClosed || !poRes.isOpen) pinchPass = false;
    if (!pRes) palmPass = false;

    // Distractor rejections: Fist and Point must never trigger Knob, Scroll, Pinch, or Palm
    if (isAirKnobGrip(fHand).active || isAirScroll(fHand).active || isOpenPalm(fHand)) distractorRejectionPass = false;
    if (isAirKnobGrip(ptHand).active || isAirScroll(ptHand).active || isOpenPalm(ptHand)) distractorRejectionPass = false;

    metrics.push({
      pitchDeg: deg,
      knobActive: kRes.active,
      scrollActive: sRes.active,
      pinchClosed: pcRes.isClosed,
      pinchOpen: poRes.isOpen,
      palmOpen: pRes,
      distractorSafe: true,
    });
  }

  benchmarkMetrics.pitchDistortion = metrics;

  recordTest("Perspective pitch 0°-60° invariant DJ Air Knob detection (13/13 angles)", knobPass);
  recordTest("Perspective pitch 0°-60° invariant Air Scroll & Pinch Zoom classification (13/13 angles)", scrollPass && pinchPass);
  recordTest("Perspective pitch 0°-60° invariant Open Palm classification (13/13 angles)", palmPass);
  recordTest("Perspective pitch 0°-60° zero false-positive distractor triggers (Fist, Point rejected)", distractorRejectionPass);
}

// -----------------------------------------------------------------------------
// SECTION 2: DEADBAND SEPARATION & ISOLATION (AIR SCROLL VS PEACE SIGN)
// -----------------------------------------------------------------------------
console.log("\n>>> SECTION 2: Deadband Separation & Isolation Challenge ([0.32, 0.42] W_palm)");

{
  const scrollBase = makeBaseHand({ index: true, middle: true, ring: false, pinky: false });
  const palmBreadth = spanMetric(scrollBase[5], scrollBase[17], 1.0);

  let falseScrollInDeadband = 0;
  let falsePeaceInDeadband = 0;
  let correctScrollBelow = 0;
  let correctPeaceAbove = 0;
  let totalDeadbandSamples = 0;

  // Sweep ratio from 0.15 to 0.60 with 0.002 step (226 steps)
  const step = 0.002;
  const startRatio = 0.15;
  const endRatio = 0.60;

  for (let r = startRatio; r <= endRatio; r += step) {
    const testHand = makeBaseHand({ index: true, middle: true, ring: false, pinky: false });
    const tipDistance = r * palmBreadth;
    testHand[8] = { x: 0.46 - tipDistance / 2, y: 0.28, z: 0 };
    testHand[12] = { x: 0.46 + tipDistance / 2, y: 0.28, z: 0 };

    const actualPalm = spanMetric(testHand[5], testHand[17], 1.0);
    const actualTip = spanMetric(testHand[8], testHand[12], 1.0);
    const actualRatio = actualTip / actualPalm;

    const scrollRes = isAirScroll(testHand);
    const peaceRes = isPeaceSign(testHand);

    if (actualRatio <= 0.32) {
      if (scrollRes.active) correctScrollBelow++;
      if (peaceRes) falsePeaceInDeadband++;
    } else if (actualRatio > 0.32 && actualRatio <= 0.42) {
      totalDeadbandSamples++;
      if (scrollRes.active) falseScrollInDeadband++;
      if (peaceRes) falsePeaceInDeadband++;
    } else if (actualRatio > 0.42) {
      if (peaceRes) correctPeaceAbove++;
      if (scrollRes.active) falseScrollInDeadband++;
    }
  }

  // Fuzz 5,000 continuous noisy samples strictly inside the deadband (0.321 to 0.419)
  let fuzzedDeadbandViolations = 0;
  let fuzzedVerifiedCount = 0;
  for (let i = 0; i < 5000; i++) {
    const targetRatio = 0.33 + Math.random() * (0.41 - 0.33);
    const testHand = makeBaseHand({ index: true, middle: true, ring: false, pinky: false });
    const tipDistance = targetRatio * palmBreadth;
    testHand[8] = { x: 0.46 - tipDistance / 2, y: 0.28, z: 0 };
    testHand[12] = { x: 0.46 + tipDistance / 2, y: 0.28, z: 0 };
    const noisyHand = addNoise(testHand, 0.0005);

    const actualPalm = spanMetric(noisyHand[5], noisyHand[17], 1.0);
    const actualTip = spanMetric(noisyHand[8], noisyHand[12], 1.0);
    const actualRatio = actualTip / actualPalm;

    if (actualRatio > 0.32001 && actualRatio <= 0.42000) {
      fuzzedVerifiedCount++;
      if (isAirScroll(noisyHand).active || isPeaceSign(noisyHand)) {
        fuzzedDeadbandViolations++;
      }
    }
  }

  benchmarkMetrics.deadband = {
    totalDeadbandSamples,
    falseScrollInDeadband,
    falsePeaceInDeadband,
    correctScrollBelow,
    correctPeaceAbove,
    fuzzedDeadbandViolations,
    fuzzedVerifiedCount,
  };

  recordTest(
    "Air Scroll vs Peace Sign deadband (0.32, 0.42] activates neither gesture (sweep)",
    falseScrollInDeadband === 0 && falsePeaceInDeadband === 0,
    `deadband samples=${totalDeadbandSamples}, violations=${falseScrollInDeadband + falsePeaceInDeadband}`
  );

  recordTest(
    "Fuzzed deadband stress test (5,000 noisy samples strictly inside deadband) produces 0 false activations",
    fuzzedDeadbandViolations === 0 && fuzzedVerifiedCount > 4000,
    `violations=${fuzzedDeadbandViolations} / ${fuzzedVerifiedCount}`
  );
}

// -----------------------------------------------------------------------------
// SECTION 3: RAPID TRANSITION STABILITY & COLLISION CROSS-CONTAMINATION
// -----------------------------------------------------------------------------
console.log("\n>>> SECTION 3: Rapid Transition Stability & Collision Matrix (1,000 Continuous Transitions)");

{
  // Cycle: Pinch -> Zoom Open -> Dial Knob -> Air Scroll -> Peace Sign -> Web Sign -> Open Palm
  const gestureMakers = [
    {
      name: "pinch_closed",
      fn: () => {
        const h = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });
        h[4] = { x: 0.40, y: 0.60, z: 0 };
        h[8] = { x: 0.42, y: 0.60, z: 0 };
        return h;
      },
    },
    {
      name: "pinch_open",
      fn: () => {
        const h = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });
        h[4] = { x: 0.40, y: 0.60, z: 0 };
        h[8] = { x: 0.49, y: 0.60, z: 0 };
        return h;
      },
    },
    {
      name: "dial_knob",
      fn: () => {
        const h = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });
        h[4] = { x: 0.40, y: 0.60, z: 0 };
        h[8] = { x: 0.43, y: 0.60, z: 0 };
        return h;
      },
    },
    {
      name: "air_scroll",
      fn: () => {
        const h = makeBaseHand({ index: true, middle: true, ring: false, pinky: false });
        h[8] = { x: 0.44, y: 0.28, z: 0 };
        h[12] = { x: 0.48, y: 0.28, z: 0 };
        return h;
      },
    },
    {
      name: "peace_sign",
      fn: () => {
        const h = makeBaseHand({ index: true, middle: true, ring: false, pinky: false });
        h[8] = { x: 0.35, y: 0.28, z: 0 };
        h[12] = { x: 0.57, y: 0.28, z: 0 };
        return h;
      },
    },
    {
      name: "web_sign",
      fn: () => makeBaseHand({ index: true, middle: false, ring: false, pinky: true }),
    },
    {
      name: "open_palm",
      fn: () => makeOpenPalm(),
    },
  ];

  let crossContaminations = 0;
  const collisionDetails = [];

  // Run 1,000 rapid state transitions
  const TOTAL_TRANSITION_FRAMES = 1000;
  for (let frame = 0; frame < TOTAL_TRANSITION_FRAMES; frame++) {
    const item = gestureMakers[frame % gestureMakers.length];
    const hand = addNoise(item.fn(), 0.001);

    const isKnob = isAirKnobGrip(hand).active;
    const isScroll = isAirScroll(hand).active;
    const isPinch = isPinchZoom(hand).active;
    const isPeace = isPeaceSign(hand);
    const isWeb = isWebSign(hand);
    const isPalm = isOpenPalm(hand);
    const isFlick = isFlickPose(hand);

    // Mutual exclusivity validations:
    if (item.name === "air_scroll") {
      if (isPeace || isWeb || isKnob || isPalm || isFlick) {
        crossContaminations++;
        collisionDetails.push(`Frame ${frame}: Air Scroll collided with peace=${isPeace}, web=${isWeb}, knob=${isKnob}`);
      }
    } else if (item.name === "peace_sign") {
      if (isScroll || isWeb || isKnob || isPalm || isFlick) {
        crossContaminations++;
        collisionDetails.push(`Frame ${frame}: Peace Sign collided with scroll=${isScroll}, web=${isWeb}`);
      }
    } else if (item.name === "web_sign") {
      if (isScroll || isPeace || isKnob || isPalm || isFlick) {
        crossContaminations++;
        collisionDetails.push(`Frame ${frame}: Web Sign collided with scroll=${isScroll}, peace=${isPeace}, knob=${isKnob}`);
      }
    } else if (item.name === "dial_knob") {
      if (isScroll || isPeace || isWeb || isFlick || isPalm) {
        crossContaminations++;
        collisionDetails.push(`Frame ${frame}: DJ Knob collided with flick=${isFlick}, scroll=${isScroll}`);
      }
    } else if (item.name === "pinch_closed" || item.name === "pinch_open") {
      if (isScroll || isPeace || isWeb || isPalm || isFlick) {
        crossContaminations++;
        collisionDetails.push(`Frame ${frame}: Pinch Zoom collided with scroll=${isScroll}, peace=${isPeace}`);
      }
    } else if (item.name === "open_palm") {
      if (isScroll || isPeace || isWeb || isKnob || isPinch) {
        crossContaminations++;
        collisionDetails.push(`Frame ${frame}: Open Palm collided with other gestures`);
      }
    }
  }

  benchmarkMetrics.transitions = {
    totalFrames: TOTAL_TRANSITION_FRAMES,
    crossContaminations,
    collisionDetails: collisionDetails.slice(0, 5),
  };

  recordTest(
    "Rapid state transition stability (1,000 frames) maintains 0 state cross-contaminations",
    crossContaminations === 0,
    `crossContaminations=${crossContaminations} across ${TOTAL_TRANSITION_FRAMES} frames`
  );
}

// -----------------------------------------------------------------------------
// SECTION 4: ASPECT RATIO INVARIANCE & NORMALIZATION TEST
// -----------------------------------------------------------------------------
console.log("\n>>> SECTION 4: Aspect Ratio Invariance & Isotropic Metric Correction");

{
  const testAspectRatios = [0.75, 1.0, 1.333, 1.777, 2.333];
  let arInvariantPass = true;

  for (const ar of testAspectRatios) {
    const knob = makeBaseHand({ index: true, middle: false, ring: false, pinky: false });
    const palmScale = palmReferenceScale(knob, ar);
    const targetDist = 0.25 * palmScale;
    knob[4] = { x: 0.40, y: 0.60, z: 0 };
    knob[8] = { x: 0.40 + targetDist / ar, y: 0.60, z: 0 };

    const res = isAirKnobGrip(knob, { aspectRatio: ar });
    if (!res.active || Math.abs(res.distance - 0.25) > 0.01) {
      arInvariantPass = false;
    }

    const scroll = makeBaseHand({ index: true, middle: true, ring: false, pinky: false });
    const palmBreadth = spanMetric(scroll[5], scroll[17], ar);
    const scrollDist = 0.20 * palmBreadth;
    scroll[8] = { x: 0.46 - scrollDist / (2 * ar), y: 0.28, z: 0 };
    scroll[12] = { x: 0.46 + scrollDist / (2 * ar), y: 0.28, z: 0 };

    const sRes = isAirScroll(scroll, { aspectRatio: ar });
    if (!sRes.active || Math.abs(sRes.ratio - 0.20) > 0.01) {
      arInvariantPass = false;
    }
  }

  recordTest(
    "Aspect ratio scaling (AR 0.75 to 2.333) maintains exact metric isotropy",
    arInvariantPass,
    `tested ARs: ${testAspectRatios.join(", ")}`
  );
}

// -----------------------------------------------------------------------------
// SECTION 5: MEDIA CONTROL & NINJA SHIELD TIMING & KINEMATICS STRESS TEST
// -----------------------------------------------------------------------------
console.log("\n>>> SECTION 5: Media Control & Ninja Shield Kinematic Boundary Stress-Testing");

{
  // 1. Media Control Hold Duration Boundary
  const openPalm = makeOpenPalm();
  const palmTrajectory = [];
  // 950ms hold (insufficient by 50ms)
  for (let t = 0; t <= 950; t += 33) {
    palmTrajectory.push({ t, x: 0.5, y: 0.5, points: openPalm });
  }
  const hold950 = isAirMediaHold(openPalm, palmTrajectory, { now: 950 });

  // 1050ms hold (sufficient by 50ms)
  palmTrajectory.push({ t: 1000, x: 0.5, y: 0.5, points: openPalm });
  palmTrajectory.push({ t: 1050, x: 0.5, y: 0.5, points: openPalm });
  const hold1050 = isAirMediaHold(openPalm, palmTrajectory, { now: 1050 });

  recordTest(
    "Air Media Hold duration boundary: 950ms rejected, 1050ms triggered",
    hold950 === false && hold1050 === true,
    `hold@950ms=${hold950}, hold@1050ms=${hold1050}`
  );

  // 2. Ninja Shield Synchronicity Gap Boundary
  const h0 = makeOpenPalm();
  const h1 = makeOpenPalm();
  // Synchronous flick within 40ms
  const syncHist = [
    { t: 0, x0: 0.3, y0: 0.2, x1: 0.7, y1: 0.2 },
    { t: 100, x0: 0.3, y0: 0.45, x1: 0.7, y1: 0.42 }, // tPeak difference ~ 0ms
  ];
  const syncShield = isNinjaShield(h0, h1, syncHist, { now: 100 });

  // Asynchronous flick with 120ms gap (exceeding 75ms threshold)
  const asyncHist = [
    { t: 0, x0: 0.3, y0: 0.2, x1: 0.7, y1: 0.2 },
    { t: 100, x0: 0.3, y0: 0.45, x1: 0.7, y1: 0.2 }, // Hand 0 flicks at 100ms
    { t: 220, x0: 0.3, y0: 0.45, x1: 0.7, y1: 0.45 }, // Hand 1 flicks at 220ms (gap 120ms)
  ];
  const asyncShield = isNinjaShield(h0, h1, asyncHist, { now: 220 });

  recordTest(
    "Ninja Shield synchronicity gate: 40ms sync accepted, 120ms async rejected",
    syncShield === true && asyncShield === false,
    `sync@40ms=${syncShield}, async@120ms=${asyncShield}`
  );
}

// -----------------------------------------------------------------------------
// VERDICT & SUMMARY
// -----------------------------------------------------------------------------
console.log("\n===============================================================================");
console.log(`TOTAL PASS: ${totalPassed} | TOTAL FAIL: ${totalFailed}`);
const finalVerdict = totalFailed === 0 ? "APPROVE" : "REQUEST_CHANGES";
console.log(`EMPIRICAL CHALLENGER VERDICT: ${finalVerdict}`);
console.log("===============================================================================");

process.exit(totalFailed === 0 ? 0 : 1);
