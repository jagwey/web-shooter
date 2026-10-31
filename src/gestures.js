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

function span(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * How far the fingertip sits along the wrist→PIP bone, in PIP-lengths.
 * MediaPipe Hands has no elbow; this bone is the orientation we actually have.
 * A folded finger falls short even when the hand is rotated.
 */
export function boneReach(tip, pip, wrist) {
  const ax = pip.x - wrist.x;
  const ay = pip.y - wrist.y;
  const pipLen2 = ax * ax + ay * ay;
  if (pipLen2 < 1e-8) return 0;
  const tx = tip.x - wrist.x;
  const ty = tip.y - wrist.y;
  return (tx * ax + ty * ay) / pipLen2;
}

export function isFingerExtended(tip, pip, wrist) {
  return boneReach(tip, pip, wrist) > EXTEND_RATIO;
}

export function isFingerClosed(tip, pip, wrist) {
  return boneReach(tip, pip, wrist) <= CLOSED_RATIO;
}

/** Wrist → middle knuckle. Stand-in for the forearm, since the hand model stops at the wrist. */
export function handAxis(points) {
  const wrist = points[0];
  const middle = points[9];
  return { x: middle.x - wrist.x, y: middle.y - wrist.y };
}

function aheadOfPip(tip, pip, wrist, axis) {
  const len = Math.hypot(axis.x, axis.y);
  if (len < 1e-4) return false;
  const project = (point) => ((point.x - wrist.x) * axis.x + (point.y - wrist.y) * axis.y) / len;
  return project(tip) > project(pip) * EXTEND_RATIO;
}

export function countExtendedFingers(points) {
  const wrist = points[0];
  let count = 0;
  for (const finger of FINGERS) {
    if (isFingerExtended(points[finger.tip], points[finger.pip], wrist)) {
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
  const indexOpen = isFingerExtended(points[8], points[6], wrist) && aheadOfPip(points[8], points[6], wrist, axis);
  const middleClosed = isFingerClosed(points[12], points[10], wrist);
  const ringClosed = isFingerClosed(points[16], points[14], wrist);
  const pinkyOpen = isFingerExtended(points[20], points[18], wrist) && aheadOfPip(points[20], points[18], wrist, axis);
  if (!indexOpen || !pinkyOpen || !middleClosed || !ringClosed) return false;
  // Index and pinky have to spread. A half-open point must not read as a web.
  const palm = span(points[5], points[17]);
  const tips = span(points[8], points[20]);
  return tips > palm * 0.72;
}

export function isFist(points) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  return FINGERS.every((finger) => isFingerClosed(points[finger.tip], points[finger.pip], wrist));
}

export function isOpenPalm(points) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  return FINGERS.every((finger) => isFingerExtended(points[finger.tip], points[finger.pip], wrist));
}

export function isPoint(points) {
  if (!points || points.length < 21 || handSpan(points) < MIN_SPAN) return false;
  const wrist = points[0];
  return (
    isFingerExtended(points[8], points[6], wrist) &&
    isFingerClosed(points[12], points[10], wrist) &&
    isFingerClosed(points[16], points[14], wrist) &&
    isFingerClosed(points[20], points[18], wrist)
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
  const indexOpen = isFingerExtended(points[8], points[6], wrist);
  const middleOpen = isFingerExtended(points[12], points[10], wrist);
  const ringClosed = isFingerClosed(points[16], points[14], wrist);
  const pinkyClosed = isFingerClosed(points[20], points[18], wrist);
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
export function purpleFrontHand(hands, gestures) {
  if (hands.length < 2) return -1;
  const [a, b] = [handSpan(hands[0]), handSpan(hands[1])];
  const front = a >= b ? 0 : 1;
  const ratio = Math.max(a, b) / (Math.min(a, b) || 1e-6);
  if (ratio < PURPLE_SPAN_RATIO) return -1;
  if (gestures[front] === "web") return -1;
  return front;
}

/**
 * Hollow Purple combo: both hands in the Gojo sign (index + middle out, ring + pinky in),
 * one hand clearly closer to the camera. Easy to miss on purpose.
 * Returns the front hand index, or -1.
 */
export function hollowPurpleReady(hands, gestures) {
  if (!hands || hands.length < 2 || !gestures || gestures.length < 2) return -1;
  if (gestures[0] !== "gojo" || gestures[1] !== "gojo") return -1;
  if (handSpan(hands[0]) < MIN_SPAN || handSpan(hands[1]) < MIN_SPAN) return -1;
  const a = handSpan(hands[0]);
  const b = handSpan(hands[1]);
  const front = a >= b ? 0 : 1;
  const ratio = Math.max(a, b) / (Math.min(a, b) || 1e-6);
  if (ratio < PURPLE_SPAN_RATIO) return -1;
  return front;
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
  const len = Math.hypot(axis.x, axis.y);
  if (len < 1e-4) return false;
  const ux = axis.x / len;
  const uy = axis.y / len;
  const mx = (points[4].x + points[8].x) / 2 - points[0].x;
  const my = (points[4].y + points[8].y) / 2 - points[0].y;
  const side = Math.abs(mx * uy - my * ux);
  return side > palm * 0.15;
}

/** web, flick (OK circle), gojo, point, fist, palm, or null. */
export function classifyGesture(points) {
  if (isWebSign(points)) return "web";
  if (isFlickPose(points)) return "flick";
  if (isGojoSign(points)) return "gojo";
  if (isPoint(points)) return "point";
  if (isFist(points)) return "fist";
  if (isOpenPalm(points)) return "palm";
  return null;
}
