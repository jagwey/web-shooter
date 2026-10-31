import assert from "node:assert/strict";
import test from "node:test";
import { activeProfile, createProfile, loadProfiles, recordMs, recordShot, removeProfile, saveProfiles } from "../src/profiles.js";

const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
};

test("fresh and corrupt storage give one default profile", () => {
  const s = memory();
  assert.equal(loadProfiles(s).list.length, 1);
  s.setItem("jagwey-profiles", "{bad");
  assert.equal(activeProfile(loadProfiles(s)).id, "default");
});

test("profiles round-trip with settings copy and stats", () => {
  const s = memory();
  const data = loadProfiles(s);
  const settings = { theme: "miles" };
  const p = createProfile(data, "  Osman  ", settings);
  settings.theme = "changed";
  recordShot(p);
  recordShot(p);
  assert.equal(recordMs(p, 24.6), true);
  assert.equal(recordMs(p, 30), false);
  assert.equal(recordMs(p, 0), false);
  data.activeId = p.id;
  saveProfiles(s, data);
  const back = activeProfile(loadProfiles(s));
  assert.deepEqual([back.name, back.settings.theme, back.stats.shots, back.stats.bestMs], ["Osman", "miles", 2, 25]);
});

test("last profile cannot be removed; removing active falls back", () => {
  const data = loadProfiles(memory());
  assert.equal(removeProfile(data, "default"), false);
  const p = createProfile(data, "B");
  data.activeId = p.id;
  assert.equal(removeProfile(data, p.id), true);
  assert.equal(data.activeId, "default");
});
