import { t } from "./i18n.js";

/**
 * Multi-Screen Window Placement.
 * getScreenDetails() needs a click. window.open() must run in a later click
 * so the browser still treats it as a user gesture.
 */

export function screenApiAvailable() {
  return typeof window.getScreenDetails === "function";
}

export async function loadScreens() {
  if (!screenApiAvailable()) {
    return {
      supported: false,
      isExtended: false,
      screens: [currentWindowScreen()],
    };
  }

  const details = await window.getScreenDetails();
  const screens = details.screens.map((screen, index) => ({
    index,
    label: screen.label || "",
    left: screen.availLeft,
    top: screen.availTop,
    width: screen.availWidth,
    height: screen.availHeight,
    isPrimary: Boolean(screen.isPrimary),
    isInternal: Boolean(screen.isInternal),
  }));

  return {
    supported: true,
    isExtended: screens.length > 1 || Boolean(window.screen.isExtended),
    screens,
    details,
  };
}

export function currentWindowScreen() {
  return {
    index: 0,
    label: "",
    left: window.screen.availLeft || 0,
    top: window.screen.availTop || 0,
    width: window.screen.availWidth || 1280,
    height: window.screen.availHeight || 720,
    isPrimary: true,
    isInternal: undefined,
    fallback: true,
  };
}

export function screenButtonLabel(screen, index) {
  const name = screen.fallback
    ? t("screenThis")
    : screen.label.trim() || `${t("screenFallback")} ${index + 1}`;
  const role = screen.isPrimary ? t("screenPrimary") : t("screenExtra");
  const kind =
    screen.isInternal === undefined
      ? ""
      : screen.isInternal
        ? t("screenInternal")
        : t("screenExternal");
  const place = kind ? `${role} · ${kind}` : role;
  return `${name} · ${place} · ${screen.width}×${screen.height}`;
}

export function openStage(screen) {
  const url = new URL("stage.html", window.location.href);
  url.searchParams.set("fs", "1");
  const features = [
    `left=${Math.round(screen.left)}`,
    `top=${Math.round(screen.top)}`,
    `width=${Math.round(screen.width)}`,
    `height=${Math.round(screen.height)}`,
    "popup=yes",
  ].join(",");

  const child = window.open(url.toString(), "jagwey-stage", features);
  if (!child) return null;

  try {
    child.moveTo(Math.round(screen.left), Math.round(screen.top));
    child.resizeTo(Math.round(screen.width), Math.round(screen.height));
    child.focus();
  } catch {
    /* some browsers ignore cross-screen moves until permission is granted */
  }

  const enter = () => {
    const root = child.document?.documentElement;
    if (!root || typeof root.requestFullscreen !== "function") return;
    root.requestFullscreen().catch(() => {
      /* the stage page keeps its own fullscreen button */
    });
  };

  try {
    if (child.document?.readyState === "complete") enter();
    else child.addEventListener("load", enter, { once: true });
  } catch {
    /* popup still opened; fullscreen stays manual */
  }

  return child;
}
