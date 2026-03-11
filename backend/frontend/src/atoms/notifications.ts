import { atom } from "jotai";

export type NotificationType =
  | "comment_on_thread"
  | "thread_liked"
  | "thread_deleted"
  | "thread_edited"
  | "comment_deleted"
  | "comment_liked"
  | "profile_viewed"
  | "suspended"
  | "unsuspended"
  | "banned"
  | "direct_message";

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  message: string;
  route: string;
  is_read: boolean;
  created_at: string;
}

/** All user notifications, newest first. */
export const notificationsAtom = atom<AppNotification[]>([]);

/** Count of unread notifications. */
export const unreadNotifCountAtom = atom((get) =>
  get(notificationsAtom).filter((n) => !n.is_read).length,
);
