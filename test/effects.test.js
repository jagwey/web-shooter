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

test("a shot follows the window instead of sticking to the old pixels", () => {
  const fx = createWebFx(mockCtx(1280, 720));
  const rect = { x: 100, y: 80, w: 400, h: 240 };
  fx.shoot(20, 20, rect, 7);
  const flying = fx.pin();
  assert.equal(flying.x, 300);
  assert.equal(flying.y, 200);
  fx.follow({ x: 160, y: 110, w: 400, h: 240 }, 7);
  const moved = fx.pin();
  assert.equal(moved.x, 360);
  assert.equal(moved.y, 230);
  fx.follow({ x: 0, y: 0, w: 10, h: 10 }, 99);
  assert.equal(fx.pin().x, 360);
  assert.doesNotThrow(() => {
    for (let frame = 1; frame <= 40; frame += 1) fx.draw(frame * 33);
  });
  const landed = fx.pin();
  assert.ok(landed);
  fx.follow({ x: 180, y: 130, w: 420, h: 260 }, 7);
  assert.equal(fx.pin().x, landed.x + 20);
  assert.equal(fx.pin().y, landed.y + 20);
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
