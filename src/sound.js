/**
 * Procedural Web Audio FX for Spidey Web Shooter.
 * Zero external assets, 100% offline, zero latency.
 */

let audioCtx = null;
let enabled = true;

function getAudioContext() {
  if (!audioCtx && typeof window !== "undefined") {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function setAudioEnabled(flag) {
  enabled = Boolean(flag);
}

export function isAudioEnabled() {
  return enabled;
}

/** Classic Spider-Man web shoot "THWIP!" */
export function playThwip() {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 1. High frequency white noise burst through sweeping bandpass
  const bufferSize = ctx.sampleRate * 0.12;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 4.5;
  filter.frequency.setValueAtTime(3600, now);
  filter.frequency.exponentialRampToValueAtTime(700, now + 0.11);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.45, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.11);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + 0.12);

  // 2. High-pitch tone pop for authentic mechanical shooter click
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1900, now);
  osc.frequency.exponentialRampToValueAtTime(350, now + 0.08);

  oscGain.gain.setValueAtTime(0.3, now);
  oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.09);
}

/** Web impact / window yank */
export function playImpact() {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);

  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.1);
}

/** Window grab tether ping */
export function playGrab() {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);

  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.07);
}

/** Window fling whoosh */
export function playFling(speed = 30) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = Math.min(0.28, Math.max(0.12, speed * 0.004));

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(400, now);
  filter.frequency.linearRampToValueAtTime(1200, now + duration * 0.4);
  filter.frequency.exponentialRampToValueAtTime(250, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.01, now);
  gain.gain.linearRampToValueAtTime(0.35, now + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + duration + 0.01);
}

/** Satoru Gojo: Hollow Purple (Kūshiki: Murasaki) sound effect */
export function playHollowPurple() {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 1. Blue & Red Clash - Dissonant FM Swept Tone
  const clashOsc = ctx.createOscillator();
  const clashGain = ctx.createGain();
  clashOsc.type = "sawtooth";
  clashOsc.frequency.setValueAtTime(440, now);
  clashOsc.frequency.exponentialRampToValueAtTime(1400, now + 0.15);
  clashOsc.frequency.exponentialRampToValueAtTime(180, now + 0.35);

  clashGain.gain.setValueAtTime(0.01, now);
  clashGain.gain.linearRampToValueAtTime(0.3, now + 0.12);
  clashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  clashOsc.connect(clashGain);
  clashGain.connect(ctx.destination);
  clashOsc.start(now);
  clashOsc.stop(now + 0.42);

  // 2. Sub-bass implosion & gravity shock
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = "sine";
  subOsc.frequency.setValueAtTime(120, now + 0.12);
  subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.45);

  subGain.gain.setValueAtTime(0.01, now);
  subGain.gain.setValueAtTime(0.55, now + 0.14);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

  subOsc.connect(subGain);
  subGain.connect(ctx.destination);
  subOsc.start(now + 0.12);
  subOsc.stop(now + 0.5);

  // 3. Purple Blast Energy Wave (High-resonance noise sweep)
  const duration = 0.4;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 6.0;
  filter.frequency.setValueAtTime(600, now + 0.1);
  filter.frequency.exponentialRampToValueAtTime(3200, now + 0.2);
  filter.frequency.exponentialRampToValueAtTime(250, now + 0.45);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.01, now + 0.1);
  noiseGain.gain.linearRampToValueAtTime(0.4, now + 0.2);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  noise.start(now + 0.1);
  noise.stop(now + 0.5);
}

/** Infinity Shield / Barrier chime */
export function playInfinityShield() {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = "sine";
  osc2.type = "triangle";
  osc1.frequency.setValueAtTime(528, now);
  osc2.frequency.setValueAtTime(792, now);

  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.38);
  osc2.stop(now + 0.38);
}
