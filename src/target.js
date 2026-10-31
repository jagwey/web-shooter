/** Screen-space client box for a Win32 window. Client fields win over the outer frame. */

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function clientOf(win) {
  if (!win || win.unsupported) return null;
  const x = finite(win.clientX, win.x);
  const y = finite(win.clientY, win.y);
  const width = finite(win.clientWidth, win.width);
  const height = finite(win.clientHeight, win.height);
  if (![x, y, width, height].every(Number.isFinite) || !(width > 0) || !(height > 0)) return null;
  return {
    x,
    y,
    width,
    height,
    hwnd: win.hwnd,
    title: win.title || "",
  };
}

/** Map a client box into overlay canvas pixels. Uses the latest sample only — no leftover offset. */
export function canvasRect(box, frame, canvasW, canvasH) {
  if (!box || !frame?.width || !frame?.height || !(canvasW > 0) || !(canvasH > 0)) return null;
  const sx = canvasW / frame.width;
  const sy = canvasH / frame.height;
  const rect = {
    x: (box.x - frame.x) * sx,
    y: (box.y - frame.y) * sy,
    w: box.width * sx,
    h: box.height * sy,
  };
  return rect.w > 0 && rect.h > 0 ? rect : null;
}

/**
 * Slide a pinned splash with the window.
 * Anchor and clip move by the same delta, so a move/resize does not leave the web on the old pixels.
 */
export function shiftPinned(pin, next) {
  if (!next) return pin;
  if (!pin?.rect) return { ...pin, rect: next };
  const dx = next.x - pin.rect.x;
  const dy = next.y - pin.rect.y;
  return {
    ...pin,
    x: pin.x + dx,
    y: pin.y + dy,
    rect: next,
    maxRadius: Math.hypot(next.w, next.h),
  };
}
