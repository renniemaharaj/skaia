export type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: string;
  mergeCooldown: number;
  /** 0–1 heat accumulated from near-misses / explosions — use for glow FX */
  heat: number;
  /** Ring buffer of recent positions for trail rendering, newest-first */
  trail: { x: number; y: number }[];
} & Partial<CourtshipFields>;

export type Explosion = {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
};

export type AttractorParticle = {
  x: number;
  y: number;
  mass: number;
  color: string;
};

import { buildClusterMap, applySystemGravity } from "./particleSystems";
import type { CourtshipFields } from "./particleSystems";

export type PhysicsSettings = {
  gravityConstant: number;
  maxVelocity: number;
  /** Mass at which a particle spontaneously explodes */
  explosionThreshold: number;
  bounceRestitution: number;
  /** Probability [0,1] a slow collision merges instead of bouncing */
  orbitalDecayChance: number;
  /** Speed threshold below which particles can merge */
  mergeThreshold: number;
  cursorMass: number;
  /** TRUE = cursor repels close particles; FALSE = pure attractor */
  cursorRepels: boolean;
  /** TRUE = clicking empty space creates new particles */
  createOnClick: boolean;
  /** Number of physics sub-steps per frame (1–4, default 2) */
  subSteps: number;
  /** Max trail length stored per particle (0 = disabled) */
  trailLength: number;
  /** Shockwave force multiplier on explosion (0 = no shockwave) */
  shockwaveForce: number;
  /** Fragment mass for threshold explosions */
  fragmentMass: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

export const BOUNDING_BOX_DAMPING = 0.75;
export const CURSOR_REPULSION_DIST = 100;
export const MAX_TRAIL_LENGTH = 12;

export const defaultColors = [
  "#5b9e8e",
  "#ff0055",
  "#ffe600",
  "#00ff66",
  "#a78bfa",
  "#f97316",
];

export const defaultSettings: PhysicsSettings = {
  gravityConstant: 0.5,
  maxVelocity: 18,
  explosionThreshold: 120,
  bounceRestitution: 0.55,
  orbitalDecayChance: 0.012,
  mergeThreshold: 3.5,
  cursorMass: 80,
  cursorRepels: true,
  createOnClick: false,
  subSteps: 2,
  trailLength: MAX_TRAIL_LENGTH,
  shockwaveForce: 6,
  fragmentMass: 2,
};

// ─── Colour helpers ──────────────────────────────────────────────────────────

export const hexToRgbStr = (hex: string): string => {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  const int = parseInt(hex, 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
};

const hex2rgb = (hex: string): [number, number, number] => {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  const int = parseInt(hex, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
};

export const blendColors = (
  c1: string,
  c2: string,
  m1: number,
  m2: number,
): string => {
  const [r1, g1, b1] = hex2rgb(c1);
  const [r2, g2, b2] = hex2rgb(c2);
  const total = m1 + m2;
  const r = Math.round((r1 * m1 + r2 * m2) / total);
  const g = Math.round((g1 * m1 + g2 * m2) / total);
  const b = Math.round((b1 * m1 + b2 * m2) / total);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};

// ─── Geometry helpers ────────────────────────────────────────────────────────

export const getRadius = (mass: number): number => Math.sqrt(mass) * 1.5;

/** Softening length — prevents force singularities when particles overlap */
const softeningEpsilonSq = (r1: number, r2: number): number => {
  const s = (r1 + r2) * 0.5;
  return s * s + 4; // constant floor of 4 keeps tiny particles stable
};

// ─── Particle factory ────────────────────────────────────────────────────────

export const spawnParticle = (
  x: number,
  y: number,
  mass: number,
  nextId: { current: number },
  color?: string,
): Particle => ({
  id: nextId.current++,
  x,
  y,
  vx: (Math.random() - 0.5) * 2,
  vy: (Math.random() - 0.5) * 2,
  mass,
  color:
    color ?? defaultColors[Math.floor(Math.random() * defaultColors.length)],
  mergeCooldown: 0,
  heat: 0,
  trail: [],
});

// ─────────────────────────────────────────────────────────────────────────────
// Spatial Hash Grid
// Divides the world into cells of size `cellSize`.  Each particle is hashed
// into a cell; neighbour queries only visit the 3×3 block of surrounding cells.
// ─────────────────────────────────────────────────────────────────────────────

class SpatialHash {
  private cells = new Map<number, number[]>(); // cell key → particle indices
  private cellSize: number;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  private key(cx: number, cy: number): number {
    // Cantor pairing with sign handling for negative coords
    const px = cx >= 0 ? 2 * cx : -2 * cx - 1;
    const py = cy >= 0 ? 2 * cy : -2 * cy - 1;
    return ((px + py) * (px + py + 1)) / 2 + py;
  }

  insert(idx: number, x: number, y: number): void {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const k = this.key(cx, cy);
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    cell.push(idx);
  }

  /** Yields all particle indices in the 3×3 neighbourhood of (x, y) */
  *query(x: number, y: number): IterableIterator<number> {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.cells.get(this.key(cx + dx, cy + dy));
        if (cell) yield* cell;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// stepPhysics — main simulation tick
// ─────────────────────────────────────────────────────────────────────────────

export const stepPhysics = (
  parts: Particle[],
  explosions: Explosion[],
  settings: PhysicsSettings,
  activeCursors: { x: number; y: number }[],
  grabbedParticle: { id: number; offsetX: number; offsetY: number } | null,
  mousePos: { x: number; y: number; active: boolean },
  width: number,
  height: number,
  nextId: { current: number },
  attractors: AttractorParticle[] = [],
): { nextParts: Particle[]; newExplosions: Explosion[] } => {
  const {
    gravityConstant: G,
    maxVelocity: MAX_V,
    explosionThreshold: EXPLOSION_MASS_THRESHOLD,
    bounceRestitution,
    orbitalDecayChance,
    mergeThreshold,
    cursorMass: CURSOR_MASS,
    cursorRepels,
    subSteps,
    trailLength,
    shockwaveForce,
    fragmentMass: FRAGMENT_MASS,
  } = settings;

  // Sub-step dt fraction
  const dt = 1 / Math.max(1, subSteps);

  // Cursor list
  const combinedCursors = [...activeCursors];
  if (mousePos.active && !grabbedParticle) {
    combinedCursors.push({ x: mousePos.x, y: mousePos.y });
  }

  // The spatial hash cell size should comfortably fit the largest interaction
  // radius.  Using 60 covers most particle pairs at 200–500 count.
  const grid = new SpatialHash(60);

  // We run state mutably for performance; a full immutable copy at 500 particles
  // per sub-step per frame is expensive.  We track which ids to remove/add.
  const toRemove = new Set<number>();
  const newParts: Particle[] = [];
  const newExplosions: Explosion[] = [];

  const clusterMap = buildClusterMap(parts);

  // ── Helper: explode a single particle into fragments ──────────────────────
  const explodeParticle = (
    p: Particle,
    shockCenter?: { x: number; y: number },
  ) => {
    newExplosions.push({
      x: p.x,
      y: p.y,
      radius: getRadius(p.mass) * 2,
      maxRadius: getRadius(p.mass) * 10,
      alpha: 1,
      color: p.color,
    });

    if (p.mass < 1.5) return;

    const numFragments = Math.min(16, Math.floor(p.mass / 2) + 2);
    for (let k = 0; k < numFragments; k++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      const frag = spawnParticle(
        p.x + Math.cos(angle) * getRadius(p.mass) * 0.5,
        p.y + Math.sin(angle) * getRadius(p.mass) * 0.5,
        Math.max(1, (p.mass / numFragments) * 0.9),
        nextId,
        p.color,
      );
      frag.vx = p.vx + Math.cos(angle) * speed;
      frag.vy = p.vy + Math.sin(angle) * speed;
      frag.mergeCooldown = 60;
      newParts.push(frag);
    }

    // Shockwave: push nearby particles away from the explosion center
    if (shockwaveForce > 0) {
      const sc = shockCenter ?? p;
      const shockRadius = getRadius(p.mass) * 8;
      for (const other of parts) {
        if (other.id === p.id || toRemove.has(other.id)) continue;
        const dx = other.x - sc.x;
        const dy = other.y - sc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < shockRadius && dist > 0.01) {
          const falloff = 1 - dist / shockRadius;
          const impulse = shockwaveForce * falloff * (p.mass / other.mass);
          other.vx += (dx / dist) * impulse;
          other.vy += (dy / dist) * impulse;
          other.heat = Math.min(1, other.heat + falloff * 0.6);
        }
      }
    }
  };

  // ── Sub-step loop ─────────────────────────────────────────────────────────
  for (let step = 0; step < subSteps; step++) {
    // Rebuild grid each sub-step (positions change)
    grid.clear();
    for (let i = 0; i < parts.length; i++) {
      if (!toRemove.has(parts[i].id)) grid.insert(i, parts[i].x, parts[i].y);
    }

    for (let i = 0; i < parts.length; i++) {
      const p1 = parts[i];
      if (toRemove.has(p1.id)) continue;

      let fx = 0;
      let fy = 0;
      const r1 = getRadius(p1.mass);

      // ── Particle–particle interactions (spatial hash) ─────────────────────
      for (const j of grid.query(p1.x, p1.y)) {
        if (j <= i) continue; // process each pair once
        const p2 = parts[j];
        if (toRemove.has(p2.id)) continue;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);
        if (dist < 0.001) continue;

        const r2 = getRadius(p2.mass);
        const minDist = r1 + r2;

        if (dist < minDist) {
          // ── Collision resolution ─────────────────────────────────────────
          const nx = dx / dist;
          const ny = dy / dist;
          const dvx = p2.vx - p1.vx;
          const dvy = p2.vy - p1.vy;
          const velAlongNormal = dvx * nx + dvy * ny;

          const approachSpeed = -velAlongNormal;
          const isOrbitalDecay =
            approachSpeed < mergeThreshold && Math.random() < orbitalDecayChance;

          if (approachSpeed >= Math.max(3.5, mergeThreshold)) {
            // ─ High-speed collision → explode both ──────────────────────────
            if (!toRemove.has(p1.id) && !toRemove.has(p2.id)) {
              toRemove.add(p1.id);
              toRemove.add(p2.id);
              explodeParticle(p1, {
                x: (p1.x + p2.x) * 0.5,
                y: (p1.y + p2.y) * 0.5,
              });
              explodeParticle(p2, {
                x: (p1.x + p2.x) * 0.5,
                y: (p1.y + p2.y) * 0.5,
              });
            }
            continue;
          }

          if (isOrbitalDecay) {
            // ─ Merge ────────────────────────────────────────────────────────
            const newColor = blendColors(p1.color, p2.color, p1.mass, p2.mass);
            if (p1.mass >= p2.mass) {
              // p1 absorbs p2 — conserve momentum exactly
              p1.vx = (p1.mass * p1.vx + p2.mass * p2.vx) / (p1.mass + p2.mass);
              p1.vy = (p1.mass * p1.vy + p2.mass * p2.vy) / (p1.mass + p2.mass);
              p1.mass += p2.mass;
              p1.color = newColor;
              p1.heat = Math.min(1, p1.heat + 0.2);
              toRemove.add(p2.id);
            } else {
              p2.vx = (p2.mass * p2.vx + p1.mass * p1.vx) / (p1.mass + p2.mass);
              p2.vy = (p2.mass * p2.vy + p1.mass * p1.vy) / (p1.mass + p2.mass);
              p2.mass += p1.mass;
              p2.color = newColor;
              p2.heat = Math.min(1, p2.heat + 0.2);
              toRemove.add(p1.id);
            }
            continue;
          }

          // ─ Elastic / inelastic bounce ──────────────────────────────────────
          if (velAlongNormal < 0) {
            // Restitution scales down for very unequal masses (avoids jitter)
            const massRatio =
              Math.min(p1.mass, p2.mass) / Math.max(p1.mass, p2.mass);
            const e = Math.max(0.05, bounceRestitution * Math.sqrt(massRatio));
            const j_impulse =
              (-(1 + e) * velAlongNormal) / (1 / p1.mass + 1 / p2.mass);

            p1.vx -= (j_impulse * nx) / p1.mass;
            p1.vy -= (j_impulse * ny) / p1.mass;
            p2.vx += (j_impulse * nx) / p2.mass;
            p2.vy += (j_impulse * ny) / p2.mass;

            // Orbital spin-up (vis-viva tangential nudge)
            const tx = -ny;
            const ty = nx;
            const totalMass = p1.mass + p2.mass;
            const v_orbit = Math.sqrt((G * totalMass) / Math.max(dist, 0.1));
            const velAlongTangent = dvx * tx + dvy * ty;
            if (Math.abs(velAlongTangent) < v_orbit * 0.5) {
              const dir = velAlongTangent >= 0 ? 1 : -1;
              const spin = Math.min(0.8, v_orbit * 0.85) * dir;
              p1.vx -= tx * spin * (p2.mass / totalMass);
              p1.vy -= ty * spin * (p2.mass / totalMass);
              p2.vx += tx * spin * (p1.mass / totalMass);
              p2.vy += ty * spin * (p1.mass / totalMass);
            }
          }

          // Positional correction — prevents sinking
          const overlap = minDist - dist;
          const correction = overlap * 0.5;
          p1.x -= nx * correction;
          p1.y -= ny * correction;
          p2.x += nx * correction;
          p2.y += ny * correction;
        } else {
          // Gravitational attraction is handled by system gravity below
        }
      }

      // ── System gravity ──────────────────────────────────────────────
      const { fx: sfx, fy: sfy } = applySystemGravity(
        p1,
        clusterMap,
        parts,
        G,
        toRemove
      );
      fx += sfx;
      fy += sfy;
      // ── Cursor interactions ──────────────────────────────────────────────
      for (const cursor of combinedCursors) {
        const dx = cursor.x - p1.x;
        const dy = cursor.y - p1.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 0.001;

        if (cursorRepels && dist < CURSOR_REPULSION_DIST) {
          const force = -(G * p1.mass * CURSOR_MASS * 5) / (distSq + 10);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        } else {
          const force = (G * p1.mass * CURSOR_MASS) / (distSq + 100);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
      }

      // ── Static attractor particles ────────────────────────────────────────
      for (const att of attractors) {
        const dx = att.x - p1.x;
        const dy = att.y - p1.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 0.001;
        const eps2 = softeningEpsilonSq(r1, getRadius(att.mass));
        const force = (G * p1.mass * att.mass) / (distSq + eps2);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      if (toRemove.has(p1.id)) continue;

      // ── Integrate velocity ────────────────────────────────────────────────
      if (p1.mergeCooldown > 0) p1.mergeCooldown--;

      p1.vx += (fx / p1.mass) * dt;
      p1.vy += (fy / p1.mass) * dt;

      // Clamp speed
      const speed = Math.sqrt(p1.vx * p1.vx + p1.vy * p1.vy);
      if (speed > MAX_V) {
        p1.vx = (p1.vx / speed) * MAX_V;
        p1.vy = (p1.vy / speed) * MAX_V;
      }

      // Integrate position
      p1.x += p1.vx * dt;
      p1.y += p1.vy * dt;

      // ── Grabbed particle override ─────────────────────────────────────────
      if (grabbedParticle?.id === p1.id) {
        p1.x = mousePos.x + grabbedParticle.offsetX;
        p1.y = mousePos.y + grabbedParticle.offsetY;
        p1.vx = 0;
        p1.vy = 0;
      }

      // ── Boundary collision ────────────────────────────────────────────────
      const r = getRadius(p1.mass);
      if (p1.x < r) {
        p1.x = r;
        p1.vx = Math.abs(p1.vx) * BOUNDING_BOX_DAMPING;
      }
      if (p1.x > width - r) {
        p1.x = width - r;
        p1.vx = -Math.abs(p1.vx) * BOUNDING_BOX_DAMPING;
      }
      if (p1.y < r) {
        p1.y = r;
        p1.vy = Math.abs(p1.vy) * BOUNDING_BOX_DAMPING;
      }
      if (p1.y > height - r) {
        p1.y = height - r;
        p1.vy = -Math.abs(p1.vy) * BOUNDING_BOX_DAMPING;
      }

      // ── Heat decay ────────────────────────────────────────────────────────
      if (p1.heat > 0) p1.heat = Math.max(0, p1.heat - 0.01);

      // ── Trail update ──────────────────────────────────────────────────────
      if (trailLength > 0) {
        p1.trail.unshift({ x: p1.x, y: p1.y });
        if (p1.trail.length > trailLength) p1.trail.length = trailLength;
      }

      // ── Over-mass threshold explosion ─────────────────────────────────────
      if (p1.mass > EXPLOSION_MASS_THRESHOLD) {
        const spawnCount = Math.floor(p1.mass / FRAGMENT_MASS);
        for (let k = 0; k < spawnCount; k++) {
          const angle = (Math.PI * 2 * k) / spawnCount + (Math.random() - 0.5);
          const burstSpeed = 6 + Math.random() * 6;
          const frag = spawnParticle(
            p1.x + Math.cos(angle) * getRadius(p1.mass) * 0.5,
            p1.y + Math.sin(angle) * getRadius(p1.mass) * 0.5,
            FRAGMENT_MASS,
            nextId,
            p1.color,
          );
          frag.vx = Math.cos(angle) * burstSpeed;
          frag.vy = Math.sin(angle) * burstSpeed;
          frag.mergeCooldown = 30;
          newParts.push(frag);
        }
        newExplosions.push({
          x: p1.x,
          y: p1.y,
          radius: getRadius(p1.mass) * 2,
          maxRadius: getRadius(p1.mass) * 10,
          alpha: 1.0,
          color: p1.color,
        });
        toRemove.add(p1.id);
      }
    } // end particle loop
  } // end sub-step loop

  // ── Build next particles array ────────────────────────────────────────────
  const nextParts: Particle[] = [];
  for (const p of parts) {
    if (!toRemove.has(p.id)) nextParts.push(p);
  }
  for (const np of newParts) nextParts.push(np);

  // ── Advance existing explosions ───────────────────────────────────────────
  const updatedExplosions: Explosion[] = [];
  for (const exp of explosions) {
    exp.alpha -= 0.025;
    // Expand toward maxRadius, then slow down (ease-out feel)
    const expandRate = (exp.maxRadius - exp.radius) * 0.12 + 1;
    exp.radius += expandRate;
    if (exp.alpha > 0) updatedExplosions.push(exp);
  }
  for (const ne of newExplosions) updatedExplosions.push(ne);

  return { nextParts, newExplosions: updatedExplosions };
};
