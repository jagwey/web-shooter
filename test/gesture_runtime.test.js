import assert from "node:assert/strict";
import test from "node:test";
import { alignHandSlots, createAirModeLock, createDwell, resolvePinchIntent, trimHistory } from "../src/gesture-runtime.js";

test("air mode lock is exclusive and suppresses discrete after exit", () => {
  const l = createAirModeLock({ releaseMs: 400 });
  assert.equal(l.suppressDiscrete(0), false);
  assert.equal(l.enter("knob", 0), true);
  assert.equal(l.enter("zoom", 1), false);
  assert.equal(l.active(), true);
  assert.equal(l.suppressDiscrete(5000), true);
  l.exit(1000);
  assert.equal(l.active(), false);
  assert.equal(l.suppressDiscrete(1300), true);
  assert.equal(l.suppressDiscrete(1401), false);
  assert.equal(l.enter("bogus", 2000), false);
});

test("dwell fires once per hold and resets", () => {
  const d = createDwell();
  assert.equal(d.update("a", true, 0, 400), 0);
  assert.equal(d.update("a", true, 200, 400), 0.5);
  assert.equal(d.update("a", true, 400, 400), 1);
  assert.equal(d.update("a", true, 600, 400), 0);
  d.update("a", false, 700, 400);
  assert.equal(d.update("a", true, 800, 400), 0);
  assert.equal(d.update("a", true, 1200, 400), 1);
});

const hand = (x, y) => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));

test("hand slots follow handedness when hands cross", () => {
  const prev = [{ label: "Left", wrist: { x: 0.2, y: 0.5 } }, { label: "Right", wrist: { x: 0.8, y: 0.5 } }];
  const hands = [hand(0.7, 0.5), hand(0.3, 0.5)];
  const r = alignHandSlots(prev, hands, ["Left", "Right"]);
  assert.deepEqual(r.slots, [0, 1]);
  assert.deepEqual(r.resetSlots, []);
});

test("hand slots fall back to nearest wrist and flag label changes", () => {
  const prev = [{ label: "Left", wrist: { x: 0.2, y: 0.5 } }, { label: "Right", wrist: { x: 0.8, y: 0.5 } }];
  const r = alignHandSlots(prev, [hand(0.8, 0.5), hand(0.2, 0.5)], []);
  assert.deepEqual(r.slots, [1, 0]);
  const c = alignHandSlots([{ label: "Left", wrist: { x: 0.5, y: 0.5 } }], [hand(0.5, 0.5)], ["Right"]);
  assert.deepEqual(c.slots[0], 0);
  assert.deepEqual(c.resetSlots, [0]);
});

test("pinch intent: rotation vs distance", () => {
  assert.equal(resolvePinchIntent({ angle: 0, distance: 0.3 }, { angle: 25, distance: 0.32 }), "knob");
  assert.equal(resolvePinchIntent({ angle: 0, distance: 0.3 }, { angle: 5, distance: 0.5 }), "zoom");
  assert.equal(resolvePinchIntent({ angle: 0, distance: 0.3 }, { angle: 5, distance: 0.35 }), null);
  assert.equal(resolvePinchIntent({ angle: 170, distance: 0.3 }, { angle: -170, distance: 0.3 }), "knob");
});

test("trimHistory drops old entries in place", () => {
  const h = [{ t: 0 }, { t: 500 }, { t: 2000 }];
  trimHistory(h, 2100, 1600);
  assert.deepEqual(h.map((e) => e.t), [500, 2000]);
});
