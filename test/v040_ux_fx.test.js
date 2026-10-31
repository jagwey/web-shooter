import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LOOKS, createEffectState, drawEffectFrame, registerCustomLook, spawnShot } from "../src/effects.js";
import { STRINGS } from "../src/i18n.js";

function mockCtx() {
  const ops = [];
  return {
    ops,
    save() { ops.push("save"); },
    restore() { ops.push("restore"); },
    beginPath() { ops.push("beginPath"); },
    closePath() { ops.push("closePath"); },
    moveTo() { ops.push("moveTo"); },
    lineTo() { ops.push("lineTo"); },
    quadraticCurveTo() { ops.push("quadraticCurveTo"); },
    bezierCurveTo() { ops.push("bezierCurveTo"); },
    arc() { ops.push("arc"); },
    ellipse() { ops.push("ellipse"); },
    stroke() { ops.push("stroke"); },
    fill() { ops.push("fill"); },
    translate() { ops.push("translate"); },
    rotate() { ops.push("rotate"); },
    clearRect() {},
    set lineCap(_) {},
    set lineJoin(_) {},
    set strokeStyle(_) {},
    set fillStyle(_) {},
    set lineWidth(_) {},
    set shadowColor(_) {},
    set shadowBlur(_) {},
    set globalAlpha(_) {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };
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

    const state = createEffectState("custom");
    spawnShot(state, { width: 1920, height: 1080, targetX: 960, targetY: 540, now: 0 });
    const ctx = mockCtx();
    drawEffectFrame(ctx, state, { width: 1920, height: 1080, now: 220 });
    assert.ok(ctx.ops.includes("stroke") || ctx.ops.includes("fill"), `Style ${style} must draw geometry`);
  }
});

test("v0.4.0 Theme & UI Overhaul: index.html includes category tabs, presets, and responsiveness slider", () => {
  const html = fs.readFileSync(path.resolve("index.html"), "utf8");
  assert.ok(html.includes('id="dashboardTabs"'), "Dashboard category tabs must exist");
  assert.ok(html.includes('id="smoothingSlider"'), "Responsiveness slider must exist");
  assert.ok(html.includes('id="presetAllBtn"'), "Full power preset button must exist");
  assert.ok(html.includes('id="presetCoreBtn"'), "Core preset button must exist");
  assert.ok(html.includes('id="presetEcoBtn"'), "Eco preset button must exist");
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
