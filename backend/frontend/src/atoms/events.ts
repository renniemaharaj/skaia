import { atom } from "jotai";

export interface ActivityEvent {
  id: number;
  user_id?: number;
  username?: string;
  avatar_url?: string;
  activity: string;
  resource?: string;
  resource_id?: number;
  meta?: Record<string, unknown>;
  created_at: string;
}

export const activityEventsAtom = atom<ActivityEvent[]>([]);
