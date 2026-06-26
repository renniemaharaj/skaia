import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { registerResource } from "../utils/wsRegistry";

export interface MediaItem {
  id: string;
  video_id: string;
  added_by: number;
  user_name: string;
  loop: boolean;
  created_at: string;
}

export interface MediaPlaylist {
  id: string;
  start_time: string;
  items: MediaItem[];
}

export interface MediaState {
  route: string;
  queue: MediaItem[];
  history: MediaItem[];
  playlists: MediaPlaylist[];
  is_paused: boolean;
  current_position: number;
  updated_at: string;
  transitioning_item_id?: string;
}

export const mediaStateAtom = atom<MediaState | null>(null);

export const playerMutedAtom = atomWithStorage<boolean>("playerMuted", true);

registerResource("media:sync", mediaStateAtom, (_prev, data: MediaState) => data);
