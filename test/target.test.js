import assert from "node:assert/strict";
import test from "node:test";
import { canvasRect, clientOf, shiftPinned } from "../src/target.js";

test("client rect covers the page, not the outer frame", () => {
  const box = clientOf({
    x: 10,
    y: 10,
    width: 800,
    height: 600,
    clientX: 18,
    clientY: 72,
    clientWidth: 784,
    clientHeight: 500,
    hwnd: 42,
    title: "Docs",
  });
  assert.deepEqual(box, { x: 18, y: 72, width: 784, height: 500, hwnd: 42, title: "Docs" });
});

test("missing client fields fall back to the outer rect", () => {
  const box = clientOf({ x: 4, y: 8, width: 100, height: 80, hwnd: 1 });
  assert.equal(box.x, 4);
  assert.equal(box.width, 100);
});

test("canvas rect is a pure scale of the latest client box", () => {
  const frame = { x: 0, y: 0, width: 1000, height: 500 };
  const first = canvasRect({ x: 100, y: 50, width: 200, height: 100 }, frame, 1000, 500);
  const moved = canvasRect({ x: 340, y: 90, width: 180, height: 120 }, frame, 1000, 500);
  assert.deepEqual(first, { x: 100, y: 50, w: 200, h: 100 });
  assert.deepEqual(moved, { x: 340, y: 90, w: 180, h: 120 });
  assert.equal(moved.x - first.x, 240);
});

test("a moved window shifts the web by the same delta", () => {
  const pin = { x: 500, y: 400, rect: { x: 100, y: 80, w: 200, h: 100 } };
  const next = shiftPinned(pin, { x: 130, y: 50, w: 220, h: 140 });
  assert.equal(next.x, 530);
  assert.equal(next.y, 370);
  assert.equal(next.rect.w, 220);
  assert.equal(next.rect.h, 140);
});
