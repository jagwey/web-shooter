/**
 * Classic Spider-Man web sign: index + pinky extended, middle + ring folded.
 * Distances are measured from the wrist so the sign still works when the
 * hand is rotated. Adapted from SpiderSense gesture checks (MIT, Rittika Das).
 */

const EXTEND_RATIO = 1.2;
const CLOSED_RATIO = 0.95;
const MIN_SPAN = 0.08;

const FINGERS = [
  { tip: 8, pip: 6 },
  { tip: 12, pip: 10 },
  { tip: 16, pip: 14 },
  { tip: 20, pip: 18 },
];

// PIP joint bend (MCP-PIP-TIP angle): a straight finger is ~180°, a curled one well under 120°.
// A half-bent finger passes neither check, so a loose hand reads as no gesture instead of a wrong one.
const EXTEND_ANGLE = 150;
const CLOSED_ANGLE = 135;

// 3D where z exists: a finger pointed at the lens no longer looks folded.
function span(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

/** Distance scaled by camera aspect ratio to make 2D coordinates isotropic. */
export function spanMetric(a, b, ar = 1.0) {
  const dx = (a.x - b.x) * ar;
  const dy = a.y - b.y;
  const dz = ((a.z || 0) - (b.z || 0)) * ar;
  return Math.hypot(dx, dy, dz);
}

/** Rigid anatomical palm centerline distance between wrist (0) and middle MCP (9). */
export function palmReferenceScale(points, ar = 1.0) {
  if (!points || points.length < 10) return 1.0;
  return spanMetric(points[0], points[9], ar) || 1.0;
}

/**
 * 3D joint vector dot product / cosine angle of joint vectors (MCP -> PIP and PIP -> TIP).
 * Straight finger: cos phi ~ 1.0 (deflection phi ~ 0°). Curled: cos phi <= 0.25 or negative.
 */
export function jointCosine(mcp, pip, tip, ar = 1.0) {
  if (!mcp || !pip || !tip) return 0;
  // Vector u: MCP -> PIP
  // Vector v: PIP -> TIP
  const ux = (pip.x - mcp.x) * ar;
  const uy = pip.y - mcp.y;
  const uz = ((pip.z || 0) - (mcp.z || 0)) * ar;

  const vx = (tip.x - pip.x) * ar;
  const vy = tip.y - pip.y;
  const vz = ((tip.z || 0) - (pip.z || 0)) * ar;

  const lenU = Math.hypot(ux, uy, uz);
  const lenV = Math.hypot(vx, vy, vz);
  if (lenU < 1e-6 || lenV < 1e-6) return 0;
  const dot = ux * vx + uy * vy + uz * vz;
  return Math.max(-1, Math.min(1, dot / (lenU * lenV)));
}

/**
 * How far the fingertip sits along the wrist→PIP bone, in PIP-lengths.
 * MediaPipe Hands has no elbow; this bone is the orientation we actually have.
 * A folded finger falls short even when the hand is rotated.
 */
export function boneReach(tip, pip, wrist, ar = 1.0) {
  const ax = (pip.x - wrist.x) * ar;
  const ay = pip.y - wrist.y;
  const az = ((pip.z || 0) - (wrist.z || 0)) * ar;
  const pipLen2 = ax * ax + ay * ay + az * az;
  if (pipLen2 < 1e-8) return 0;
  const tx = (tip.x - wrist.x) * ar;
  const ty = tip.y - wrist.y;
  const tz = ((tip.z || 0) - (wrist.z || 0)) * ar;
  return (tx * ax + ty * ay + tz * az) / pipLen2;
}

export function isFingerExtended(tip, pip, wrist, mcp, { minAngle = EXTEND_ANGLE, minReach = EXTEND_RATIO, minCos = 0.80, ar = 1.0 } = {}) {
  if (mcp) {
    const cos = jointCosine(mcp, pip, tip, ar);
    const angle = jointAngle(mcp, pip, tip);
    if (angle < minAngle && cos < minCos) return false;
  }
  return boneReach(tip, pip, wrist, ar) > minReach;
}

export function isFingerClosed(tip, pip, wrist, mcp, { maxAngle = CLOSED_ANGLE, maxReach = CLOSED_RATIO, maxCos = 0.25, ar = 1.0 } = {}) {
  if (mcp) {
    const cos = jointCosine(mcp, pip, tip, ar);
    const angle = jointAngle(mcp, pip, tip);
    if (angle > maxAngle && cos > maxCos) return false;
  }
  return boneReach(tip, pip, wrist, ar) <= maxReach;
}

/** Wrist → middle knuckle. Stand-in for the forearm, since the hand model stops at the wrist. */
export function handAxis(points) {
  const wrist = points[0];
  const middle = points[9];
  return { x: middle.x - wrist.x, y: middle.y - wrist.y, z: (middle.z || 0) - (wrist.z || 0) };
}

function aheadOfPip(tip, pip, wrist, axis, ar = 1.0, extendRatio = EXTEND_RATIO) {
  const ax = axis.x * ar;
  const ay = axis.y;
  const az = (axis.z || 0) * ar;
  const len = Math.hypot(ax, ay, az);
  if (len < 1e-4) return false;
  const project = (point) =>
    ((point.x - wrist.x) * ar * ax + (point.y - wrist.y) * ay + ((point.z || 0) - (wrist.z || 0)) * ar * az) / len;
  return project(tip) > project(pip) * extendRatio;
}

export function jointAngle(a, b, c) {
  const u = [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)];
  const len = Math.hypot(...u) * Math.hypot(...v);
  if (len === 0) return 0;
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / len;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

export function countExtendedFingers(points) {
  const wrist = points[0];
  let count = 0;
  for (const finger of FINGERS) {
    if (isFingerExtended(points[finger.tip], points[finger.pip], wrist, points[finger.pip - 1])) {
      count += 1;
    }
  }
  return count;
}

export function isWebSign(points, options = {}) {
  if (!points || points.length < 21) return false;
  const wasActive = typeof options === "boolean" ? options : Boolean(options?.wasActive);
  const ar = typeof options === "object" && options?.aspectRatio ? Number(options.aspectRatio) : 1.0;
  const world = typeof options === "object" && options?.world ? options.world : null;

  if (handSpan(points) < MIN_SPAN) return false;

  const pts = (world && points !== world) ? (worldShape(world) || points) : points;
  const effAr = world ? 1.0 : ar;
  const wrist = pts[0];
  const axis = handAxis(pts);

  // Rigid anatomical palm scale (wrist 0 -> middle MCP 9)
  const palmScale = palmReferenceScale(pts, effAr);
  if (palmScale < 1e-4) return false;

  // Schmitt trigger dual-threshold hysteresis:
  // Entry (wasActive = false): strict extension & curl
  // Exit  (wasActive = true):  relaxed hold
  const extendAngle = wasActive ? 135 : 150;
  const extendCos = wasActive ? 0.60 : 0.80;
  const extendReach = wasActive ? 0.95 : 1.15;
  const extendAheadRatio = wasActive ? 0.95 : 1.15;

  const closedAngle = wasActive ? 140 : 125;
  const closedCos = wasActive ? 0.50 : 0.25;
  const closedReach = wasActive ? 1.05 : 0.90;

  const spreadThresh = wasActive ? 0.55 : 0.72;

  const indexOpen =
    isFingerExtended(pts[8], pts[6], wrist, pts[5], {
      minAngle: extendAngle,
      minCos: extendCos,
      minReach: extendReach,
      ar: effAr,
    }) && aheadOfPip(pts[8], pts[6], wrist, axis, effAr, extendAheadRatio);

  const middleClosed = isFingerClosed(pts[12], pts[10], wrist, pts[9], {
    maxAngle: closedAngle,
    maxCos: closedCos,
    maxReach: closedReach,
    ar: effAr,
  });

  const ringClosed = isFingerClosed(pts[16], pts[14], wrist, pts[13], {
    maxAngle: closedAngle,
    maxCos: closedCos,
    maxReach: closedReach,
    ar: effAr,
  });

  const pinkyOpen =
    isFingerExtended(pts[20], pts[18], wrist, pts[17], {
      minAngle: extendAngle,
      minCos: extendCos,
      minReach: extendReach,
      ar: effAr,
    }) && aheadOfPip(pts[20], pts[18], wrist, axis, effAr, extendAheadRatio);

  if (!indexOpen || !pinkyOpen || !middleClosed || !ringClosed) return false;

  // Index and pinky have to spread. A half-open point must not read as a web.
  // Normalized by rigid palm centerline (L_palm)
  const palmBreadth = spanMetric(pts[5], pts[17], effAr);
  const tipsSpread = spanMetric(pts[8], pts[20], effAr);
  const normTips = tipsSpread / palmScale;
  const normPalm = palmBreadth / palmScale;

  return normTips > normPalm * spreadThresh;
}

export function isFist(points) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  return FINGERS.every((finger) => isFingerClosed(points[finger.tip], points[finger.pip], wrist, points[finger.pip - 1]));
}

export function isOpenPalm(points) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  if (!FINGERS.every((finger) => isFingerExtended(points[finger.tip], points[finger.pip], wrist, points[finger.pip - 1]))) return false;
  // A deliberate "stop" hand: fingers fanned and thumb out. A relaxed, loosely open hand is not a cancel.
  const palm = span(points[5], points[17]);
  return span(points[8], points[20]) > palm * 1.25 && span(points[4], points[5]) > palm * 0.6;
}

export function isPoint(points) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  return (
    isFingerExtended(points[8], points[6], wrist, points[5]) &&
    isFingerClosed(points[12], points[10], wrist, points[9]) &&
    isFingerClosed(points[16], points[14], wrist, points[13]) &&
    isFingerClosed(points[20], points[18], wrist, points[17])
  );
}

/**
 * Satoru Gojo: Kūshiki / Hollow Purple gesture or finger gun / snap:
 * Index + middle fingers extended together, ring + pinky folded.
 * Distinct from Web sign (which has middle closed & pinky open).
 */
export function isGojoSign(points) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  const indexOpen = isFingerExtended(points[8], points[6], wrist, points[5]);
  const middleOpen = isFingerExtended(points[12], points[10], wrist, points[9]);
  const ringClosed = isFingerClosed(points[16], points[14], wrist, points[13]);
  const pinkyClosed = isFingerClosed(points[20], points[18], wrist, points[17]);
  return indexOpen && middleOpen && ringClosed && pinkyClosed;
}

/** ✌️ Peace / Scissors sign: index + middle extended in a clear V shape, ring + pinky folded. */
export function isPeaceSign(points) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  const indexOpen = isFingerExtended(points[8], points[6], wrist, points[5]);
  const middleOpen = isFingerExtended(points[12], points[10], wrist, points[9]);
  const ringClosed = isFingerClosed(points[16], points[14], wrist, points[13]);
  const pinkyClosed = isFingerClosed(points[20], points[18], wrist, points[17]);
  if (!indexOpen || !middleOpen || !ringClosed || !pinkyClosed) return false;
  const palm = span(points[5], points[17]);
  return span(points[8], points[12]) > palm * 0.42;
}

/** 👉 Finger gun: index extended, thumb extended upward, middle/ring/pinky folded. */
export function isFingerGun(points) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  const indexOpen = isFingerExtended(points[8], points[6], wrist, points[5]);
  const middleClosed = isFingerClosed(points[12], points[10], wrist, points[9]);
  const ringClosed = isFingerClosed(points[16], points[14], wrist, points[13]);
  const pinkyClosed = isFingerClosed(points[20], points[18], wrist, points[17]);
  if (!indexOpen || !middleClosed || !ringClosed || !pinkyClosed) return false;
  const palm = span(points[5], points[17]);
  return span(points[4], points[5]) > palm * 0.75;
}

/** True deliberate power fist: thumb locks over knuckles, not a loose hand resting under the chin. */
export function isPowerFist(points) {
  if (!isFist(points)) return false;
  const palm = span(points[5], points[17]);
  return span(points[4], points[6]) < palm * 0.75 || span(points[4], points[10]) < palm * 0.75;
}

/** Hand resting in the chin/face/head region (upper 36% of webcam frame). */
export function isInFaceDeadzone(points) {
  if (!points || points.length < 21) return false;
  const wrist = points[0];
  const knuckle = points[9];
  return wrist.y < 0.36 && knuckle.y < 0.40;
}

/** Metric Euclidean distance against user-trained custom gesture template. */
export function matchCustomGesture(points, template, maxError = 0.075) {
  if (!points || !template || points.length !== 21 || template.length !== 21) return false;
  let totalDist = 0;
  for (let i = 0; i < 21; i += 1) {
    const dx = points[i].x - template[i].x;
    const dy = points[i].y - template[i].y;
    const dz = (points[i].z || 0) - (template[i].z || 0);
    totalDist += Math.hypot(dx, dy, dz);
  }
  return totalDist / 21 < maxError;
}

/** Bounding-box diagonal of a hand in image space; grows as the hand nears the camera. */
export function handSpan(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

// Front hand must look this much bigger (thrust at the camera vs. held back).
export const PURPLE_SPAN_RATIO = 1.45;

/**
 * Gojo's Hollow Purple stance: two hands, one pushed toward the camera, the other pulled back.
 * Returns the front hand's index, or -1. Any front pose works (claw, finger gun) except the web sign.
 */
export function purpleFrontHand(hands, gestures, depths = null) {
  if (hands.length < 2) return -1;
  let front;
  if (depths) {
    // Body tracking: wrist depth from the pose model (smaller z = closer to the camera).
    front = depths[0] <= depths[1] ? 0 : 1;
    if (Math.abs(depths[0] - depths[1]) < PURPLE_DEPTH_GAP) return -1;
  } else {
    const [a, b] = [handSpan(hands[0]), handSpan(hands[1])];
    front = a >= b ? 0 : 1;
    const ratio = Math.max(a, b) / (Math.min(a, b) || 1e-6);
    if (ratio < PURPLE_SPAN_RATIO) return -1;
  }
  if (gestures[front] === "web") return -1;
  return front;
}

/**
 * Hollow Purple combo: both hands in the Gojo sign (index + middle out, ring + pinky in),
 * one hand clearly closer to the camera. Easy to miss on purpose.
 * Returns the front hand index, or -1.
 */
export function hollowPurpleReady(hands, gestures, depths = null) {
  if (!hands || hands.length < 2 || !gestures || gestures.length < 2) return -1;
  if (gestures[0] !== "gojo" || gestures[1] !== "gojo") return -1;
  if (handSpan(hands[0]) < MIN_SPAN || handSpan(hands[1]) < MIN_SPAN) return -1;
  return purpleFrontHand(hands, gestures, depths);
}

/**
 * OK / flick pose from the reference photo: thumb and index meet in a circle,
 * middle + ring + pinky stay extended. MediaPipe has no forearm, so the cocked
 * wrist shows up as that circle sitting off the finger axis.
 * Motion (a real flick) is checked separately — a still OK hand is not a flick.
 */
export function isFlickPose(points) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  const palm = span(points[5], points[17]);
  if (palm < 1e-4) return false;
  const pinch = span(points[4], points[8]);
  if (!(pinch < palm * 0.55)) return false;
  if (isFingerExtended(points[8], points[6], wrist)) return false;
  const middle = isFingerExtended(points[12], points[10], wrist);
  const ring = isFingerExtended(points[16], points[14], wrist);
  const pinky = isFingerExtended(points[20], points[18], wrist);
  if (!middle || !ring || !pinky) return false;
  return pinchOffAxis(points, palm);
}

function pinchOffAxis(points, palm) {
  const axis = handAxis(points);
  const len = Math.hypot(axis.x, axis.y, axis.z);
  if (len < 1e-4) return false;
  const u = [axis.x / len, axis.y / len, axis.z / len];
  const m = [
    (points[4].x + points[8].x) / 2 - points[0].x,
    (points[4].y + points[8].y) / 2 - points[0].y,
    ((points[4].z || 0) + (points[8].z || 0)) / 2 - (points[0].z || 0),
  ];
  // Distance of the pinch from the hand axis line (|m x u|).
  const side = Math.hypot(m[1] * u[2] - m[2] * u[1], m[2] * u[0] - m[0] * u[2], m[0] * u[1] - m[1] * u[0]);
  return side > palm * 0.15;
}

// Pose-model wrist depth gap (hip-centred units, ~image width) between thrust and chest hand.
export const PURPLE_DEPTH_GAP = 0.15;

/**
 * Pose wrists (landmarks 15/16) matched to hands by nearest hand wrist (landmark 0).
 * Returns [zHand0, zHand1], or null when the pose is missing or ambiguous.
 */
export function wristDepths(hands, pose) {
  if (!pose || hands.length < 2) return null;
  const wrists = [pose[15], pose[16]];
  const d = (h, w) => Math.hypot(h[0].x - w.x, h[0].y - w.y);
  const straight = d(hands[0], wrists[0]) + d(hands[1], wrists[1]);
  const crossed = d(hands[0], wrists[1]) + d(hands[1], wrists[0]);
  const [w0, w1] = straight <= crossed ? wrists : [wrists[1], wrists[0]];
  // Both pose wrists must sit on a tracked hand, or the pairing is a guess.
  if (Math.min(straight, crossed) > 0.2) return null;
  return [w0.z, w1.z];
}

// World landmarks are metres (a palm is ~0.09); scale to image-like units so MIN_SPAN still means "a hand".
const WORLD_PALM = 0.3;

/** Metric 3D hand from MediaPipe worldLandmarks: rotation- and distance-proof, scaled for these checks. */
export function worldShape(world) {
  if (!world || world.length < 21) return null;
  const len = span(world[0], world[9]);
  if (len < 1e-6) return null;
  const k = WORLD_PALM / len;
  return world.map((p) => ({ x: p.x * k, y: p.y * k, z: p.z * k }));
}

/**
 * web, flick (OK circle), gojo, point, fist, palm, or null.
 * With world landmarks the finger shape is judged in true 3D; the image hand still gates size.
 */
export function classifyGesture(points, world = null, customTemplates = [], options = {}) {
  let templates = customTemplates;
  let opts = options;
  if (customTemplates && !Array.isArray(customTemplates) && typeof customTemplates === "object") {
    opts = customTemplates;
    templates = [];
  }
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return null;
  const shape = worldShape(world);
  const evalPoints = shape || points;
  if (templates && templates.length > 0) {
    for (const t of templates) {
      if (t.points && matchCustomGesture(evalPoints, t.points)) {
        return t.name || "custom";
      }
    }
  }
  const webOptions = {
    ...opts,
    world: shape ? null : (opts.world || world),
  };
  if (isWebSign(evalPoints, webOptions)) return "web";
  if (isPeaceSign(evalPoints)) return "peace";
  if (isFingerGun(evalPoints)) return "finger_gun";
  if (isFlickPose(evalPoints)) return "flick";
  if (isGojoSign(evalPoints)) return "gojo";
  if (isPoint(evalPoints)) return "point";
  if (isFist(evalPoints)) return "fist";
  if (isOpenPalm(evalPoints)) return "palm";
  return null;
}

export const VOTE_WINDOW = 5;
export const VOTE_MIN = 3;

/**
 * Majority vote over the last VOTE_WINDOW raw frames. A pose wins with VOTE_MIN votes;
 * otherwise the previous gesture holds, so one bad frame never fires or drops anything.
 */
export function voteGesture(votes, raw, last) {
  votes.push(raw);
  if (votes.length > VOTE_WINDOW) votes.shift();
  const counts = new Map();
  for (const v of votes) counts.set(v, (counts.get(v) || 0) + 1);
  for (const [gesture, count] of counts) if (count >= VOTE_MIN) return gesture;
  return last;
}

// ============================================================================
// 5 NEW GESTURE RECOGNITION ALGORITHMS & ANTI-COLLISION ENGINE
// ============================================================================

export const AIR_KNOB_MIN_GRIP = 0.08;
export const AIR_KNOB_MAX_GRIP = 0.65;

export const AIR_MEDIA_HOLD_RADIUS = 0.045;
export const AIR_MEDIA_HOLD_MAX_VELOCITY = 0.12;
export const AIR_MEDIA_HOLD_MIN_DURATION = 1000;

export const AIR_MEDIA_FLICK_MIN_DX = 0.12;
export const AIR_MEDIA_FLICK_MIN_VX = 0.65;
export const AIR_MEDIA_FLICK_MAX_DRIFT = 0.50;

export const NINJA_SHIELD_MIN_DY = 0.14;
export const NINJA_SHIELD_MIN_VY = 0.85;
export const NINJA_SHIELD_MAX_SYNC_MS = 75;
export const NINJA_SHIELD_MAX_DRIFT = 0.55;

export const PINCH_ZOOM_CLOSED = 0.32;
export const PINCH_ZOOM_OPEN = 0.62;

export const AIR_SCROLL_MAX_GAP_RATIO = 0.32;
export const PEACE_SIGN_MIN_GAP_RATIO = 0.42;

/**
 * DJ Air Knob: Thumb tip (4) and Index tip (8) circular/angular rotation in the air.
 * - d_knob = spanMetric(p4, p8, ar) / L_palm in [0.08, 0.65]
 * - Anti-collision invariant: Middle (12), Ring (16), Pinky (20) must be CLOSED
 *   (100% rejection of OK Flick which requires 12, 16, 20 extended).
 * - Dial angle: theta = atan2((y8 - y4), (x8 - x4) * ar).
 * - Returns { active: boolean, angle: number, distance: number }.
 */
export function isAirKnobGrip(points, options = {}) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) {
    return { active: false, angle: 0, distance: 0 };
  }

  const ar = typeof options === "object" && (options.aspectRatio || options.ar)
    ? Number(options.aspectRatio || options.ar)
    : 1.0;
  const minGrip = options.minGrip ?? AIR_KNOB_MIN_GRIP;
  const maxGrip = options.maxGrip ?? AIR_KNOB_MAX_GRIP;

  const wrist = points[0];
  const palmScale = palmReferenceScale(points, ar);
  if (palmScale < 1e-4) {
    return { active: false, angle: 0, distance: 0 };
  }

  const tipSpan = spanMetric(points[4], points[8], ar);
  const dKnob = tipSpan / palmScale;

  // Anti-collision invariant: Middle (12), Ring (16), Pinky (20) MUST BE CLOSED
  const middleClosed = isFingerClosed(points[12], points[10], wrist, points[9], { ar });
  const ringClosed = isFingerClosed(points[16], points[14], wrist, points[13], { ar });
  const pinkyClosed = isFingerClosed(points[20], points[18], wrist, points[17], { ar });

  const active = dKnob >= minGrip && dKnob <= maxGrip && middleClosed && ringClosed && pinkyClosed;

  const dx = (points[8].x - points[4].x) * ar;
  const dy = points[8].y - points[4].y;
  const angle = Math.atan2(dy, dx);

  return { active, angle, distance: dKnob };
}

function extractPointSample(item) {
  if (!item) return null;
  const pts = item.points || item.landmarks;
  if (pts && pts.length >= 10 && pts[9]) {
    const t = Number(item.t ?? item.time ?? item.timestamp ?? 0);
    return { t, x: pts[9].x, y: pts[9].y, points: pts };
  }
  if (Array.isArray(item) && item.length >= 10 && typeof item[9]?.x === "number") {
    const t = Number(item.t ?? 0);
    return { t, x: item[9].x, y: item[9].y, points: item };
  }
  if (typeof item.x === "number" && typeof item.y === "number") {
    const t = Number(item.t ?? item.time ?? item.timestamp ?? 0);
    return { t, x: item.x, y: item.y };
  }
  return null;
}

function buildTrajectory(points, history = [], options = {}) {
  const trajectory = [];
  if (Array.isArray(history)) {
    for (const h of history) {
      const s = extractPointSample(h);
      if (s) trajectory.push(s);
    }
  }
  if (points && points[9]) {
    const curX = points[9].x;
    const curY = points[9].y;
    let now = options.now ?? options.t ?? options.time ?? options.timestamp;
    if (now === undefined) {
      if (trajectory.length > 0) {
        const last = trajectory[trajectory.length - 1];
        if (Math.hypot(last.x - curX, last.y - curY) < 1e-4) {
          now = last.t;
        } else {
          now = last.t + 16;
        }
      } else {
        now = 0;
      }
    }
    now = Number(now);
    if (trajectory.length === 0 || trajectory[trajectory.length - 1].t < now) {
      trajectory.push({ t: now, x: curX, y: curY, points });
    } else if (trajectory.length > 0 && trajectory[trajectory.length - 1].t === now) {
      if (!trajectory[trajectory.length - 1].points) {
        trajectory[trajectory.length - 1].points = points;
      }
    }
  }
  return trajectory;
}

/**
 * Air Media Hold: Open palm held steady in the air for 1 second.
 * - isOpenPalm(points) must be satisfied.
 * - Palm center p9 held steady within spatial radius R <= 0.045 with velocity v < 0.12 s^-1 for duration >= 1000 ms.
 * - Returns boolean.
 */
export function isAirMediaHold(points, history = [], options = {}) {
  if (!points || !isOpenPalm(points)) return false;

  const minDuration = options.minDuration ?? options.duration ?? AIR_MEDIA_HOLD_MIN_DURATION;
  const maxRadius = options.maxRadius ?? options.radius ?? AIR_MEDIA_HOLD_RADIUS;
  const maxVelocity = options.maxVelocity ?? options.velocity ?? AIR_MEDIA_HOLD_MAX_VELOCITY;

  const trajectory = buildTrajectory(points, history, options);
  if (trajectory.length < 2) return false;

  const tEnd = trajectory[trajectory.length - 1].t;
  const tStart = trajectory[0].t;
  const totalDuration = tEnd - tStart;
  if (totalDuration < minDuration) return false;

  const windowSamples = trajectory.filter((s) => s.t >= tEnd - minDuration);
  if (windowSamples.length < 2) return false;

  const anchor = windowSamples[0];

  // 1. Spatial radius check
  for (const s of windowSamples) {
    const dist = Math.hypot(s.x - anchor.x, s.y - anchor.y);
    if (dist > maxRadius) return false;
  }

  // 2. Velocity check
  const dtSec = (tEnd - windowSamples[0].t) / 1000;
  if (dtSec <= 0) return false;

  const totalDist = Math.hypot(
    windowSamples[windowSamples.length - 1].x - windowSamples[0].x,
    windowSamples[windowSamples.length - 1].y - windowSamples[0].y
  );
  const avgVelocity = totalDist / dtSec;
  if (avgVelocity >= maxVelocity) return false;

  for (let i = 0; i < windowSamples.length - 1; i += 1) {
    const segDt = (windowSamples[i + 1].t - windowSamples[i].t) / 1000;
    if (segDt > 0.01) {
      const segDist = Math.hypot(windowSamples[i + 1].x - windowSamples[i].x, windowSamples[i + 1].y - windowSamples[i].y);
      const segV = segDist / segDt;
      if (segV >= maxVelocity * 1.5) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Air Media Flick: Open palm flick to the right for Next Track.
 * - isOpenPalm(points) must be satisfied.
 * - Rapid horizontal displacement to the right: Delta x >= +0.12, vx >= 0.65 s^-1, |vy| <= 0.50 * vx.
 * - Returns boolean.
 */
export function isAirMediaFlick(points, history = [], options = {}) {
  if (!points || !isOpenPalm(points)) return false;

  const minDx = options.minDx ?? AIR_MEDIA_FLICK_MIN_DX;
  const minVx = options.minVx ?? AIR_MEDIA_FLICK_MIN_VX;
  const maxDriftRatio = options.maxDriftRatio ?? options.maxDrift ?? AIR_MEDIA_FLICK_MAX_DRIFT;
  const mirrored = Boolean(options.mirrored);
  const dir = mirrored ? -1 : 1;

  const trajectory = buildTrajectory(points, history, options);
  if (trajectory.length < 2) return false;

  const tLatest = trajectory[trajectory.length - 1].t;
  const windowMs = options.windowMs ?? 400;
  const recent = trajectory.filter((s) => tLatest - s.t <= windowMs);
  if (recent.length < 2) return false;

  for (let i = 0; i < recent.length; i += 1) {
    for (let j = i + 1; j < recent.length; j += 1) {
      const dt = (recent[j].t - recent[i].t) / 1000;
      if (dt < 0.03) continue;

      const dx = (recent[j].x - recent[i].x) * dir;
      const dy = recent[j].y - recent[i].y;

      if (dx < minDx) continue;

      const vx = dx / dt;
      if (vx < minVx) continue;

      const vy = Math.abs(dy) / dt;
      if (vy <= maxDriftRatio * vx) {
        return true;
      }
    }
  }

  return false;
}

function extractDualTrajectories(hand0, hand1, history = [], options = {}) {
  let hist0 = [];
  let hist1 = [];

  if (Array.isArray(history)) {
    if (history.length === 2 && Array.isArray(history[0]) && Array.isArray(history[1])) {
      hist0 = history[0];
      hist1 = history[1];
    } else {
      for (const item of history) {
        if (!item) continue;
        if (item.hand0 || item.hand1) {
          if (item.hand0) hist0.push({ t: item.t, ...(extractPointSample(item.hand0) || item.hand0) });
          if (item.hand1) hist1.push({ t: item.t, ...(extractPointSample(item.hand1) || item.hand1) });
        } else if (Array.isArray(item.hands) && item.hands.length >= 2) {
          hist0.push({ t: item.t, ...(extractPointSample(item.hands[0]) || item.hands[0]) });
          hist1.push({ t: item.t, ...(extractPointSample(item.hands[1]) || item.hands[1]) });
        } else if (item.handIndex === 0) {
          hist0.push(item);
        } else if (item.handIndex === 1) {
          hist1.push(item);
        } else if (typeof item.y0 === "number" && typeof item.y1 === "number") {
          hist0.push({ t: item.t, x: item.x0 ?? 0.5, y: item.y0 });
          hist1.push({ t: item.t, x: item.x1 ?? 0.5, y: item.y1 });
        }
      }
    }
  } else if (typeof history === "object" && history !== null) {
    hist0 = history.hand0 || history.h0 || [];
    hist1 = history.hand1 || history.h1 || [];
  }

  const traj0 = buildTrajectory(hand0, hist0, options);
  const traj1 = buildTrajectory(hand1, hist1, options);
  return [traj0, traj1];
}

function findDownwardStroke(traj, minDy, minVy, maxDriftRatio, windowMs) {
  if (!traj || traj.length < 2) return null;
  const tLatest = traj[traj.length - 1].t;
  const recent = traj.filter((s) => tLatest - s.t <= windowMs);
  if (recent.length < 2) return null;

  let best = null;
  for (let i = 0; i < recent.length; i += 1) {
    for (let j = i + 1; j < recent.length; j += 1) {
      const dt = (recent[j].t - recent[i].t) / 1000;
      if (dt < 0.03) continue;

      const dy = recent[j].y - recent[i].y;
      if (dy < minDy) continue;

      const vy = dy / dt;
      if (vy < minVy) continue;

      const dx = Math.abs(recent[j].x - recent[i].x);
      const vx = dx / dt;
      if (vx > maxDriftRatio * vy) continue;

      if (!best || vy > best.vy) {
        best = { dy, vy, vx, tStart: recent[i].t, tEnd: recent[j].t, tPeak: (recent[i].t + recent[j].t) / 2 };
      }
    }
  }
  return best;
}

/**
 * Ninja / Boss Shield: Two open palms flicked downward simultaneously.
 * - Both hands must satisfy isOpenPalm.
 * - Downward displacement Delta y >= 0.14, downward velocity vy >= 0.85 s^-1 on both hands.
 * - Synchronicity |t0 - t1| <= 75 ms.
 * - Rejects any motion with excessive horizontal drift.
 * - Returns boolean.
 */
export function isNinjaShield(hand0, hand1, history = [], options = {}) {
  if (!hand0 || !hand1 || hand0.length < 21 || hand1.length < 21) return false;
  if (!isOpenPalm(hand0) || !isOpenPalm(hand1)) return false;

  const minDy = options.minDy ?? NINJA_SHIELD_MIN_DY;
  const minVy = options.minVy ?? NINJA_SHIELD_MIN_VY;
  const maxSyncMs = options.maxSyncMs ?? NINJA_SHIELD_MAX_SYNC_MS;
  const maxDriftRatio = options.maxDriftRatio ?? NINJA_SHIELD_MAX_DRIFT;
  const windowMs = options.windowMs ?? 400;

  const [traj0, traj1] = extractDualTrajectories(hand0, hand1, history, options);
  const stroke0 = findDownwardStroke(traj0, minDy, minVy, maxDriftRatio, windowMs);
  const stroke1 = findDownwardStroke(traj1, minDy, minVy, maxDriftRatio, windowMs);

  if (!stroke0 || !stroke1) return false;

  const syncDiff = Math.abs(stroke0.tPeak - stroke1.tPeak);
  if (syncDiff > maxSyncMs) return false;

  return true;
}

/**
 * Pinch-to-Zoom Desktop: Two fingers opening and closing in the air.
 * - Active fingers: Thumb (4) and Index (8). Middle (12), Ring (16), Pinky (20) must be CLOSED.
 * - Distance metric d_pinch = spanMetric(p4, p8, ar) / L_palm.
 * - Schmitt trigger dual-threshold: Closed boundary D_closed = 0.32, Open boundary D_open = 0.62, deadband [0.32, 0.62].
 * - Returns { active: boolean, distance: number, isClosed: boolean, isOpen: boolean, action: string | null }.
 */
export function isPinchZoom(points, optionsOrHistory = {}, maybeOptions = {}) {
  let options = optionsOrHistory;
  let history = [];
  if (Array.isArray(optionsOrHistory)) {
    history = optionsOrHistory;
    options = maybeOptions || {};
  } else if (optionsOrHistory && Array.isArray(optionsOrHistory.history)) {
    history = optionsOrHistory.history;
  }

  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) {
    return { active: false, distance: 0, isClosed: false, isOpen: false, action: null };
  }

  const ar = typeof options === "object" && (options.aspectRatio || options.ar)
    ? Number(options.aspectRatio || options.ar)
    : 1.0;
  const dClosed = options.closedThreshold ?? options.dClosed ?? PINCH_ZOOM_CLOSED;
  const dOpen = options.openThreshold ?? options.dOpen ?? PINCH_ZOOM_OPEN;

  const wrist = points[0];
  const palmScale = palmReferenceScale(points, ar);
  if (palmScale < 1e-4) {
    return { active: false, distance: 0, isClosed: false, isOpen: false, action: null };
  }

  // Active fingers: Thumb (4) and Index (8).
  // Inactive fingers: Middle (12), Ring (16), Pinky (20) MUST BE CLOSED
  const middleClosed = isFingerClosed(points[12], points[10], wrist, points[9], { ar });
  const ringClosed = isFingerClosed(points[16], points[14], wrist, points[13], { ar });
  const pinkyClosed = isFingerClosed(points[20], points[18], wrist, points[17], { ar });

  const tipSpan = spanMetric(points[4], points[8], ar);
  const distance = tipSpan / palmScale;

  const active = Boolean(middleClosed && ringClosed && pinkyClosed);
  const isClosed = active && distance <= dClosed;
  const isOpen = active && distance >= dOpen;

  let action = null;
  const wasClosed = Boolean(options.wasClosed ?? (options.prevState === "closed"));
  const wasOpen = Boolean(options.wasOpen ?? (options.prevState === "open"));

  if (active) {
    if (wasClosed && isOpen) {
      action = "zoom_in";
    } else if (wasOpen && isClosed) {
      action = "zoom_out";
    } else if (history.length > 0) {
      for (let i = history.length - 1; i >= 0; i -= 1) {
        const prev = history[i];
        const prevDist = typeof prev.distance === "number"
          ? prev.distance
          : (prev.points ? (spanMetric(prev.points[4], prev.points[8], ar) / (palmReferenceScale(prev.points, ar) || 1)) : null);
        if (prevDist !== null) {
          if (prevDist <= dClosed && distance >= dOpen) {
            action = "zoom_in";
            break;
          } else if (prevDist >= dOpen && distance <= dClosed) {
            action = "zoom_out";
            break;
          }
        }
      }
    }
  }

  return { active, distance, isClosed, isOpen, action };
}

/**
 * Air Scroll: Index + middle finger moving together up/down simulating mouse wheel.
 * - Index and Middle extended (isFingerExtended), Ring and Pinky closed (isFingerClosed).
 * - Parallel alignment tip gap: spanMetric(p8, p12, ar) / W_palm <= 0.32.
 * - Guaranteed isolation deadband [0.32, 0.42]: ratio <= 0.32 is Air Scroll; ratio > 0.42 is Peace Sign (isPeaceSign).
 * - Returns { active: boolean, center: { x: number, y: number }, ratio: number }.
 */
export function isAirScroll(points, options = {}) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) {
    return { active: false, center: { x: 0, y: 0 }, ratio: 0 };
  }

  const ar = typeof options === "object" && (options.aspectRatio || options.ar)
    ? Number(options.aspectRatio || options.ar)
    : 1.0;
  const maxRatio = options.maxRatio ?? AIR_SCROLL_MAX_GAP_RATIO;

  const wrist = points[0];

  const indexOpen = isFingerExtended(points[8], points[6], wrist, points[5], { ar });
  const middleOpen = isFingerExtended(points[12], points[10], wrist, points[9], { ar });

  const ringClosed = isFingerClosed(points[16], points[14], wrist, points[13], { ar });
  const pinkyClosed = isFingerClosed(points[20], points[18], wrist, points[17], { ar });

  if (!indexOpen || !middleOpen || !ringClosed || !pinkyClosed) {
    return { active: false, center: { x: 0, y: 0 }, ratio: 0 };
  }

  const palmBreadth = spanMetric(points[5], points[17], ar);
  if (palmBreadth < 1e-4) {
    return { active: false, center: { x: 0, y: 0 }, ratio: 0 };
  }

  const tipGap = spanMetric(points[8], points[12], ar);
  const ratio = tipGap / palmBreadth;

  const active = ratio <= maxRatio;

  const center = {
    x: (points[8].x + points[12].x) / 2,
    y: (points[8].y + points[12].y) / 2,
  };

  return { active, center, ratio };
}

