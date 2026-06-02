import React, { useEffect, useRef } from 'react';
import './GravityParticles.css';

interface GravityParticlesProps {
  particleCount?: number;
  externalCursors?: { x: number; y: number }[];
  className?: string;
}

type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: string;
  mergeCooldown: number;
};

const G = 0.05; // Gravitational constant
const MAX_VELOCITY = 8;
const EXPLOSION_MASS_THRESHOLD = 40;
const BOUNDING_BOX_DAMPING = 0.8;
const CURSOR_MASS = 150; // Cursor acts as a very massive body
const CURSOR_REPULSION_DIST = 100;

const hexToRgbStr = (hex: string) => {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const int = parseInt(hex, 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
};

const defaultColors = ['#00f0ff', '#ff0055', '#ffe600', '#00ff66'];

const GravityParticles: React.FC<GravityParticlesProps> = ({
  particleCount = 150,
  externalCursors = [],
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const nextId = useRef(0);
  const explosionsRef = useRef<{ x: number, y: number, radius: number, alpha: number, color: string }[]>([]);
  const mousePosRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const setSize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    setSize();
    window.addEventListener('resize', setSize);

    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY, active: true };
    };
    const handleMouseLeave = () => {
      mousePosRef.current.active = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('mouseout', handleMouseLeave);

    // Initialize particles
    const particles: Particle[] = [];
    
    const spawnParticle = (x: number, y: number, mass: number): Particle => {
      return {
        id: nextId.current++,
        x,
        y,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        mass,
        color: defaultColors[Math.floor(Math.random() * defaultColors.length)],
        mergeCooldown: 0,
      };
    };

    // Spawn normal particles
    for (let i = 0; i < particleCount; i++) {
      particles.push(spawnParticle(
        Math.random() * width,
        Math.random() * height,
        Math.random() * 3 + 1
      ));
    }

    particlesRef.current = particles;

    const getRadius = (mass: number) => Math.sqrt(mass) * 1.5;

    let animationFrameId: number;

    const loop = () => {
      ctx.clearRect(0, 0, width, height);

      const parts = particlesRef.current;
      const newParts: Particle[] = [];
      const toRemove = new Set<number>();

      // Active cursors (local + external)
      const activeCursors: {x: number, y: number}[] = [...externalCursors];
      if (mousePosRef.current.active) {
        activeCursors.push({ x: mousePosRef.current.x, y: mousePosRef.current.y });
      }

      // Apply gravity
      for (let i = 0; i < parts.length; i++) {
        const p1 = parts[i];
        if (toRemove.has(p1.id)) continue;

        let fx = 0;
        let fy = 0;

        for (let j = 0; j < parts.length; j++) {
          if (i === j) continue;
          const p2 = parts[j];
          if (toRemove.has(p2.id)) continue;

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);
          
          const r1 = getRadius(p1.mass);
          const r2 = getRadius(p2.mass);
          const minDist = r1 + r2;

          // Collision & Merging
          if (dist < minDist && p1.mergeCooldown <= 0 && p2.mergeCooldown <= 0) {
            if (p1.mass >= p2.mass) {
              toRemove.add(p2.id);
              // Momentum conservation
              p1.vx = (p1.mass * p1.vx + p2.mass * p2.vx) / (p1.mass + p2.mass);
              p1.vy = (p1.mass * p1.vy + p2.mass * p2.vy) / (p1.mass + p2.mass);
              p1.mass += p2.mass;
              continue; // Move to next interaction
            } else {
              toRemove.add(p1.id);
              p2.vx = (p2.mass * p2.vx + p1.mass * p1.vx) / (p1.mass + p2.mass);
              p2.vy = (p2.mass * p2.vy + p1.mass * p1.vy) / (p1.mass + p2.mass);
              p2.mass += p1.mass;
              break; // p1 is dead
            }
          }

          // Gravity calculation
          const force = (G * p1.mass * p2.mass) / (distSq + 100);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }

        // Apply cursor gravity/repulsion
        for (const cursor of activeCursors) {
          const dx = cursor.x - p1.x;
          const dy = cursor.y - p1.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);
          
          if (dist < CURSOR_REPULSION_DIST) {
            // Repel if very close (creates a stirring effect)
            const force = -(G * p1.mass * CURSOR_MASS * 5) / (distSq + 10);
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          } else {
            // Attract
            const force = (G * p1.mass * CURSOR_MASS) / (distSq + 100);
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }
        }

        if (toRemove.has(p1.id)) continue;

        if (p1.mergeCooldown > 0) p1.mergeCooldown--;

        // Update velocity
        p1.vx += fx / p1.mass;
        p1.vy += fy / p1.mass;

        // Cap velocity
        const speed = Math.sqrt(p1.vx * p1.vx + p1.vy * p1.vy);
        if (speed > MAX_VELOCITY) {
          p1.vx = (p1.vx / speed) * MAX_VELOCITY;
          p1.vy = (p1.vy / speed) * MAX_VELOCITY;
        }

        // Update position
        p1.x += p1.vx;
        p1.y += p1.vy;

        // Bounce off walls
        const r = getRadius(p1.mass);
        if (p1.x < r) { p1.x = r; p1.vx *= -BOUNDING_BOX_DAMPING; }
        if (p1.x > width - r) { p1.x = width - r; p1.vx *= -BOUNDING_BOX_DAMPING; }
        if (p1.y < r) { p1.y = r; p1.vy *= -BOUNDING_BOX_DAMPING; }
        if (p1.y > height - r) { p1.y = height - r; p1.vy *= -BOUNDING_BOX_DAMPING; }

        // Explode logic
        if (p1.mass > EXPLOSION_MASS_THRESHOLD) {
          const fragmentMass = 2; // Fixed mass per fragment
          const spawnCount = Math.floor(p1.mass / fragmentMass);

          for (let k = 0; k < spawnCount; k++) {
            const angle = (Math.PI * 2 * k) / spawnCount + (Math.random() - 0.5);
            const burstSpeed = 6 + Math.random() * 6;
            const radiusOffset = getRadius(p1.mass) * 0.5; // Start them slightly offset
            const newP = spawnParticle(
              p1.x + Math.cos(angle) * radiusOffset, 
              p1.y + Math.sin(angle) * radiusOffset, 
              fragmentMass
            );
            newP.vx = Math.cos(angle) * burstSpeed;
            newP.vy = Math.sin(angle) * burstSpeed;
            newP.color = p1.color;
            newP.mergeCooldown = 30; // 30 frames cooldown before they can merge again
            newParts.push(newP);
          }

          explosionsRef.current.push({
            x: p1.x,
            y: p1.y,
            radius: getRadius(p1.mass) * 8,
            alpha: 1.0,
            color: p1.color,
          });

          toRemove.add(p1.id);
        }
      }

      // Draw and filter
      const nextParts: Particle[] = [];
      for (const p of parts) {
        if (!toRemove.has(p.id)) nextParts.push(p);
      }
      for (const np of newParts) nextParts.push(np);
      
      particlesRef.current = nextParts;

      for (const p of nextParts) {
        const r = getRadius(p.mass);

        const rgb = hexToRgbStr(p.color);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, r * 3);
        gradient.addColorStop(0, `rgba(${rgb}, 0.5)`);
        gradient.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Draw explosions
      const nextExplosions = [];
      for (const exp of explosionsRef.current) {
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

        exp.alpha -= 0.03;
        exp.radius += 2;
        if (exp.alpha > 0) nextExplosions.push(exp);
      }
      explosionsRef.current = nextExplosions;

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      window.removeEventListener('resize', setSize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mouseout', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [particleCount, externalCursors]);

  return (
    <canvas 
      ref={canvasRef} 
      className={`gravity-particles-canvas ${className}`}
    />
  );
};

export default GravityParticles;
