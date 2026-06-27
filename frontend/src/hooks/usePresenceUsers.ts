import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { type OnlineUser, onlineUsersAtom } from "../atoms/presence";
import { normalizeRoute } from "../utils/route";

export function usePresenceUsers() {
  const rawUsers = useAtomValue(onlineUsersAtom);
  const location = useLocation();

  const currentRoute = normalizeRoute(location.pathname);

  return useMemo(() => {
    const seen = new Map<number, OnlineUser>();
    for (const u of rawUsers) {
      if (u.user_id === 0) continue;
      if (u.user_id < 0) {
        // guest - always unique, no dedup needed
        seen.set(u.user_id, u);
        continue;
      }
      const existing = seen.get(u.user_id);
      if (!existing || (u.user_name && !existing.user_name)) {
        seen.set(u.user_id, u);
      }
    }

    const onlineUsers = Array.from(seen.values()).slice(0, 100);

    const here: OnlineUser[] = [];
    const elsewhere: OnlineUser[] = [];

    for (const u of onlineUsers) {
      if (normalizeRoute(u.route) === currentRoute) {
        here.push(u);
      } else {
        elsewhere.push(u);
      }
    }

    return {
      onlineUsers,
      here,
      elsewhere,
      total: onlineUsers.length,
    };
  }, [rawUsers, currentRoute]);
}
