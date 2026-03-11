import { atom } from "jotai";

export interface OnlineUser {
  user_id: number;
  user_name: string;
  avatar: string;
  route: string;
}

export interface CursorPosition {
  user_id: number;
  user_name: string;
  avatar: string;
  x: number; // 0–1 fraction of viewport width
  y: number; // 0–1 fraction of viewport height
  updatedAt: number; // Date.now() timestamp for expiry
}

/** All online users broadcast from the server (first 100). */
export const onlineUsersAtom = atom<OnlineUser[]>([]);

/** Cursor positions of other users on the same route, keyed by user_id. */
export const cursorPositionsAtom = atom<Map<number, CursorPosition>>(new Map());

/**
 * Set by the WS sync hook when a "tp" (teleport) message is received.
 * Consumed by Layout, which calls navigate() and resets this to null.
 */
export const pendingTpRouteAtom = atom<string | null>(null);
