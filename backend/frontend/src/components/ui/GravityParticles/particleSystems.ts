import { getRadius, blendColors } from './engine';
import type { Particle } from './engine';

export const SYSTEM_PROXIMITY_FACTOR = 4.5;
export const SYSTEM_VELOCITY_THRESHOLD = 6.0;
export const COURTSHIP_START_DIST = 14;
export const COURTSHIP_SPEED_THRESHOLD = 4.5;

export type CourtshipFields = {
  courtshipTarget: number | null;
  courtshipGlow: number; // 0 to 1
  courtshipColor: string;
  systemCentroid: { x: number; y: number } | null;
  systemMass: number | null;
  systemId: number | null;
};

export type ParticleWithSystems = Particle & Partial<CourtshipFields>;

export type Cluster = {
  id: number;
  particles: ParticleWithSystems[];
  centroid: { x: number; y: number };
  totalMass: number;
};

export type ClusterMap = Map<number, Cluster>; // particle id -> Cluster

export const buildClusterMap = (parts: ParticleWithSystems[]): ClusterMap => {
  const map: ClusterMap = new Map();
  const clusters: Cluster[] = [];
  
  const visited = new Set<number>();
  
  for (let i = 0; i < parts.length; i++) {
    if (visited.has(parts[i].id)) continue;
    
    const clusterParts: ParticleWithSystems[] = [parts[i]];
    visited.add(parts[i].id);
    
    let head = 0;
    while (head < clusterParts.length) {
      const p1 = clusterParts[head++];
      const r1 = getRadius(p1.mass);
      
      for (let j = 0; j < parts.length; j++) {
        const p2 = parts[j];
        if (visited.has(p2.id)) continue;
        
        const r2 = getRadius(p2.mass);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const dvx = p2.vx - p1.vx;
        const dvy = p2.vy - p1.vy;
        const relSpeed = Math.sqrt(dvx * dvx + dvy * dvy);
        
        const minDist = (r1 + r2) * SYSTEM_PROXIMITY_FACTOR;
        if (dist < minDist && relSpeed < SYSTEM_VELOCITY_THRESHOLD) {
          visited.add(p2.id);
          clusterParts.push(p2);
        }
      }
    }
    
    let cx = 0, cy = 0, cmass = 0;
    for (const p of clusterParts) {
      cx += p.x * p.mass;
      cy += p.y * p.mass;
      cmass += p.mass;
    }
    cx /= cmass;
    cy /= cmass;
    
    const cluster: Cluster = {
      id: clusters.length,
      particles: clusterParts,
      centroid: { x: cx, y: cy },
      totalMass: cmass
    };
    clusters.push(cluster);
    
    for (const p of clusterParts) {
      p.systemId = cluster.id;
      p.systemCentroid = cluster.centroid;
      p.systemMass = cmass;
      map.set(p.id, cluster);
    }
  }
  
  return map;
};

const softeningEpsilonSq = (r1: number, r2: number): number => {
  const s = (r1 + r2) * 0.5;
  return s * s + 4;
};

export const applySystemGravity = (
  p1: Particle,
  clusterMap: ClusterMap,
  parts: Particle[],
  G: number,
  toRemove: Set<number>
): { fx: number; fy: number } => {
  let fx = 0;
  let fy = 0;
  
  const myCluster = clusterMap.get(p1.id);
  if (!myCluster) return { fx, fy };
  
  const seenClusters = new Set<number>();
  seenClusters.add(myCluster.id);
  
  // Attract to particles IN THE SAME cluster normally
  for (const p2 of myCluster.particles) {
    if (p1.id === p2.id || toRemove.has(p2.id)) continue;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);
    if (dist < 0.001) continue;
    
    const eps2 = softeningEpsilonSq(getRadius(p1.mass), getRadius(p2.mass));
    const force = (G * p1.mass * p2.mass) / (distSq + eps2);
    fx += (dx / dist) * force;
    fy += (dy / dist) * force;
  }
  
  // Attract to OTHER CLUSTERS as a single point mass
  for (const p2 of parts) {
    if (toRemove.has(p2.id)) continue;
    const otherCluster = clusterMap.get(p2.id);
    if (!otherCluster || seenClusters.has(otherCluster.id)) continue;
    seenClusters.add(otherCluster.id);
    
    const dx = otherCluster.centroid.x - p1.x;
    const dy = otherCluster.centroid.y - p1.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);
    if (dist < 0.001) continue;
    
    const eps2 = softeningEpsilonSq(getRadius(p1.mass), getRadius(otherCluster.totalMass));
    const force = (G * p1.mass * otherCluster.totalMass) / (distSq + eps2);
    fx += (dx / dist) * force;
    fy += (dy / dist) * force;
  }
  
  return { fx, fy };
};

export const computeCourtship = (parts: ParticleWithSystems[], frameCount: number): void => {
  for (const p1 of parts) {
    let bestTarget: ParticleWithSystems | null = null;
    let bestScore = 0;
    
    const r1 = getRadius(p1.mass);
    
    for (const p2 of parts) {
      if (p1.id === p2.id) continue;
      
      const r2 = getRadius(p2.mass);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const surfaceGap = dist - (r1 + r2);
      if (surfaceGap > COURTSHIP_START_DIST) continue;
      
      const dvx = p2.vx - p1.vx;
      const dvy = p2.vy - p1.vy;
      const relSpeed = Math.sqrt(dvx * dvx + dvy * dvy);
      
      if (relSpeed > COURTSHIP_SPEED_THRESHOLD) continue;
      
      const score = (1 - surfaceGap / COURTSHIP_START_DIST) * (1 - relSpeed / COURTSHIP_SPEED_THRESHOLD);
      if (score > bestScore) {
        bestScore = score;
        bestTarget = p2;
      }
    }
    
    if (bestTarget) {
      p1.courtshipTarget = bestTarget.id;
      p1.courtshipColor = blendColors(p1.color, bestTarget.color, p1.mass, bestTarget.mass);
      
      const pulse = Math.sin(frameCount * 0.1 + p1.id) * 0.5 + 0.5;
      p1.courtshipGlow = Math.min(1, (p1.courtshipGlow || 0) + 0.1) * (0.5 + bestScore * 0.5 * pulse);
    } else {
      p1.courtshipTarget = null;
      p1.courtshipGlow = Math.max(0, (p1.courtshipGlow || 0) - 0.05);
    }
  }
};
