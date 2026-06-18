import { atom } from "jotai";

export interface OnlineUser {
  user_id: number;
  user_name: string;
  avatar: string;
  roles?: string[];
  route: string;
  is_muted?: boolean;
  guest_session_id?: string;
}

export interface CursorPosition {
  user_id: number;
  user_name: string;
  avatar: string;
  x: number; // 0–1 fraction of document scrollWidth
  y: number; // 0–1 fraction of document scrollHeight
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

/** Tracks the user ID we are teleporting to or who summoned us, for scroll syncing. */
export const pendingTpUserAtom = atom<number | null>(null);
