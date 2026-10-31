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

const LOOKS = {
  classic: {
    quality: "full",
    trail: [160, 220, 255],
    glow: "#dfffff",
    beam: [120, 220, 255],
    fiber: [210, 245, 255],
    head: "#00d9ff",
    fine: [190, 240, 255],
    particle: [220, 250, 255],
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
};
LOOKS.light = LOOKS.low;

function stepOf(dt) {
  return Math.min(dt, 50) / FRAME_MS;
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function createWebFx(ctx, hooks = {}) {
  const canvas = ctx.canvas;
  let look = LOOKS.mint;
  let activeWeb = null;
  let webImpact = null;
  let webParticles = [];
  let muzzleFlash = null;
  let shockwave = null;
  let lastDraw = performance.now();

  function setPreset(name) {
    const key = name === "light" ? "low" : name;
    look = LOOKS[key] || LOOKS.mint;
  }

  function full() {
    return look.quality !== "low";
  }

  function shoot(startX, startY) {
    const target = webTarget(startX, startY);
    activeWeb = {
      startX,
      startY,
      targetX: target.x,
      targetY: target.y,
      progress: 0,
      opacity: 1,
      age: 0,
    };
    webImpact = null;
    muzzleFlash = { x: startX, y: startY, life: 1 };
    shockwave = { x: startX, y: startY, radius: 8, life: 1 };
    spawnParticles(startX, startY, full() ? 16 : 4);
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
    const cap = full() ? 240 : 48;
    if (webParticles.length > cap) {
      webParticles = webParticles.slice(webParticles.length - cap);
    }
  }

  function hasWork() {
    return Boolean(activeWeb || webImpact || muzzleFlash || shockwave || webParticles.length);
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
  }

  function drawActiveWeb(step) {
    if (!activeWeb) return;
    const web = activeWeb;
    web.progress += 0.075 * step;
    web.age += step * FRAME_MS;
    const progress = Math.min(web.progress, 1);

    const currentX = web.startX + (web.targetX - web.startX) * progress;
    const currentY = web.startY + (web.targetY - web.startY) * progress;
    const dx = web.targetX - web.startX;
    const dy = web.targetY - web.startY;
    const distance = Math.hypot(dx, dy) || 1;
    const perpX = -dy / distance;
    const perpY = dx / distance;
    const curveAmount = Math.min(distance * 0.18, 140);
    const controlX = (web.startX + web.targetX) / 2 + perpX * curveAmount;
    const controlY = (web.startY + web.targetY) / 2 + perpY * curveAmount;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = web.opacity;

    if (full()) {
      for (let trail = 5; trail >= 1; trail -= 1) {
        const trailProgress = Math.max(0, progress - trail * 0.025);
        const trailX = web.startX + (web.targetX - web.startX) * trailProgress;
        const trailY = web.startY + (web.targetY - web.startY) * trailProgress;
        ctx.beginPath();
        ctx.moveTo(web.startX, web.startY);
        ctx.lineTo(trailX, trailY);
        ctx.strokeStyle = rgba(look.trail, 0.05 * trail);
        ctx.lineWidth = 2 + trail;
        ctx.stroke();
      }
    }

    ctx.shadowColor = look.glow;
    ctx.shadowBlur = full() ? 22 : 0;
    strokeCurve(
      web.startX,
      web.startY,
      controlX,
      controlY,
      currentX,
      currentY,
      rgba(look.beam, 0.45),
      full() ? 12 : 6,
    );

    ctx.shadowBlur = full() ? 10 : 0;
    strokeCurve(web.startX, web.startY, controlX, controlY, currentX, currentY, "rgba(255, 255, 255, 0.98)", 3);

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

    if (progress >= 1 && !webImpact) {
      webImpact = {
        x: web.targetX,
        y: web.targetY,
        life: 1,
        maxRadius: Math.max(canvas.width, canvas.height) * 1.05,
      };
      spawnParticles(web.targetX, web.targetY, full() ? 90 : 12);
      shockwave = { x: web.targetX, y: web.targetY, radius: 10, life: 1 };
      hooks.onImpact?.(web.targetX, web.targetY);
    }

    if (web.age > 1150) {
      web.opacity -= 0.025 * step;
    }
    if (web.opacity <= 0) activeWeb = null;
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
    const radius = Math.min(impact.maxRadius * Math.pow(progress, 0.65), impact.maxRadius);
    const spokes = full() ? 18 : 8;
    const fade = Math.max(impact.life, 0);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = look.glow;
    ctx.shadowBlur = full() ? 20 : 0;

    for (let i = 0; i < spokes; i += 1) {
      const angle = (Math.PI * 2 * i) / spokes;
      const endX = impact.x + Math.cos(angle) * radius;
      const endY = impact.y + Math.sin(angle) * radius;
      const bend = radius * 0.035;
      const controlX = impact.x + Math.cos(angle + Math.PI / 2) * bend;
      const controlY = impact.y + Math.sin(angle + Math.PI / 2) * bend;
      ctx.beginPath();
      ctx.moveTo(impact.x, impact.y);
      ctx.quadraticCurveTo(controlX, controlY, endX, endY);
      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0.15, fade)})`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }

    const rings = full() ? 13 : 4;
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
        const sag = ringRadius * (0.08 + r * 0.006);
        const controlRadius = ringRadius - sag;
        const controlX = impact.x + Math.cos(middleAngle) * controlRadius;
        const controlY = impact.y + Math.sin(middleAngle) * controlRadius;
        ctx.quadraticCurveTo(controlX, controlY, x, y);
      }
      const alpha = Math.max(0.18, 0.9 - r * 0.045) * fade;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = r <= 2 ? 2.4 : 1.15;
      ctx.stroke();
    }

    ctx.shadowBlur = full() ? 8 : 0;
    const fineSpokes = full() ? 36 : 0;
    for (let i = 0; i < fineSpokes; i += 1) {
      const angle = (Math.PI * 2 * i) / 36;
      ctx.beginPath();
      ctx.moveTo(impact.x, impact.y);
      ctx.lineTo(impact.x + Math.cos(angle) * radius, impact.y + Math.sin(angle) * radius);
      ctx.strokeStyle = rgba(look.fine, 0.18 * fade);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    const coreSize = 10 + progress * 24;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 35;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, coreSize, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.95 * fade})`;
    ctx.fill();

    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12;
      const outer = 35 + progress * 45;
      ctx.beginPath();
      ctx.moveTo(impact.x + Math.cos(angle) * 12, impact.y + Math.sin(angle) * 12);
      ctx.lineTo(impact.x + Math.cos(angle) * outer, impact.y + Math.sin(angle) * outer);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * fade})`;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawParticles(step) {
    if (webParticles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = webParticles.length - 1; i >= 0; i -= 1) {
      const particle = webParticles[i];
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.vx *= Math.pow(0.97, step);
      particle.vy *= Math.pow(0.97, step);
      particle.life -= 0.025 * step;
      if (particle.life <= 0) {
        webParticles.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fillStyle = rgba(look.particle, particle.life);
      ctx.shadowColor = look.glow;
      ctx.shadowBlur = full() ? 10 : 0;
      ctx.fill();
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

  return { shoot, draw, setPreset, hasWork };
}
