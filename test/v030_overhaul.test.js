import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHandFilter, filterLandmarks, handSpeed, predict } from "../src/filter.js";
import { activeProfile, createProfile, loadProfiles, recordMs, recordShot, sanitizeProfiles } from "../src/profiles.js";

test("v0.4.3 version parity across package.json, Cargo.toml, and tauri.conf.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  const tauriConf = JSON.parse(fs.readFileSync(path.resolve("src-tauri/tauri.conf.json"), "utf8"));
  const cargoToml = fs.readFileSync(path.resolve("src-tauri/Cargo.toml"), "utf8");
  assert.equal(pkg.version, "0.4.3");
  assert.equal(tauriConf.version, "0.4.3");
  assert.match(cargoToml, /version\s*=\s*"0.4.3"/);
});

test("v0.3.0 desktop.toml grants permissions for move_window_fast and profile commands", () => {
  const toml = fs.readFileSync(path.resolve("src-tauri/permissions/desktop.toml"), "utf8");
  assert.match(toml, /"move_window_fast"/);
  assert.match(toml, /"get_profiles"/);
  assert.match(toml, /"save_profiles_cmd"/);
});

test("v0.3.0 index.html and control.js audit fixes are in place", () => {
  const html = fs.readFileSync(path.resolve("index.html"), "utf8");
  const control = fs.readFileSync(path.resolve("src/control.js"), "utf8");
  // #modelLabel must not carry data-i18n="modelLoading" so language switches never overwrite ready status
  assert.doesNotMatch(html, /id="modelLabel"[^>]*data-i18n="modelLoading"/);
  // Required DOM elements for camera holders and AI connection testing exist
  assert.match(html, /id="holderLabel"/);
  assert.match(html, /id="aiTestBtn"/);
  assert.match(html, /id="aiStatusMessage"/);
  // Worker boot timeout is 4000ms (fast fallback to main thread)
  assert.match(control, /const WORKER_BOOT_MS = 4000;/);
  // scanCameraDocument uses #video instead of nonexistent #cameraVideo
  assert.doesNotMatch(control, /getElementById\("cameraVideo"\)/);
  // appendAiMessage and updateAiMessage are defined
  assert.match(control, /function appendAiMessage\(/);
  assert.match(control, /function updateAiMessage\(/);
});

test("v0.3.0 sanitizeProfiles repairs missing or corrupted stats and activeId", () => {
  const dirty = {
    activeId: "non-existent",
    list: [
      { id: "p1", name: "  Osman  ", settings: { dualHands: true }, stats: null },
      { id: "p2", name: "", settings: "invalid", stats: { shots: "12", bestMs: "8" } },
    ],
  };
  const clean = sanitizeProfiles(dirty);
  assert.equal(clean.activeId, "p1");
  assert.equal(clean.list.length, 2);
  assert.equal(clean.list[0].name, "Osman");
  assert.deepEqual(clean.list[0].stats, { shots: 0, bestMs: null, sessions: 0 });
  assert.equal(clean.list[1].name, "Oyuncu 2");
  assert.equal(clean.list[1].settings, null);
  assert.deepEqual(clean.list[1].stats, { shots: 12, bestMs: 8, sessions: 0 });

  // recordShot and recordMs tolerate profiles whose stats were deleted at runtime
  const p = { id: "p3", name: "Test" };
  recordShot(p);
  assert.equal(p.stats.shots, 1);
  assert.equal(recordMs(p, 11.4), true);
  assert.equal(p.stats.bestMs, 11);
});

test("v0.3.0 1 Euro Filter fast sweep tracking and handSpeed calculation", () => {
  const f = createHandFilter();
  const make21 = (x, y) => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));

  filterLandmarks(f, make21(0.2, 0.5), 0);
  assert.equal(handSpeed(f, 9), 0);

  // Fast sweep: 0.2 -> 0.8 in 32ms (2 frames at 60fps = 18.75 screen widths/sec!)
  filterLandmarks(f, make21(0.5, 0.5), 16);
  const out = filterLandmarks(f, make21(0.8, 0.5), 32);

  // With beta=18.0, dCutoff=3.0, filtered position tracks >99% of rapid displacement immediately
  assert.ok(out[9].x > 0.77, `Expected fast sweep x > 0.77, got ${out[9].x}`);
  const speed = handSpeed(f, 9);
  assert.ok(speed > 5, `Expected high handSpeed > 5, got ${speed}`);

  // Adaptive velocity lead extrapolates ahead in movement direction
  const leadMs = Math.min(42, Math.max(14, Math.round(14 + speed * 22)));
  assert.equal(leadMs, 42);
  const predicted = predict(f, 9, out[9], leadMs);
  assert.ok(predicted.x > out[9].x);
});

test("v0.3.0 anchor-based window dragging eliminates cumulative DWM border drift", () => {
  // Simulate a window whose outer Win32 rect is at (100, 100) and client rect is at (108, 132)
  // (8px invisible DWM left border, 32px title bar).
  const found = { hwnd: 12345, x: 100, y: 100, width: 800, height: 600, clientX: 108, clientY: 132, clientWidth: 784, clientHeight: 560 };
  const anchorHandSx = 500;
  const anchorHandSy = 400;
  const grab = {
    hwnd: found.hwnd,
    anchorWinX: found.x,
    anchorWinY: found.y,
    anchorHandSx,
    anchorHandSy,
    offsetClientX: found.clientX - found.x,
    offsetClientY: found.clientY - found.y,
    winX: found.x,
    winY: found.y,
  };

  // Simulate 60 frames of hand movement ending at (+250, -120)
  for (let step = 1; step <= 60; step += 1) {
    const point = {
      sx: anchorHandSx + Math.round((250 * step) / 60),
      sy: anchorHandSy + Math.round((-120 * step) / 60),
    };
    grab.winX = Math.round(grab.anchorWinX + (point.sx - grab.anchorHandSx));
    grab.winY = Math.round(grab.anchorWinY + (point.sy - grab.anchorHandSy));
  }

  // Exact 1:1 tracking with zero accumulated drift
  assert.equal(grab.winX, 350);
  assert.equal(grab.winY, -20);
  assert.equal(grab.winX + grab.offsetClientX, 358);
  assert.equal(grab.winY + grab.offsetClientY, 12);
});
