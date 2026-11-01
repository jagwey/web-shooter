import assert from "node:assert/strict";
import test from "node:test";
import { FX_PRESETS } from "../src/effects.js";
import { actionFor, defaultBindings, migrateBindings, removeBinding, upsertBinding } from "../src/bindings.js";

test("default bindings are fist grab, palm cancel, peace minimize, web close", () => {
  const bindings = defaultBindings();
  assert.equal(actionFor(bindings, "gesture", "fist"), "grab");
  assert.equal(actionFor(bindings, "gesture", "palm"), "cancel");
  assert.equal(actionFor(bindings, "gesture", "peace"), "minimize");
  assert.equal(actionFor(bindings, "gesture", "web"), "close");
  assert.equal(bindings.filter((b) => b.input.kind === "gesture").length, 4);
  assert.equal(actionFor(bindings, "hotkey", "CommandOrControl+Alt+J"), "overlay_toggle");
  assert.equal(actionFor(bindings, "hotkey", "CommandOrControl+Alt+K"), "show_control");
  assert.equal(actionFor(bindings, "hotkey", "CommandOrControl+Alt+P"), "gestures_pause");
  for (const removed of ["flick", "gojo", "finger_gun", "point", "pinch"]) {
    assert.equal(actionFor(bindings, "gesture", removed), null);
  }
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

test("migrate resets a stale v0.5 set to the v0.6 defaults", () => {
  const old = [
    { id: "b-web", action: "shoot", input: { kind: "gesture", value: "web" } },
    { id: "b-fist", action: "grab", input: { kind: "gesture", value: "fist" } },
    { id: "b-flick", action: "minimize", input: { kind: "gesture", value: "flick" } },
    { id: "b-gojo", action: "hollow_purple", input: { kind: "gesture", value: "gojo" } },
    { id: "b-peace", action: "close_tab", input: { kind: "gesture", value: "peace" } },
    { id: "b-gun", action: "ask_ai", input: { kind: "gesture", value: "finger_gun" } },
    { id: "b-overlay", action: "overlay_toggle", input: { kind: "hotkey", value: "CommandOrControl+Alt+J" } },
  ];
  const next = migrateBindings(old);
  assert.deepEqual(next.map((b) => b.id).sort(), defaultBindings().map((b) => b.id).sort());
  assert.equal(actionFor(next, "gesture", "web"), "close");
  assert.equal(actionFor(next, "gesture", "peace"), "minimize");
  assert.equal(actionFor(next, "gesture", "flick"), null);
  assert.equal(next.some((b) => ["shoot", "hollow_purple", "close_tab", "ask_ai"].includes(b.action)), false);
  assert.deepEqual(migrateBindings(next), next);
});

test("migrate keeps custom gestures only when they map to a v0.6 action", () => {
  const old = [
    { id: "b-web", action: "shoot", input: { kind: "gesture", value: "web" } },
    { id: "c-keep", action: "minimize", input: { kind: "gesture", value: "my-wave" } },
    { id: "c-drop", action: "close_tab", input: { kind: "gesture", value: "my-ok" } },
  ];
  const next = migrateBindings(old);
  assert.equal(actionFor(next, "gesture", "my-wave"), "minimize");
  assert.equal(actionFor(next, "gesture", "my-ok"), null);
  assert.equal(actionFor(next, "gesture", "web"), "close");
});

test("migrate leaves a clean set alone so deletions persist", () => {
  assert.deepEqual(migrateBindings([]).map((b) => b.id), defaultBindings().map((b) => b.id));
  const trimmed = defaultBindings().filter((b) => b.id !== "b-peace");
  assert.equal(actionFor(migrateBindings(trimmed), "gesture", "peace"), null);
});

test("effect presets include the performance mode", () => {
  assert.ok(FX_PRESETS.includes("low"));
});

test("migrate drops maximize_restore and adds the pause hotkey once", () => {
  const old = [
    { id: "b-max", action: "maximize_restore", input: { kind: "gesture", value: "point" } },
    { id: "b-web", action: "shoot", input: { kind: "gesture", value: "web" } },
  ];
  const once = migrateBindings(old);
  assert.equal(once.some((b) => b.action === "maximize_restore"), false);
  assert.equal(actionFor(once, "hotkey", "CommandOrControl+Alt+P"), "gestures_pause");
  const twice = migrateBindings(once);
  assert.equal(twice.filter((b) => b.action === "gestures_pause").length, 1);
  assert.equal(actionFor(once, "gesture", "web"), "close");
});
