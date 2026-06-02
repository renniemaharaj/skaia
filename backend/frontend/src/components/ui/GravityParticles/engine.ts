export type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: string;
  mergeCooldown: number;
};

export type Explosion = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: string;
};

export type PhysicsSettings = {
  gravityConstant: number;
  maxVelocity: number;
  explosionThreshold: number;
  bounceRestitution: number;
  orbitalDecayChance: number;
  cursorMass: number;
};

export const BOUNDING_BOX_DAMPING = 0.8;
export const CURSOR_REPULSION_DIST = 100;
export const defaultColors = ['#5b9e8e', '#ff0055', '#ffe600', '#00ff66'];

export const hexToRgbStr = (hex: string) => {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const int = parseInt(hex, 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
};

export const blendColors = (c1: string, c2: string, m1: number, m2: number) => {
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

export const getRadius = (mass: number) => Math.sqrt(mass) * 1.5;

export const spawnParticle = (x: number, y: number, mass: number, nextId: { current: number }): Particle => {
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

export const stepPhysics = (
  parts: Particle[],
  explosions: Explosion[],
  settings: PhysicsSettings,
  activeCursors: { x: number; y: number }[],
  grabbedParticle: { id: number; offsetX: number; offsetY: number } | null,
  mousePos: { x: number; y: number; active: boolean },
  width: number,
  height: number,
  nextId: { current: number }
): { nextParts: Particle[], newExplosions: Explosion[] } => {
  const { 
    gravityConstant: G, 
    maxVelocity: MAX_VELOCITY, 
    explosionThreshold: EXPLOSION_MASS_THRESHOLD, 
    bounceRestitution, 
    orbitalDecayChance, 
    cursorMass: CURSOR_MASS 
  } = settings;

  const newParts: Particle[] = [];
  const toRemove = new Set<number>();
  const newExplosions: Explosion[] = [];

  const combinedCursors = [...activeCursors];
  if (mousePos.active && !grabbedParticle) {
    combinedCursors.push({ x: mousePos.x, y: mousePos.y });
  }

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

        const approachSpeed = -velAlongNormal;
        const isOrbitalDecay = approachSpeed < 3.5 && Math.random() < orbitalDecayChance;

        if (approachSpeed < 3.5 && !isOrbitalDecay) {
          if (velAlongNormal < 0) {
            const massRatio = Math.min(p1.mass, p2.mass) / Math.max(p1.mass, p2.mass);
            const restitution = Math.max(0.05, bounceRestitution * massRatio); 
            
            const jForce = -(1 + restitution) * velAlongNormal;
            const impulse = jForce / (1 / p1.mass + 1 / p2.mass);

            p1.vx -= (impulse * nx) / p1.mass;
            p1.vy -= (impulse * ny) / p1.mass;
            p2.vx += (impulse * nx) / p2.mass;
            p2.vy += (impulse * ny) / p2.mass;

            const tx = -ny;
            const ty = nx;
            const totalMass = p1.mass + p2.mass;
            
            const v_orbit = Math.sqrt((G * totalMass) / dist);
            const velAlongTangent = dvx * tx + dvy * ty;

            if (Math.abs(velAlongTangent) < v_orbit * 0.5) {
              const direction = velAlongTangent >= 0 ? 1 : -1;
              const spinForce = Math.min(0.8, v_orbit * 0.85) * direction;

              p1.vx -= tx * spinForce * (p2.mass / totalMass);
              p1.vy -= ty * spinForce * (p2.mass / totalMass);
              p2.vx += tx * spinForce * (p1.mass / totalMass);
              p2.vy += ty * spinForce * (p1.mass / totalMass);
            }
          }

          const overlap = minDist - dist;
          p1.x -= nx * overlap * 0.5;
          p1.y -= ny * overlap * 0.5;
          p2.x += nx * overlap * 0.5;
          p2.y += ny * overlap * 0.5;
        } else {
          if (approachSpeed >= 3.5) {
            toRemove.add(p1.id);
            toRemove.add(p2.id);

            const explodeParticle = (p: Particle) => {
              newExplosions.push({
                x: p.x, y: p.y, radius: getRadius(p.mass) * 2, alpha: 1, color: p.color
              });
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
                    mass: Math.max(1, (p.mass / numFragments) * 0.9),
                    color: p.color,
                    mergeCooldown: 60,
                  });
                }
              }
            };

            explodeParticle(p1);
            explodeParticle(p2);
            break; 
          } else {
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

      const force = (G * p1.mass * p2.mass) / (distSq + 20);
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
    }

    for (const cursor of combinedCursors) {
      const dx = cursor.x - p1.x;
      const dy = cursor.y - p1.y;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);
      
      if (dist < CURSOR_REPULSION_DIST) {
        const force = -(G * p1.mass * CURSOR_MASS * 5) / (distSq + 10);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      } else {
        const force = (G * p1.mass * CURSOR_MASS) / (distSq + 100);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
    }

    if (toRemove.has(p1.id)) continue;

    if (p1.mergeCooldown > 0) p1.mergeCooldown--;

    p1.vx += fx / p1.mass;
    p1.vy += fy / p1.mass;

    const speed = Math.sqrt(p1.vx * p1.vx + p1.vy * p1.vy);
    if (speed > MAX_VELOCITY) {
      p1.vx = (p1.vx / speed) * MAX_VELOCITY;
      p1.vy = (p1.vy / speed) * MAX_VELOCITY;
    }

    p1.x += p1.vx;
    p1.y += p1.vy;

    if (grabbedParticle?.id === p1.id) {
      p1.x = mousePos.x + grabbedParticle.offsetX;
      p1.y = mousePos.y + grabbedParticle.offsetY;
      p1.vx = 0;
      p1.vy = 0;
    }

    const r = getRadius(p1.mass);
    if (p1.x < r) { p1.x = r; p1.vx *= -BOUNDING_BOX_DAMPING; }
    if (p1.x > width - r) { p1.x = width - r; p1.vx *= -BOUNDING_BOX_DAMPING; }
    if (p1.y < r) { p1.y = r; p1.vy *= -BOUNDING_BOX_DAMPING; }
    if (p1.y > height - r) { p1.y = height - r; p1.vy *= -BOUNDING_BOX_DAMPING; }

    if (p1.mass > EXPLOSION_MASS_THRESHOLD) {
      const fragmentMass = 2; 
      const spawnCount = Math.floor(p1.mass / fragmentMass);

      for (let k = 0; k < spawnCount; k++) {
        const angle = (Math.PI * 2 * k) / spawnCount + (Math.random() - 0.5);
        const burstSpeed = 6 + Math.random() * 6;
        const radiusOffset = getRadius(p1.mass) * 0.5; 
        const newP = spawnParticle(
          p1.x + Math.cos(angle) * radiusOffset, 
          p1.y + Math.sin(angle) * radiusOffset, 
          fragmentMass,
          nextId
        );
        newP.vx = Math.cos(angle) * burstSpeed;
        newP.vy = Math.sin(angle) * burstSpeed;
        newP.color = p1.color;
        newP.mergeCooldown = 30; 
        newParts.push(newP);
      }

      newExplosions.push({
        x: p1.x,
        y: p1.y,
        radius: getRadius(p1.mass) * 8,
        alpha: 1.0,
        color: p1.color,
      });

      toRemove.add(p1.id);
    }
  }

  const nextParts: Particle[] = [];
  for (const p of parts) {
    if (!toRemove.has(p.id)) nextParts.push(p);
  }
  for (const np of newParts) nextParts.push(np);

  // Filter explosions and update them
  const updatedExplosions: Explosion[] = [];
  for (const exp of explosions) {
    exp.alpha -= 0.03;
    exp.radius += 2;
    if (exp.alpha > 0) updatedExplosions.push(exp);
  }
  for (const newExp of newExplosions) updatedExplosions.push(newExp);

  return { nextParts, newExplosions: updatedExplosions };
};
