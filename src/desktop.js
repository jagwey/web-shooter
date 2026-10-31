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

export async function emitTo(target, name, payload) {
  const mod = await api();
  if (!mod) return;
  return mod.emitTo(target, name, payload);
}
