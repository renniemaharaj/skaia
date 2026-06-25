import { atom } from "jotai";
import { registerResource } from "../utils/wsRegistry";
import { currentUserAtom } from "./auth";
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

registerResource(
  "inbox:update:conversation_created",
  inboxConversationsAtom,
  (prev, data: InboxConversation) =>
    prev.some(c => String(c.id) === String(data.id)) ? prev : [data, ...prev]
);
registerResource(
  "inbox:update:conversation_deleted",
  inboxConversationsAtom,
  (prev, data: { id?: string | number }) =>
    data?.id ? prev.filter(c => String(c.id) !== String(data.id)) : prev
);
registerResource(
  "inbox:update:conversation_deleted",
  activeConversationIdAtom,
  (prev, data: { id?: string | number }) =>
    prev && data?.id && String(prev) === String(data.id) ? null : prev
);
registerResource("inbox:update:participant_removed", inboxConversationsAtom, (prev, data: any) =>
  prev.map(c =>
    String(c.id) === String(data.conversation_id)
      ? {
          ...c,
          participants: c.participants?.filter(p => String(p.id) !== String(data.user_id)),
        }
      : c
  )
);
registerResource("inbox:update:participant_added", inboxConversationsAtom, (prev, data: any) =>
  prev.map(c => {
    if (String(c.id) !== String(data.conversation_id)) return c;
    const existing = c.participants?.find(p => String(p.id) === String(data.participant.id));
    if (existing) return c;
    return {
      ...c,
      participants: [...(c.participants || []), data.participant],
    };
  })
);
registerResource("inbox:update:participant_muted", inboxConversationsAtom, (prev, data: any) =>
  prev.map(c =>
    String(c.id) === String(data.conversation_id)
      ? {
          ...c,
          participants: c.participants?.map(p =>
            String(p.id) === String(data.user_id) ? { ...p, is_muted: data.is_muted } : p
          ),
        }
      : c
  )
);
registerResource(
  "inbox:update:participant_role_changed",
  inboxConversationsAtom,
  (prev, data: any) =>
    prev.map(c =>
      String(c.id) === String(data.conversation_id)
        ? {
            ...c,
            participants: c.participants?.map(p =>
              String(p.id) === String(data.user_id) ? { ...p, role: data.role } : p
            ),
          }
        : c
    )
);
registerResource("inbox:update:conversation_locked", inboxConversationsAtom, (prev, data: any) =>
  prev.map(c =>
    String(c.id) === String(data.conversation_id) ? { ...c, is_locked: data.is_locked } : c
  )
);
registerResource("inbox:update:message_created", inboxMessagesAtom, (prev, data: InboxMessage) =>
  prev.some(m => String(m.id) === String(data.id)) ? prev : [...prev, data]
);
registerResource(
  "inbox:update:message_created",
  inboxConversationsAtom,
  (prev, data: InboxMessage, store) => {
    const convStr = String(data.conversation_id);
    const activeConversationId = store.get(activeConversationIdAtom);
    const currentUser = store.get(currentUserAtom);
    return prev.map(c =>
      String(c.id) === convStr
        ? {
            ...c,
            last_message: data,
            unread_count:
              convStr !== activeConversationId && String(data.sender_id) !== String(currentUser?.id)
                ? (c.unread_count ?? 0) + 1
                : convStr === activeConversationId
                  ? 0
                  : c.unread_count,
          }
        : c
    );
  }
);

registerResource("inbox:message", inboxUnreadCountAtom, (prev, data: InboxMessage, store) => {
  const currentUser = store.get(currentUserAtom);
  const activeConversationId = store.get(activeConversationIdAtom);
  const isFromCurrentUser = String(data?.sender_id ?? "") === String(currentUser?.id);
  const convId = String(data?.conversation_id ?? "");
  const isActive = convId && convId === String(activeConversationId);
  return !isActive && !isFromCurrentUser ? prev + 1 : prev;
});
registerResource("inbox:message", inboxConversationsAtom, (prev, data: InboxMessage, store) => {
  const currentUser = store.get(currentUserAtom);
  const activeConversationId = store.get(activeConversationIdAtom);
  const isFromCurrentUser = String(data?.sender_id ?? "") === String(currentUser?.id);
  const convId = String(data?.conversation_id ?? "");
  const isActive = convId && convId === String(activeConversationId);
  if (!convId) return prev;
  return prev.map(c =>
    String(c.id) === convId
      ? {
          ...c,
          last_message: data,
          unread_count:
            isActive || isFromCurrentUser
              ? isActive
                ? 0
                : c.unread_count
              : (c.unread_count ?? 0) + 1,
        }
      : c
  );
});
