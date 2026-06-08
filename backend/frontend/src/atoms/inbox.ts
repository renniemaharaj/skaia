import { atom } from "jotai";
import type { User } from "./auth";

export interface InboxMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string;
  content: string;
  message_type: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_size?: number;
  attachment_mime?: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

export interface InboxParticipant extends User {
  role: string;
  is_muted: boolean;
}

export interface InboxConversation {
  id: string;
  is_group: boolean;
  title?: string;
  created_at: string;
  updated_at: string;
  is_locked: boolean;
  participants?: InboxParticipant[];
  other_user?: User;
  last_message?: InboxMessage;
  unread_count?: number;
  blocked_by_current_user?: boolean;
  blocked_by_other_user?: boolean;
}

/** All conversations for the current user. */
export const inboxConversationsAtom = atom<InboxConversation[]>([]);

/** Messages in the active conversation. */
export const inboxMessagesAtom = atom<InboxMessage[]>([]);

/** ID of the active conversation being viewed. */
export const activeConversationIdAtom = atom<string | null>(null);

/** Total unread DM count across all conversations. */
export const inboxUnreadCountAtom = atom<number>(0);
