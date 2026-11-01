import assert from "node:assert/strict";
import test from "node:test";
import { STRINGS } from "../src/i18n.js";

test("Turkish and English catalogs have the same keys", () => {
  const tr = Object.keys(STRINGS.tr).sort();
  const en = Object.keys(STRINGS.en).sort();
  assert.deepEqual(tr, en);
  for (const key of tr) {
    assert.equal(typeof STRINGS.tr[key], "string");
    assert.equal(STRINGS.tr[key].length > 0, true);
    assert.equal(STRINGS.en[key].length > 0, true);
  }
});

test("gesture pause / practice / toast keys exist in both languages", () => {
  const keys = [
    "actionGesturesPause", "gesturePinch", "toastMediaToggle", "toastNextTrack", "toastShowDesktop",
    "toastZoomIn", "toastZoomOut", "toastVolumeUp", "toastVolumeDown", "toastCloseCancelled",
    "toastPractice", "toastPaused", "toastResumed", "statusActive", "statusPaused", "statusPractice",
    "practiceMode", "practiceModeHint", "pauseGestures", "resumeGestures",
  ];
  for (const lang of ["tr", "en"]) for (const k of keys) assert.ok(STRINGS[lang][k], `${lang}.${k}`);
});
