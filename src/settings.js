import { getLang } from "./i18n.js";
import { defaultBindings } from "./bindings.js";

export function fallbackSettings() {
  return {
    onboarded: false,
    lang: typeof getLang === "function" ? getLang() : "tr",
    startWithWindows: false,
    releaseCameraWhenIdle: false,
    idleReleaseSecs: 20,
    monitorMode: "one",
    monitorId: "",
    fxPreset: "off",
    bindings: typeof defaultBindings === "function" ? defaultBindings() : [],
    cameraDeviceId: "",
    targetFps: 120,
    soundEnabled: true,
    showWebs: false,
    showFocusFrame: true,
    dualHands: true,
    bodyTracking: false,
    customFx: null,
    theme: "minimal",
    sniperTarget: "gemini_web",
    airVolumeToggle: true,
    airMediaToggle: true,
    ninjaShieldToggle: true,
    airZoomToggle: true,
    airScrollToggle: true,
  };
}
