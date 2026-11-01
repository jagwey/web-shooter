export function inDesktop() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let cached = null;

async function api() {
  if (!inDesktop()) return null;
  if (!cached) {
    const core = await import("@tauri-apps/api/core");
    const event = await import("@tauri-apps/api/event");
    cached = { invoke: core.invoke, listen: event.listen, emitTo: event.emitTo };
  }
  return cached;
}

export async function invoke(command, args) {
  const mod = await api();
  if (!mod) return { unsupported: true };
  return mod.invoke(command, args);
}

const FAST_CHANNEL_NAME = "jagwey-web-shooter-fast-ipc";
const fastBus = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(FAST_CHANNEL_NAME) : null;
const fastListeners = new Map();

if (fastBus) {
  fastBus.onmessage = (event) => {
    const data = event.data;
    if (!data || !data.name) return;
    const handlers = fastListeners.get(data.name);
    if (handlers) {
      for (const fn of handlers) {
        try {
          fn({ payload: data.payload });
        } catch (err) {
          console.error("[fastBus] listener error:", err);
        }
      }
    }
  };
}

export async function listen(name, handler) {
  let lastFastAt = 0;
  const wrappedFast = (ev) => {
    lastFastAt = performance.now();
    handler(ev);
  };
  if (fastBus) {
    let set = fastListeners.get(name);
    if (!set) {
      set = new Set();
      fastListeners.set(name, set);
    }
    set.add(wrappedFast);
  }
  const mod = await api();
  if (!mod) {
    return () => fastListeners.get(name)?.delete(wrappedFast);
  }
  const unlistenTauri = await mod.listen(name, (ev) => {
    if (performance.now() - lastFastAt < 15) return;
    handler(ev);
  });
  return () => {
    fastListeners.get(name)?.delete(wrappedFast);
    unlistenTauri?.();
  };
}

// Returns the pending update (or null). Network/endpoint errors stay silent: no update UI.
// loud: rethrow errors (manual check needs to tell "failed" from "up to date").
export async function checkForUpdate({ loud = false } = {}) {
  if (!inDesktop()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    return await check();
  } catch (error) {
    if (loud) throw error;
    return null;
  }
}

export async function installUpdate(update, onProgress) {
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") total = event.data.contentLength || 0;
    if (event.event === "Progress") done += event.data.chunkLength;
    onProgress(total ? Math.round((done / total) * 100) : null);
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

export async function emitTo(target, name, payload) {
  if (fastBus) {
    fastBus.postMessage({ target, name, payload });
    return;
  }
  const mod = await api();
  if (!mod) return;
  return mod.emitTo(target, name, payload);
}

export async function adjustVolume(delta) {
  return invoke("adjust_volume", { delta });
}

export async function mediaPlayPause() {
  return invoke("media_play_pause");
}

export async function mediaNextTrack() {
  return invoke("media_next_track");
}

export async function showDesktop() {
  return invoke("show_desktop");
}

export async function zoomDesktop(zoomIn) {
  return invoke("zoom_desktop", { zoomIn });
}

export async function scrollWheel(delta) {
  return invoke("scroll_wheel", { delta });
}

