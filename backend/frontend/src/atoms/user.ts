import { atom } from "jotai";

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bannerUrl?: string;
  photoUrl?: string;
  bio?: string;
  discordId?: string;
  isSuspended: boolean;
  roles: string[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export const userAtom = atom<User | null>(null);
export const authTokensAtom = atom<AuthTokens | null>(null);
export const isAuthenticatedAtom = atom((get) => {
  const user = get(userAtom);
  const tokens = get(authTokensAtom);
  return user !== null && tokens !== null;
});

// Derived atoms for permission checking
export const hasPermissionAtom = atom((get) => (permission: string) => {
  const user = get(userAtom);
  if (!user) return false;
  // Admin has all permissions
  if ((user.roles ?? []).includes("admin")) return true;
  return (user.permissions ?? []).includes(permission);
});

export const hasRoleAtom = atom((get) => (role: string) => {
  const user = get(userAtom);
  if (!user) return false;
  return (user.roles ?? []).includes(role);
});
