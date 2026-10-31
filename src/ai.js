/**
 * AI Assistant Module for Jagwey Web Shooter.
 * Supports:
 * 1. Google Gemini API (gemini-2.5-flash / gemini-1.5-flash) via user API key.
 * 2. Local LLM via Ollama / LM Studio (http://localhost:11434).
 * 3. OpenAI-compatible / Custom endpoint.
 *
 * Provides Smart Window Layout Auto-Tiling and Natural Language Assistance.
 */

import { invoke } from "./desktop.js";

export async function testAiConnection(settings) {
  const provider = settings.aiProvider || "none";
  if (provider === "none") {
    return { ok: false, message: "AI kapalı / Disabled" };
  }

  const startTime = performance.now();

  try {
    if (provider === "gemini") {
      const key = settings.aiApiKey?.trim();
      if (!key) return { ok: false, message: "Gemini API key gerekli / Key required" };
      const model = settings.aiModel?.trim() || "gemini-2.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Say 'READY' in one word." }] }],
          generationConfig: { maxOutputTokens: 5, temperature: 0.1 },
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const latency = Math.round(performance.now() - startTime);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "OK";
      return { ok: true, latency, message: `Gemini aktif (${latency}ms) · ${text}` };
    }

    if (provider === "ollama") {
      const endpoint = (settings.aiEndpoint?.trim() || "http://localhost:11434").replace(/\/$/, "");
      const res = await fetch(`${endpoint}/api/tags`, { method: "GET" });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = await res.json();
      const latency = Math.round(performance.now() - startTime);
      const modelCount = data.models?.length || 0;
      return {
        ok: true,
        latency,
        message: `Ollama bağlı (${latency}ms) · ${modelCount} model yüklü`,
      };
    }

    if (provider === "custom") {
      const endpoint = (settings.aiEndpoint?.trim() || "http://localhost:11434/v1").replace(/\/$/, "");
      const headers = { "Content-Type": "application/json" };
      if (settings.aiApiKey?.trim()) {
        headers.Authorization = `Bearer ${settings.aiApiKey.trim()}`;
      }
      const res = await fetch(`${endpoint}/models`, { method: "GET", headers });
      if (!res.ok) throw new Error(`Custom API HTTP ${res.status}`);
      const latency = Math.round(performance.now() - startTime);
      return { ok: true, latency, message: `API Bağlantısı başarılı (${latency}ms)` };
    }

    return { ok: false, message: "Bilinmeyen sağlayıcı / Unknown provider" };
  } catch (error) {
    return { ok: false, message: `Hata: ${error.message}` };
  }
}

/**
 * Smart Workspace Auto-Tiler:
 * Uses AI if configured, otherwise falls back to optimal golden-ratio desktop auto-tiling.
 */
export async function autoTileWorkspace(settings, windows, monitors) {
  if (!windows || windows.length === 0) return { count: 0, message: "Pencere bulunamadı" };

  const primaryMon = monitors?.find((m) => m.primary) || monitors?.[0] || {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  };

  // If AI is enabled and connected, ask AI for semantic layout arrangement
  if (settings.aiProvider && settings.aiProvider !== "none") {
    try {
      const layout = await queryAiLayout(settings, windows, primaryMon);
      if (layout && layout.length > 0) {
        for (const item of layout) {
          if (item.hwnd && item.x !== undefined && item.y !== undefined) {
            await invoke("move_window", { hwnd: item.hwnd, x: Math.round(item.x), y: Math.round(item.y) });
          }
        }
        return { count: layout.length, message: `AI ile ${layout.length} pencere akıllıca hizalandı.` };
      }
    } catch {
      // Fallback cleanly to heuristic tiling
    }
  }

  // Heuristic Grid / Split Tiling:
  const n = Math.min(windows.length, 6);
  const margin = 20;
  const usableWidth = primaryMon.width - margin * 2;
  const usableHeight = primaryMon.height - margin * 2 - 40; // taskbar space

  if (n === 1) {
    await invoke("move_window", {
      hwnd: windows[0].hwnd,
      x: primaryMon.x + margin + 100,
      y: primaryMon.y + margin + 50,
    });
  } else if (n === 2) {
    const halfW = Math.floor(usableWidth / 2);
    await invoke("move_window", {
      hwnd: windows[0].hwnd,
      x: primaryMon.x + margin,
      y: primaryMon.y + margin,
    });
    await invoke("move_window", {
      hwnd: windows[1].hwnd,
      x: primaryMon.x + margin + halfW,
      y: primaryMon.y + margin,
    });
  } else {
    // 3 or more: 1 major window on left, stacked on right
    const leftW = Math.floor(usableWidth * 0.55);
    const rightW = usableWidth - leftW;
    await invoke("move_window", {
      hwnd: windows[0].hwnd,
      x: primaryMon.x + margin,
      y: primaryMon.y + margin,
    });

    const stackCount = n - 1;
    const stackH = Math.floor(usableHeight / stackCount);
    for (let i = 1; i < n; i += 1) {
      await invoke("move_window", {
        hwnd: windows[i].hwnd,
        x: primaryMon.x + margin + leftW,
        y: primaryMon.y + margin + (i - 1) * stackH,
      });
    }
  }

  return { count: n, message: `${n} pencere ekrana otomatik yerleştirildi.` };
}

async function queryAiLayout(settings, windows, monitor) {
  const windowList = windows.slice(0, 5).map((w) => ({ hwnd: w.hwnd, title: w.title.slice(0, 40) }));
  const prompt = `You are a desktop window layout manager.
Monitor size: width=${monitor.width}, height=${monitor.height}.
Windows: ${JSON.stringify(windowList)}.
Arrange them neatly so they don't overlap. Return ONLY a valid JSON array: [{"hwnd": number, "x": number, "y": number}].`;

  if (settings.aiProvider === "gemini") {
    const key = settings.aiApiKey?.trim();
    const model = settings.aiModel?.trim() || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  }

  if (settings.aiProvider === "ollama") {
    const endpoint = (settings.aiEndpoint?.trim() || "http://localhost:11434").replace(/\/$/, "");
    const model = settings.aiModel?.trim() || "llama3.2";
    const res = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false, format: "json" }),
    });
    const data = await res.json();
    return JSON.parse(data.response);
  }

  return null;
}
