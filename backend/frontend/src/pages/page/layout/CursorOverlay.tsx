import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { cursorPositionsAtom } from "../../../atoms/presence";
import "./CursorOverlay.css";

const CURSOR_EXPIRY_MS = 4000;

const CursorOverlay = () => {
  const cursors = useAtomValue(cursorPositionsAtom);
  const setCursors = useSetAtom(cursorPositionsAtom);

  // Periodically remove stale cursors
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [uid, pos] of next) {
          if (now - pos.updatedAt > CURSOR_EXPIRY_MS) {
            next.delete(uid);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [setCursors]);

  if (cursors.size === 0) return null;

  return (
    <div className="cursor-overlay" aria-hidden="true">
      {Array.from(cursors.values()).map((cursor) => (
        <div
          key={cursor.user_id}
          className="cursor-avatar"
          style={{
            left: `${cursor.x * 100}vw`,
            top: `${cursor.y * 100}vh`,
          }}
          title={cursor.user_name}
        >
          {cursor.avatar ? (
            <img src={cursor.avatar} alt={cursor.user_name} />
          ) : (
            <span className="cursor-avatar-initials">
              {cursor.user_name?.[0]?.toUpperCase() || "?"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default CursorOverlay;
