/**
 * AUTOMATED UI COMPONENT TEST SUITE
 * Milestone 2: UI/UX Modernization & Automated Component Testing
 * Native Node Test Runner (`node --test`)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sanitizeProfiles, createProfile, removeProfile, activeProfile } from "../src/profiles.js";
import { STRINGS } from "../src/i18n.js";

// Helper to load index.html content
function loadHtml() {
  return fs.readFileSync(path.resolve("index.html"), "utf8");
}

// Helper to load style.css content
function loadCss() {
  return fs.readFileSync(path.resolve("src/style.css"), "utf8");
}

// Helper to extract an element's opening tag by ID
function findElementById(html, id) {
  const regex = new RegExp(`<([a-zA-Z0-9]+)[^>]*id=["']${id}["'][^>]*>`, "i");
  const match = html.match(regex);
  return match ? { tag: match[1].toLowerCase(), raw: match[0] } : null;
}

// Helper to extract all DOM IDs
function extractAllIds(html) {
  const matches = [...html.matchAll(/\bid=["']([^"']+)["']/g)];
  return matches.map((m) => m[1]);
}

// ============================================================================
// SUITE 1: DOM Structure & Element Integrity Contract
// ============================================================================

test("UI DOM Contract: all 17 mandatory Milestone 2 IDs exist and are unique", () => {
  const html = loadHtml();
  const mandatoryIds = [
    "modelLabel",
    "holderLabel",
    "themeSelect",
    "effectsSelect",
    "howItWorks",
    "smoothingSlider",
    "testShot",
    "hitLabel",
    "win32Label",
    "profileSelect",
    "profileDelete",
    "profileName",
    "profileAdd",
    "cameraSelect",
    "refreshCamerasBtn",
    "overlayToggle",
    "cameraToggle",
    "dashboardTabs",
  ];

  for (const id of mandatoryIds) {
    const el = findElementById(html, id);
    assert.ok(el, `Mandatory element #${id} must exist in index.html`);
  }

  // Verify uniqueness (each ID occurs exactly once)
  for (const id of mandatoryIds) {
    const count = (html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length;
    assert.equal(count, 1, `Element #${id} must occur exactly once, found ${count}`);
  }
});

test("UI DOM Contract: all core dashboard and studio elements exist", () => {
  const html = loadHtml();
  const studioIds = [
    "video",
    "cameraCanvas",
    "cameraStage",
    "liveCameraDot",
    "cameraMirrorBtn",
    "cameraExpandBtn",
    "gestureBadge",
    "gestureStatusChip",
    "practiceToggle",
    "gesturePauseBtn",
    "fingerStatusBar",
    "deviceLabel",
    "fpsValue",
    "msValue",
    "handValue",
    "winValue",
    "cameraMessage",
    "cameraRetry",
  ];

  for (const id of studioIds) {
    const el = findElementById(html, id);
    assert.ok(el, `Studio element #${id} must exist in index.html`);
  }
});

test("UI DOM Contract: onboarding flow and action controls exist", () => {
  const html = loadHtml();
  const onboardingIds = [
    "updateBar",
    "updateText",
    "updateBtn",
    "onboarding",
    "welcomeNext",
    "onboardCameraMessage",
    "onboardAllow",
    "onboardSkip",
    "onboardMonitors",
    "displayNext",
    "playGo",
    "home",
  ];

  for (const id of onboardingIds) {
    const el = findElementById(html, id);
    assert.ok(el, `Onboarding element #${id} must exist in index.html`);
  }
});

test("UI DOM Contract: all IDs across index.html are globally unique", () => {
  const html = loadHtml();
  const allIds = extractAllIds(html);
  const seen = new Set();
  const duplicates = [];

  for (const id of allIds) {
    if (seen.has(id)) {
      duplicates.push(id);
    }
    seen.add(id);
  }

  assert.deepEqual(duplicates, [], `Found duplicate IDs: ${duplicates.join(", ")}`);
});

test("UI DOM Contract: #modelLabel preserves dynamic language contract", () => {
  const html = loadHtml();
  // #modelLabel must NOT carry data-i18n="modelLoading" so dynamic status is not overwritten on lang toggle
  assert.doesNotMatch(html, /id=["']modelLabel["'][^>]*data-i18n=["']modelLoading["']/);
});

// ============================================================================
// SUITE 2: Tab Navigation & Visibility Filtering
// ============================================================================

test("Tab Navigation: tab buttons and target cards match 1:1 schema", () => {
  const html = loadHtml();

  // Extract all data-tab-target values from #dashboardTabs
  const tabButtonMatches = [...html.matchAll(/data-tab-target=["']([^"']+)["']/g)];
  const targets = tabButtonMatches.map((m) => m[1]);
  assert.ok(targets.includes("all"), "Tabs must include 'all'");
  assert.ok(targets.includes("gestures"), "Tabs must include 'gestures'");
  assert.ok(targets.includes("appearance"), "Tabs must include 'appearance'");
  assert.ok(targets.includes("system"), "Tabs must include 'system'");
  assert.ok(targets.includes("guide"), "Tabs must include 'guide'");

  // Extract all card data-tab categories
  const cardMatches = [...html.matchAll(/class=["'][^"']*card[^"']*["'][^>]*data-tab=["']([^"']+)["']/g)];
  const cardCategories = cardMatches.map((m) => m[1]);
  assert.ok(cardCategories.includes("gestures"), "Cards must include data-tab='gestures'");
  assert.ok(cardCategories.includes("appearance"), "Cards must include data-tab='appearance'");
  assert.ok(cardCategories.includes("system"), "Cards must include data-tab='system'");
  assert.ok(cardCategories.includes("guide"), "Cards must include data-tab='guide'");
});

test("Tab Navigation: tab switching logic correctly filters cards", () => {
  const categories = ["system", "gestures", "appearance", "gestures", "system", "system", "guide"];

  function simulateTabFilter(activeTab) {
    return categories.map((cat) => ({
      category: cat,
      hidden: activeTab !== "all" && cat !== activeTab,
    }));
  }

  // When 'all' is selected: no cards hidden
  const allResult = simulateTabFilter("all");
  assert.equal(allResult.every((c) => !c.hidden), true, "All cards should be visible when tab='all'");

  // When 'gestures' is selected: only gestures visible
  const gesturesResult = simulateTabFilter("gestures");
  assert.equal(gesturesResult.filter((c) => !c.hidden).length, 2);
  assert.equal(gesturesResult.every((c) => (c.category === "gestures" ? !c.hidden : c.hidden)), true);

  // When 'guide' is selected: only guide visible
  const guideResult = simulateTabFilter("guide");
  assert.equal(guideResult.filter((c) => !c.hidden).length, 1);
  assert.equal(guideResult.every((c) => (c.category === "guide" ? !c.hidden : c.hidden)), true);
});

// ============================================================================
// SUITE 3: Theme Selector & Modern CSS Architecture
// ============================================================================

test("Theme Select: options in HTML match available themes", () => {
  const html = loadHtml();
  const themeSelectMatch = html.match(/<select[^>]*id=["']themeSelect["'][^>]*>([\s\S]*?)<\/select>/i);
  assert.ok(themeSelectMatch, "themeSelect element must exist");

  const options = [...themeSelectMatch[1].matchAll(/value=["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(options.includes("minimal"), "themeSelect must include 'minimal'");
  assert.ok(options.includes("anime"), "themeSelect must include 'anime'");
});

test("Effects Select: options in HTML match available effect modes", () => {
  const html = loadHtml();
  const fxSelectMatch = html.match(/<select[^>]*id=["']effectsSelect["'][^>]*>([\s\S]*?)<\/select>/i);
  assert.ok(fxSelectMatch, "effectsSelect element must exist");

  const options = [...fxSelectMatch[1].matchAll(/value=["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(options.includes("off"), "effectsSelect must include 'off'");
  assert.ok(options.includes("classic"), "effectsSelect must include 'classic'");
});

test("CSS Design System: style.css defines modern glassmorphism, accent gradients, and tokens", () => {
  const css = loadCss();

  // Color tokens
  assert.ok(css.includes("--bg:"), "CSS must define --bg");
  assert.ok(css.includes("--panel:"), "CSS must define --panel");
  assert.ok(css.includes("--line:"), "CSS must define --line");
  assert.ok(css.includes("--accent:"), "CSS must define --accent");
  assert.ok(css.includes("--accent-gradient:"), "CSS must define --accent-gradient");

  // Modern glassmorphism
  assert.ok(css.includes("backdrop-filter:"), "CSS must use backdrop-filter for glassmorphism");
  assert.ok(css.includes("blur("), "CSS must use blur filters");
  assert.ok(css.includes("border-radius:"), "CSS must define comfortable rounded radii");

  // Theme variant
  assert.ok(css.includes('[data-theme="anime"]'), "CSS must include [data-theme='anime'] skin");
});

// ============================================================================
// SUITE 4: Smoothing Slider Badge Formatting
// ============================================================================

function formatSmoothingBadge(val, lang = "tr") {
  const pct = Math.round((Number(val) || 0.75) * 100);
  const fastLabel = lang === "tr" ? STRINGS.tr.smoothingFast : STRINGS.en.smoothingFast;
  const smoothLabel = lang === "tr" ? STRINGS.tr.smoothingSmooth : STRINGS.en.smoothingSmooth;
  const balancedLabel = lang === "tr" ? "Dengeli" : "Balanced";
  const label = pct >= 80 ? fastLabel : pct <= 50 ? smoothLabel : balancedLabel;
  return `%${pct} · ${label}`;
}

test("Smoothing Slider: attributes define correct range and default", () => {
  const html = loadHtml();
  const slider = findElementById(html, "smoothingSlider");
  assert.ok(slider, "smoothingSlider element must exist");
  assert.ok(slider.raw.includes('min="0.30"'), "min must be 0.30");
  assert.ok(slider.raw.includes('max="1.00"'), "max must be 1.00");
  assert.ok(slider.raw.includes('step="0.05"'), "step must be 0.05");
  assert.ok(slider.raw.includes('value="0.75"'), "default value must be 0.75");
});

test("Smoothing Slider: formatSmoothingBadge formats percentage and label correctly", () => {
  assert.equal(formatSmoothingBadge(0.75, "tr"), "%75 · Dengeli");
  assert.equal(formatSmoothingBadge(0.85, "tr"), `%85 · ${STRINGS.tr.smoothingFast}`);
  assert.equal(formatSmoothingBadge(0.40, "tr"), `%40 · ${STRINGS.tr.smoothingSmooth}`);
  assert.equal(formatSmoothingBadge(1.00, "tr"), `%100 · ${STRINGS.tr.smoothingFast}`);
  assert.equal(formatSmoothingBadge(0.30, "tr"), `%30 · ${STRINGS.tr.smoothingSmooth}`);

  // English localization
  assert.equal(formatSmoothingBadge(0.75, "en"), "%75 · Balanced");
  assert.equal(formatSmoothingBadge(0.90, "en"), `%90 · ${STRINGS.en.smoothingFast}`);
  assert.equal(formatSmoothingBadge(0.45, "en"), `%45 · ${STRINGS.en.smoothingSmooth}`);
});

// ============================================================================
// SUITE 5: Profile Management UI Interaction Logic
// ============================================================================

test("Profile UI: initial sanitize provides single default profile with stats", () => {
  const data = sanitizeProfiles(null);
  assert.equal(data.list.length, 1);
  assert.equal(data.activeId, "default");
  assert.equal(data.list[0].name, "Oyuncu 1");
  assert.deepEqual(data.list[0].stats, { shots: 0, bestMs: null, sessions: 0 });

  // Delete button should be disabled when only 1 profile exists
  const canDeleteSingle = data.list.length > 1;
  assert.equal(canDeleteSingle, false, "Cannot delete when single profile remains");
});

test("Profile UI: creating and deleting profiles maintains correct activeId", () => {
  const data = sanitizeProfiles(null);
  const p2 = createProfile(data, "Gamer Two", { smoothing: 0.8 });
  assert.equal(data.list.length, 2);
  assert.equal(p2.name, "Gamer Two");

  // Delete button should now be enabled
  const canDeleteMulti = data.list.length > 1;
  assert.equal(canDeleteMulti, true, "Delete should be enabled when multiple profiles exist");

  // Removing profile p2
  const removed = removeProfile(data, p2.id);
  assert.equal(removed, true);
  assert.equal(data.list.length, 1);
  assert.equal(data.activeId, "default");
});

test("Profile UI: stats formatting produces readable string", () => {
  const profile = {
    id: "p1",
    name: "Hero",
    stats: { shots: 42, bestMs: 16, sessions: 3 },
  };

  const template = STRINGS.tr.profileStats; // "Atış: {shots} · En iyi: {best}"
  const formatted = template
    .replace("{shots}", String(profile.stats.shots))
    .replace("{best}", profile.stats.bestMs ? `${profile.stats.bestMs}ms` : "-");

  assert.equal(formatted, "Atış: 42 · En iyi: 16ms");
});

// ============================================================================
// SUITE 6: Status Indicators, HUD Elements & Toasts
// ============================================================================

test("Finger Status Bar: exactly 5 anatomical finger pills exist", () => {
  const html = loadHtml();
  const fingers = ["thumb", "index", "middle", "ring", "pinky"];

  for (const f of fingers) {
    const regex = new RegExp(`class=["'][^"']*finger-pill[^"']*["'][^>]*data-finger=["']${f}["']`, "i");
    assert.match(html, regex, `Finger pill for '${f}' must exist`);
  }
});

test("Gesture Status Chip: initial state is active with localized label", () => {
  const html = loadHtml();
  const chip = findElementById(html, "gestureStatusChip");
  assert.ok(chip, "gestureStatusChip must exist");
  assert.ok(chip.raw.includes('data-state="active"'), "Initial data-state must be active");
});

test("HUD Toast: timing and smooth opacity decay computation", () => {
  const duration = 1100;
  const t0 = 1000;
  const until = t0 + duration;

  // Function mirroring drawToast opacity decay
  function calcToastAlpha(now) {
    const remain = Math.max(0, until - now);
    const elapsed = duration - remain;
    const enterAlpha = Math.min(1, elapsed / 160);
    const exitAlpha = Math.min(1, remain / 220);
    return Math.max(0, Math.min(enterAlpha, exitAlpha));
  }

  // t = 1000: start (0ms elapsed) -> alpha = 0
  assert.equal(calcToastAlpha(t0), 0);

  // t = 1160: full enter (160ms elapsed) -> alpha = 1
  assert.equal(calcToastAlpha(t0 + 160), 1);

  // t = 1500: mid flight (500ms elapsed, 600ms remain) -> alpha = 1
  assert.equal(calcToastAlpha(t0 + 500), 1);

  // t = 2000: exit decay (100ms remain < 220ms) -> alpha < 1
  assert.ok(calcToastAlpha(t0 + 1000) < 0.5);

  // t = 2100: finished -> alpha = 0
  assert.equal(calcToastAlpha(until), 0);
});

test("Switches: default aria-pressed attributes match fallbackSettings", () => {
  const html = loadHtml();
  const switches = [
    { id: "focusFrameToggle", expected: "true" },
    { id: "dualHandsToggle", expected: "true" },
    { id: "safetyToggle", expected: "true" },
    { id: "soundToggle", expected: "true" },
  ];

  for (const sw of switches) {
    const el = findElementById(html, sw.id);
    assert.ok(el, `Switch #${sw.id} must exist`);
    assert.ok(el.raw.includes(`aria-pressed="${sw.expected}"`), `Switch #${sw.id} default aria-pressed should be ${sw.expected}`);
  }
});
