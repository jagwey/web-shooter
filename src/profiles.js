// Local-only profiles: name, settings snapshot and stats live in this machine's WebView storage.
const KEY = "jagwey-profiles";

const blankStats = () => ({ shots: 0, bestMs: null, sessions: 0 });

export function loadProfiles(storage) {
  try {
    const data = JSON.parse(storage.getItem(KEY) || "null");
    if (data && Array.isArray(data.list) && data.list.length) return data;
  } catch {
    // Corrupt entry: start fresh rather than crash the control window.
  }
  return { activeId: "default", list: [{ id: "default", name: "Oyuncu 1", settings: null, stats: blankStats() }] };
}

export function saveProfiles(storage, data) {
  try {
    storage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: profiles stay in memory for this session.
  }
}

export function activeProfile(data) {
  return data.list.find((p) => p.id === data.activeId) || data.list[0];
}

export function createProfile(data, name, settings) {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const profile = { id, name: String(name || "").trim().slice(0, 32) || `Oyuncu ${data.list.length + 1}`, settings: settings ? structuredClone(settings) : null, stats: blankStats() };
  data.list.push(profile);
  return profile;
}

export function removeProfile(data, id) {
  if (data.list.length <= 1) return false;
  data.list = data.list.filter((p) => p.id !== id);
  if (data.activeId === id) data.activeId = data.list[0].id;
  return true;
}

export function recordShot(profile) {
  profile.stats.shots += 1;
}

export function recordMs(profile, ms) {
  if (!(ms > 0)) return false;
  const rounded = Math.round(ms);
  if (profile.stats.bestMs != null && rounded >= profile.stats.bestMs) return false;
  profile.stats.bestMs = rounded;
  return true;
}
