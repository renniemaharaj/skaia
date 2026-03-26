import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { useLocation } from "react-router-dom";
import { socketAtom, currentUserAtom } from "../atoms/auth";

/**
 * Sends a presence announcement to the server whenever the route changes or
 * a new WebSocket connection is established. The server broadcasts the full
 * online-user list to every connected client after each update.
 */
export const usePresence = (enabled = true) => {
  if (!enabled) {
    return;
  }

  const socket = useAtomValue(socketAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const location = useLocation();
  // Keep latest values accessible inside the stable send helper.
  const routeRef = useRef(location.pathname);
  const userRef = useRef(currentUser);
  routeRef.current = location.pathname;
  userRef.current = currentUser;

  const sendPresence = (ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const user = userRef.current;
    ws.send(
      JSON.stringify({
        type: "presence",
        user_id: user?.id ? Number(user.id) : 0,
        payload: {
          route: routeRef.current,
          user_name: user?.display_name || user?.username || "",
          avatar: user?.avatar_url ?? "",
        },
      }),
    );
  };

  // Announce on route change (socket already open)
  useEffect(() => {
    if (socket) sendPresence(socket);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, socket]);
};
