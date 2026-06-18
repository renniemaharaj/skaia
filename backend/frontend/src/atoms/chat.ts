import { atom } from "jotai";

export interface GlobalChatMessage {
  id: number;
  user_id: number;
  user_name: string;
  avatar: string;
  roles?: string[];
  content: string;
  created_at: string;
  is_guest: boolean;
  kind?: "message" | "join" | "leave" | string;
  guest_session_id?: string;
}

/** Ring of global chat messages, max 80. */
export const globalChatMessagesAtom = atom<GlobalChatMessage[]>([]);
