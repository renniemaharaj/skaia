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

const G = 0.08; // Gravitational constant (increased for stronger space-time warping)
const MAX_VELOCITY = 10;
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

const blendColors = (c1: string, c2: string, m1: number, m2: number) => {
  const hex2rgb = (hex: string) => {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const int = parseInt(hex, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  };
  const [r1, g1, b1] = hex2rgb(c1);
  const [r2, g2, b2] = hex2rgb(c2);
  const total = m1 + m2;
  const r = Math.round((r1 * m1 + r2 * m2) / total);
  const g = Math.round((g1 * m1 + g2 * m2) / total);
  const b = Math.round((b1 * m1 + b2 * m2) / total);
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
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

          // Collision, Merging & Systems
          if (dist < minDist && p1.mergeCooldown <= 0 && p2.mergeCooldown <= 0) {
            const nx = dx / dist;
            const ny = dy / dist;

            const dvx = p2.vx - p1.vx;
            const dvy = p2.vy - p1.vy;
            const velAlongNormal = dvx * nx + dvy * ny;

            // approachSpeed is how fast their surfaces are smashing directly into each other.
            // This perfectly factors in both speed AND angle! A high-speed glancing blow 
            // will have a low approachSpeed, while a head-on collision will be high.
            const approachSpeed = -velAlongNormal;

            // Particles randomly experience orbital decay when rubbing against each other, 
            // causing stable systems to eventually collapse and merge.
            const isOrbitalDecay = approachSpeed < 3.5 && Math.random() < 0.02;

            // Collision resolution: Gentle/glancing (< 3.5) forms a system.
            // Violent head-on (>= 3.5) OR decayed orbits merge!
            if (approachSpeed < 3.5 && !isOrbitalDecay) {
              // Do not resolve if velocities are separating
              if (velAlongNormal < 0) {
                // Mass ratio defines how much they bounce. 
                // A tiny particle hitting a huge one has a low mass ratio, 
                // so it gets almost 0 bounce (restitution), causing it to stick and get trapped!
                const massRatio = Math.min(p1.mass, p2.mass) / Math.max(p1.mass, p2.mass);
                const restitution = Math.max(0.05, 0.5 * massRatio); 
                
                const j = -(1 + restitution) * velAlongNormal;
                const impulse = j / (1 / p1.mass + 1 / p2.mass);

                // Apply impulse
                p1.vx -= (impulse * nx) / p1.mass;
                p1.vy -= (impulse * ny) / p1.mass;
                p2.vx += (impulse * nx) / p2.mass;
                p2.vy += (impulse * ny) / p2.mass;

                // Induce orbital rotation by adding a tangential kick
                const tx = -ny;
                const ty = nx;
                const totalMass = p1.mass + p2.mass;
                
                // Calculate perfect orbital velocity so we don't kick them out of the gravity well!
                // v_orbit = sqrt(G * M / r)
                const v_orbit = Math.sqrt((G * totalMass) / dist);
                
                // Check current tangential velocity
                const velAlongTangent = dvx * tx + dvy * ty;

                // ONLY inject spin if they are lacking stable orbital velocity!
                if (Math.abs(velAlongTangent) < v_orbit * 0.5) {
                  // Inject spin in the direction they are already drifting
                  const direction = velAlongTangent >= 0 ? 1 : -1;
                  // Limit the spin force to never exceed the stable orbital velocity
                  const spinForce = Math.min(0.8, v_orbit * 0.85) * direction;

                  p1.vx -= tx * spinForce * (p2.mass / totalMass);
                  p1.vy -= ty * spinForce * (p2.mass / totalMass);
                  p2.vx += tx * spinForce * (p1.mass / totalMass);
                  p2.vy += ty * spinForce * (p1.mass / totalMass);
                }
              }

              // Positional correction to prevent getting stuck
              const overlap = minDist - dist;
              p1.x -= nx * overlap * 0.5;
              p1.y -= ny * overlap * 0.5;
              p2.x += nx * overlap * 0.5;
              p2.y += ny * overlap * 0.5;
            } else {
              if (approachSpeed >= 3.5) {
                // High speed collision! EXPLODE BOTH PARTICLES!
                toRemove.add(p1.id);
                toRemove.add(p2.id);

                const explodeParticle = (p: Particle) => {
                  explosionsRef.current.push({
                    x: p.x, y: p.y, radius: getRadius(p.mass) * 2, alpha: 1, color: p.color
                  });
                  // Only fragment if mass is large enough to split
                  if (p.mass >= 1.5) {
                    const numFragments = Math.min(15, Math.floor(p.mass / 2) + 2);
                    for (let k = 0; k < numFragments; k++) {
                      const angle = Math.random() * Math.PI * 2;
                      const speed = Math.random() * 5 + 2;
                      newParts.push({
                        id: nextId.current++,
                        x: p.x + Math.cos(angle) * (getRadius(p.mass) * 0.5),
                        y: p.y + Math.sin(angle) * (getRadius(p.mass) * 0.5),
                        vx: p.vx + Math.cos(angle) * speed,
                        vy: p.vy + Math.sin(angle) * speed,
                        mass: Math.max(1, (p.mass / numFragments) * 0.9), // slightly lose mass to energy
                        color: p.color,
                        mergeCooldown: 60,
                      });
                    }
                  }
                };

                explodeParticle(p1);
                explodeParticle(p2);
                break; // p1 is destroyed, break out of inner loop
              } else {
                // Gentle orbital decay! Normal Merge!
                const newColor = blendColors(p1.color, p2.color, p1.mass, p2.mass);
                if (p1.mass >= p2.mass) {
                  toRemove.add(p2.id);
                  p1.vx = (p1.mass * p1.vx + p2.mass * p2.vx) / (p1.mass + p2.mass);
                  p1.vy = (p1.mass * p1.vy + p2.mass * p2.vy) / (p1.mass + p2.mass);
                  p1.mass += p2.mass;
                  p1.color = newColor;
                  continue; 
                } else {
                  toRemove.add(p1.id);
                  p2.vx = (p2.mass * p2.vx + p1.mass * p1.vx) / (p1.mass + p2.mass);
                  p2.vy = (p2.mass * p2.vy + p1.mass * p1.vy) / (p1.mass + p2.mass);
                  p2.mass += p1.mass;
                  p2.color = newColor;
                  break; 
                }
              }
            }
          }

          // Gravity calculation
          // Softening parameter reduced to 20 to allow for massive gravity spikes on close passes (slingshots)
          const force = (G * p1.mass * p2.mass) / (distSq + 20);
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
