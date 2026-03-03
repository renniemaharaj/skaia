import { atom } from "jotai";

export interface OnlineUser {
  user_id: number;
  user_name: string;
  avatar: string;
  route: string;
}

/** All online users broadcast from the server (first 100). */
export const onlineUsersAtom = atom<OnlineUser[]>([]);

/**
 * Set by the WS sync hook when a "tp" (teleport) message is received.
 * Consumed by Layout, which calls navigate() and resets this to null.
 */
export const pendingTpRouteAtom = atom<string | null>(null);
