import { atom } from "jotai";

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

export interface InboxConversation {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  updated_at: string;
  other_user?: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string;
  };
  last_message?: InboxMessage;
  unread_count: number;
}

/** All conversations for the current user. */
export const inboxConversationsAtom = atom<InboxConversation[]>([]);

/** Messages in the active conversation. */
export const inboxMessagesAtom = atom<InboxMessage[]>([]);

/** ID of the active conversation being viewed. */
export const activeConversationIdAtom = atom<string | null>(null);

/** Total unread DM count across all conversations. */
export const inboxUnreadCountAtom = atom<number>(0);
