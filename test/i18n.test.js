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
