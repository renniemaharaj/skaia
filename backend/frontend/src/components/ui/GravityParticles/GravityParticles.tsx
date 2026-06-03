import React, { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { physicsSettingsAtom } from '../../../atoms/physics';
import type { Particle, Explosion, AttractorParticle } from './engine';
import { 
  spawnParticle, 
  stepPhysics, 
  getRadius 
} from './engine';
import { computeCourtship } from './particleSystems';
import type { ParticleWithSystems } from './particleSystems';
import { renderParticle, renderExplosion } from './particleRenderer';
import './GravityParticles.css';

interface GravityParticlesProps {
  particleCount?: number;
  externalCursors?: { x: number; y: number }[];
  attractors?: AttractorParticle[];
  className?: string;
}

const GravityParticles: React.FC<GravityParticlesProps> = ({
  particleCount = 150,
  externalCursors = [],
  attractors = [],
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const nextId = useRef(0);
  const explosionsRef = useRef<Explosion[]>([]);
  const mousePosRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  const settings = useAtomValue(physicsSettingsAtom);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  
  const externalCursorsRef = useRef(externalCursors);
  externalCursorsRef.current = externalCursors;

  const attractorsRef = useRef(attractors);
  attractorsRef.current = attractors;
  
  const grabbedParticleRef = useRef<{ id: number; offsetX: number; offsetY: number } | null>(null);

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
      grabbedParticleRef.current = null;
    };
    const handleMouseDown = (e: MouseEvent) => {
      const mx = e.clientX;
      const my = e.clientY;
      let grabbed = false;
      for (const p of particlesRef.current) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= Math.max(20, getRadius(p.mass))) {
          grabbedParticleRef.current = { id: p.id, offsetX: dx, offsetY: dy };
          grabbed = true;
          break;
        }
      }
      
      if (!grabbed && settingsRef.current.createOnClick) {
        const threshold = settingsRef.current.explosionThreshold;
        // Central massive particle just below threshold
        const central = spawnParticle(mx, my, threshold * 0.85, nextId);
        particlesRef.current.push(central);

        // Orbiting particles
        const numOrbiters = 5 + Math.floor(Math.random() * 5);
        for (let i = 0; i < numOrbiters; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 40 + Math.random() * 60;
          const orbiter = spawnParticle(
            mx + Math.cos(angle) * dist,
            my + Math.sin(angle) * dist,
            Math.random() * 3 + 2,
            nextId
          );
          
          // Add tangential velocity for orbit
          const G = settingsRef.current.gravityConstant;
          const vOrbit = Math.sqrt((G * central.mass) / dist);
          orbiter.vx = -Math.sin(angle) * vOrbit;
          orbiter.vy = Math.cos(angle) * vOrbit;
          
          particlesRef.current.push(orbiter);
        }
      }
    };
    const handleMouseUp = () => {
      grabbedParticleRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('mouseout', handleMouseLeave);

    // Initialize particles
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push(spawnParticle(
        Math.random() * width,
        Math.random() * height,
        Math.random() * 3 + 1,
        nextId
      ));
    }
    particlesRef.current = particles;

    let animationFrameId: number;
    let frameCount = 0;

    const loop = () => {
      frameCount++;
      ctx.clearRect(0, 0, width, height);

      // Step physics via engine logic
      const { nextParts, newExplosions } = stepPhysics(
        particlesRef.current,
        explosionsRef.current,
        settingsRef.current,
        externalCursorsRef.current,
        grabbedParticleRef.current,
        mousePosRef.current,
        width,
        height,
        nextId,
        attractorsRef.current
      );

      particlesRef.current = nextParts;
      explosionsRef.current = newExplosions;

      computeCourtship(nextParts as ParticleWithSystems[], frameCount);

      // Draw explosions
      for (const exp of explosionsRef.current) {
        renderExplosion(ctx, exp);
      }

      // Draw particles
      for (const p of nextParts) {
        renderParticle(ctx, p as ParticleWithSystems, {
          glowScale: 1.2,
          showTrails: true,
          trailAlpha: 0.3,
        });
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      window.removeEventListener('resize', setSize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mouseout', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [particleCount]);

  return (
    <canvas 
      ref={canvasRef} 
      className={`gravity-particles-canvas ${className}`}
    />
  );
};

export default GravityParticles;
