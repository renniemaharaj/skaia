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
  email_verified: boolean;
  totp_enabled: boolean;
  roles: string[];
  permissions: string[];
  power_level?: number;
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

// Helper: Create an atom with custom localStorage storage (no JSON serialization)
function customStorageAtom<T extends string | null>(
  key: string,
  initialValue: T,
) {
  const baseAtom = atom<T>((localStorage.getItem(key) as T) || initialValue);

  return atom(
    (get) => get(baseAtom),
    (_get, set, newValue: T) => {
      if (newValue === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, newValue as string);
      }
      set(baseAtom, newValue);
    },
  );
}

// Store tokens in localStorage WITHOUT JSON serialization
export const accessTokenAtom = customStorageAtom<string | null>(
  "auth.accessToken",
  null,
);
export const refreshTokenAtom = customStorageAtom<string | null>(
  "auth.refreshToken",
  null,
);

// Auth state - separate atoms for better granularity
export const currentUserAtom = atomWithStorage<User | null>("auth.user", null);

// Derived from accessTokenAtom (synchronous localStorage read) so that
// ProtectedRoute sees the correct value on the very first render after a
// page reload — no async-hydration race condition.
export const isAuthenticatedAtom = atom<boolean>(
  (get) => get(accessTokenAtom) !== null,
);
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
  if ((user.roles ?? []).includes("admin")) return true;
  return (user.permissions ?? []).includes(permission);
});

// Atom for checking specific roles
export const hasRoleAtom = atom((get) => (role: string) => {
  const user = get(currentUserAtom);
  return (user?.roles ?? []).includes(role);
});

// Socket connection state
export const socketAtom = atom<WebSocket | null>(null);
