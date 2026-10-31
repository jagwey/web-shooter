// Local-only profiles: name, settings snapshot and stats live in this machine's WebView storage.
const KEY = "jagwey-profiles";

const blankStats = () => ({ shots: 0, bestMs: null, sessions: 0 });

export function sanitizeProfiles(data) {
  if (!data || !Array.isArray(data.list) || data.list.length === 0) {
    return { activeId: "default", list: [{ id: "default", name: "Oyuncu 1", settings: null, stats: blankStats() }] };
  }
  const list = data.list
    .filter((p) => p && typeof p === "object")
    .map((p, idx) => ({
      id: String(p.id || `p${idx}`),
      name: String(p.name || "").trim().slice(0, 32) || `Oyuncu ${idx + 1}`,
      settings: p.settings && typeof p.settings === "object" ? p.settings : null,
      stats: {
        shots: Number(p.stats?.shots) || 0,
        bestMs: p.stats?.bestMs != null && Number.isFinite(Number(p.stats.bestMs)) ? Number(p.stats.bestMs) : null,
        sessions: Number(p.stats?.sessions) || 0,
      },
    }));
  if (list.length === 0) {
    return { activeId: "default", list: [{ id: "default", name: "Oyuncu 1", settings: null, stats: blankStats() }] };
  }
  const activeId = list.some((p) => p.id === data.activeId) ? data.activeId : list[0].id;
  return { activeId, list };
}

export function loadProfiles(storage) {
  try {
    const data = JSON.parse(storage?.getItem?.(KEY) || "null");
    if (data && Array.isArray(data.list) && data.list.length) return sanitizeProfiles(data);
  } catch {
    // Corrupt entry: start fresh rather than crash the control window.
  }
  return sanitizeProfiles(null);
}

export function saveProfiles(storage, data) {
  try {
    storage?.setItem?.(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: profiles stay in memory for this session.
  }
}

export function activeProfile(data) {
  const found = data.list.find((p) => p.id === data.activeId) || data.list[0];
  if (found && !found.stats) found.stats = blankStats();
  return found;
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
  if (!profile) return;
  profile.stats ||= blankStats();
  profile.stats.shots = (Number(profile.stats.shots) || 0) + 1;
}

export function recordMs(profile, ms) {
  if (!profile || !(ms > 0)) return false;
  profile.stats ||= blankStats();
  const rounded = Math.round(ms);
  if (profile.stats.bestMs != null && rounded >= profile.stats.bestMs) return false;
  profile.stats.bestMs = rounded;
  return true;
}
