import assert from "node:assert/strict";
import test from "node:test";
import { FX_PRESETS } from "../src/effects.js";
import { actionFor, defaultBindings, removeBinding, upsertBinding } from "../src/bindings.js";

test("default bindings cover shoot, grab, cancel, and overlay", () => {
  const bindings = defaultBindings();
  assert.equal(actionFor(bindings, "gesture", "web"), "shoot");
  assert.equal(actionFor(bindings, "gesture", "fist"), "grab");
  assert.equal(actionFor(bindings, "gesture", "palm"), "cancel");
  assert.equal(actionFor(bindings, "hotkey", "CommandOrControl+Alt+J"), "overlay_toggle");
  assert.equal(actionFor(bindings, "gesture", "point"), null);
});

test("a new binding replaces the same input", () => {
  const next = upsertBinding(defaultBindings(), {
    id: "custom",
    action: "wave",
    input: { kind: "gesture", value: "web" },
  });
  assert.equal(actionFor(next, "gesture", "web"), "wave");
  assert.equal(next.filter((item) => item.input.value === "web").length, 1);
  assert.equal(removeBinding(next, "custom").some((item) => item.id === "custom"), false);
});

test("effect presets include the performance mode", () => {
  assert.deepEqual(FX_PRESETS, ["classic", "mint", "neon", "low"]);
});
