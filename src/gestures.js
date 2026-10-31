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

/**
 * How far the fingertip sits along the wrist→PIP bone, in PIP-lengths.
 * MediaPipe Hands has no elbow; this bone is the orientation we actually have.
 * A folded finger falls short even when the hand is rotated.
 */
export function boneReach(tip, pip, wrist) {
  const ax = pip.x - wrist.x;
  const ay = pip.y - wrist.y;
  const az = (pip.z || 0) - (wrist.z || 0);
  const pipLen2 = ax * ax + ay * ay + az * az;
  if (pipLen2 < 1e-8) return 0;
  const tx = tip.x - wrist.x;
  const ty = tip.y - wrist.y;
  const tz = (tip.z || 0) - (wrist.z || 0);
  return (tx * ax + ty * ay + tz * az) / pipLen2;
}

export function isFingerExtended(tip, pip, wrist, mcp) {
  if (mcp && jointAngle(mcp, pip, tip) < EXTEND_ANGLE) return false;
  return boneReach(tip, pip, wrist) > EXTEND_RATIO;
}

export function isFingerClosed(tip, pip, wrist, mcp) {
  if (mcp && jointAngle(mcp, pip, tip) > CLOSED_ANGLE) return false;
  return boneReach(tip, pip, wrist) <= CLOSED_RATIO;
}

/** Wrist → middle knuckle. Stand-in for the forearm, since the hand model stops at the wrist. */
export function handAxis(points) {
  const wrist = points[0];
  const middle = points[9];
  return { x: middle.x - wrist.x, y: middle.y - wrist.y, z: (middle.z || 0) - (wrist.z || 0) };
}

function aheadOfPip(tip, pip, wrist, axis) {
  const len = Math.hypot(axis.x, axis.y, axis.z || 0);
  if (len < 1e-4) return false;
  const project = (point) =>
    ((point.x - wrist.x) * axis.x + (point.y - wrist.y) * axis.y + ((point.z || 0) - (wrist.z || 0)) * (axis.z || 0)) / len;
  return project(tip) > project(pip) * EXTEND_RATIO;
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

export function isWebSign(points) {
  if (!points || points.length < 21) return false;
  if (handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  const axis = handAxis(points);
  const indexOpen = isFingerExtended(points[8], points[6], wrist, points[5]) && aheadOfPip(points[8], points[6], wrist, axis);
  const middleClosed = isFingerClosed(points[12], points[10], wrist, points[9]);
  const ringClosed = isFingerClosed(points[16], points[14], wrist, points[13]);
  const pinkyOpen = isFingerExtended(points[20], points[18], wrist, points[17]) && aheadOfPip(points[20], points[18], wrist, axis);
  if (!indexOpen || !pinkyOpen || !middleClosed || !ringClosed) return false;
  // Index and pinky have to spread. A half-open point must not read as a web.
  const palm = span(points[5], points[17]);
  const tips = span(points[8], points[20]);
  return tips > palm * 0.72;
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
export function classifyGesture(points, world = null) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return null;
  const shape = worldShape(world);
  if (shape) points = shape;
  if (isWebSign(points)) return "web";
  if (isFlickPose(points)) return "flick";
  if (isGojoSign(points)) return "gojo";
  if (isPoint(points)) return "point";
  if (isFist(points)) return "fist";
  if (isOpenPalm(points)) return "palm";
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
