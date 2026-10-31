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

export async function listen(name, handler) {
  const mod = await api();
  if (!mod) return () => {};
  return mod.listen(name, handler);
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
  const mod = await api();
  if (!mod) return;
  return mod.emitTo(target, name, payload);
}
