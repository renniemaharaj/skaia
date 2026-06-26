import { atom } from "jotai";
import { registerResource } from "../utils/wsRegistry";

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

registerResource("global:chat", globalChatMessagesAtom, (prev, data: GlobalChatMessage) => {
  const messages = [...prev, data];
  return messages.slice(-80);
});
registerResource(
  "global:chat:history",
  globalChatMessagesAtom,
  (_prev, data: { messages?: GlobalChatMessage[] }) =>
    Array.isArray(data?.messages) ? data.messages : _prev
);
