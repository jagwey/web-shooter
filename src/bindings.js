export const BUILTIN_ACTIONS = ["shoot", "grab", "cancel", "minimize", "close_tab", "ask_ai", "scan_document", "maximize_restore", "hollow_purple", "overlay_toggle", "show_control"];

export const GESTURES = ["web", "fist", "palm", "flick", "peace", "finger_gun", "gojo", "point", "custom"];

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
export function migrateBindings(bindings) {
  if (!bindings || bindings.length === 0) return defaultBindings();
  let renamed = false;
  const next = bindings.map((binding) => {
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
  return next;
}
