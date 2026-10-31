export const BUILTIN_ACTIONS = ["shoot", "grab", "cancel", "overlay_toggle", "show_control"];

export const GESTURES = ["web", "fist", "palm", "point"];

export function defaultBindings() {
  return [
    { id: "b-web", action: "shoot", input: { kind: "gesture", value: "web" } },
    { id: "b-fist", action: "grab", input: { kind: "gesture", value: "fist" } },
    { id: "b-palm", action: "cancel", input: { kind: "gesture", value: "palm" } },
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
