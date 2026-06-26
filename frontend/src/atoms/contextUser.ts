import { atom } from "jotai";

export interface ContextUser {
  background_video_url?: string | null;
  background_image_url?: string | null;
  background_position?: string | null;
}

export const contextUserAtom = atom<ContextUser | null>(null);
