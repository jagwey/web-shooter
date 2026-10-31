import { isWebSign, classifyGesture, jointCosine, boneReach, spanMetric, palmReferenceScale, handSpan, handAxis } from "../src/gestures.js";
import { createHandFilter, filterLandmarks, predict } from "../src/filter.js";

console.log("===============================================================================");
console.log("       EMPIRICAL CHALLENGER STRESS-TEST SUITE: REQUIREMENTS R4 & R5           ");
console.log("===============================================================================");

let totalPassed = 0;
let totalFailed = 0;

function report(testName, passed, details = "") {
  if (passed) {
    totalPassed++;
    console.log(`[PASS] ${testName} ${details ? "- " + details : ""}`);
  } else {
    totalFailed++;
    console.error(`[FAIL] ${testName} ${details ? "- " + details : ""}`);
  }
}

// Helper to construct a standard web sign hand
function makeBaseHand({ index = true, middle = false, ring = false, pinky = true } = {}) {
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

// -----------------------------------------------------------------------------
// CHALLENGE 1: Perspective Foreshortening Challenge
// -----------------------------------------------------------------------------
console.log("\n>>> CHALLENGE 1: Perspective Foreshortening Challenge (3D Cosine vs 2D Reach)");

{
  // Test 1A: Sweep pitch angle towards camera (0 to 75 deg)
  const pitchAngles = [0, 15, 30, 45, 55, 60, 65, 70];
  let allPitchPassed = true;
  const foreshorteningMetrics = [];

  for (const angleDeg of pitchAngles) {
    const rad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const hand = makeBaseHand();
    const wrist = hand[0];

    for (let i = 1; i < 21; i++) {
      const dy = hand[i].y - wrist.y;
      const dz = hand[i].z - wrist.z;
      hand[i].y = wrist.y + dy * cosA - dz * sinA;
      hand[i].z = wrist.z - (dy * sinA + dz * cosA);
    }

    const ax2D = hand[6].x - wrist.x;
    const ay2D = hand[6].y - wrist.y;
    const pipLen2D = ax2D * ax2D + ay2D * ay2D;
    const tx2D = hand[8].x - wrist.x;
    const ty2D = hand[8].y - wrist.y;
    const reach2D = (tx2D * ax2D + ty2D * ay2D) / pipLen2D;

    const reach3D = boneReach(hand[8], hand[6], wrist);
    const cos3D = jointCosine(hand[5], hand[6], hand[8]);

    const hand2D = hand.map(p => ({ x: p.x, y: p.y, z: 0 }));
    const isWeb3D = isWebSign(hand);
    const isWeb2D = isWebSign(hand2D);

    foreshorteningMetrics.push({
      angleDeg,
      reach2D: reach2D.toFixed(3),
      reach3D: reach3D.toFixed(3),
      cos3D: cos3D.toFixed(3),
      isWeb3D,
      isWeb2D,
    });

    if (!isWeb3D) allPitchPassed = false;
  }

  console.table(foreshorteningMetrics);
  report("Perspective pitch foreshortening 0°-70° maintains isWebSign=true via 3D math", allPitchPassed);

  // Test 1B: Synthesized pose aiming directly into lens where 2D reach shrinks to [0.70, 0.90]
  const hAim = makeBaseHand();
  const wrist = hAim[0];

  hAim[9] = { x: 0.50, y: 0.68, z: -0.15 }; // Middle knuckle tilted forward

  // Index finger extended forward toward camera (fanned slightly outward)
  hAim[5] = { x: 0.37, y: 0.68, z: -0.05 };
  hAim[6] = { x: 0.36, y: 0.70, z: -0.25 };
  hAim[7] = { x: 0.355, y: 0.725, z: -0.35 };
  hAim[8] = { x: 0.35, y: 0.75, z: -0.45 };

  // Pinky finger extended forward toward camera (fanned slightly outward)
  hAim[17] = { x: 0.63, y: 0.68, z: -0.05 };
  hAim[18] = { x: 0.64, y: 0.70, z: -0.25 };
  hAim[19] = { x: 0.645, y: 0.725, z: -0.35 };
  hAim[20] = { x: 0.65, y: 0.75, z: -0.45 };

  // Middle and ring curled
  hAim[10] = { x: 0.47, y: 0.65, z: -0.12 };
  hAim[11] = { x: 0.48, y: 0.72, z: -0.08 };
  hAim[12] = { x: 0.48, y: 0.76, z: -0.05 };

  hAim[14] = { x: 0.53, y: 0.65, z: -0.12 };
  hAim[15] = { x: 0.52, y: 0.72, z: -0.08 };
  hAim[16] = { x: 0.52, y: 0.76, z: -0.05 };

  const ax2D = hAim[6].x - wrist.x;
  const ay2D = hAim[6].y - wrist.y;
  const reach2D = ((hAim[8].x - wrist.x) * ax2D + (hAim[8].y - wrist.y) * ay2D) / (ax2D * ax2D + ay2D * ay2D);
  const reach3D = boneReach(hAim[8], hAim[6], wrist);
  const cos3D = jointCosine(hAim[5], hAim[6], hAim[8]);

  const hAim2D = hAim.map(p => ({ x: p.x, y: p.y, z: 0 }));
  const web3D = isWebSign(hAim);
  const web2D = isWebSign(hAim2D);

  console.log(`Synthesized Camera-Aiming Pose: reach2D=${reach2D.toFixed(3)}, reach3D=${reach3D.toFixed(3)}, cos3D=${cos3D.toFixed(3)}`);
  console.log(`Detection: with 3D = ${web3D}, without 3D (2D flattened) = ${web2D}`);

  report(
    "Foreshortened pose with 2D reach in [0.70, 0.90] recognized in 3D (true) and rejected in 2D (false)",
    web3D === true && web2D === false && reach2D >= 0.70 && reach2D <= 0.90 && cos3D >= 0.80
  );
}

// -----------------------------------------------------------------------------
// CHALLENGE 2: Aspect Ratio Stress-Test
// -----------------------------------------------------------------------------
console.log("\n>>> CHALLENGE 2: Aspect Ratio Stress-Test (AR = 1.0, 1.333, 1.777, 2.35)");

{
  const aspectRatios = [1.0, 1.333, 1.777, 2.35];
  const angles = [0, 30, 45, 60, 90, 120, 150, 180, 225, 270, 315];
  let arRotationsPassed = true;
  let arFalsePositives = 0;

  function rotateHand(points, degrees) {
    const wrist = points[0];
    const rad = (degrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return points.map(p => ({
      x: wrist.x + (p.x - wrist.x) * cos - (p.y - wrist.y) * sin,
      y: wrist.y + (p.x - wrist.x) * sin + (p.y - wrist.y) * cos,
      z: p.z || 0,
    }));
  }

  function applyCameraProjection(hand, ar) {
    return hand.map(p => ({
      x: 0.5 + (p.x - 0.5) / ar,
      y: p.y,
      z: p.z || 0,
    }));
  }

  for (const ar of aspectRatios) {
    for (const deg of angles) {
      const isotropicHand = rotateHand(makeBaseHand(), deg);
      const cameraHand = applyCameraProjection(isotropicHand, ar);

      const detected = isWebSign(cameraHand, { aspectRatio: ar });
      if (!detected) {
        arRotationsPassed = false;
        console.error(`False Negative: AR=${ar}, deg=${deg}`);
      }

      // Negative distractors
      const fist = applyCameraProjection(rotateHand(makeBaseHand({ index: false, pinky: false }), deg), ar);
      const palm = applyCameraProjection(rotateHand(makeBaseHand({ index: true, middle: true, ring: true, pinky: true }), deg), ar);
      const point = applyCameraProjection(rotateHand(makeBaseHand({ index: true, middle: false, ring: false, pinky: false }), deg), ar);

      if (isWebSign(fist, { aspectRatio: ar })) arFalsePositives++;
      if (isWebSign(palm, { aspectRatio: ar })) arFalsePositives++;
      if (isWebSign(point, { aspectRatio: ar })) arFalsePositives++;
    }
  }

  report("Aspect ratio invariance across all rotations (AR 1.0, 1.333, 1.777, 2.35): 0 False Negatives", arRotationsPassed);
  report("Aspect ratio distractor rejection (fist, palm, point): 0 False Positives", arFalsePositives === 0, `False positives: ${arFalsePositives}`);

  // Test spanMetric exact metric isotropy
  const origin = { x: 0.0, y: 0.0, z: 0.0 };
  const arTest = 1.777;
  const pxCamera = { x: 0.1 / arTest, y: 0.0, z: 0.0 };
  const pyCamera = { x: 0.0, y: 0.1, z: 0.0 };
  const dX = spanMetric(origin, pxCamera, arTest);
  const dY = spanMetric(origin, pyCamera, arTest);
  const diff = Math.abs(dX - dY);
  report("spanMetric restores exact metric isotropy under AR scaling", diff < 1e-12, `residual diff=${diff.toExponential(4)}`);
}

// -----------------------------------------------------------------------------
// CHALLENGE 3: Planar & Degenerate Input Compatibility Challenge
// -----------------------------------------------------------------------------
console.log("\n>>> CHALLENGE 3: Planar & Degenerate Compatibility Challenge");

{
  let degeneratePassed = true;
  let exceptionCount = 0;

  const testCases = [
    { name: "Planar 2D hand (z = 0 on all points)", gen: () => makeBaseHand(), expect: true },
    { name: "Missing z (z = undefined on all points)", gen: () => makeBaseHand().map(p => ({ x: p.x, y: p.y })), expect: true },
    { name: "Null z (z = null on all points)", gen: () => makeBaseHand().map(p => ({ x: p.x, y: p.y, z: null })), expect: true },
    { name: "Defensive NaN z fallback to 2D", gen: () => { const h = makeBaseHand(); h[8].z = NaN; return h; }, expect: true },
    { name: "All NaN coordinates", gen: () => Array.from({ length: 21 }, () => ({ x: NaN, y: NaN, z: NaN })), expect: false },
    { name: "Infinity coordinates", gen: () => Array.from({ length: 21 }, () => ({ x: Infinity, y: -Infinity, z: Infinity })), expect: false },
    { name: "Collapsed hand (all 21 points identical)", gen: () => Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })), expect: false },
    { name: "Zero hand axis (wrist == middle MCP)", gen: () => { const h = makeBaseHand(); h[9] = { ...h[0] }; return h; }, expect: false },
    { name: "Zero bone vector (tip == pip for index)", gen: () => { const h = makeBaseHand(); h[8] = { ...h[6] }; return h; }, expect: false },
    { name: "Zero joint vector (pip == mcp for index)", gen: () => { const h = makeBaseHand(); h[6] = { ...h[5] }; return h; }, expect: false },
    { name: "Empty array []", gen: () => [], expect: false },
    { name: "Null input", gen: () => null, expect: false },
    { name: "Undefined input", gen: () => undefined, expect: false },
    { name: "Truncated hand (10 landmarks)", gen: () => makeBaseHand().slice(0, 10), expect: false },
    { name: "Empty point objects ({})", gen: () => Array.from({ length: 21 }, () => ({})), expect: false },
  ];

  for (const tc of testCases) {
    try {
      const input = tc.gen();
      const res = isWebSign(input);
      if (res !== tc.expect) {
        console.error(`Edge Case Mismatch: ${tc.name} returned ${res} (expected: ${tc.expect})`);
        degeneratePassed = false;
      }
    } catch (err) {
      exceptionCount++;
      console.error(`Exception on ${tc.name}:`, err.message);
      degeneratePassed = false;
    }
  }

  // Fuzz testing with 1,000 random degenerate float inputs
  let fuzzPassed = true;
  for (let iter = 0; iter < 1000; iter++) {
    const fuzzed = Array.from({ length: 21 }, () => ({
      x: (Math.random() - 0.5) * 1e5,
      y: (Math.random() - 0.5) * 1e5,
      z: (Math.random() - 0.5) * 1e5,
    }));
    try {
      const res = isWebSign(fuzzed);
      if (typeof res !== "boolean") fuzzPassed = false;
    } catch {
      fuzzPassed = false;
      exceptionCount++;
    }
  }

  report("Planar (z=0, undefined, null) and degenerate inputs handled cleanly without exceptions", degeneratePassed);
  report("Fuzzing with 1,000 extreme coordinate inputs caused 0 uncaught exceptions", fuzzPassed && exceptionCount === 0);
}

// -----------------------------------------------------------------------------
// CHALLENGE 4: Schmitt Trigger Hysteresis Challenge
// -----------------------------------------------------------------------------
console.log("\n>>> CHALLENGE 4: Schmitt Trigger Hysteresis Challenge (100 Boundary Frames)");

{
  function makeInterpolatedHand(alpha) {
    const h = makeBaseHand();
    const openY = 0.28;
    const closedY = 0.65;
    const tipY = closedY + alpha * (openY - closedY);
    h[8].y = tipY;
    h[20].y = tipY;
    h[7].y = closedY + alpha * (0.42 - closedY);
    h[19].y = closedY + alpha * (0.42 - closedY);
    return h;
  }

  let enterThresholdAlpha = null;
  let exitThresholdAlpha = null;

  for (let a = 0.0; a <= 1.0; a += 0.01) {
    const hand = makeInterpolatedHand(a);
    if (enterThresholdAlpha === null && isWebSign(hand, { wasActive: false })) {
      enterThresholdAlpha = a;
    }
    if (exitThresholdAlpha === null && isWebSign(hand, { wasActive: true })) {
      exitThresholdAlpha = a;
    }
  }

  console.log(`Hysteresis Characterization: Exit threshold alpha = ${exitThresholdAlpha.toFixed(2)}, Entry threshold alpha = ${enterThresholdAlpha.toFixed(2)}`);
  const hasHysteresisGap = exitThresholdAlpha < enterThresholdAlpha;
  report("Hysteresis gap confirmed: Exit threshold < Entry threshold", hasHysteresisGap);

  // Counter-factual comparison: Oscillate across entry threshold without hysteresis
  let statelessTransitions = 0;
  let lastStateless = null;
  for (let f = 0; f < 100; f++) {
    const alpha = (f % 2 === 0) ? enterThresholdAlpha + 0.04 : enterThresholdAlpha - 0.04;
    const state = isWebSign(makeInterpolatedHand(alpha), { wasActive: false });
    if (lastStateless !== null && state !== lastStateless) statelessTransitions++;
    lastStateless = state;
  }
  console.log(`Stateless (no hysteresis) oscillation: ${statelessTransitions} transitions across 100 frames`);

  // With Schmitt trigger hysteresis:
  let hysTransitions = 0;
  let wasActive = isWebSign(makeInterpolatedHand(1.0), { wasActive: false }); // start active
  let lastHys = wasActive;
  let activeFrameCount = 0;

  for (let f = 0; f < 100; f++) {
    const alpha = (f % 2 === 0) ? enterThresholdAlpha + 0.04 : enterThresholdAlpha - 0.04;
    const state = isWebSign(makeInterpolatedHand(alpha), { wasActive });
    if (state !== lastHys) hysTransitions++;
    if (state) activeFrameCount++;
    wasActive = state;
    lastHys = state;
  }

  console.log(`Schmitt trigger hysteresis oscillation: ${hysTransitions} transitions, Active frames = ${activeFrameCount}/100`);

  report(
    "Schmitt trigger hysteresis suppresses boundary chatter (0 transitions vs 99 stateless transitions)",
    hysTransitions === 0 && activeFrameCount === 100 && statelessTransitions >= 90
  );

  // Clean exit below exit threshold
  for (let f = 0; f < 5; f++) {
    wasActive = isWebSign(makeInterpolatedHand(exitThresholdAlpha - 0.1), { wasActive });
  }
  report("Clean exit below exit threshold (wasActive cleanly drops to false)", wasActive === false);
}

// -----------------------------------------------------------------------------
// CHALLENGE 5: Filter Parameter Numerical Verification (High Iterations)
// -----------------------------------------------------------------------------
console.log("\n>>> CHALLENGE 5: Filter Parameter Numerical Verification (High Iterations)");

{
  const hand = (x, y) => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));

  // High-iteration resting benchmark (10,000 frames @ 60 FPS)
  const restingFilter = createHandFilter();
  let maxDev = 0;
  const restingIterations = 10000;
  const dt60 = 16.6667;

  for (let i = 0; i < restingIterations; i++) {
    const noise = (i % 2 === 0) ? 0.004 : -0.004;
    const out = filterLandmarks(restingFilter, hand(0.5 + noise, 0.5), i * dt60);
    if (i > 20) {
      const dev = Math.abs(out[8].x - 0.5);
      if (dev > maxDev) maxDev = dev;
    }
  }

  console.log(`Resting Hand (${restingIterations} iterations @ 60 FPS): Max Deviation = ${maxDev.toFixed(6)} (Bound: < 0.002)`);
  report(`Resting jitter damping strictly meets maxDev < 0.002 (observed: ${maxDev.toFixed(6)})`, maxDev < 0.002);

  // High-iteration fast-move benchmark: 1,000 sweeps across 25 frames each at ~1.8 screens/s
  let maxLagSweep = 0;
  let leadFails = 0;
  const sweepRuns = 1000;

  for (let s = 0; s < sweepRuns; s++) {
    const fFast = createHandFilter();
    let x = 0.1;
    let out;
    for (let i = 0; i < 25; i++) {
      x = 0.1 + i * 0.03;
      out = filterLandmarks(fFast, hand(x, 0.5), i * dt60);
      if (i > 5) {
        const lag = x - out[8].x;
        if (lag > maxLagSweep) maxLagSweep = lag;
        const pred = predict(fFast, 8, out[8], 16);
        if (pred.x <= out[8].x) leadFails++;
      }
    }
  }

  console.log(`Fast Move (${sweepRuns} sweeps @ 1.8 screens/s): Max Lag = ${maxLagSweep.toFixed(6)} (Bound: < 0.03)`);
  report(`Fast move latency strictly meets lag < 0.03 (observed: ${maxLagSweep.toFixed(6)})`, maxLagSweep < 0.03);
  report("Predictive lead verified: predict() extrapolates ahead of filtered position across all sweeps", leadFails === 0);

  // Multi-framerate verification: 30 FPS, 60 FPS, 120 FPS
  const fpsConfigs = [
    { name: "30 FPS", dt: 33.3333 },
    { name: "60 FPS", dt: 16.6667 },
    { name: "120 FPS", dt: 8.3333 },
  ];

  let multiFpsPassed = true;
  for (const cfg of fpsConfigs) {
    const fRest = createHandFilter();
    let mDev = 0;
    for (let i = 0; i < 500; i++) {
      const noise = (i % 2 === 0) ? 0.004 : -0.004;
      const out = filterLandmarks(fRest, hand(0.5 + noise, 0.5), i * cfg.dt);
      if (i > 20) mDev = Math.max(mDev, Math.abs(out[8].x - 0.5));
    }

    const fFast = createHandFilter();
    let mLag = 0;
    for (let i = 0; i < 25; i++) {
      const x = 0.1 + i * 0.03;
      const out = filterLandmarks(fFast, hand(x, 0.5), i * cfg.dt);
      if (i > 5) mLag = Math.max(mLag, x - out[8].x);
    }

    console.log(`[${cfg.name}] resting maxDev=${mDev.toFixed(6)}, fast lag=${mLag.toFixed(6)}`);
    if (mDev >= 0.002 || mLag >= 0.03) multiFpsPassed = false;
  }

  report("Filter stability verified across 30 FPS, 60 FPS, 120 FPS", multiFpsPassed);
}

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log("\n===============================================================================");
console.log(`TOTAL PASS: ${totalPassed} | TOTAL FAIL: ${totalFailed}`);
const finalVerdict = totalFailed === 0 ? "CONFIRMED" : "REJECTED";
console.log(`FINAL EMPIRICAL VERDICT: ${finalVerdict}`);
console.log("===============================================================================");

process.exit(totalFailed === 0 ? 0 : 1);