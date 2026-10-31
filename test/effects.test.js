import assert from "node:assert/strict";
import test from "node:test";
import { createWebFx } from "../src/effects.js";

function mockCtx(width, height) {
  const canvas = { width, height };
  return new Proxy(
    { canvas },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === "canvas") return canvas;
        return () => {};
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    },
  );
}

test("a shot animates through impact without throwing", () => {
  const fx = createWebFx(mockCtx(1280, 720));
  fx.draw(0);
  fx.shoot(180, 520);
  assert.doesNotThrow(() => {
    for (let frame = 1; frame <= 90; frame += 1) fx.draw(frame * 33);
  });
  fx.shoot(1100, 480);
  fx.draw(4000);
});

test("hollow purple and infinity shield animate without throwing", () => {
  const fx = createWebFx(mockCtx(1280, 720));
  fx.triggerPurple(640, 360);
  fx.triggerShield(640, 360, "Test Window", 2000);
  assert.equal(fx.hasWork(), true);
  assert.doesNotThrow(() => {
    for (let frame = 1; frame <= 120; frame += 1) {
      fx.draw(frame * 33);
    }
  });
});
