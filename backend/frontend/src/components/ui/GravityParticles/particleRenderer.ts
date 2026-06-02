import { getRadius, hexToRgbStr } from './engine';
import type { Explosion, AttractorParticle } from './engine';
import type { ParticleWithSystems } from './particleSystems';

export const renderParticle = (
  ctx: CanvasRenderingContext2D,
  p: ParticleWithSystems,
  opts: { glowScale: number; showTrails: boolean; trailAlpha: number }
) => {
  const r = getRadius(p.mass);
  
  if (opts.showTrails && p.trail && p.trail.length > 1) {
    ctx.beginPath();
    ctx.moveTo(p.trail[0].x, p.trail[0].y);
    for (let i = 1; i < p.trail.length; i++) {
      ctx.lineTo(p.trail[i].x, p.trail[i].y);
    }
    const rgb = hexToRgbStr(p.color);
    ctx.strokeStyle = `rgba(${rgb}, ${opts.trailAlpha})`;
    ctx.lineWidth = r * 0.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();

  const rgb = hexToRgbStr(p.color);
  let glowRadius = r * 3 * opts.glowScale;
  let glowColor = `rgba(${rgb}, 0.5)`;
  
  if (p.courtshipGlow && p.courtshipGlow > 0.01 && p.courtshipColor) {
    const crgb = hexToRgbStr(p.courtshipColor);
    glowRadius = r * (3 + p.courtshipGlow * 2) * opts.glowScale;
    glowColor = `rgba(${crgb}, ${p.courtshipGlow * 0.8})`;
  } else if (p.heat && p.heat > 0) {
    glowRadius = r * (3 + p.heat) * opts.glowScale;
    glowColor = `rgba(255, 150, 0, ${p.heat * 0.6})`;
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
  const gradient = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, glowRadius);
  gradient.addColorStop(0, glowColor);
  gradient.addColorStop(1, glowColor.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = gradient;
  ctx.fill();
};

export const renderExplosion = (ctx: CanvasRenderingContext2D, exp: Explosion) => {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.beginPath();
  ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
  const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius);
  const rgb = hexToRgbStr(exp.color);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${exp.alpha})`);
  gradient.addColorStop(0.2, `rgba(${rgb}, ${exp.alpha * 0.8})`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
};

export const renderAttractor = (ctx: CanvasRenderingContext2D, att: AttractorParticle, frameCount: number) => {
  const r = getRadius(att.mass);
  ctx.beginPath();
  ctx.arc(att.x, att.y, r, 0, Math.PI * 2);
  ctx.fillStyle = att.color;
  ctx.fill();
  
  const pulse = Math.sin(frameCount * 0.05) * 0.5 + 0.5;
  const rgb = hexToRgbStr(att.color);
  ctx.beginPath();
  ctx.arc(att.x, att.y, r * (2 + pulse), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb}, ${0.3 * (1 - pulse)})`;
  ctx.fill();
};

export const renderDebugCluster = (ctx: CanvasRenderingContext2D, cx: number, cy: number, mass: number) => {
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, getRadius(mass), 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.stroke();
};
