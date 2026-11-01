import { shiftPinned } from "./target.js";

/**
 * Cinematic web strand, impact web, particles, muzzle flash, and shockwave.
 * Motion is adapted from SpiderSense by Rittika Das (MIT).
 * https://github.com/rittika-das/SpiderSense
 *
 * Speeds are scaled by frame time so the shot feels the same at 30fps and 60fps.
 * Upstream advanced once per MediaPipe result (~33ms).
 */

const FRAME_MS = 33;

export const FX_PRESETS = ["classic", "mint", "neon", "low"];

export const LOOKS = {
  spiderman: {
    quality: "full",
    trail: [255, 60, 60],
    glow: "#ff3b3b",
    beam: [255, 85, 85],
    fiber: [130, 190, 255],
    head: "#ffffff",
    fine: [255, 120, 120],
    particle: [255, 220, 220],
    thickness: 3.2,
    particleStyle: "webs",
  },
  miles: {
    quality: "full",
    trail: [255, 30, 80],
    glow: "#ff0055",
    beam: [255, 215, 0],
    fiber: [255, 80, 120],
    head: "#ffd700",
    fine: [255, 200, 50],
    particle: [255, 225, 90],
    thickness: 3.4,
    particleStyle: "sparks",
  },
  symbiote: {
    quality: "full",
    trail: [147, 51, 234],
    glow: "#c084fc",
    beam: [168, 85, 247],
    fiber: [216, 180, 254],
    head: "#d8b4fe",
    fine: [192, 132, 252],
    particle: [243, 232, 255],
    thickness: 4.0,
    particleStyle: "purple",
  },
  classic: {
    quality: "full",
    trail: [160, 220, 255],
    glow: "#dfffff",
    beam: [120, 220, 255],
    fiber: [210, 245, 255],
    head: "#00d9ff",
    fine: [190, 240, 255],
    particle: [220, 250, 255],
    thickness: 3.0,
    particleStyle: "webs",
  },
  mint: {
    quality: "full",
    trail: [176, 245, 210],
    glow: "#d8ffe9",
    beam: [156, 240, 196],
    fiber: [210, 255, 230],
    head: "#9cf0c4",
    fine: [180, 245, 210],
    particle: [220, 255, 236],
    thickness: 3.0,
    particleStyle: "stardust",
  },
  neon: {
    quality: "full",
    trail: [255, 79, 216],
    glow: "#ff4dff",
    beam: [124, 255, 107],
    fiber: [255, 230, 90],
    head: "#7cff6b",
    fine: [255, 80, 220],
    particle: [210, 255, 140],
    thickness: 3.2,
    particleStyle: "sparks",
  },
  gojo: {
    quality: "full",
    trail: [168, 85, 247],
    glow: "#a855f7",
    beam: [59, 130, 246],
    fiber: [239, 68, 68],
    head: "#c084fc",
    fine: [192, 132, 252],
    particle: [243, 232, 255],
    thickness: 3.4,
    particleStyle: "purple",
  },
  sakura: {
    quality: "full",
    trail: [244, 114, 182],
    glow: "#f472b6",
    beam: [251, 113, 133],
    fiber: [255, 228, 230],
    head: "#fb7185",
    fine: [244, 114, 182],
    particle: [255, 210, 225],
    thickness: 2.8,
    particleStyle: "sakura",
  },
  clean: {
    quality: "full",
    trail: [56, 189, 248],
    glow: "#38bdf8",
    beam: [125, 211, 252],
    fiber: [248, 250, 252],
    head: "#e0f2fe",
    fine: [56, 189, 248],
    particle: [248, 250, 252],
    thickness: 2.6,
    particleStyle: "stardust",
  },
  midnight: {
    quality: "full",
    trail: [34, 211, 238],
    glow: "#22d3ee",
    beam: [6, 182, 212],
    fiber: [165, 243, 252],
    head: "#a5f3fc",
    fine: [34, 211, 238],
    particle: [207, 250, 254],
    thickness: 3.0,
    particleStyle: "stardust",
  },
  sage: {
    quality: "full",
    trail: [110, 231, 183],
    glow: "#6ee7b7",
    beam: [52, 211, 153],
    fiber: [209, 250, 229],
    head: "#a7f3d0",
    fine: [110, 231, 183],
    particle: [236, 253, 245],
    thickness: 3.0,
    particleStyle: "stardust",
  },
  low: {
    quality: "low",
    trail: [176, 245, 210],
    glow: "#d8ffe9",
    beam: [156, 240, 196],
    fiber: [210, 255, 230],
    head: "#9cf0c4",
    fine: [180, 245, 210],
    particle: [220, 255, 236],
  },
  custom: {
    quality: "full",
    trail: [0, 245, 255],
    glow: "#00f5ff",
    beam: [0, 245, 255],
    fiber: [255, 255, 255],
    head: "#ffffff",
    fine: [0, 245, 255],
    particle: [255, 255, 255],
    thickness: 3,
    particleStyle: "sparks",
  },
};
LOOKS.light = LOOKS.low;

export function registerCustomLook(custom) {
  if (!custom) return;
  const parseHex = (hex, def) => {
    if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return def;
    const clean = hex.replace("#", "");
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16),
      ];
    }
    if (clean.length >= 6) {
      return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
      ];
    }
    return def;
  };

  const primaryRgb = parseHex(custom.primary, [0, 245, 255]);
  const glowHex = custom.glow || "#00f5ff";
  const particleRgb = parseHex(custom.particle, [255, 255, 255]);

  LOOKS.custom = {
    quality: "full",
    trail: primaryRgb,
    glow: glowHex,
    beam: primaryRgb,
    fiber: particleRgb,
    head: glowHex,
    fine: primaryRgb,
    particle: particleRgb,
    thickness: Number(custom.thickness) || 3,
    particleStyle: custom.style || "sparks",
  };
}

function stepOf(dt) {
  return Math.min(dt, 50) / FRAME_MS;
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

// One sag shape for the flying strand and the held tether, so the handoff between them is seamless.
export function strandControl(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy) || 1;
  const sag = Math.min(dist * 0.04, 25);
  return {
    cx: (x0 + x1) / 2 + (-dy / dist) * (sag * 0.4),
    cy: (y0 + y1) / 2 + Math.abs((dx / dist) * sag) + 4,
  };
}

// Quadratic bezier cut at t (de Casteljau): the drawn prefix lies exactly on the full curve.
export function curvePrefix(x0, y0, cx, cy, x1, y1, t) {
  const ax = x0 + (cx - x0) * t;
  const ay = y0 + (cy - y0) * t;
  const bx = cx + (x1 - cx) * t;
  const by = cy + (y1 - cy) * t;
  return { cx: ax, cy: ay, x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

export function createWebFx(ctx, hooks = {}) {
  const canvas = ctx.canvas;
  let look = LOOKS.mint;
  let activeWeb = null;
  let webImpact = null;
  let webParticles = [];
  let muzzleFlash = null;
  let shockwave = null;
  let activePurples = [];
  let activeShields = [];
  let lastDraw = performance.now();
  let tethered = false;

  function setPreset(name) {
    const key = name === "light" ? "low" : name;
    look = LOOKS[key] || LOOKS.spiderman || LOOKS.mint;
  }

  function full() {
    return look.quality !== "low";
  }

  function landWeb(web) {
    webImpact = {
      x: web.targetX,
      y: web.targetY,
      rect: web.rect,
      hwnd: web.hwnd ?? null,
      life: 1,
      maxRadius: web.rect ? Math.hypot(web.rect.w, web.rect.h) : 320,
    };
    spawnParticles(web.targetX, web.targetY, full() ? 70 : 12);
    shockwave = { x: web.targetX, y: web.targetY, radius: 12, life: 1 };
    muzzleFlash = { x: web.targetX, y: web.targetY, life: 1 };
  }

  function shiftLive(pin, rect) {
    if (!pin) return pin;
    const shifted = shiftPinned(pin, rect);
    if (pin.targetX != null && pin.rect) {
      const dx = rect.x - pin.rect.x;
      const dy = rect.y - pin.rect.y;
      shifted.targetX = pin.targetX + dx;
      shifted.targetY = pin.targetY + dy;
    }
    return shifted;
  }

  // Slide the in-flight strand and the splash with the window they hit. Other hwnds are ignored.
  function follow(rect, hwnd = null) {
    if (!rect) return;
    if (activeWeb && (hwnd == null || activeWeb.hwnd == null || activeWeb.hwnd === hwnd)) {
      activeWeb = shiftLive(activeWeb, rect);
    }
    if (webImpact && (hwnd == null || webImpact.hwnd == null || webImpact.hwnd === hwnd)) {
      webImpact = shiftLive(webImpact, rect);
    }
  }

  function pin() {
    if (webImpact) return { x: webImpact.x, y: webImpact.y, rect: webImpact.rect, hwnd: webImpact.hwnd };
    if (activeWeb) return { x: activeWeb.targetX, y: activeWeb.targetY, rect: activeWeb.rect, hwnd: activeWeb.hwnd };
    return null;
  }

  // rect = target window in canvas px. The strand flies from the hand to the client center, then sticks inside that rect.
  function shoot(x, y, rect = null, hwnd = null) {
    const targetX = rect ? rect.x + rect.w / 2 : x;
    const targetY = rect ? rect.y + rect.h / 2 : y;
    activeWeb = {
      startX: x,
      startY: y,
      targetX,
      targetY,
      progress: 0,
      age: 0,
      opacity: 1,
      rect,
      hwnd,
      landed: false,
    };
    webImpact = null;
    muzzleFlash = { x, y, life: 1 };
    hooks.onImpact?.(x, y);
    if (Math.hypot(targetX - x, targetY - y) < 24) {
      activeWeb.landed = true;
      landWeb(activeWeb);
    }
  }

  function triggerPurple(x, y) {
    activePurples.push({
      x,
      y,
      progress: 0,
      sparkAngle: 0,
    });
    spawnParticles(x, y, full() ? 24 : 8);
  }

  function triggerShield(x, y, title = "Hassas Pencere", duration = 2400) {
    activeShields.push({
      x,
      y,
      title,
      duration,
      start: performance.now(),
      pulse: 0,
    });
  }

  function webTarget(x) {
    return {
      x: x < canvas.width / 2 ? canvas.width : 0,
      y: 0,
    };
  }

  function spawnParticles(x, y, amount) {
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 7;
      webParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 1 + Math.random() * 3,
      });
    }
    const cap = full() ? 140 : 40;
    if (webParticles.length > cap) {
      webParticles = webParticles.slice(webParticles.length - cap);
    }
  }

  function hasWork() {
    return Boolean(
      activeWeb ||
        webImpact ||
        muzzleFlash ||
        shockwave ||
        webParticles.length ||
        activePurples.length ||
        activeShields.length,
    );
  }

  function draw(now = performance.now()) {
    const dt = now - lastDraw;
    lastDraw = now;
    const step = stepOf(dt);
    drawActiveWeb(step);
    drawImpact(step);
    drawParticles(step);
    drawMuzzleFlash(step);
    drawShockwave(step);
    drawPurples(step);
    drawShields(now, step);
  }

  function drawActiveWeb(step) {
    if (!activeWeb) return;
    const web = activeWeb;
    web.progress += 0.075 * step;
    web.age += step * FRAME_MS;
    const progress = Math.min(web.progress, 1);
    if (progress >= 1 && !web.landed) {
      web.landed = true;
      landWeb(web);
    }
    if (web.age > 1150) {
      web.opacity -= 0.025 * step;
    }
    if (web.opacity <= 0) {
      activeWeb = null;
      return;
    }
    // A held web is drawn by the overlay tether from here on; drawing both shows two strands.
    if (web.landed && tethered) return;

    const dx = web.targetX - web.startX;
    const dy = web.targetY - web.startY;
    const distance = Math.hypot(dx, dy) || 1;
    const perpX = -dy / distance;
    const perpY = dx / distance;
    const whole = strandControl(web.startX, web.startY, web.targetX, web.targetY);
    const head = curvePrefix(web.startX, web.startY, whole.cx, whole.cy, web.targetX, web.targetY, progress);
    const controlX = head.cx;
    const controlY = head.cy;
    const currentX = head.x;
    const currentY = head.y;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = web.opacity;

    if (full()) {
      for (let trail = 5; trail >= 1; trail -= 1) {
        const cut = curvePrefix(web.startX, web.startY, whole.cx, whole.cy, web.targetX, web.targetY, Math.max(0, progress - trail * 0.025));
        strokeCurve(web.startX, web.startY, cut.cx, cut.cy, cut.x, cut.y, rgba(look.trail, 0.05 * trail), 2 + trail);
      }
    }

    const scaleW = Math.max(0.4, (look.thickness || 3) / 3);
    ctx.shadowColor = look.glow;
    ctx.shadowBlur = full() ? 16 : 0;
    strokeCurve(
      web.startX,
      web.startY,
      controlX,
      controlY,
      currentX,
      currentY,
      rgba(look.beam, 0.55),
      (full() ? 16 : 8) * scaleW,
    );

    ctx.shadowBlur = 0;
    strokeCurve(web.startX, web.startY, controlX, controlY, currentX, currentY, "rgba(8, 10, 18, 0.8)", (full() ? 8 : 4) * scaleW);
    strokeCurve(web.startX, web.startY, controlX, controlY, currentX, currentY, "rgba(255, 255, 255, 0.98)", (full() ? 3.2 : 1.8) * scaleW);

    const fiberCount = full() ? 7 : 0;
    for (let i = 0; i < fiberCount; i += 1) {
      const offset = (i - 3) * 3;
      strokeCurve(
        web.startX + perpX * offset,
        web.startY + perpY * offset,
        controlX + perpX * offset,
        controlY + perpY * offset,
        currentX + perpX * offset,
        currentY + perpY * offset,
        rgba(look.fiber, 0.35),
        0.8,
      );
    }

    ctx.beginPath();
    ctx.arc(currentX, currentY, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = look.head;
    ctx.shadowBlur = full() ? 25 : 0;
    ctx.fill();
    ctx.restore();
  }

  // Live hand point for the strand's root, so a flying web leaves from where the hand is now.
  function anchor(x, y, held) {
    tethered = held;
    if (activeWeb && held) {
      activeWeb.startX = x;
      activeWeb.startY = y;
    }
  }

  function flying() {
    return Boolean(activeWeb && !activeWeb.landed);
  }

  function strokeCurve(x0, y0, cx, cy, x1, y1, style, width) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function drawImpact(step) {
    if (!webImpact) return;
    const impact = webImpact;
    impact.life -= 0.012 * step;
    if (impact.life <= 0) {
      webImpact = null;
      return;
    }

    const progress = 1 - impact.life;
    // Fast spread (first ~25% of life), then hold and fade.
    const radius = impact.maxRadius * Math.min(1, Math.pow(progress * 4, 0.6));
    const spokes = full() ? 16 : 10;
    const fade = Math.min(1, impact.life * 2.5);

    ctx.save();
    if (impact.rect) {
      ctx.beginPath();
      ctx.rect(impact.rect.x, impact.rect.y, impact.rect.w, impact.rect.h);
      ctx.clip();
    }
    ctx.shadowBlur = 0;
    ctx.lineCap = "round";

    if (progress < 0.22) {
      const flash = 1 - progress / 0.22;
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, 22 + (1 - flash) * 70, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.62 * flash})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, 10 + (1 - flash) * 28, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 246, 214, ${0.9 * flash})`;
      ctx.fill();
    }

    for (let i = 0; i < spokes; i += 1) {
      const angle = (Math.PI * 2 * i) / spokes;
      const endX = impact.x + Math.cos(angle) * radius;
      const endY = impact.y + Math.sin(angle) * radius;
      const bend = radius * 0.05;
      const controlX = impact.x + Math.cos(angle + Math.PI / 2) * bend;
      const controlY = impact.y + Math.sin(angle + Math.PI / 2) * bend;
      ctx.beginPath();
      ctx.moveTo(impact.x, impact.y);
      ctx.quadraticCurveTo(controlX, controlY, endX, endY);
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.55 * fade})`;
      ctx.lineWidth = full() ? 5.5 : 3;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * fade})`;
      ctx.lineWidth = full() ? 2.4 : 1.3;
      ctx.stroke();
    }

    const rings = 8;
    for (let r = 1; r <= rings; r += 1) {
      const ringRadius = radius * (r / rings);
      ctx.beginPath();
      for (let i = 0; i <= spokes; i += 1) {
        const angle = (Math.PI * 2 * i) / spokes;
        const x = impact.x + Math.cos(angle) * ringRadius;
        const y = impact.y + Math.sin(angle) * ringRadius;
        if (i === 0) {
          ctx.moveTo(x, y);
          continue;
        }
        const previousAngle = (Math.PI * 2 * (i - 1)) / spokes;
        const middleAngle = (previousAngle + angle) / 2;
        const sag = ringRadius * (0.14 + r * 0.012);
        const controlRadius = ringRadius - sag;
        const controlX = impact.x + Math.cos(middleAngle) * controlRadius;
        const controlY = impact.y + Math.sin(middleAngle) * controlRadius;
        ctx.quadraticCurveTo(controlX, controlY, x, y);
      }
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.88 * fade})`;
      ctx.lineWidth = full() ? 1.7 : 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawParticles(step) {
    if (webParticles.length === 0) return;
    const style = look.particleStyle || "sparks";
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = webParticles.length - 1; i >= 0; i -= 1) {
      const particle = webParticles[i];
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      if (style === "fire") {
        particle.vy -= 0.14 * step; // upward ember buoyancy
      } else if (style === "sakura") {
        particle.vy += 0.05 * step; // gentle petal drift
        particle.vx += Math.sin(particle.life * 10) * 0.08 * step;
      }
      particle.vx *= Math.pow(0.97, step);
      particle.vy *= Math.pow(0.97, step);
      particle.life -= 0.025 * step;
      if (particle.life <= 0) {
        webParticles.splice(i, 1);
        continue;
      }
      ctx.fillStyle = rgba(look.particle, particle.life);
      ctx.strokeStyle = rgba(look.particle, particle.life);
      ctx.shadowColor = look.glow;
      ctx.shadowBlur = full() ? 6 : 0;

      if (style === "sparks") {
        // Electric spark streak
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 2.4, particle.y - particle.vy * 2.4);
        ctx.lineWidth = Math.max(1, particle.size * 0.75);
        ctx.stroke();
      } else if (style === "stardust") {
        // 4-point twinkling star diamond
        const r = particle.size * (0.8 + 0.5 * Math.sin(particle.life * 18));
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y - r * 1.6);
        ctx.lineTo(particle.x + r * 0.5, particle.y - r * 0.5);
        ctx.lineTo(particle.x + r * 1.6, particle.y);
        ctx.lineTo(particle.x + r * 0.5, particle.y + r * 0.5);
        ctx.lineTo(particle.x, particle.y + r * 1.6);
        ctx.lineTo(particle.x - r * 0.5, particle.y + r * 0.5);
        ctx.lineTo(particle.x - r * 1.6, particle.y);
        ctx.lineTo(particle.x - r * 0.5, particle.y - r * 0.5);
        ctx.closePath();
        ctx.fill();
      } else if (style === "sakura") {
        // Soft cherry-blossom oval petal
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 1.25, 0, Math.PI * 2);
        ctx.fill();
      } else if (style === "purple") {
        // Void orb: dark core with glowing violet rim
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(18, 6, 34, ${particle.life * 0.9})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Default / webs / fire glowing ember
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawMuzzleFlash(step) {
    if (!muzzleFlash) return;
    muzzleFlash.life -= 0.08 * step;
    if (muzzleFlash.life <= 0) {
      muzzleFlash = null;
      return;
    }
    const radius = 8 + (1 - muzzleFlash.life) * 35;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.arc(muzzleFlash.x, muzzleFlash.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${muzzleFlash.life * 0.6})`;
    ctx.shadowColor = look.head;
    ctx.shadowBlur = full() ? 25 : 0;
    ctx.fill();
    ctx.restore();
  }

  function drawShockwave(step) {
    if (!shockwave) return;
    shockwave.radius += 8 * step;
    shockwave.life -= 0.045 * step;
    if (shockwave.life <= 0) {
      shockwave = null;
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.arc(shockwave.x, shockwave.y, shockwave.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${shockwave.life})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = look.head;
    ctx.shadowBlur = full() ? 15 : 0;
    ctx.stroke();
    ctx.restore();
  }

  function drawPurples(step) {
    if (activePurples.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = activePurples.length - 1; i >= 0; i -= 1) {
      const p = activePurples[i];
      p.progress += 0.025 * step;
      p.sparkAngle += 0.22 * step;

      const { x, y, progress, sparkAngle } = p;

      if (progress < 0.35) {
        // Phase 1: Blue (Lapse) & Red (Reversal) Convergence swirl
        const phase1Norm = progress / 0.35;
        const orbitRadius = Math.max(10, (1 - phase1Norm) * 75 + 12);
        const blueAngle = sparkAngle * 1.5;
        const redAngle = blueAngle + Math.PI;

        const bx = x + Math.cos(blueAngle) * orbitRadius;
        const by = y + Math.sin(blueAngle) * orbitRadius;
        const rx = x + Math.cos(redAngle) * orbitRadius;
        const ry = y + Math.sin(redAngle) * orbitRadius;

        // Blue Orb (Ao)
        ctx.shadowColor = "#3b82f6";
        ctx.shadowBlur = full() ? 30 : 10;
        ctx.beginPath();
        ctx.arc(bx, by, 9 + phase1Norm * 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59, 130, 246, 0.95)";
        ctx.fill();

        // Red Orb (Aka)
        ctx.shadowColor = "#ef4444";
        ctx.beginPath();
        ctx.arc(rx, ry, 9 + phase1Norm * 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
        ctx.fill();

        // Energy arc between orbs
        ctx.shadowColor = "#c084fc";
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20, rx, ry);
        ctx.strokeStyle = "rgba(216, 180, 254, 0.85)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (progress < 0.72) {
        // Phase 2: Singularity Fusion - Hollow Purple Core
        const phase2Norm = (progress - 0.35) / 0.37;
        const coreRadius = 18 + Math.sin(phase2Norm * Math.PI) * 42;

        // Concentric distortion rings
        for (let r = 1; r <= 3; r += 1) {
          const ringR = coreRadius * (0.8 + r * 0.4);
          ctx.beginPath();
          ctx.arc(x, y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(168, 85, 247, ${((1 - phase2Norm) * 0.7) / r})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Void core
        ctx.shadowColor = "#a855f7";
        ctx.shadowBlur = full() ? 50 : 20;
        ctx.beginPath();
        ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(147, 51, 234, 0.95)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, coreRadius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(20, 8, 38, 0.98)";
        ctx.fill();

        // Electric lightning sparks
        for (let s = 0; s < 6; s += 1) {
          const sa = (Math.PI * 2 * s) / 6 + sparkAngle;
          const sx = x + Math.cos(sa) * (coreRadius * 1.5);
          const sy = y + Math.sin(sa) * (coreRadius * 1.5);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = "rgba(235, 215, 255, 0.9)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else {
        // Phase 3: Murasaki Blast Wave & Dissipation
        const phase3Norm = (progress - 0.72) / 0.28;
        const blastRadius = 50 + phase3Norm * 280;
        const fade = 1 - phase3Norm;

        ctx.shadowColor = "#c084fc";
        ctx.shadowBlur = full() ? 40 : 15;
        ctx.beginPath();
        ctx.arc(x, y, blastRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(168, 85, 247, ${fade * 0.85})`;
        ctx.lineWidth = 5 * fade;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, blastRadius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(216, 180, 254, ${fade * 0.2})`;
        ctx.fill();
      }

      if (p.progress >= 1.0) {
        activePurples.splice(i, 1);
      }
    }
    ctx.restore();
  }

  function drawShields(now, step) {
    if (activeShields.length === 0) return;
    ctx.save();

    for (let i = activeShields.length - 1; i >= 0; i -= 1) {
      const s = activeShields[i];
      const elapsed = now - s.start;
      const progress = Math.min(elapsed / s.duration, 1);
      const remainingRatio = 1 - progress;
      s.pulse += 0.08 * step;

      const { x, y } = s;
      const hexR = 75 + Math.sin(s.pulse) * 4;

      // Hexagonal Barrier
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = full() ? 25 : 8;

      ctx.beginPath();
      for (let h = 0; h < 6; h += 1) {
        const ha = (Math.PI / 3) * h;
        const hx = x + Math.cos(ha) * hexR;
        const hy = y + Math.sin(ha) * hexR;
        if (h === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(14, 116, 144, 0.45)";
      ctx.fill();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Countdown Arc
      ctx.beginPath();
      ctx.arc(x, y, hexR + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remainingRatio);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.95)";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Shield Warning Banner & Title
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🛡️ INFINITY SHIELD · KORUNDU", x, y - 10);

      ctx.fillStyle = "rgba(224, 242, 254, 0.85)";
      ctx.font = "11px system-ui, sans-serif";
      const shortTitle = s.title.length > 28 ? s.title.slice(0, 25) + "…" : s.title;
      ctx.fillText(shortTitle, x, y + 10);
      ctx.fillText("İptal: Avuç içi / 3s bekle", x, y + 26);

      if (progress >= 1.0) {
        activeShields.splice(i, 1);
      }
    }
    ctx.restore();
  }

  return { shoot, follow, pin, anchor, flying, triggerPurple, triggerShield, draw, setPreset, hasWork };
}
