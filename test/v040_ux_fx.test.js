import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LOOKS, createWebFx, registerCustomLook } from "../src/effects.js";
import { STRINGS } from "../src/i18n.js";

function mockCtx(width, height) {
  const canvas = { width, height };
  const ops = [];
  const proxy = new Proxy(
    { canvas, ops },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === "canvas") return canvas;
        if (prop === "ops") return ops;
        return (...args) => { ops.push(prop); };
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }
  );
  return proxy;
}

test("v0.4.0 FX Engine: all 6 particle styles and thickness render without error", () => {
  const styles = ["sparks", "stardust", "webs", "sakura", "fire", "purple"];
  for (const style of styles) {
    registerCustomLook({
      primary: "#00f5ff",
      glow: "#a855f7",
      particle: "#ffffff",
      style,
      thickness: 6,
    });
    assert.equal(LOOKS.custom.particleStyle, style);
    assert.equal(LOOKS.custom.thickness, 6);

    const ctx = mockCtx(1920, 1080);
    const fx = createWebFx(ctx);
    fx.setPreset("custom");
    fx.shoot(960, 540);
    assert.doesNotThrow(() => {
      for (let frame = 1; frame <= 30; frame += 1) {
        fx.draw(frame * 33);
      }
    });
    assert.ok(ctx.ops.includes("stroke") || ctx.ops.includes("arc"), `Style ${style} must draw geometry`);
  }
});

test("v0.4.0 Theme & UI Overhaul: index.html includes theme, effects, and responsiveness slider", () => {
  const html = fs.readFileSync(path.resolve("index.html"), "utf8");
  assert.ok(html.includes('id="themeSelect"'), "Theme select must exist");
  assert.ok(html.includes('id="effectsSelect"'), "Effects select must exist");
  assert.ok(html.includes('id="howItWorks"'), "How-it-works card must exist");
  assert.ok(html.includes('id="smoothingSlider"'), "Responsiveness slider must exist");
  assert.equal((html.match(/id="testShot"/g) || []).length, 1, "No duplicate #testShot buttons");
  assert.equal((html.match(/id="hitLabel"/g) || []).length, 1, "No duplicate #hitLabel elements");
  assert.equal((html.match(/id="win32Label"/g) || []).length, 1, "No duplicate #win32Label elements");
});

test("v0.4.0 i18n parity: new tab, preset, and smoothing keys exist in both TR and EN", () => {
  const required = [
    "tabAll",
    "tabGestures",
    "tabThemes",
    "tabAi",
    "tabSystem",
    "presetAllOn",
    "presetCoreOnly",
    "presetEco",
    "smoothingTitle",
    "smoothingFast",
    "smoothingSmooth",
  ];
  for (const key of required) {
    assert.ok(STRINGS.tr[key], `Missing TR key: ${key}`);
    assert.ok(STRINGS.en[key], `Missing EN key: ${key}`);
  }
});
