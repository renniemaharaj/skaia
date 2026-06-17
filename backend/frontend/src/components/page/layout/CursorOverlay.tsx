import { useEffect, useRef, useState, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { cursorPositionsAtom } from "../../../atoms/presence";
import { currentUserAtom } from "../../../atoms/auth";
import UserAvatar from "../../user/UserAvatar";
import UserProfileOverlay from "../../user/UserProfileOverlay";
import "./CursorOverlay.css";

const CURSOR_EXPIRY_MS = 4000;
const COLLISION_RADIUS = 36; // Min distance between avatars
const REPULSION_FORCE = 0.4;

interface PhysicsNode {
  userId: number;
  x: number; // target document percentage
  y: number; // target document percentage
  vx: number;
  vy: number;
  renderedX: number; // actual pixels
  renderedY: number; // actual pixels
}

const CursorOverlay = () => {
  const cursors = useAtomValue(cursorPositionsAtom);
  const setCursors = useSetAtom(cursorPositionsAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const currentUserId = currentUser?.id ? Number(currentUser.id) : 0;

  // Interaction effects state
  const [pokedUsers, setPokedUsers] = useState<Set<number>>(new Set());
  const [spinningUsers, setSpinningUsers] = useState<Set<number>>(new Set());
  const [particles, setParticles] = useState<
    { id: string; userId: number; tx: string; ty: string; color: string }[]
  >([]);

  // Physics state
  const physicsRef = useRef<Map<number, PhysicsNode>>(new Map());
  const requestRef = useRef<number | null>(null);
  const localMouseRef = useRef({ x: -1000, y: -1000 });
  const lastParticleTimeRef = useRef<Map<number, number>>(new Map());

  // Track local mouse for physics pushing
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      localMouseRef.current = { x: e.pageX, y: e.pageY };
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  // Generate particles function
  const triggerParticles = useCallback((userId: number) => {
    const now = Date.now();
    const last = lastParticleTimeRef.current.get(userId) || 0;
    if (now - last < 500) return; // Cooldown
    lastParticleTimeRef.current.set(userId, now);

    const colors = [
      "var(--primary-color)",
      "var(--color-success)",
      "var(--color-warning)",
      "var(--color-danger)",
    ];
    const newParticles = Array.from({ length: 8 }).map((_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      const distance = 25 + Math.random() * 25;
      return {
        id: `${userId}-${now}-${i}`,
        userId,
        tx: `${Math.cos(angle) * distance}px`,
        ty: `${Math.sin(angle) * distance}px`,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });

    setParticles(prev => [...prev, ...newParticles]);
    setTimeout(() => {
      setParticles(prev =>
        prev.filter(p => p.userId !== userId || Date.now() - parseInt(p.id.split("-")[1]) < 550)
      );
    }, 600);
  }, []);

  // Periodically remove stale cursors
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setCursors(prev => {
        let changed = false;
        const next = new Map(prev);
        for (const [uid, pos] of next) {
          if (now - pos.updatedAt > CURSOR_EXPIRY_MS) {
            next.delete(uid);
            physicsRef.current.delete(uid);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [setCursors]);

  // Physics and Animation Loop
  useEffect(() => {
    const updatePhysics = () => {
      if (cursors.size > 0) {
        const container = document.getElementById("root") || document.documentElement;
        const docWidth = container.scrollWidth;
        const docHeight = container.scrollHeight;

        // Sync targets
        cursors.forEach((cursor, uid) => {
          let node = physicsRef.current.get(uid);
          const targetX = cursor.x * docWidth;
          const targetY = cursor.y * docHeight;

          if (!node) {
            node = {
              userId: uid,
              x: targetX,
              y: targetY,
              vx: 0,
              vy: 0,
              renderedX: targetX,
              renderedY: targetY,
            };
            physicsRef.current.set(uid, node);
          } else {
            // Spring towards target
            node.vx += (targetX - node.renderedX) * 0.15;
            node.vy += (targetY - node.renderedY) * 0.15;
          }
        });

        const nodes = Array.from(physicsRef.current.values());

        // Apply collision repulsion from LOCAL MOUSE
        const { x: mx, y: my } = localMouseRef.current;
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          if (n1.userId === currentUserId) continue; // Don't push local avatar with local mouse
          const dx = n1.renderedX - mx;
          const dy = n1.renderedY - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0 && dist < COLLISION_RADIUS * 1.5) {
            const force = (COLLISION_RADIUS * 1.5 - dist) * REPULSION_FORCE * 1.5;
            n1.vx += (dx / dist) * force;
            n1.vy += (dy / dist) * force;
            triggerParticles(n1.userId);
          }
        }

        // Apply collision repulsion between avatars
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const n1 = nodes[i];
            const n2 = nodes[j];
            const dx = n1.renderedX - n2.renderedX;
            const dy = n1.renderedY - n2.renderedY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0 && dist < COLLISION_RADIUS) {
              const force = (COLLISION_RADIUS - dist) * REPULSION_FORCE;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              n1.vx += fx;
              n1.vy += fy;
              n2.vx -= fx;
              n2.vy -= fy;
              triggerParticles(n1.userId);
              triggerParticles(n2.userId);
            }
          }
        }

        // Apply velocities and update DOM directly for 60fps performance
        nodes.forEach(node => {
          node.vx *= 0.75; // friction
          node.vy *= 0.75;
          node.renderedX += node.vx;
          node.renderedY += node.vy;

          const el = document.getElementById(`cursor-avatar-${node.userId}`);
          if (el) {
            // Overlay is position: absolute on the DOM, so it inherently scrolls
            el.style.left = `${node.renderedX}px`;
            el.style.top = `${node.renderedY}px`;
          }
        });
      }

      requestRef.current = requestAnimationFrame(updatePhysics);
    };

    requestRef.current = requestAnimationFrame(updatePhysics);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [cursors, triggerParticles]);

  const handlePoke = (userId: number) => {
    setPokedUsers(prev => new Set(prev).add(userId));
    setSpinningUsers(prev => new Set(prev).add(userId));

    setTimeout(() => {
      setPokedUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }, 200);

    setTimeout(() => {
      setSpinningUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }, 500);

    triggerParticles(userId);
  };

  // Render empty div if no cursors so physics loop stops, but keeping the overlay handles scroll
  if (cursors.size === 0) return null;

  return (
    <div className="cursor-overlay" aria-hidden="true">
      {Array.from(cursors.values()).map(cursor => (
        <div
          key={cursor.user_id}
          id={`cursor-avatar-${cursor.user_id}`}
          className={`cursor-avatar glowing ${pokedUsers.has(cursor.user_id) ? "poked" : ""} ${spinningUsers.has(cursor.user_id) ? "spinning" : ""}`}
          onClick={() => handlePoke(cursor.user_id)}
          title={cursor.user_name}
        >
          {particles
            .filter(p => p.userId === cursor.user_id)
            .map(p => (
              <div
                key={p.id}
                className="cursor-particle"
                style={
                  { "--tx": p.tx, "--ty": p.ty, backgroundColor: p.color } as React.CSSProperties
                }
              />
            ))}
          <div className="cursor-avatar-img-container">
            <UserProfileOverlay
              userId={cursor.user_id}
              fallbackName={cursor.user_name}
              fallbackAvatar={cursor.avatar || undefined}
              disableClick={true}
            >
              <div>
                <UserAvatar
                  src={cursor.avatar || undefined}
                  alt={cursor.user_name}
                  size={24}
                  initials={cursor.user_name?.[0]?.toUpperCase()}
                  className="cursor-avatar-img"
                />
              </div>
            </UserProfileOverlay>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CursorOverlay;
