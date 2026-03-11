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

  socketRef.current = socket;
  userRef.current = currentUser;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastSentRef.current < THROTTLE_MS) return;
      lastSentRef.current = now;

      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;

      ws.send(
        JSON.stringify({
          type: "cursor:update",
          user_id: userRef.current?.id ? Number(userRef.current.id) : 0,
          payload: { x, y },
        }),
      );
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [socket]); // re-attach when socket instance changes
};
