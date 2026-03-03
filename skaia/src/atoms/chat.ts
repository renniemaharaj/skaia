import { atom } from "jotai";

export interface GlobalChatMessage {
  id: number;
  user_id: number;
  user_name: string;
  avatar: string;
  content: string;
  created_at: string;
  is_guest: boolean;
}

/** Ring of global chat messages, max 80. */
export const globalChatMessagesAtom = atom<GlobalChatMessage[]>([]);
