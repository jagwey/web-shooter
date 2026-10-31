/**
 * Local model advisor: asks for GPU / VRAM / RAM and recommends an Ollama model.
 * Runs fully offline so it works before any AI provider is set up.
 */

import { fold } from "./guide.js";

// Desktop VRAM for common cards; laptop variants differ, so typed "X GB" always wins.
const GPU_VRAM = [
  [/rtx\s*5090/, 32], [/rtx\s*5080/, 16], [/rtx\s*5070\s*ti/, 16], [/rtx\s*5070/, 12], [/rtx\s*5060/, 8],
  [/rtx\s*4090/, 24], [/rtx\s*4080/, 16], [/rtx\s*4070/, 12], [/rtx\s*4060\s*ti/, 8], [/rtx\s*4060/, 8],
  [/rtx\s*3090/, 24], [/rtx\s*3080/, 10], [/rtx\s*3070/, 8], [/rtx\s*3060\s*ti/, 8], [/rtx\s*3060/, 12], [/rtx\s*3050/, 8],
  [/rtx\s*20[78]0/, 8], [/rtx\s*2060/, 6], [/gtx\s*1660/, 6], [/gtx\s*1650/, 4], [/gtx\s*10[78]0/, 8], [/gtx\s*1060/, 6], [/gtx\s*1050/, 2],
  [/rx\s*79[05]0/, 20], [/rx\s*7800/, 16], [/rx\s*7700/, 12], [/rx\s*7600/, 8],
  [/rx\s*6[89]\d0/, 16], [/rx\s*67\d0/, 12], [/rx\s*66\d0/, 8], [/rx\s*5[78]0/, 8],
  [/arc\s*a770/, 16], [/arc\s*a750/, 8],
];

// Integrated graphics share system RAM; treat as no dedicated VRAM.
const INTEGRATED = /intel.*(uhd|iris|hd graphics)|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/;

let awaitingSpecs = false;

export function detectGpu() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "";
    // "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x2504) Direct3D11 ...)" -> "NVIDIA GeForce RTX 3060"
    const m = /ANGLE \([^,]+,\s*([^(,]+)/.exec(raw);
    return (m ? m[1] : raw).trim();
  } catch {
    return "";
  }
}

export function isModelQuestion(message) {
  const t = fold(message);
  const what = "(model|yapay zeka|\\bai\\b|llm|ollama)";
  const ask = "(hangi|en iyi|mantikli|oner|tavsiye|kurayim|kursam|secmeli)";
  return new RegExp(`${ask}.{0,30}${what}|${what}.{0,30}${ask}`).test(t);
}

export function parseSpecs(message, gpuName = "") {
  const t = fold(message);
  const gpu = fold(gpuName);
  let vram = num(/(\d+)\s*gb\s*(vram|ekran|gpu)/, t) ?? num(/(vram|ekran karti?|gpu)\D{0,12}(\d+)\s*gb/, t, 2);
  let ram = num(/(\d+)\s*gb\s*(ram|bellek|hafiza)/, t) ?? num(/(ram|bellek)\D{0,6}(\d+)/, t, 2);

  const tableVram = GPU_VRAM.find(([re]) => re.test(t) || re.test(gpu))?.[1] ?? null;
  const integrated = INTEGRATED.test(t) || (INTEGRATED.test(gpu) && tableVram === null);

  // Unlabeled "12 gb ... 16 gb": VRAM is almost always the smaller one.
  const loose = [...t.matchAll(/(\d+)\s*gb/g)].map((m) => Number(m[1]));
  if (vram === null && ram === null && loose.length >= 2) {
    vram = Math.min(...loose);
    ram = Math.max(...loose);
  } else if (loose.length === 1 && vram === null && ram === null) {
    if (tableVram !== null || integrated) ram = loose[0];
    else vram = loose[0];
  }

  if (vram === null) vram = integrated ? 0 : tableVram;
  return { vram, ram, integrated };
}

function num(re, text, group = 1) {
  const m = re.exec(text);
  return m ? Number(m[group]) : null;
}

export function recommendModel({ vram, ram }) {
  const r = ram ?? 8;
  let pick;
  if (vram >= 20) pick = ["gemma3:27b", "17 GB", "En güçlü yerel seçenek; uzun ve akıllı cevaplar.", "gemma3:12b"];
  else if (vram >= 12) pick = ["gemma3:12b", "8 GB", "Kalite/hız dengesi çok iyi.", "qwen2.5:7b"];
  else if (vram >= 8) pick = ["qwen2.5:7b", "4.7 GB", "Türkçesi iyi, hızlı.", "llama3.2:3b"];
  else if (vram >= 4) pick = ["llama3.2:3b", "2 GB", "Kartına tam sığar, akıcı çalışır.", "qwen2.5:1.5b"];
  else if (r >= 16) pick = ["llama3.2:3b", "2 GB", "Ekran kartı yetersiz; işlemcide (CPU) çalışır, cevaplar biraz yavaş gelir.", "qwen2.5:1.5b"];
  else pick = ["qwen2.5:1.5b", "1 GB", "Zayıf sistem için en hafif seçenek; CPU'da çalışır.", "gemma3:1b"];

  const [model, size, why, lighter] = pick;
  const specs = `VRAM: ${vram ? `${vram} GB` : "yok/paylaşımlı"} · RAM: ${ram ? `${ram} GB` : "bilinmiyor"}`;
  const ramWarn = r < 8 ? "\n⚠️ RAM 8 GB altı: modeli açarken diğer programları kapat." : "";
  return `🧠 Sistemine göre önerim (${specs}):

✅ ${model}  (≈${size})
${why}

Kurulum:
1. ollama.com → Windows sürümünü kur.
2. Terminal: ollama pull ${model}
3. "⚙️ Model & Sağlayıcı Ayarları" → "Yerel Ollama" → "Modelleri Getir" → ${model} seç.

Takılırsa / kamera kasarsa daha hafifi: ollama pull ${lighter}
(El izleme de GPU kullanır; FPS düşerse hafif modele geç.)${ramWarn}`;
}

// Returns a reply, or null when the message is not for the advisor.
export function adviseModel(message) {
  const gpuName = detectGpu();
  const wasWaiting = awaitingSpecs;
  awaitingSpecs = false;
  if (!wasWaiting && !isModelQuestion(message)) return null;

  const specs = parseSpecs(message, gpuName);
  if (wasWaiting || (specs.vram !== null && specs.ram !== null)) {
    // A follow-up with no numbers at all is a new topic, not an answer.
    if (wasWaiting && specs.vram === null && specs.ram === null && !isModelQuestion(message)) return null;
    if (specs.vram === null) specs.vram = 0;
    return recommendModel(specs);
  }

  awaitingSpecs = true;
  const seen = gpuName ? `Algıladığım ekran kartı: ${gpuName}${specs.vram !== null ? ` (~${specs.vram} GB VRAM)` : ""}.` : "Ekran kartını algılayamadım.";
  return `🧠 Sana en uygun yerel modeli seçeyim. ${seen}

Şunları yaz:
• Ekran kartın ve VRAM'i (örn. "RTX 3060 12 GB")
• RAM miktarın (örn. "16 GB RAM")

Bilmiyorsan: Ctrl+Shift+Esc → Görev Yöneticisi → Performans.
  - GPU sekmesi → "Ayrılmış GPU belleği" = VRAM
  - Bellek sekmesi → toplam = RAM`;
}
