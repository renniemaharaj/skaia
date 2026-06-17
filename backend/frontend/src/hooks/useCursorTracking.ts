import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { socketAtom, currentUserAtom } from "../atoms/auth";

const THROTTLE_MS = 50; // ~20 fps

/**
 * Tracks the local mouse position and broadcasts it to the server over the
 * WebSocket. The server relays the position to other clients on the same route.
 */
export const useCursorTracking = () => {
  const socket = useAtomValue(socketAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const socketRef = useRef(socket);
  const userRef = useRef(currentUser);
  const lastSentRef = useRef(0);
  const lastClientPos = useRef({ x: 0, y: 0 });

  socketRef.current = socket;
  userRef.current = currentUser;

  useEffect(() => {
    const getScrollContainer = () => document.getElementById("root") || document.documentElement;

    const sendPosition = (clientX: number, clientY: number) => {
      const now = Date.now();
      if (now - lastSentRef.current < THROTTLE_MS) return;
      lastSentRef.current = now;

      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const container = getScrollContainer();

      const x = (clientX + container.scrollLeft) / container.scrollWidth;
      const y = (clientY + container.scrollTop) / container.scrollHeight;
      const uid = userRef.current?.id ? Number(userRef.current.id) : 0;

      ws.send(
        JSON.stringify({
          type: "cursor:update",
          user_id: uid,
          payload: { x, y },
        })
      );
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastClientPos.current = { x: e.clientX, y: e.clientY };
      sendPosition(e.clientX, e.clientY);
    };

    const handleScroll = () => {
      sendPosition(lastClientPos.current.x, lastClientPos.current.y);
    };

    const container = getScrollContainer();

    document.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [socket]); // re-attach when socket instance changes
};
