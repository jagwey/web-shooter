export const BUILTIN_ACTIONS = ["shoot", "grab", "cancel", "minimize", "close_tab", "ask_ai", "scan_document", "hollow_purple", "overlay_toggle", "show_control", "gestures_pause"];

export const GESTURES = ["web", "fist", "palm", "flick", "peace", "finger_gun", "gojo", "point", "pinch", "custom"];

const PAUSE_BINDING = {
  id: "b-pause",
  action: "gestures_pause",
  input: { kind: "hotkey", value: "CommandOrControl+Alt+P" },
};

export function defaultBindings() {
  return [
    { id: "b-web", action: "shoot", input: { kind: "gesture", value: "web" } },
    { id: "b-fist", action: "grab", input: { kind: "gesture", value: "fist" } },
    { id: "b-palm", action: "cancel", input: { kind: "gesture", value: "palm" } },
    { id: "b-flick", action: "minimize", input: { kind: "gesture", value: "flick" } },
    { id: "b-purple", action: "hollow_purple", input: { kind: "gesture", value: "gojo" } },
    { id: "b-peace", action: "close_tab", input: { kind: "gesture", value: "peace" } },
    { id: "b-gun", action: "ask_ai", input: { kind: "gesture", value: "finger_gun" } },
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

/** Old builds named the Gojo sign "flick". That name is now the OK-hand minimize. */
export function migrateBindings(bindings, settings = null) {
  if (!bindings || bindings.length === 0) return defaultBindings();
  let renamed = false;
  const next = bindings.filter((binding) => binding.action !== "maximize_restore").map((binding) => {
    const input = binding.input;
    if (binding.action === "hollow_purple" && input?.kind === "gesture" && input.value === "flick") {
      renamed = true;
      return { ...binding, input: { ...input, value: "gojo" } };
    }
    return binding;
  });
  const hasFlick = next.some((binding) => binding.input?.kind === "gesture" && binding.input?.value === "flick");
  if (renamed && !hasFlick) {
    next.push({ id: "b-flick", action: "minimize", input: { kind: "gesture", value: "flick" } });
  }
  // One-time add: a deleted pause binding stays deleted; never duplicate an already-used hotkey.
  if (!settings?.migratedPause) {
    const taken = next.some((b) => b.action === "gestures_pause" || (b.input?.kind === "hotkey" && b.input.value === PAUSE_BINDING.input.value));
    if (!taken) next.push({ ...PAUSE_BINDING, input: { ...PAUSE_BINDING.input } });
    if (settings) settings.migratedPause = true;
  }
  return next;
}
