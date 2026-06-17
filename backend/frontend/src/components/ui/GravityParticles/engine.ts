export type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: string;
  mergeCooldown: number;
  /** 0–1 heat accumulated from near-misses / explosions */
  heat: number;
  /** Ring buffer of recent positions for trail rendering, newest-first */
  trail: { x: number; y: number }[];

  // Alive fields
  /**
   * 0 = fully social (seeks density), 1 = fully antisocial (flees density).
   * Triangle-distributed at birth so most particles are mid-spectrum.
   */
  antisocialLevel?: number;
  /** Ticks until next think cycle. Staggered per particle. */
  thinkCooldown?: number;
  /** World-space destination the particle is travelling toward. */
  destination?: { x: number; y: number } | null;
  /** The angle the particle is currently steering toward (radians). */
  desiredAngle?: number;
  /** Whether the particle considers itself "inside" a system right now. */
  inSystem?: boolean;
  /**
   * Target orbital radius from the system CoM this particle is trying to hold.
   * Set on entry to a system; null when not in a system.
   */
  targetOrbitalRadius?: number | null;
  /** Arrival order token - lower = earlier = higher priority for inner slots. */
  systemArrivalOrder?: number;
  /**
   * Estimated gravitational binding energy of this particle to its local system,
   * refreshed each think cycle. Used to scale escape force for antisocial particles.
   * 0 when not in a system.
   */
  bindingEnergy?: number;
  /**
   * When > 0 the particle is in active escape mode - applies a sustained
   * counterforce against the local gravitational gradient regardless of
   * thinkCooldown. Counts down each tick.
   */
  escapeBurnTicks?: number;
  /** Cached CoM of the system the particle last evaluated. */
  systemCoM?: { x: number; y: number } | null;
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

import { applySystemGravity, buildClusterMap } from "./particleSystems";
import type { CourtshipFields } from "./particleSystems";

export type PhysicsSettings = {
  gravityConstant: number;
  maxVelocity: number;
  explosionThreshold: number;
  bounceRestitution: number;
  orbitalDecayChance: number;
  mergeThreshold: number;
  cursorMass: number;
  cursorMode: "mixed" | "gravity" | "repel";
  createOnClick: boolean;
  subSteps: number;
  trailLength: number;
  shockwaveForce: number;
  fragmentMass: number;
  particlesAreAlive: boolean;
  rendererType: "default" | "center-anchored" | "text";
  rendererText: string;
  /** Ticks between think cycles (base, ±30% jitter). Default 90. */
  thinkInterval: number;
  /** Sight radius (px) for pressure scanning. Default 140. */
  sightRadius: number;
  /** Number of ray directions cast during scan. Default 16. */
  sightRays: number;
  /**
   * Steering force coefficient - multiplied by the particle's estimated
   * gravitational binding when escaping, so antisocial particles can actually
   * break free. Default 0.35.
   */
  aliveSteerForce: number;
  /** Look-ahead horizon (px) for collision avoidance. Default 80. */
  avoidanceHorizon: number;
  /** Half-angle (radians) of the look-ahead cone. Default π/5. */
  avoidanceHalfAngle: number;
  /** Spacing between orbital ring slots (px). Default 30. */
  ringSpacing: number;
  /**
   * Spring constant for ring stabilisation.
   * The actual force is ALSO multiplied by local gravitational strength so
   * rings hold under strong gravity. Default 0.12.
   */
  ringSpringK: number;
  /**
   * Minimum clearance (px) enforced between any particle and the system CoM.
   * Acts as a hard repulsion floor - prevents full gravitational collapse.
   * Default = ringSpacing (one ring-width).
   */
  collapseGuardRadius: number;
  /** Audio Visualization Mode: map gravity to bass and highs to velocity */
  audioVisualization: boolean;
};

// Constants

export const BOUNDING_BOX_DAMPING = 0.75;
export const CURSOR_REPULSION_DIST = 100;
export const MAX_TRAIL_LENGTH = 12;

export const defaultColors = ["#5b9e8e", "#ff0055", "#ffe600", "#00ff66", "#a78bfa", "#f97316"];

export const defaultSettings: PhysicsSettings = {
  gravityConstant: 0.5,
  maxVelocity: 18,
  explosionThreshold: 120,
  bounceRestitution: 0.55,
  orbitalDecayChance: 0.012,
  mergeThreshold: 3.5,
  cursorMass: 80,
  cursorMode: "gravity",
  createOnClick: false,
  subSteps: 2,
  trailLength: MAX_TRAIL_LENGTH,
  shockwaveForce: 6,
  fragmentMass: 2,
  particlesAreAlive: false,
  rendererType: "default",
  rendererText: "SKAIA",
  thinkInterval: 90,
  sightRadius: 140,
  sightRays: 16,
  aliveSteerForce: 0.35,
  avoidanceHorizon: 80,
  avoidanceHalfAngle: Math.PI / 5,
  ringSpacing: 30,
  ringSpringK: 0.12,
  collapseGuardRadius: 30, // = ringSpacing by default
  audioVisualization: false,
};

// Colour helpers

export const hexToRgbStr = (hex: string): string => {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map(c => c + c)
      .join("");
  const int = Number.parseInt(hex, 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
};

const hex2rgb = (hex: string): [number, number, number] => {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map(c => c + c)
      .join("");
  const int = Number.parseInt(hex, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
};

export const blendColors = (c1: string, c2: string, m1: number, m2: number): string => {
  const [r1, g1, b1] = hex2rgb(c1);
  const [r2, g2, b2] = hex2rgb(c2);
  const total = m1 + m2;
  const r = Math.round((r1 * m1 + r2 * m2) / total);
  const g = Math.round((g1 * m1 + g2 * m2) / total);
  const b = Math.round((b1 * m1 + b2 * m2) / total);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};

// Geometry helpers

export const getRadius = (mass: number): number => Math.sqrt(mass) * 1.5;

const softeningEpsilonSq = (r1: number, r2: number): number => {
  const s = (r1 + r2) * 0.5;
  return s * s + 4;
};

// Particle factory

export const spawnParticle = (
  x: number,
  y: number,
  mass: number,
  nextId: { current: number },
  color?: string,
  particlesAreAlive?: boolean
): Particle => {
  const p: Particle = {
    id: nextId.current++,
    x,
    y,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    mass,
    color: color ?? defaultColors[Math.floor(Math.random() * defaultColors.length)],
    mergeCooldown: 0,
    heat: 0,
    trail: [],
  };

  if (particlesAreAlive) {
    const a = Math.random();
    const b = Math.random();
    p.antisocialLevel = (a + b) / 2; // triangle distribution 0–1
    p.thinkCooldown = Math.floor(Math.random() * 90);
    p.desiredAngle = Math.random() * Math.PI * 2;
    p.destination = null;
    p.inSystem = false;
    p.targetOrbitalRadius = null;
    p.systemArrivalOrder = 0;
    p.bindingEnergy = 0;
    p.escapeBurnTicks = 0;
    p.systemCoM = null;
  }

  return p;
};

// Alive behaviour helpers

let _arrivalCounter = 0;

// System analysis

type SystemInfo = {
  cx: number;
  cy: number;
  totalMass: number;
  count: number;
  /**
   * Approximate gravitational acceleration magnitude this particle feels
   * from the combined system mass at its current position.
   */
  gravAccel: number;
};

/**
 * Compute the local system CoM, total mass, and the gravitational acceleration
 * this particle would feel from that combined mass.
 *
 * gravAccel = G * totalMass / dist²  (softened)
 * This is used to scale escape forces so they actually overcome gravity.
 */
const computeLocalSystem = (
  p: Particle,
  parts: Particle[],
  toRemove: Set<number>,
  radius: number,
  G: number
): SystemInfo | null => {
  let cx = 0;
  let cy = 0;
  let totalMass = 0;
  let count = 0;
  const r2 = radius * radius;

  for (const other of parts) {
    if (other.id === p.id || toRemove.has(other.id)) continue;
    const dx = other.x - p.x;
    const dy = other.y - p.y;
    if (dx * dx + dy * dy < r2) {
      cx += other.x * other.mass;
      cy += other.y * other.mass;
      totalMass += other.mass;
      count++;
    }
  }

  if (count < 2) return null;

  cx /= totalMass;
  cy /= totalMass;

  const dcx = cx - p.x;
  const dcy = cy - p.y;
  const distSq = Math.max(dcx * dcx + dcy * dcy, 1);
  const gravAccel = (G * totalMass) / distSq;

  return { cx, cy, totalMass, count, gravAccel };
};

// Pressure scan

const scanPressure = (
  p: Particle,
  parts: Particle[],
  attractors: AttractorParticle[],
  toRemove: Set<number>,
  numRays: number,
  sightRadius: number
): number[] => {
  const pressure = new Array<number>(numRays).fill(0);
  const step = (Math.PI * 2) / numRays;
  const sr2 = sightRadius * sightRadius;

  const sample = (sx: number, sy: number, mass: number) => {
    const dx = sx - p.x;
    const dy = sy - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > sr2 || d2 < 0.01) return;
    const angle = Math.atan2(dy, dx);
    let idx = Math.round(angle / step) % numRays;
    if (idx < 0) idx += numRays;
    pressure[idx] += mass / d2;
  };

  for (const other of parts) {
    if (other.id === p.id || toRemove.has(other.id)) continue;
    sample(other.x, other.y, other.mass);
  }
  for (const att of attractors) sample(att.x, att.y, att.mass);

  return pressure;
};

// Destination picker

const pickDestination = (
  p: Particle,
  pressure: number[],
  numRays: number,
  sightRadius: number
): { x: number; y: number } => {
  const step = (Math.PI * 2) / numRays;
  const al = p.antisocialLevel ?? 0.5;

  // Bias toward current heading (inertia)
  const currentAngle = Math.atan2(p.vy, p.vx);
  const biased = pressure.slice();
  const maxP = Math.max(...biased, 0.001);
  let closestRay = Math.round(currentAngle / step) % numRays;
  if (closestRay < 0) closestRay += numRays;
  biased[closestRay] += maxP * 0.2;

  let chosenIdx = 0;

  if (al > 0.6) {
    // Antisocial => minimum pressure direction
    let minV = Number.POSITIVE_INFINITY;
    for (let i = 0; i < numRays; i++) {
      if (biased[i] < minV) {
        minV = biased[i];
        chosenIdx = i;
      }
    }
  } else if (al < 0.4) {
    // Social => maximum pressure direction
    let maxV = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < numRays; i++) {
      if (biased[i] > maxV) {
        maxV = biased[i];
        chosenIdx = i;
      }
    }
  } else {
    // Ambivalent => weighted-random toward emptier rays
    const weights = biased.map(v => 1 / (v + 0.001));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < numRays; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosenIdx = i;
        break;
      }
    }
  }

  const angle = chosenIdx * step;
  const dist = sightRadius * 0.85;
  return { x: p.x + Math.cos(angle) * dist, y: p.y + Math.sin(angle) * dist };
};

// Ring slot assignment

const computeTargetRing = (
  p: Particle,
  systemParticles: Particle[],
  ringSpacing: number,
  collapseGuardRadius: number
): number => {
  const al = p.antisocialLevel ?? 0.5;
  const arrivalOrder = p.systemArrivalOrder ?? _arrivalCounter;

  const masses = systemParticles.map(q => q.mass);
  const minMass = Math.min(...masses, p.mass);
  const maxMass = Math.max(...masses, p.mass);
  const massNorm = maxMass > minMass ? (p.mass - minMass) / (maxMass - minMass) : 0.5;

  const orders = systemParticles.map(q => q.systemArrivalOrder ?? 0).concat(arrivalOrder);
  const minOrder = Math.min(...orders);
  const maxOrder = Math.max(...orders);
  const orderNorm = maxOrder > minOrder ? (arrivalOrder - minOrder) / (maxOrder - minOrder) : 0;

  // Score => ring index: heavy=inner, antisocial=outer, early=inner
  const score = (1 - massNorm) * 0.35 + al * 0.45 + orderNorm * 0.2;
  const ringIdx = Math.min(4, Math.floor(score * 5));

  // Innermost ring must be at least collapseGuardRadius away from CoM
  return collapseGuardRadius + (ringIdx + 1) * ringSpacing;
};

// Ring stabilisation force

/**
 * Returns the combined radial + tangential + neighbour-repulsion force for a
 * particle trying to hold its orbital ring.
 *
 * Key fix vs previous version:
 *  - Hard repulsion floor at collapseGuardRadius from CoM (exponential wall)
 *  - Ring spring scaled by gravAccel so it can resist whatever gravity applies
 *  - Neighbour repulsion zone is ringSpacing-based, not radius-based
 */
const computeRingForce = (
  p: Particle,
  parts: Particle[],
  toRemove: Set<number>,
  cx: number,
  cy: number,
  gravAccel: number,
  ringSpringK: number,
  ringSpacing: number,
  collapseGuardRadius: number
): { rfx: number; rfy: number } => {
  const rdx = p.x - cx;
  const rdy = p.y - cy;
  const currentR = Math.sqrt(rdx * rdx + rdy * rdy) || 0.001;
  const ux = rdx / currentR; // unit vec outward from CoM
  const uy = rdy / currentR;

  const targetR = p.targetOrbitalRadius ?? collapseGuardRadius + ringSpacing;

  let rfx = 0;
  let rfy = 0;

  // 1. Hard collapse guard - exponential repulsion below guard radius
  if (currentR < collapseGuardRadius) {
    // Force grows steeply as the particle approaches the CoM
    const penetration = collapseGuardRadius - currentR;
    const guardMag = penetration * penetration * 0.5 * p.mass;
    rfx += ux * guardMag;
    rfy += uy * guardMag;
  }

  // 2. Ring spring - scaled by gravAccel so it competes with gravity
  const radialError = currentR - targetR;
  // Scale: ringSpringK controls shape; gravAccel ensures strength matches field
  const springScale = ringSpringK * (1 + gravAccel * 2.5);
  const radialMag = radialError * springScale * p.mass;
  // Negative: pulls toward target (positive error = too far out = pull inward)
  rfx -= ux * radialMag;
  rfy -= uy * radialMag;

  // 3. Tangential nudge - maintains orbit rather than radial stacking
  const tangentialDir = p.id % 2 === 0 ? 1 : -1;
  const tangentialMag = ringSpringK * gravAccel * p.mass * 0.6;
  rfx += -uy * tangentialDir * tangentialMag;
  rfy += ux * tangentialDir * tangentialMag;

  // 4. Same-ring neighbour repulsion
  // Zone is ringSpacing × 0.7 - generous enough to spread without tight packing
  const repelZone = ringSpacing * 0.7;
  for (const other of parts) {
    if (other.id === p.id || toRemove.has(other.id)) continue;
    if (!other.inSystem || other.targetOrbitalRadius == null) continue;
    // Only same-ring neighbours
    if (Math.abs((other.targetOrbitalRadius ?? 0) - targetR) > ringSpacing * 0.5) continue;
    const odx = p.x - other.x;
    const ody = p.y - other.y;
    const od = Math.sqrt(odx * odx + ody * ody) || 0.001;
    if (od < repelZone) {
      const repulse = ((repelZone - od) / repelZone) * ringSpringK * p.mass * 2.0;
      rfx += (odx / od) * repulse;
      rfy += (ody / od) * repulse;
    }
  }

  return { rfx, rfy };
};

// Escape force

/**
 * For antisocial particles in a gravitational trap:
 * Compute the force needed to counteract local gravity and then some.
 *
 * escapeForce = gravAccel × mass × (1 + antisocialLevel × boostFactor)
 *
 * Direction: away from system CoM, blended with the particle's desired angle
 * so it steers toward the exit rather than just pushing radially outward.
 */
const computeEscapeForce = (
  p: Particle,
  cx: number,
  cy: number,
  gravAccel: number,
  al: number,
  desiredAngle: number
): { efx: number; efy: number } => {
  const rdx = p.x - cx;
  const rdy = p.y - cy;
  const dist = Math.sqrt(rdx * rdx + rdy * rdy) || 0.001;

  // Radial outward unit vector
  const rx = rdx / dist;
  const ry = rdy / dist;

  // Desired direction unit vector
  const dx = Math.cos(desiredAngle);
  const dy = Math.sin(desiredAngle);

  // Blend: 60% away from CoM, 40% toward desired exit
  const bx = rx * 0.6 + dx * 0.4;
  const by = ry * 0.6 + dy * 0.4;
  const bLen = Math.sqrt(bx * bx + by * by) || 0.001;

  // Scale: must overcome gravity, plus extra proportional to antisocial level
  // boost ranges 1.4× (al=0.6) to 2.2× (al=1.0)
  const boost = 1.0 + al * 1.2;
  const mag = gravAccel * p.mass * boost;

  return { efx: (bx / bLen) * mag, efy: (by / bLen) * mag };
};

// Look-ahead collision avoidance

const computeAvoidanceForce = (
  p: Particle,
  parts: Particle[],
  toRemove: Set<number>,
  horizon: number,
  halfAngle: number,
  antisocialLevel: number
): { bfx: number; bfy: number; lfx: number; lfy: number } => {
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (speed < 0.5) return { bfx: 0, bfy: 0, lfx: 0, lfy: 0 };

  const heading = Math.atan2(p.vy, p.vx);
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  const urgencyScale = 0.4 + antisocialLevel * 0.6;

  let closestDist = Number.POSITIVE_INFINITY;
  let threatDx = 0;
  let threatDy = 0;

  for (const other of parts) {
    if (other.id === p.id || toRemove.has(other.id)) continue;
    const dx = other.x - p.x;
    const dy = other.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
    if (dist > horizon) continue;

    const forward = dx * cosH + dy * sinH;
    if (forward < 0) continue;

    const angle = Math.abs(Math.atan2(Math.abs(dx * sinH - dy * cosH), Math.abs(forward)));
    if (angle > halfAngle) continue;

    const combinedR = getRadius(p.mass) + getRadius(other.mass) + 4;
    if (dist < combinedR * 3 && dist < closestDist) {
      closestDist = dist;
      threatDx = dx;
      threatDy = dy;
    }
  }

  if (closestDist === Number.POSITIVE_INFINITY) return { bfx: 0, bfy: 0, lfx: 0, lfy: 0 };

  const closingFraction = 1 - closestDist / horizon;
  const brakeMag = speed * closingFraction * urgencyScale * p.mass * 0.6;
  const bfx = -(p.vx / speed) * brakeMag;
  const bfy = -(p.vy / speed) * brakeMag;

  const lateralOffset = threatDx * -sinH + threatDy * cosH;
  const lateralDir = lateralOffset >= 0 ? -1 : 1;
  const lateralMag = closingFraction * urgencyScale * p.mass * 0.8;
  const lfx = -sinH * lateralDir * lateralMag;
  const lfy = cosH * lateralDir * lateralMag;

  return { bfx, bfy, lfx, lfy };
};

// Spatial Hash Grid

class SpatialHash {
  private cells = new Map<number, number[]>();
  private cellSize: number;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  private key(cx: number, cy: number): number {
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

// stepPhysics

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
  attractors: AttractorParticle[] = []
): { nextParts: Particle[]; newExplosions: Explosion[] } => {
  const {
    gravityConstant: G,
    maxVelocity: MAX_V,
    explosionThreshold: EXPLOSION_MASS_THRESHOLD,
    bounceRestitution,
    orbitalDecayChance,
    mergeThreshold,
    cursorMass: CURSOR_MASS,
    cursorMode,
    subSteps,
    trailLength,
    shockwaveForce,
    fragmentMass: FRAGMENT_MASS,
    particlesAreAlive,
    thinkInterval,
    sightRadius,
    sightRays,
    aliveSteerForce,
    avoidanceHorizon,
    avoidanceHalfAngle,
    ringSpacing,
    ringSpringK,
    collapseGuardRadius,
  } = settings;

  const dt = 1 / Math.max(1, subSteps);

  const combinedCursors = [...activeCursors];
  if (mousePos.active && !grabbedParticle) {
    combinedCursors.push({ x: mousePos.x, y: mousePos.y });
  }

  const grid = new SpatialHash(60);
  const toRemove = new Set<number>();
  const newParts: Particle[] = [];
  const newExplosions: Explosion[] = [];
  const clusterMap = buildClusterMap(parts);

  // Explode helper
  const explodeParticle = (p: Particle, shockCenter?: { x: number; y: number }) => {
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
        particlesAreAlive
      );
      frag.vx = p.vx + Math.cos(angle) * speed;
      frag.vy = p.vy + Math.sin(angle) * speed;
      frag.mergeCooldown = 60;
      newParts.push(frag);
    }

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

  // Sub-step loop
  for (let step = 0; step < subSteps; step++) {
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

      // Particle–particle collisions
      for (const j of grid.query(p1.x, p1.y)) {
        if (j <= i) continue;
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
          const nx = dx / dist;
          const ny = dy / dist;
          const dvx = p2.vx - p1.vx;
          const dvy = p2.vy - p1.vy;
          const velAlongNormal = dvx * nx + dvy * ny;
          const approachSpeed = -velAlongNormal;

          const allowMerge = settings.rendererType === "default";
          const isOrbitalDecay =
            allowMerge && approachSpeed < mergeThreshold && Math.random() < orbitalDecayChance;

          if (allowMerge && approachSpeed >= Math.max(3.5, mergeThreshold)) {
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
            const newColor = blendColors(p1.color, p2.color, p1.mass, p2.mass);
            if (p1.mass >= p2.mass) {
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

          if (velAlongNormal < 0) {
            const massRatio = Math.min(p1.mass, p2.mass) / Math.max(p1.mass, p2.mass);
            const e = Math.max(0.05, bounceRestitution * Math.sqrt(massRatio));
            const j_impulse = (-(1 + e) * velAlongNormal) / (1 / p1.mass + 1 / p2.mass);
            p1.vx -= (j_impulse * nx) / p1.mass;
            p1.vy -= (j_impulse * ny) / p1.mass;
            p2.vx += (j_impulse * nx) / p2.mass;
            p2.vy += (j_impulse * ny) / p2.mass;

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

          const overlap = minDist - dist;
          const correction = overlap * 0.5;
          p1.x -= nx * correction;
          p1.y -= ny * correction;
          p2.x += nx * correction;
          p2.y += ny * correction;
        }
      }

      // System gravity
      const { fx: sfx, fy: sfy } = applySystemGravity(p1, clusterMap, parts, G, toRemove);
      fx += sfx;
      fy += sfy;

      // Cursor interactions
      for (const cursor of combinedCursors) {
        const dx = cursor.x - p1.x;
        const dy = cursor.y - p1.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 0.001;
        if (cursorMode === "repel") {
          const force = -(G * p1.mass * CURSOR_MASS * 5) / (distSq + 10);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        } else if (cursorMode === "mixed" && dist < CURSOR_REPULSION_DIST) {
          const force = -(G * p1.mass * CURSOR_MASS * 5) / (distSq + 10);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        } else {
          const force = (G * p1.mass * CURSOR_MASS) / (distSq + 100);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
      }

      // Static attractors
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

      // ALIVE BEHAVIOUR

      if (particlesAreAlive && p1.antisocialLevel !== undefined) {
        const al = p1.antisocialLevel;

        // Lazy-init
        if (p1.thinkCooldown === undefined) {
          p1.thinkCooldown = Math.floor(Math.random() * thinkInterval);
          p1.desiredAngle = Math.atan2(p1.vy, p1.vx);
          p1.destination = null;
          p1.inSystem = false;
          p1.targetOrbitalRadius = null;
          p1.systemArrivalOrder = 0;
          p1.bindingEnergy = 0;
          p1.escapeBurnTicks = 0;
          p1.systemCoM = null;
        }

        p1.thinkCooldown!--;

        if (p1.thinkCooldown! <= 0) {
          // Q1: "Where am I?"
          const localSystem = computeLocalSystem(p1, parts, toRemove, sightRadius * 0.7, G);
          const wasInSystem = p1.inSystem;
          p1.inSystem = localSystem !== null;

          if (localSystem) {
            p1.systemCoM = { x: localSystem.cx, y: localSystem.cy };
            p1.bindingEnergy = localSystem.gravAccel;

            if (!wasInSystem) {
              // Just entered - assign ring slot
              p1.systemArrivalOrder = _arrivalCounter++;
              const systemParts = parts.filter(q => {
                if (q.id === p1.id || toRemove.has(q.id)) return false;
                const dx = q.x - p1.x;
                const dy = q.y - p1.y;
                return dx * dx + dy * dy < (sightRadius * 0.7) ** 2;
              });
              p1.targetOrbitalRadius = computeTargetRing(
                p1,
                systemParts,
                ringSpacing,
                collapseGuardRadius
              );
            }

            // Check if antisocial particle should escape
            // Trigger escape burn if: antisocial AND system is dense enough to matter
            if (al > 0.6 && localSystem.gravAccel > 0.05) {
              // How trapped are we? Compare current speed vs escape velocity estimate
              const escapeVelSq =
                (2 * G * localSystem.totalMass) /
                Math.max(Math.sqrt((localSystem.cx - p1.x) ** 2 + (localSystem.cy - p1.y) ** 2), 1);
              const speedSq = p1.vx * p1.vx + p1.vy * p1.vy;
              const trappedFraction = 1 - Math.min(1, speedSq / escapeVelSq);

              // The more trapped and the more antisocial, the longer the burn
              const burnDuration = Math.floor(trappedFraction * al * thinkInterval * 1.5);
              if (burnDuration > 0) {
                p1.escapeBurnTicks = burnDuration;
              }
            }
          } else {
            p1.systemCoM = null;
            p1.bindingEnergy = 0;
            if (wasInSystem) {
              p1.targetOrbitalRadius = null;
              p1.escapeBurnTicks = 0;
            }
          }

          // Q2: "Where am I going?"
          const dest = p1.destination;
          if (dest) {
            const ddx = dest.x - p1.x;
            const ddy = dest.y - p1.y;
            const destDist = Math.sqrt(ddx * ddx + ddy * ddy);
            const destinationReached = destDist < sightRadius * 0.2;

            if (destinationReached) {
              // Arrived - evaluate whether to stay
              const pressure = scanPressure(
                p1,
                parts,
                attractors,
                toRemove,
                sightRays,
                sightRadius
              );
              const totalPressure = pressure.reduce((a, b) => a + b, 0);
              const densityThreshold = 0.5;
              const tooMuch = totalPressure > densityThreshold && al > 0.55;
              const tooFew = totalPressure < densityThreshold * 0.1 && al < 0.35;

              if (tooMuch || tooFew) {
                const p2 = scanPressure(p1, parts, attractors, toRemove, sightRays, sightRadius);
                p1.destination = pickDestination(p1, p2, sightRays, sightRadius);
              } else {
                p1.destination = null; // content to linger
              }
            } else if (p1.inSystem && al > 0.65 && localSystem) {
              // In a system mid-journey while antisocial - override toward escape
              const escapePressure = scanPressure(
                p1,
                parts,
                attractors,
                toRemove,
                sightRays,
                sightRadius
              );
              p1.destination = pickDestination(p1, escapePressure, sightRays, sightRadius);
            }
          }

          // Q3: "Where can I go?"
          if (!p1.destination) {
            const pressure = scanPressure(p1, parts, attractors, toRemove, sightRays, sightRadius);
            p1.destination = pickDestination(p1, pressure, sightRays, sightRadius);
          }

          if (p1.destination) {
            p1.desiredAngle = Math.atan2(p1.destination.y - p1.y, p1.destination.x - p1.x);
          }

          const jitter = Math.floor((Math.random() - 0.5) * thinkInterval * 0.6);
          p1.thinkCooldown = Math.max(20, thinkInterval + jitter);
        }

        // Every-tick alive forces

        // 1. Escape burn - sustained anti-gravity for trapped antisocial particles
        if ((p1.escapeBurnTicks ?? 0) > 0 && p1.systemCoM) {
          p1.escapeBurnTicks!--;
          const { efx, efy } = computeEscapeForce(
            p1,
            p1.systemCoM.x,
            p1.systemCoM.y,
            p1.bindingEnergy ?? 0.1,
            al,
            p1.desiredAngle ?? 0
          );
          fx += efx;
          fy += efy;
        }

        // 2. General steering toward desired angle (gentle baseline)
        //    Weaker when escape burn is active (burn handles it), stronger in open space
        const escapeBurning = (p1.escapeBurnTicks ?? 0) > 0;
        const steerBoost =
          !escapeBurning && p1.inSystem && al < 0.4
            ? 1.3 // social particles in a system steer toward ring more strongly
            : escapeBurning
              ? 0.2 // escape burn does the heavy lifting
              : 1.0;
        const steerScale = (aliveSteerForce / Math.sqrt(p1.mass)) * steerBoost;
        if (p1.desiredAngle !== undefined) {
          fx += Math.cos(p1.desiredAngle) * steerScale * p1.mass;
          fy += Math.sin(p1.desiredAngle) * steerScale * p1.mass;
        }

        // 3. Ring stabilisation - only for social/neutral particles in a system
        //    Antisocial particles trying to escape don't stabilise - they're leaving
        if (p1.inSystem && p1.targetOrbitalRadius != null && p1.systemCoM && al < 0.65) {
          const { rfx, rfy } = computeRingForce(
            p1,
            parts,
            toRemove,
            p1.systemCoM.x,
            p1.systemCoM.y,
            p1.bindingEnergy ?? 0.1,
            ringSpringK,
            ringSpacing,
            collapseGuardRadius
          );
          fx += rfx;
          fy += rfy;
        } else if (p1.inSystem && p1.systemCoM && al >= 0.65 && (p1.escapeBurnTicks ?? 0) === 0) {
          // Antisocial particle not actively burning - still apply collapse guard
          // so it doesn't get crushed while waiting for next think cycle
          const rdx = p1.x - p1.systemCoM.x;
          const rdy = p1.y - p1.systemCoM.y;
          const currentR = Math.sqrt(rdx * rdx + rdy * rdy) || 0.001;
          if (currentR < collapseGuardRadius) {
            const penetration = collapseGuardRadius - currentR;
            const guardMag = penetration * penetration * 0.5 * p1.mass;
            fx += (rdx / currentR) * guardMag;
            fy += (rdy / currentR) * guardMag;
          }
        }

        // 4. Look-ahead collision avoidance (while travelling with some speed)
        const spd = Math.sqrt(p1.vx * p1.vx + p1.vy * p1.vy);
        if (p1.destination && spd > 0.8) {
          const { bfx, bfy, lfx, lfy } = computeAvoidanceForce(
            p1,
            parts,
            toRemove,
            avoidanceHorizon,
            avoidanceHalfAngle,
            al
          );
          fx += bfx + lfx;
          fy += bfy + lfy;
        }
      }

      // END ALIVE

      if (toRemove.has(p1.id)) continue;

      // Integrate
      if (p1.mergeCooldown > 0) p1.mergeCooldown--;

      p1.vx += (fx / p1.mass) * dt;
      p1.vy += (fy / p1.mass) * dt;

      const speed = Math.sqrt(p1.vx * p1.vx + p1.vy * p1.vy);
      if (speed > MAX_V) {
        p1.vx = (p1.vx / speed) * MAX_V;
        p1.vy = (p1.vy / speed) * MAX_V;
      }

      p1.x += p1.vx * dt;
      p1.y += p1.vy * dt;

      if (grabbedParticle?.id === p1.id) {
        p1.x = mousePos.x + grabbedParticle.offsetX;
        p1.y = mousePos.y + grabbedParticle.offsetY;
        p1.vx = 0;
        p1.vy = 0;
      }

      // Boundaries
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

      if (p1.heat > 0) p1.heat = Math.max(0, p1.heat - 0.01);

      if (trailLength > 0) {
        p1.trail.unshift({ x: p1.x, y: p1.y });
        if (p1.trail.length > trailLength) p1.trail.length = trailLength;
      }

      // Threshold explosion
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
            particlesAreAlive
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
    }
  }

  // Build next frame
  const nextParts: Particle[] = [];
  for (const p of parts) {
    if (!toRemove.has(p.id)) nextParts.push(p);
  }
  for (const np of newParts) nextParts.push(np);

  const updatedExplosions: Explosion[] = [];
  for (const exp of explosions) {
    exp.alpha -= 0.025;
    const expandRate = (exp.maxRadius - exp.radius) * 0.12 + 1;
    exp.radius += expandRate;
    if (exp.alpha > 0) updatedExplosions.push(exp);
  }
  for (const ne of newExplosions) updatedExplosions.push(ne);

  return { nextParts, newExplosions: updatedExplosions };
};
