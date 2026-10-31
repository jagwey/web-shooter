/**
 * Classic Spider-Man web sign: index + pinky extended, middle + ring folded.
 * Distances are measured from the wrist so the sign still works when the
 * hand is rotated. Adapted from SpiderSense gesture checks (MIT, Rittika Das).
 */

const EXTEND_RATIO = 1.12;
const CLOSED_RATIO = 1.02;

const FINGERS = [
  { tip: 8, pip: 6 },
  { tip: 12, pip: 10 },
  { tip: 16, pip: 14 },
  { tip: 20, pip: 18 },
];

function span(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isFingerExtended(tip, pip, wrist) {
  const pipSpan = span(pip, wrist);
  if (pipSpan === 0) return false;
  return span(tip, wrist) > pipSpan * EXTEND_RATIO;
}

export function isFingerClosed(tip, pip, wrist) {
  const pipSpan = span(pip, wrist);
  if (pipSpan === 0) return false;
  return span(tip, wrist) <= pipSpan * CLOSED_RATIO;
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
  const wrist = points[0];
  const indexOpen = isFingerExtended(points[8], points[6], wrist);
  const middleClosed = isFingerClosed(points[12], points[10], wrist);
  const ringClosed = isFingerClosed(points[16], points[14], wrist);
  const pinkyOpen = isFingerExtended(points[20], points[18], wrist);
  return indexOpen && pinkyOpen && middleClosed && ringClosed;
}

export function isFist(points) {
  if (!points || points.length < 21) return false;
  const wrist = points[0];
  return FINGERS.every((finger) => isFingerClosed(points[finger.tip], points[finger.pip], wrist));
}

export function isOpenPalm(points) {
  if (!points || points.length < 21) return false;
  const wrist = points[0];
  return FINGERS.every((finger) => isFingerExtended(points[finger.tip], points[finger.pip], wrist));
}

export function isPoint(points) {
  if (!points || points.length < 21) return false;
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
  if (!points || points.length < 21) return false;
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

// Front hand must look this much bigger than the back hand (thrust at the camera vs. held at the chest).
export const PURPLE_SPAN_RATIO = 1.4;

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

/** web, flick (Gojo purple), point, fist, palm, or null. */
export function classifyGesture(points) {
  if (isWebSign(points)) return "web";
  if (isGojoSign(points)) return "flick";
  if (isPoint(points)) return "point";
  if (isFist(points)) return "fist";
  if (isOpenPalm(points)) return "palm";
  return null;
}
