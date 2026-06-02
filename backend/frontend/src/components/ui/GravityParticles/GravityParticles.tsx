import React, { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { physicsSettingsAtom } from '../../../atoms/physics';
import type { Particle, Explosion } from './engine';
import { 
  spawnParticle, 
  stepPhysics, 
  getRadius, 
  hexToRgbStr 
} from './engine';
import './GravityParticles.css';

interface GravityParticlesProps {
  particleCount?: number;
  externalCursors?: { x: number; y: number }[];
  className?: string;
}

const GravityParticles: React.FC<GravityParticlesProps> = ({
  particleCount = 150,
  externalCursors = [],
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const nextId = useRef(0);
  const explosionsRef = useRef<Explosion[]>([]);
  const mousePosRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  const settings = useAtomValue(physicsSettingsAtom);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
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
      for (const p of particlesRef.current) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= Math.max(20, getRadius(p.mass))) {
          grabbedParticleRef.current = { id: p.id, offsetX: dx, offsetY: dy };
          break;
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

    const loop = () => {
      ctx.clearRect(0, 0, width, height);

      // Step physics via engine logic
      const { nextParts, newExplosions } = stepPhysics(
        particlesRef.current,
        explosionsRef.current,
        settingsRef.current,
        externalCursors,
        grabbedParticleRef.current,
        mousePosRef.current,
        width,
        height,
        nextId
      );

      particlesRef.current = nextParts;
      explosionsRef.current = newExplosions;

      // Draw particles
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
  }, [particleCount, externalCursors]);

  return (
    <canvas 
      ref={canvasRef} 
      className={`gravity-particles-canvas ${className}`}
    />
  );
};

export default GravityParticles;
