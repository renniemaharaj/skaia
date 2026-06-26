import type { ProfileUser } from "../components/user/types";
import { apiRequestLazy } from "./api";

interface UserBatchResponse {
  users: ProfileUser[];
}

type UserProfileListener = (user: ProfileUser) => void;

const profileListeners = new Map<string, Set<UserProfileListener>>();

const requestUserProfile = apiRequestLazy<string, ProfileUser, UserBatchResponse>("/users/batch", {
  windowMs: 10,
  maxBatchSize: 50,
  buildBody: ids => ({ ids: ids.map(Number) }),
  selectItems: response => response.users ?? [],
  keyOf: user => String(user.id),
});

const publishUserProfile = (user: ProfileUser) => {
  const key = String(user.id);
  for (const listener of profileListeners.get(key) ?? []) listener(user);
};

export const subscribeUserProfile = (
  userId: string | number,
  listener: UserProfileListener
): (() => void) => {
  const key = String(userId);
  const listeners = profileListeners.get(key) ?? new Set<UserProfileListener>();
  listeners.add(listener);
  profileListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) profileListeners.delete(key);
  };
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const loadUserProfile = async (userId: string | number): Promise<ProfileUser> => {
  const key = String(userId);
  if (!/^[1-9]\d*$/.test(key)) {
    throw new Error(`Invalid user id: ${key}`);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const user = await requestUserProfile(key);
      publishUserProfile(user);
      return user;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await wait(200);
    }
  }
  throw lastError;
};
