export const BUILTIN_ACTIONS = ["grab", "cancel", "minimize", "close", "none", "overlay_toggle", "show_control", "gestures_pause"];

export const GESTURES = ["fist", "palm", "peace", "web", "custom"];

// Gesture bindings may only point at these; anything else is a removed v0.5 feature.
const GESTURE_ACTIONS = ["grab", "cancel", "minimize", "close", "none"];
const HOTKEY_ACTIONS = ["overlay_toggle", "show_control", "gestures_pause"];
const REMOVED_GESTURES = ["flick", "gojo", "finger_gun", "point", "pinch"];

const PAUSE_BINDING = {
  id: "b-pause",
  action: "gestures_pause",
  input: { kind: "hotkey", value: "CommandOrControl+Alt+P" },
};

export function defaultBindings() {
  return [
    { id: "b-fist", action: "grab", input: { kind: "gesture", value: "fist" } },
    { id: "b-palm", action: "cancel", input: { kind: "gesture", value: "palm" } },
    { id: "b-peace", action: "minimize", input: { kind: "gesture", value: "peace" } },
    { id: "b-web", action: "close", input: { kind: "gesture", value: "web" } },
    {
      id: "b-overlay",
      action: "overlay_toggle",
      input: { kind: "hotkey", value: "CommandOrControl+Alt+J" },
    },
    {
      id: "b-control",
      action: "show_control",
      input: { kind: "hotkey", value: "CommandOrControl+Alt+K" },
    },
    { ...PAUSE_BINDING, input: { ...PAUSE_BINDING.input } },
  ];
}

export function actionFor(bindings, kind, value) {
  if (!value) return null;
  const found = (bindings || []).find(
    (binding) => binding.input?.kind === kind && binding.input?.value === value,
  );
  return found?.action ?? null;
}

export function upsertBinding(bindings, binding) {
  const next = (bindings || []).filter(
    (item) =>
      !(item.input?.kind === binding.input.kind && item.input?.value === binding.input.value),
  );
  next.push(binding);
  return next;
}

export function removeBinding(bindings, id) {
  return (bindings || []).filter((item) => item.id !== id);
}

function isStale(binding) {
  const { kind, value } = binding.input || {};
  if (kind === "hotkey") return !HOTKEY_ACTIONS.includes(binding.action);
  return !GESTURE_ACTIONS.includes(binding.action) || REMOVED_GESTURES.includes(value);
}

/**
 * v0.6 keeps four gestures. Stored sets that still hold a removed action or gesture are reset
 * to the new defaults; only custom-template gestures and hotkeys bound to live actions survive.
 * A clean set is left alone, so a binding the user deleted stays deleted.
 */
export function migrateBindings(bindings, settings = null) {
  if (!bindings || bindings.length === 0) return defaultBindings();
  let next = bindings;
  if (bindings.some(isStale)) {
    const kept = bindings.filter((b) => !isStale(b) && (b.input?.kind === "hotkey" || !GESTURES.includes(b.input?.value)));
    next = defaultBindings().filter(
      (d) => !kept.some((b) => (d.input.kind === "hotkey" && b.action === d.action) || (b.input?.kind === d.input.kind && b.input?.value === d.input.value)),
    ).concat(kept);
  }
  // One-time add: a deleted pause binding stays deleted; never duplicate an already-used hotkey.
  if (!settings?.migratedPause) {
    const taken = next.some((b) => b.action === "gestures_pause" || (b.input?.kind === "hotkey" && b.input.value === PAUSE_BINDING.input.value));
    if (!taken) next = next.concat({ ...PAUSE_BINDING, input: { ...PAUSE_BINDING.input } });
    if (settings) settings.migratedPause = true;
  }
  return next;
}
