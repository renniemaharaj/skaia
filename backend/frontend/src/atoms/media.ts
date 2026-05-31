import { atom } from "jotai";

export interface MediaItem {
  id: string;
  video_id: string;
  added_by: number;
  user_name: string;
  loop: boolean;
  created_at: string;
}

export interface MediaState {
  route: string;
  queue: MediaItem[];
  history: MediaItem[];
  is_paused: boolean;
  current_position: number;
  updated_at: string;
}

export const mediaStateAtom = atom<MediaState | null>(null);
