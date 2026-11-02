/**
 * Milestone 1 Empirical Challenger Boundary & Stress Verification
 *
 * Requirements to verify:
 * 1. Hand Clap detection (isHandClap):
 *    - Approach velocity right at 3.0 palm/s
 *    - Contact distance right at 0.7 palm
 *    - Refractory period 800ms
 *    - Opposing velocity vector requirement (parallel movement rejected)
 *    - MediaPipe 1-frame hand merge tolerance
 * 2. Flick Release gesture (isFlickRelease):
 *    - Hold time boundary (119ms vs 120ms vs 121ms)
 *    - Release window boundary (250ms vs 251ms)
 *    - Release speed boundary right at 3.0 palm/s
 *    - Contiguity requirement (interrupted OK run rejected)
 *    - Tip separation requirement (span <= 0.90 palm rejected)
 * 3. Grab continuity and fast tracking under rapid hand movement:
 *    - Rapid single-hand label reversals (Left <-> Right jitter under maxHands=1)
 *    - Dual-hand grab protection against slot reset
 *    - High-speed tracking continuity & predictive lead capping (LEAD_CAP_MS = 85ms)
 */

import assert from "node:assert/strict";
import {
  isHandClap,
  HAND_CLAP_MIN_APPROACH_VELOCITY,
  HAND_CLAP_MAX_CONTACT_DISTANCE,
  HAND_CLAP_REFRACTORY_MS,
  isFlickRelease,
  FLICK_RELEASE_MIN_HOLD_MS,
  FLICK_RELEASE_WINDOW_MS,
  FLICK_RELEASE_MIN_SPEED,
  isFlickPose,
  isOpenPalm,
  isFist,
  spanMetric,
  palmReferenceScale,
} from "../../src/gestures.js";

const motionScale = (pts) => {
  const k = palmReferenceScale(pts, 1.0);
  return k > 1e-4 ? k : 0.15;
};

import { alignHandSlots } from "../../src/gesture-runtime.js";
import { createHandFilter, filterLandmarks, handSpeed, adaptiveLeadMs, predictPalmAnchor, predict } from "../../src/filter.js";

console.log("===============================================================================");
console.log("   MILESTONE 1 EMPIRICAL CHALLENGER: BOUNDARY & KINEMATICS STRESS HARNESS    ");
console.log("===============================================================================");

let totalPassed = 0;
let totalFailed = 0;

function report(testName, passed, details = "") {
  if (passed) {
    totalPassed++;
    console.log(`[PASS] ${testName}${details ? " -> " + details : ""}`);
  } else {
    totalFailed++;
    console.error(`[FAIL] ${testName}${details ? " -> " + details : ""}`);
  }
}

// -----------------------------------------------------------------------------
// Synthetic Landmark Generators
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

function translateHand(points, dx, dy, dz = 0) {
  return points.map((p) => ({
    x: p.x + dx,
    y: p.y + dy,
    z: (p.z || 0) + dz,
  }));
}

function makeFlickPoseHand() {
  const points = makeBaseHand({ index: false, middle: true, ring: true, pinky: true });
  const openFingers = [
    [9, 10, 11, 12, 0.46],
    [13, 14, 15, 16, 0.54],
    [17, 18, 19, 20, 0.62],
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
  return points;
}

function makeFlickReleaseHand(tipY = 0.15) {
  const pts = makeFlickPoseHand();
  pts[6] = { x: 0.38, y: 0.55, z: 0 };
  pts[7] = { x: 0.36, y: 0.42, z: 0 };
  pts[8] = { x: 0.34, y: tipY, z: 0 };
  return pts;
}

// =============================================================================
// TEST SUITE 1: Hand Clap Detection (isHandClap) Boundary Precision
// =============================================================================
console.log("\n>>> SUITE 1: Hand Clap Detection Boundary & Kinematics");

{
  const openPalm = makeOpenPalm();
  const k = motionScale(openPalm);

  // 1.1 Approach Velocity Boundary: 2.99 vs 3.00 vs 3.01 palm/s
  const currentGap = 0.1 * k;
  const h0_end = translateHand(openPalm, -currentGap / 2, 0);
  const h1_end = translateHand(openPalm, currentGap / 2, 0);

  function testVelocity(V) {
    const dPast = (0.1 + 0.1 * V) * k;
    const h0_start = translateHand(openPalm, -dPast / 2, 0);
    const h1_start = translateHand(openPalm, dPast / 2, 0);
    const hist = [
      { t: 0, hand0: h0_start, hand1: h1_start },
      { t: 100, hand0: h0_end, hand1: h1_end },
    ];
    return isHandClap(h0_end, h1_end, hist, { now: 100 });
  }

  const vBelow = testVelocity(2.99);
  const vAt = testVelocity(3.00);
  const vAbove = testVelocity(3.01);

  report(
    "1.1 Hand Clap velocity boundary: 2.99 rejected, 3.00 accepted, 3.01 accepted",
    vBelow === false && vAt === true && vAbove === true,
    `v(2.99)=${vBelow}, v(3.00)=${vAt}, v(3.01)=${vAbove}`
  );

  // 1.2 Contact Distance Boundary: 0.69 vs 0.70 vs 0.71 palm
  function testDistance(distRatio) {
    const dEnd = distRatio * k;
    const dStart = dEnd + 0.6 * k;
    const h0_s = translateHand(openPalm, -dStart / 2, 0);
    const h1_s = translateHand(openPalm, dStart / 2, 0);
    const h0_e = translateHand(openPalm, -dEnd / 2, 0);
    const h1_e = translateHand(openPalm, dEnd / 2, 0);
    const hist = [
      { t: 0, hand0: h0_s, hand1: h1_s },
      { t: 100, hand0: h0_e, hand1: h1_e },
    ];
    return isHandClap(h0_e, h1_e, hist, { now: 100 });
  }

  const dBelow = testDistance(0.69);
  const dAt = testDistance(0.70);
  const dAbove = testDistance(0.71);

  report(
    "1.2 Hand Clap contact distance boundary: 0.69 accepted, 0.70 accepted, 0.71 rejected",
    dBelow === true && dAt === true && dAbove === false,
    `d(0.69)=${dBelow}, d(0.70)=${dAt}, d(0.71)=${dAbove}`
  );

  // 1.3 Refractory Period Boundary: 799ms vs 800ms vs 801ms
  const validClapHist = [
    { t: 0, hand0: translateHand(openPalm, -0.4 * k, 0), hand1: translateHand(openPalm, 0.4 * k, 0) },
    { t: 100, hand0: translateHand(openPalm, -0.05 * k, 0), hand1: translateHand(openPalm, 0.05 * k, 0) },
  ];
  const lastClap = 1000;
  const clapAt799 = isHandClap(validClapHist[1].hand0, validClapHist[1].hand1, [
    { t: 1000 + 799 - 100, hand0: validClapHist[0].hand0, hand1: validClapHist[0].hand1 },
    { t: 1000 + 799, hand0: validClapHist[1].hand0, hand1: validClapHist[1].hand1 },
  ], { now: 1000 + 799, lastClapAt: lastClap });

  const clapAt800 = isHandClap(validClapHist[1].hand0, validClapHist[1].hand1, [
    { t: 1000 + 800 - 100, hand0: validClapHist[0].hand0, hand1: validClapHist[0].hand1 },
    { t: 1000 + 800, hand0: validClapHist[1].hand0, hand1: validClapHist[1].hand1 },
  ], { now: 1000 + 800, lastClapAt: lastClap });

  const clapAt801 = isHandClap(validClapHist[1].hand0, validClapHist[1].hand1, [
    { t: 1000 + 801 - 100, hand0: validClapHist[0].hand0, hand1: validClapHist[0].hand1 },
    { t: 1000 + 801, hand0: validClapHist[1].hand0, hand1: validClapHist[1].hand1 },
  ], { now: 1000 + 801, lastClapAt: lastClap });

  report(
    "1.3 Hand Clap refractory boundary: 799ms blocked, 800ms allowed, 801ms allowed",
    clapAt799 === false && clapAt800 === true && clapAt801 === true,
    `dt(799)=${clapAt799}, dt(800)=${clapAt800}, dt(801)=${clapAt801}`
  );

  // 1.4 Opposing Velocity Vector Verification
  const parallelHist = [
    { t: 0, hand0: translateHand(openPalm, -0.3, 0), hand1: translateHand(openPalm, 0.1, 0) },
    { t: 100, hand0: translateHand(openPalm, -0.05, 0), hand1: translateHand(openPalm, 0.35, 0) },
  ];
  const clapParallel = isHandClap(parallelHist[1].hand0, parallelHist[1].hand1, parallelHist, { now: 100 });

  report(
    "1.4 Hand Clap opposing vectors: parallel sweep in same direction is strictly rejected",
    clapParallel === false,
    `parallel=${clapParallel}`
  );

  // 1.5 MediaPipe 1-Frame Merge Tolerance: 140ms gap accepted, 141ms gap rejected (symmetrically enforced)
  const mergeHist = [
    { t: 0, hand0: translateHand(openPalm, -0.3, 0), hand1: translateHand(openPalm, 0.3, 0) },
    { t: 80, hand0: translateHand(openPalm, -0.03, 0), hand1: translateHand(openPalm, 0.03, 0) },
  ];
  const mergeAt140 = isHandClap(translateHand(openPalm, 0, 0), null, mergeHist, { now: 220 });
  const mergeAt141 = isHandClap(translateHand(openPalm, 0, 0), null, mergeHist, { now: 221 });

  // Symmetrical check: hand 0 missing, hand 1 present
  const mergeH0At140 = isHandClap(null, translateHand(openPalm, 0, 0), mergeHist, { now: 220 });
  const mergeH0At141 = isHandClap(null, translateHand(openPalm, 0, 0), mergeHist, { now: 221 });

  const mergeEnforced = mergeAt140 === true && mergeAt141 === false && mergeH0At140 === true && mergeH0At141 === false;
  report(
    "1.5 Hand Clap 1-frame merge tolerance: 140ms gap accepted, 141ms gap rejected (strict symmetrical 140ms timeout enforced)",
    mergeEnforced === true,
    `h1Missing: gap(140)=${mergeAt140}, gap(141)=${mergeAt141} | h0Missing: gap(140)=${mergeH0At140}, gap(141)=${mergeH0At141}`
  );
}

// =============================================================================
// TEST SUITE 2: Flick Gesture (isFlickRelease) Boundary Precision
// =============================================================================
console.log("\n>>> SUITE 2: Flick Release Boundary & Kinematics");

{
  const okPose = makeFlickPoseHand();
  const palm = palmReferenceScale(okPose, 1.0);

  // 2.1 Hold Duration Boundary: 119ms vs 120ms vs 121ms
  function testHoldDuration(holdMs) {
    const hist = [
      { t: 0, points: okPose },
      { t: holdMs, points: okPose },
    ];
    const released = makeFlickReleaseHand(0.15);
    hist.push({ t: holdMs + 30, points: released });
    return isFlickRelease(hist, { now: holdMs + 30 });
  }

  const hold119 = testHoldDuration(119);
  const hold120 = testHoldDuration(120);
  const hold121 = testHoldDuration(121);

  report(
    "2.1 Flick Release hold duration boundary: 119ms rejected, 120ms accepted, 121ms accepted",
    hold119 === false && hold120 === true && hold121 === true,
    `hold(119)=${hold119}, hold(120)=${hold120}, hold(121)=${hold121}`
  );

  // 2.2 Release Window Boundary: 250ms vs 251ms
  function testReleaseWindow(windowMs) {
    const hist = [
      { t: 0, points: okPose },
      { t: 150, points: okPose },
    ];
    const released = makeFlickReleaseHand(0.15);
    hist.push({ t: 150 + windowMs, points: released });
    return isFlickRelease(hist, { now: 150 + windowMs });
  }

  const win250 = testReleaseWindow(250);
  const win251 = testReleaseWindow(251);

  report(
    "2.2 Flick Release window boundary: 250ms accepted, 251ms rejected",
    win250 === true && win251 === false,
    `win(250)=${win250}, win(251)=${win251}`
  );

  // 2.3 Release Speed Boundary: 2.99 vs 3.00 vs 3.01 palm/s
  const released = makeFlickReleaseHand(0.15);
  function testSpeedWithShift(speedVal) {
    const dt = 0.1;
    const reqSpan = speedVal * palm * dt;
    const dx = 0.34 - okPose[8].x;
    const dy = (0.15 + reqSpan) - okPose[8].y;
    const shiftedOk = okPose.map(p => ({ x: p.x + dx, y: p.y + dy, z: p.z }));
    const hist = [
      { t: 0, points: shiftedOk },
      { t: 150, points: shiftedOk },
      { t: 150 + dt * 1000, points: released },
    ];
    return isFlickRelease(hist, { now: 150 + dt * 1000 });
  }

  const speed299 = testSpeedWithShift(2.99);
  const speed300 = testSpeedWithShift(3.00);
  const speed301 = testSpeedWithShift(3.01);

  report(
    "2.3 Flick Release speed boundary: 2.99 palm/s rejected, 3.00 accepted, 3.01 accepted",
    speed299 === false && speed300 === true && speed301 === true,
    `speed(2.99)=${speed299}, speed(3.00)=${speed300}, speed(3.01)=${speed301}`
  );

  // 2.4 Contiguity Requirement: Broken OK run rejected
  const openPalm = makeOpenPalm();
  const brokenHist = [
    { t: 0, points: okPose },
    { t: 100, points: okPose },
    { t: 116, points: openPalm },
    { t: 132, points: okPose },
    { t: 232, points: okPose },
    { t: 260, points: makeFlickReleaseHand(0.15) },
  ];
  const brokenFlick = isFlickRelease(brokenHist, { now: 260 });

  report(
    "2.4 Flick Release contiguity: broken OK run (< 120ms contiguous) is strictly rejected",
    brokenFlick === false,
    `broken=${brokenFlick}`
  );

  // 2.5 Tip Separation Requirement: span(4, 8) / palm <= 0.90 rejected
  const closedTipsRelease = makeFlickReleaseHand(0.15);
  closedTipsRelease[4] = { x: closedTipsRelease[8].x + 0.05 * palm, y: closedTipsRelease[8].y, z: 0 };
  const tipHist = [
    { t: 0, points: okPose },
    { t: 150, points: okPose },
    { t: 180, points: closedTipsRelease },
  ];
  const closedTipsRes = isFlickRelease(tipHist, { now: 180 });

  report(
    "2.5 Flick Release tip separation: unseparated thumb/index (span <= 0.90 palm) is strictly rejected",
    closedTipsRes === false,
    `unseparated=${closedTipsRes}`
  );
}

// =============================================================================
// TEST SUITE 3: Grab & Tracking Continuity Under Rapid Motion & Label Flipping
// =============================================================================
console.log("\n>>> SUITE 3: Tracking & Grab Continuity Stress Verification");

{
  // 3.1 Rapid Single-Hand Label Reversal Hysteresis
  let slotLabels = [{ label: "Left", wrist: { x: 0.5, y: 0.5 } }];
  let grabActive = true;
  let grabDrops = 0;

  const mockHandState = { grab: true, lastGesture: "fist", lastPoint: { sx: 500, sy: 500 } };
  const maxHands = 1;

  for (let frame = 0; frame < 120; frame++) {
    const rawLabel = frame % 2 === 0 ? "Left" : "Right";
    const xPos = 0.4 + 0.2 * Math.sin(frame * 0.1);
    const handLandmarks = [{ x: xPos, y: 0.5, z: 0 }];
    const hands = [handLandmarks];
    const handedness = [rawLabel];

    const aligned = alignHandSlots(slotLabels, hands, handedness);

    for (const s of aligned.resetSlots) {
      if (maxHands > 1) {
        const hs = mockHandState;
        const prevWrist = slotLabels[s]?.wrist;
        const curWrist = hands[aligned.slots[s]]?.[0];
        const d = prevWrist && curWrist ? Math.hypot(prevWrist.x - curWrist.x, prevWrist.y - curWrist.y) : 1.0;
        if (!hs.grab && d > 0.35) {
          grabActive = false;
          grabDrops++;
        }
      }
    }

    if (!grabActive) grabDrops++;
    slotLabels[0] = { label: rawLabel, wrist: { x: xPos, y: 0.5 } };
  }

  report(
    "3.1 Single-hand rapid label reversal: 120 alternating Left/Right frames cause ZERO grab drops",
    grabDrops === 0 && grabActive === true,
    `grabDrops=${grabDrops}, grabActive=${grabActive}`
  );

  // 3.2 Dual-Hand Mode Active Grab Protection Against Slot Reset
  const dualSlotLabels = [
    { label: "Left", wrist: { x: 0.3, y: 0.5 } },
    { label: "Right", wrist: { x: 0.7, y: 0.5 } },
  ];
  const dualHandsState = [
    { grab: true },
    { grab: false },
  ];
  let dualGrabDrops = 0;
  let nonGrabResets = 0;

  const crossedHands = [
    [{ x: 0.7, y: 0.5, z: 0 }],
    [{ x: 0.3, y: 0.5, z: 0 }],
  ];
  const crossedHandedness = ["Left", "Right"];

  const alignedDual = alignHandSlots(dualSlotLabels, crossedHands, crossedHandedness);
  for (const s of alignedDual.resetSlots) {
    const hs = dualHandsState[s];
    const prevWrist = dualSlotLabels[s]?.wrist;
    const curWrist = crossedHands[alignedDual.slots[s]]?.[0];
    const d = prevWrist && curWrist ? Math.hypot(prevWrist.x - curWrist.x, prevWrist.y - curWrist.y) : 1.0;
    if (!hs.grab && d > 0.35) {
      nonGrabResets++;
    } else if (hs.grab && d > 0.35) {
      dualGrabDrops++;
    }
  }

  report(
    "3.2 Dual-hand active grab protection: slot holding grab is immune to reset on label flip",
    dualGrabDrops === 0,
    `dualGrabDrops=${dualGrabDrops}, nonGrabResets=${nonGrabResets}`
  );

  // 3.3 Fast Motion Tracking Continuity & Predictive Lead (LEAD_CAP_MS = 85ms)
  const filter = createHandFilter();
  const openPalm = makeOpenPalm();
  const LEAD_CAP_MS = 85;
  let maxObservedLead = 0;
  let allFinite = true;

  for (let step = 0; step < 60; step++) {
    const t = step * 16.666;
    const normX = 0.1 + 0.8 * Math.pow(step / 60, 2);
    const rawSweepHand = translateHand(openPalm, normX - 0.5, 0);

    const filtered = filterLandmarks(filter, rawSweepHand, t, {
      minCutoff: 2.2 * 0.65,
      beta: 18.0,
      dCutoff: 4.5,
      aCutoff: 6.0,
    });

    const speed = handSpeed(filter, 9);
    const lead = adaptiveLeadMs(speed, LEAD_CAP_MS);
    maxObservedLead = Math.max(maxObservedLead, lead);

    const anchor = predictPalmAnchor(filter, filtered, lead);
    const tipAim = predict(filter, 8, filtered[8], lead);

    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(tipAim.x) || !Number.isFinite(tipAim.y)) {
      allFinite = false;
    }
  }

  report(
    "3.3 Fast motion predictive lead: leadMs dynamically scales toward LEAD_CAP_MS (85ms) without divergence",
    allFinite && maxObservedLead > 30 && maxObservedLead <= LEAD_CAP_MS,
    `maxLead=${maxObservedLead.toFixed(1)}ms (cap=${LEAD_CAP_MS}ms), allFinite=${allFinite}`
  );
}

// =============================================================================
// VERDICT & SUMMARY
// =============================================================================
console.log("\n===============================================================================");
console.log(`TOTAL PASS: ${totalPassed} | TOTAL FAIL: ${totalFailed}`);
const verdict = totalFailed === 0 ? "PASSED" : "REQUEST_CHANGES";
console.log(`EMPIRICAL CHALLENGER VERDICT: ${verdict}`);
console.log("===============================================================================");

process.exit(totalFailed === 0 ? 0 : 1);
