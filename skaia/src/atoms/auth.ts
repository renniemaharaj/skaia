import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string;
  banner_url: string;
  photo_url: string;
  bio: string;
  discord_id?: string;
  is_suspended: boolean;
  roles: string[];
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
}

// Store tokens in localStorage
export const accessTokenAtom = atomWithStorage<string | null>(
  "auth.accessToken",
  null,
);
export const refreshTokenAtom = atomWithStorage<string | null>(
  "auth.refreshToken",
  null,
);

// Auth state - separate atoms for better granularity
export const currentUserAtom = atom<User | null>(null);
export const isAuthenticatedAtom = atom<boolean>(false);
export const authLoadingAtom = atom<boolean>(false);
export const authErrorAtom = atom<string | null>(null);

// Derived atom for full auth state
export const authStateAtom = atom((get) => ({
  isAuthenticated: get(isAuthenticatedAtom),
  user: get(currentUserAtom),
  accessToken: get(accessTokenAtom),
  refreshToken: get(refreshTokenAtom),
  loading: get(authLoadingAtom),
  error: get(authErrorAtom),
}));

// Atom for checking specific permissions
export const hasPermissionAtom = atom((get) => (permission: string) => {
  const user = get(currentUserAtom);
  if (!user) return false;
  // Admin has all permissions
  if (user.roles.includes("admin")) return true;
  return user.permissions.includes(permission) ?? false;
});

// Atom for checking specific roles
export const hasRoleAtom = atom((get) => (role: string) => {
  const user = get(currentUserAtom);
  return user?.roles.includes(role) ?? false;
});

// Socket connection state
export const socketAtom = atom<WebSocket | null>(null);
export const socketConnectedAtom = atom<boolean>(false);

// Real-time updates from socket
export const forumThreadsAtom = atomWithStorage<any[]>("forum.threads", []);
export const forumPostsAtom = atomWithStorage<any[]>("forum.posts", []);
export const onlineUsersAtom = atom<string[]>([]);

// UI state atoms for real-time updates
export const uiUpdatingAtom = atom<boolean>(false);
export const uiUpdateQueueAtom = atom<
  Array<{
    id: string;
    type: "thread" | "post" | "user" | "like";
    action: "create" | "update" | "delete" | "like" | "unlike";
    data: any;
    timestamp: number;
  }>
>([]);;
