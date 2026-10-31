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

/** web, flick (Gojo purple), point, fist, palm, or null. */
export function classifyGesture(points) {
  if (isWebSign(points)) return "web";
  if (isGojoSign(points)) return "flick";
  if (isPoint(points)) return "point";
  if (isFist(points)) return "fist";
  if (isOpenPalm(points)) return "palm";
  return null;
}
