import { atom } from "jotai";
import { registerResource } from "../utils/wsRegistry";

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
  | "direct_message"
  | "mentioned"
  | "store_order";

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
export const unreadNotifCountAtom = atom(
  get => get(notificationsAtom).filter(n => !n.is_read).length
);

registerResource("notification", notificationsAtom, (prev, data: AppNotification) => [
  data,
  ...prev,
]);
registerResource(
  "notification:sync",
  notificationsAtom,
  (prev, data: { notifications?: AppNotification[] }) =>
    prev.length === 0 && Array.isArray(data?.notifications) ? data.notifications : prev
);
registerResource(
  "notification:update:notification_read",
  notificationsAtom,
  (prev, data: { id?: number }) =>
    data?.id
      ? prev.map(n => (String(n.id) === String(data.id) ? { ...n, is_read: true } : n))
      : prev
);
registerResource("notification:update:notification_all_read", notificationsAtom, prev =>
  prev.map(n => ({ ...n, is_read: true }))
);
registerResource(
  "notification:update:notification_deleted",
  notificationsAtom,
  (prev, data: { id?: number }) =>
    data?.id ? prev.filter(n => String(n.id) !== String(data.id)) : prev
);
registerResource("notification:update:notification_all_deleted", notificationsAtom, () => []);
