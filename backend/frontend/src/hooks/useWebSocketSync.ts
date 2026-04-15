import { useEffect, useRef, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  forumCategoriesAtom,
  type ForumCategory,
  type ForumThread,
  currentThreadAtom,
  threadCommentsAtom,
  categoryFeedThreadsAtom,
  activeCategoryFeedIdAtom,
  userFeedThreadsAtom,
  activeUserFeedIdAtom,
} from "../atoms/forum";
import {
  socketAtom,
  currentUserAtom,
  accessTokenAtom,
  refreshTokenAtom,
  isAuthenticatedAtom,
  type User,
} from "../atoms/auth";
import {
  wsBaseUrlAtom,
  brandingAtom,
  footerConfigAtom,
  seoAtom,
} from "../atoms/config";
import {
  onlineUsersAtom,
  pendingTpRouteAtom,
  cursorPositionsAtom,
  type CursorPosition,
} from "../atoms/presence";
import { globalChatMessagesAtom, type GlobalChatMessage } from "../atoms/chat";
import {
  inboxMessagesAtom,
  inboxConversationsAtom,
  inboxUnreadCountAtom,
  activeConversationIdAtom,
} from "../atoms/inbox";
import {
  notificationsAtom,
  type AppNotification,
} from "../atoms/notifications";
import { activityEventsAtom, type ActivityEvent } from "../atoms/events";
import {
  playNotificationSound,
  playMessageSound,
  playChatSound,
} from "../utils/sound";

import {
  productsAtom,
  productCategoriesAtom,
  storeCartItemsAtom,
  type Product,
  type StoreCategory,
  type CartItem,
  type CheckoutResponse,
} from "../atoms/store";

interface WebSocketMessage {
  type: string;
  payload: {
    action: string;
    id?: string | number;
    data?: any;
  };
}

/**
 * Module-level singleton — shared across every hook instance in the same JS context.
 * Prevents multiple concurrent WebSocket connections when the hook is called from
 * both Layout and a page-level component at the same time.
 */
let _globalWs: WebSocket | null = null;
let _globalConnecting = false;
// Module-level mirror of activeConversationIdAtom so the singleton onmessage
// closure always has the latest value even across multiple hook instances.
let _activeConversationId: string | null = null;

/**
 * Hook to manage resource subscriptions and listen for backend propagated changes
 * When the backend changes a resource, it propagates only to clients that have viewed it
 */
export const useWebSocketSync = () => {
  const setForumCategories = useSetAtom(forumCategoriesAtom);
  const setCurrentThread = useSetAtom(currentThreadAtom);
  const setThreadComments = useSetAtom(threadCommentsAtom);
  const setSocket = useSetAtom(socketAtom);
  const setOnlineUsers = useSetAtom(onlineUsersAtom);
  const setPendingTpRoute = useSetAtom(pendingTpRouteAtom);
  const setCursorPositions = useSetAtom(cursorPositionsAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const wsUrl = useAtomValue(wsBaseUrlAtom);
  // Tracks all active subscriptions so they can be replayed on reconnect
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const currentUser = useAtomValue(currentUserAtom);
  // Keep refs so the stable ws.onmessage callback always has the latest user info
  const currentUserIdRef = useRef<string | null>(null);
  const currentUserPermissionsRef = useRef<string[] | null>(null);
  currentUserIdRef.current = currentUser?.id ?? null;
  currentUserPermissionsRef.current = currentUser?.permissions ?? null;

  // Live thread feed atoms — the WS handler pushes broadcast events into these
  const setCategoryFeedThreads = useSetAtom(categoryFeedThreadsAtom);
  const setUserFeedThreads = useSetAtom(userFeedThreadsAtom);
  const activeCategoryFeedId = useAtomValue(activeCategoryFeedIdAtom);
  const activeUserFeedId = useAtomValue(activeUserFeedIdAtom);
  // Refs so the stable onmessage closure always reads current values
  const activeCategoryFeedIdRef = useRef<string | null>(null);
  const activeUserFeedIdRef = useRef<string | null>(null);
  activeCategoryFeedIdRef.current = activeCategoryFeedId;
  activeUserFeedIdRef.current = activeUserFeedId;

  // ── Global chat ─────────────────────────────────────────────────────────
  const setGlobalChatMessages = useSetAtom(globalChatMessagesAtom);

  // ── Inbox ────────────────────────────────────────────────────────────────
  const setInboxMessages = useSetAtom(inboxMessagesAtom);
  const setInboxConversations = useSetAtom(inboxConversationsAtom);
  const setInboxUnreadCount = useSetAtom(inboxUnreadCountAtom);
  const activeConversationId = useAtomValue(activeConversationIdAtom);
  const activeConversationIdRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;
  // Keep module-level var in sync so all setupWebSocket closures see the latest value.
  _activeConversationId = activeConversationId;

  // ── Notifications ────────────────────────────────────────────────────────
  const setNotifications = useSetAtom(notificationsAtom);
  // ── Site config ──────────────────────────────────────────────────────────
  const setBrandingWs = useSetAtom(brandingAtom);
  const setFooterWs = useSetAtom(footerConfigAtom);
  const setSeoWs = useSetAtom(seoAtom);

  // ── Store ─────────────────────────────────────────────────────────────────
  const setProducts = useSetAtom(productsAtom);
  const setStoreCategories = useSetAtom(productCategoriesAtom);
  const setStoreCartItems = useSetAtom(storeCartItemsAtom);

  // ── Activity events ───────────────────────────────────────────────────────
  const setActivityEvents = useSetAtom(activityEventsAtom);

  // read token so the WS connection is authenticated server-side
  const accessToken = useAtomValue(accessTokenAtom);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const setupWebSocket = useCallback(() => {
    // Global singleton guard — only one WS connection per browser context.
    if (_globalWs && _globalWs.readyState === WebSocket.OPEN) {
      return;
    }
    if (_globalConnecting) {
      console.log("[setupWebSocket] Connection already in progress, skipping");
      return;
    }
    _globalConnecting = true;
    try {
      const token = accessTokenRef.current;
      const url = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        _globalConnecting = false;
        console.log("WebSocket connected for change propagation");
        _globalWs = ws;
        setSocket(ws);

        // Re-subscribe to all tracked resources after (re)connect
        subscriptionsRef.current.forEach((key) => {
          const [resourceType, resourceId] = key.split(":");
          ws.send(
            JSON.stringify({
              type: "subscribe",
              payload: { resource_type: resourceType, resource_id: resourceId },
            }),
          );
          console.log(`[reconnect] Re-subscribed to ${key}`);
        });
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          // Parse payload since it's a JSON-encoded string from backend
          const payload =
            typeof message.payload === "string"
              ? JSON.parse(message.payload)
              : message.payload;

          // Handle user update propagation
          if (message.type === "user:update") {
            const { action: userAction, data: userData } = payload;

            // ── Lightweight permission/role push ─────────────────────────
            // Sent directly to the user's client (no subscription needed).
            // Only contains id, roles, permissions, new_token — merge into
            // currentUserAtom so derived atoms react instantly.
            if (userAction === "permissions_changed" && userData) {
              const myId = currentUserIdRef.current;
              if (myId && String(userData.id) === String(myId)) {
                setCurrentUser((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    roles: userData.roles ?? prev.roles,
                    permissions: userData.permissions ?? prev.permissions,
                  };
                });
                if (userData.new_token) setAccessToken(userData.new_token);
              }
              // Also notify profile pages displaying this user
              window.dispatchEvent(
                new CustomEvent("user:profile:updated", {
                  detail: {
                    userId: String(userData.id),
                    user: {
                      roles: userData.roles,
                      permissions: userData.permissions,
                    },
                  },
                }),
              );
            }

            // ── Full user object push (profile edits, avatar, suspend…) ──
            if (payload?.data?.user) {
              const updatedUser = payload.data.user as User;
              const newToken = payload.data.new_token as string | undefined;

              // Notify profile pages displaying this user
              window.dispatchEvent(
                new CustomEvent("user:profile:updated", {
                  detail: {
                    userId: String(updatedUser.id),
                    user: updatedUser,
                  },
                }),
              );

              // Apply session changes if this is the logged-in user
              const myId = currentUserIdRef.current;
              if (myId && String(updatedUser.id) === String(myId)) {
                setCurrentUser(updatedUser);
                if (newToken) setAccessToken(newToken);
                if (updatedUser.is_suspended) {
                  setAccessToken(null);
                  setRefreshToken(null);
                  setCurrentUser(null);
                }
              }
            }

            // ── Uploads changed — notify the profile uploads tab ──────────
            if (
              userAction === "user_updated" &&
              (userData as any)?.action === "uploads_changed"
            ) {
              const { id } = payload as { id?: number };
              window.dispatchEvent(
                new CustomEvent("user:uploads:changed", {
                  detail: { userId: String(id ?? 0) },
                }),
              );
            }
          }

          // Handle presence update
          if (message.type === "presence:update") {
            const { users } = payload;
            if (Array.isArray(users)) {
              setOnlineUsers(users);
            }
          }

          // Handle cursor position update from another client on same route
          if (message.type === "cursor:update") {
            const cp = payload as CursorPosition;
            if (cp && typeof cp.user_id === "number") {
              setCursorPositions((prev) => {
                const next = new Map(prev);
                next.set(cp.user_id, { ...cp, updatedAt: Date.now() });
                return next;
              });
            }
          }

          // Handle incoming teleport request — navigate this client to the given route
          if (message.type === "tp") {
            const route = payload?.route;
            if (typeof route === "string" && route) {
              setPendingTpRoute(route);
            }
          }

          // Handle forum update propagation
          if (message.type === "forum:update") {
            const { action, id, data } = payload;
            console.log(
              `Received forum propagation: ${action} for ${id ?? data?.id}`,
            );

            // Handle thread updates
            if (action === "thread_updated" || action === "thread_created") {
              setCurrentThread((prev) => {
                if (
                  prev &&
                  (prev.id === String(data.id) || prev.id === data.id)
                ) {
                  return {
                    ...prev,
                    title: data.title || prev.title,
                    content: data.content || prev.content,
                    updated_at: data.updated_at || prev.updated_at,
                    view_count: data.view_count ?? prev.view_count,
                    reply_count: data.reply_count ?? prev.reply_count,
                  };
                }
                return prev;
              });
            }

            // ── Live feed: thread created (broadcast to all clients) ──────────
            if (action === "thread_created" && data) {
              const thread = data as ForumThread;
              // Category feed
              if (
                activeCategoryFeedIdRef.current &&
                String(thread.category_id) === activeCategoryFeedIdRef.current
              ) {
                setCategoryFeedThreads((prev) => {
                  if (prev.some((t) => String(t.id) === String(thread.id)))
                    return prev;
                  return [...prev, thread]; // newest at end → bottom of the chat feed
                });
              }
              // User feed
              if (
                activeUserFeedIdRef.current &&
                String(thread.user_id) === activeUserFeedIdRef.current
              ) {
                setUserFeedThreads((prev) => {
                  if (prev.some((t) => String(t.id) === String(thread.id)))
                    return prev;
                  return [...prev, thread];
                });
              }
            }

            // ── Live feed: thread updated (metadata refresh in both feeds) ───
            if (action === "thread_updated" && data) {
              const update = (prev: ForumThread[]) =>
                prev.map((t) =>
                  String(t.id) === String(data.id) ? { ...t, ...data } : t,
                );
              setCategoryFeedThreads(update);
              setUserFeedThreads(update);
            }

            // Handle thread deletion
            if (action === "thread_deleted") {
              setCurrentThread((prev) => {
                if (prev && String(prev.id) === String(id)) {
                  return null;
                }
                return prev;
              });
            }

            // ── Live feed: thread deleted (broadcast to all clients) ─────────
            if (action === "thread_deleted" && id) {
              const remove = (prev: ForumThread[]) =>
                prev.filter((t) => String(t.id) !== String(id));
              setCategoryFeedThreads(remove);
              setUserFeedThreads(remove);
            }

            // Handle comment operations
            if (action === "comment_created") {
              setThreadComments((prev) => {
                // Add new comment if it's not already in the list
                const newComment = data.new_comment;
                const exists = prev.some(
                  (p) => String(p.id) === String(newComment.id),
                );
                if (!exists) {
                  // Enrich permissions for the receiving client
                  const userId = currentUserIdRef.current;
                  const perms = currentUserPermissionsRef.current;
                  const isOwner =
                    userId != null &&
                    String(newComment.user_id) === String(userId);
                  const enriched = {
                    ...newComment,
                    can_delete:
                      isOwner ||
                      (perms?.includes("forum.thread-comment-delete") ?? false),
                    can_edit:
                      isOwner ||
                      (perms?.includes("forum.thread-comment-delete") ?? false),
                    can_like_comments: true,
                  };

                  // Notify the viewing user of a new comment from someone else
                  if (!isOwner) {
                    const preview =
                      newComment.content?.length > 80
                        ? `${newComment.content.slice(0, 80)}…`
                        : newComment.content;
                    toast(`${newComment.author_name || "Someone"} commented`, {
                      description: preview,
                      duration: 5000,
                    });
                  }

                  return [...prev, enriched];
                }
                return prev;
              });
            }

            if (action === "comment_deleted") {
              setThreadComments((prev) =>
                prev.filter((p) => String(p.id) !== String(data.comment_id)),
              );
            }

            if (action === "comment_updated") {
              setThreadComments((prev) =>
                prev.map((p) =>
                  String(p.id) === String(data.comment_id)
                    ? {
                        ...p,
                        content: data.content || p.content,
                        updated_at: data.updated_at || p.updated_at,
                      }
                    : p,
                ),
              );
            }
            if (action === "comment_liked") {
              const actingUserId = String(data.user_id);
              setThreadComments((prev) =>
                prev.map((p) =>
                  String(p.id) === String(data.comment_id)
                    ? {
                        ...p,
                        likes: data.likes ?? p.likes + 1,
                        is_liked:
                          actingUserId === currentUserIdRef.current
                            ? true
                            : p.is_liked,
                      }
                    : p,
                ),
              );
            }

            if (action === "comment_unliked") {
              const actingUserId = String(data.user_id);
              setThreadComments((prev) =>
                prev.map((p) =>
                  String(p.id) === String(data.comment_id)
                    ? {
                        ...p,
                        likes: Math.max(0, data.likes ?? p.likes - 1),
                        is_liked:
                          actingUserId === currentUserIdRef.current
                            ? false
                            : p.is_liked,
                      }
                    : p,
                ),
              );
            }

            if (action === "thread_liked") {
              const actingUserId = String(data.user_id);
              setCurrentThread((prev) => {
                if (prev && String(prev.id) === String(data.thread_id)) {
                  return {
                    ...prev,
                    likes: data.likes ?? (prev.likes || 0) + 1,
                    is_liked:
                      actingUserId === currentUserIdRef.current
                        ? true
                        : prev.is_liked,
                  };
                }
                return prev;
              });
            }

            if (action === "thread_unliked") {
              const actingUserId = String(data.user_id);
              setCurrentThread((prev) => {
                if (prev && String(prev.id) === String(data.thread_id)) {
                  return {
                    ...prev,
                    likes: Math.max(0, data.likes ?? (prev.likes || 1) - 1),
                    is_liked:
                      actingUserId === currentUserIdRef.current
                        ? false
                        : prev.is_liked,
                  };
                }
                return prev;
              });
            }
            setForumCategories((prevCategories) => {
              switch (action) {
                case "category_created": {
                  // Add new category if not already present
                  const exists = prevCategories.some((c) => c.id === data.id);
                  if (exists) return prevCategories;

                  // Subscribe to this category so we receive future updates (e.g. deletion)
                  if (data.id) {
                    const key = `forum_category:${data.id}`;
                    subscriptionsRef.current.add(key);
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.send(
                        JSON.stringify({
                          type: "subscribe",
                          payload: {
                            resource_type: "forum_category",
                            resource_id: data.id,
                          },
                        }),
                      );
                    }
                  }

                  const newCategory: ForumCategory = {
                    id: data.id,
                    name: data.name,
                    description: data.description,
                    thread_count: data.thread_count || 0,
                    created_at: data.created_at,
                    updated_at: data.updated_at,
                    threads: [],
                  };
                  return [...prevCategories, newCategory];
                }

                case "category_deleted": {
                  return prevCategories.filter(
                    (c) => String(c.id) !== String(id),
                  );
                }

                case "category_updated": {
                  return prevCategories.map((c) =>
                    String(c.id) === String(id)
                      ? {
                          ...c,
                          name: data.name || c.name,
                          description: data.description || c.description,
                          thread_count: data.thread_count ?? c.thread_count,
                          updated_at: data.updated_at || c.updated_at,
                          threads: c.threads,
                        }
                      : c,
                  );
                }

                case "category_threads_updated": {
                  return prevCategories.map((c) =>
                    String(c.id) === String(id)
                      ? {
                          ...c,
                          threads: data.threads ?? c.threads,
                          updated_at: new Date().toISOString(),
                        }
                      : c,
                  );
                }

                case "thread_created": {
                  // Broadcast fallback: update category list directly
                  if (!data || !data.category_id) return prevCategories;
                  const catId = String(data.category_id);
                  return prevCategories.map((c) => {
                    if (String(c.id) !== catId) return c;
                    const alreadyExists = (c.threads || []).some(
                      (t) => String(t.id) === String(data.id),
                    );
                    if (alreadyExists) return c;
                    return {
                      ...c,
                      threads: [data, ...(c.threads || [])].slice(0, 2),
                      thread_count: (c.thread_count || 0) + 1,
                    };
                  });
                }

                case "thread_deleted": {
                  // Broadcast fallback: remove deleted thread from all categories
                  return prevCategories.map((c) => {
                    const filtered = (c.threads || []).filter(
                      (t) => String(t.id) !== String(id),
                    );
                    if (filtered.length === (c.threads || []).length) return c;
                    return {
                      ...c,
                      threads: filtered,
                      thread_count: Math.max(0, (c.thread_count || 0) - 1),
                    };
                  });
                }

                default:
                  return prevCategories;
              }
            });
          }

          // ── Global chat ──────────────────────────────────────────────────
          if (message.type === "global:chat") {
            const chatMsg = payload as GlobalChatMessage;
            // Play sound only for messages from other users
            if (String(chatMsg.user_id) !== String(currentUserIdRef.current)) {
              playChatSound();
            }
            setGlobalChatMessages((prev) => {
              const msgs = [...prev, chatMsg];
              return msgs.slice(-80);
            });
          }

          if (message.type === "global:chat:history") {
            const messages = (payload as any)?.messages;
            if (Array.isArray(messages)) {
              setGlobalChatMessages(messages);
            }
          }

          // ── Inbox ─────────────────────────────────────────────────────────
          if (message.type === "inbox:update") {
            const { action: inboxAction, data: inboxData } = payload as any;
            if (inboxAction === "message_created" && inboxData) {
              const convStr = String(inboxData.conversation_id);
              const activeId = _activeConversationId;
              // Always append to the message feed — the subscription to
              // inbox_conversation:{id} ensures we only receive events for
              // the conversation currently open, just like thread comments.
              // No extra activeId check needed; the backend only pushes to
              // subscribers of that specific conversation.
              setInboxMessages((prev) => {
                if (prev.some((m) => String(m.id) === String(inboxData.id)))
                  return prev;
                return [...prev, inboxData];
              });
              // Always update sidebar: bump last_message + unread count
              setInboxConversations((prev) =>
                prev.map((c) =>
                  String(c.id) === convStr
                    ? {
                        ...c,
                        last_message: inboxData,
                        unread_count:
                          convStr !== activeId ? (c.unread_count ?? 0) + 1 : 0,
                      }
                    : c,
                ),
              );
            }
          }

          if (message.type === "inbox:message") {
            // Direct push to recipient — no subscription required.
            // Bump global badge and update the sidebar so the conversation
            // list stays current even when no specific chat is open.
            playMessageSound();
            const inboxMsgConvId = String(
              (payload as any)?.conversation_id ?? "",
            );
            const isActiveConv =
              inboxMsgConvId &&
              inboxMsgConvId === String(_activeConversationId);
            if (!isActiveConv) {
              setInboxUnreadCount((prev) => prev + 1);
            }
            // Always refresh last_message in the sidebar; only bump
            // unread_count when the conversation is not currently open.
            if (inboxMsgConvId) {
              setInboxConversations((prev) =>
                prev.map((c) =>
                  String(c.id) === inboxMsgConvId
                    ? {
                        ...c,
                        last_message: payload as any,
                        unread_count: isActiveConv
                          ? 0
                          : (c.unread_count ?? 0) + 1,
                      }
                    : c,
                ),
              );
            }
          }

          // ── Store ─────────────────────────────────────────────────────────
          if (message.type === "store:update") {
            const { action, data } = payload as { action: string; data?: any };

            if (action === "category_created" && data) {
              setStoreCategories((prev) => {
                if (prev.some((c) => String(c.id) === String(data.id)))
                  return prev;
                return [...prev, data as StoreCategory];
              });
            }
            if (action === "category_updated" && data) {
              setStoreCategories((prev) =>
                prev.map((c) =>
                  String(c.id) === String(data.id) ? { ...c, ...data } : c,
                ),
              );
            }
            if (action === "category_deleted" && data?.id) {
              setStoreCategories((prev) =>
                prev.filter((c) => String(c.id) !== String(data.id)),
              );
            }

            if (action === "product_created" && data) {
              setProducts((prev) => {
                if (prev.some((p) => String(p.id) === String(data.id)))
                  return prev;
                return [...prev, data as Product];
              });
            }
            if (action === "product_updated" && data) {
              setProducts((prev) =>
                prev.map((p) =>
                  String(p.id) === String(data.id) ? { ...p, ...data } : p,
                ),
              );
            }
            if (action === "product_deleted" && data?.id) {
              setProducts((prev) =>
                prev.filter((p) => String(p.id) !== String(data.id)),
              );
            }

            // Purchase outcomes — targeted at the purchasing user only
            if (action === "purchase_success") {
              const resp = data as CheckoutResponse;
              toast.success("Payment successful!", {
                description: `Order #${resp?.order?.id} — $${resp?.order?.total_price?.toFixed(2)}`,
                duration: 8000,
              });
              // Clear local cart after backend confirms success
              setStoreCartItems([]);
            }
            if (action === "purchase_failure") {
              const resp = data as CheckoutResponse;
              toast.error("Payment failed", {
                description: resp?.message ?? "Please try again.",
                duration: 8000,
              });
            }
          }

          // ── Notifications ─────────────────────────────────────────────────
          if (message.type === "notification") {
            const notif = payload as AppNotification;
            setNotifications((prev) => [notif, ...prev]);
            playNotificationSound();
            toast(notif.message, {
              duration: 6000,
              action: notif.route
                ? {
                    label: "View",
                    onClick: () => {
                      window.location.assign(notif.route);
                    },
                  }
                : undefined,
            });
          }

          // ── Notification bootstrap (on connect) ───────────────────────────
          if (message.type === "notification:sync") {
            const { notifications: notifs } = payload as {
              notifications?: AppNotification[];
            };
            if (Array.isArray(notifs) && notifs.length > 0) {
              // Only seed the atom when the bell hasn't loaded yet to avoid
              // overwriting a user-navigated paginated view.
              setNotifications((prev) => (prev.length === 0 ? notifs : prev));
            }
          }

          // ── Notification read / delete sync ───────────────────────────────
          if (message.type === "notification:update") {
            const { action: na, id: nid } = payload as {
              action: string;
              id?: number;
            };
            if (na === "notification_read" && nid) {
              setNotifications((prev) =>
                prev.map((n) =>
                  String(n.id) === String(nid) ? { ...n, is_read: true } : n,
                ),
              );
            }
            if (na === "notification_all_read") {
              setNotifications((prev) =>
                prev.map((n) => ({ ...n, is_read: true })),
              );
            }
            if (na === "notification_deleted" && nid) {
              setNotifications((prev) =>
                prev.filter((n) => String(n.id) !== String(nid)),
              );
            }
            if (na === "notification_all_deleted") {
              setNotifications([]);
            }
          }

          // ── Cart ──────────────────────────────────────────────────────────
          if (message.type === "cart:update") {
            const { data: cartData } = payload as {
              action: string;
              data?: CartItem[];
            };
            if (Array.isArray(cartData)) {
              setStoreCartItems(cartData);
            }
          }

          // ── Site config ───────────────────────────────────────────────────
          if (message.type === "config:update") {
            const { action: ca, data: cd } = payload as {
              action: string;
              data?: any;
            };
            if (ca === "branding_updated" && cd) setBrandingWs(cd);
            if (ca === "seo_updated" && cd) setSeoWs(cd);
            if (ca === "footer_updated" && cd) setFooterWs(cd);
            // Landing section/item changes — let landing components re-fetch
            window.dispatchEvent(
              new CustomEvent("config:live:event", {
                detail: { action: ca, data: cd },
              }),
            );
          }

          // ── CMS pages ─────────────────────────────────────────────────────
          if (message.type === "page:update") {
            const { action: pa, data: pd } = payload as {
              action: string;
              data?: any;
            };
            window.dispatchEvent(
              new CustomEvent("page:live:event", {
                detail: { action: pa, data: pd },
              }),
            );
          }

          // ── Activity events ───────────────────────────────────────────────
          if (message.type === "events:update") {
            const { data: evtData } = payload as {
              action: string;
              data?: ActivityEvent;
            };
            if (evtData) {
              setActivityEvents((prev) => {
                if (prev.some((e) => e.id === evtData.id)) return prev;
                return [...prev, evtData];
              });
            }
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        _globalConnecting = false;
        console.error("WebSocket error:", error);
      };

      ws.onclose = () => {
        _globalConnecting = false;
        _globalWs = null;
        console.log("WebSocket disconnected");
        setSocket(null);
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          setupWebSocket();
        }, 3000);
      };
    } catch (error) {
      _globalConnecting = false;
      console.error("WebSocket connection error:", error);
      // Retry connection
      setTimeout(() => {
        setupWebSocket();
      }, 3000);
    }
  }, [
    setForumCategories,
    setCurrentThread,
    setSocket,
    setOnlineUsers,
    setCurrentUser,
    setAccessToken,
    setRefreshToken,
    setCategoryFeedThreads,
    setUserFeedThreads,
    setGlobalChatMessages,
    setInboxMessages,
    setInboxConversations,
    setInboxUnreadCount,
    setNotifications,
    setProducts,
    setStoreCategories,
    setStoreCartItems,
    setCursorPositions,
    setActivityEvents,
    setBrandingWs,
    setFooterWs,
    setSeoWs,
    wsUrl,
  ]);

  // Reconnect only when the *user identity* changes (login / logout),
  // NOT on every token refresh.  Permission propagation updates the token
  // in-place — that must NOT tear down the socket or we create a
  // disconnect/reconnect loop that drops messages.
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    // Only reconnect when auth state actually flips (logged-in ↔ logged-out).
    if (prevAuthRef.current === isAuthenticated) return;
    prevAuthRef.current = isAuthenticated;
    if (!_globalWs) return;
    _globalWs.close();
    _globalWs = null;
  }, [isAuthenticated]);

  /**
   * Subscribe to a specific resource so client receives propagated updates
   * Backend tracks this subscription and sends updates for changes to that resource
   */
  const subscribe = useCallback(
    (resourceType: string, resourceId: number | string) => {
      const key = `${resourceType}:${resourceId}`;
      // Always track so reconnects can replay this subscription
      subscriptionsRef.current.add(key);

      if (!_globalWs) {
        console.warn(
          `[subscribe] WebSocket not initialized for ${key}, queued for reconnect`,
        );
        return;
      }
      if (_globalWs.readyState !== WebSocket.OPEN) {
        console.warn(
          `[subscribe] WebSocket not OPEN (state=${_globalWs.readyState}) for ${key}, queued for reconnect`,
        );
        return;
      }
      const subscription = {
        type: "subscribe",
        payload: {
          resource_type: resourceType,
          resource_id: resourceId,
        },
      };
      _globalWs.send(JSON.stringify(subscription));
      console.log(
        `[subscribe] Sent subscribe message for ${key}`,
        subscription,
      );
    },
    [],
  );

  /**
   * Unsubscribe from a resource (e.g., when user leaves a page)
   */
  const unsubscribe = useCallback(
    (resourceType: string, resourceId: number | string) => {
      const key = `${resourceType}:${resourceId}`;
      subscriptionsRef.current.delete(key);

      if (_globalWs && _globalWs.readyState === WebSocket.OPEN) {
        const unsubscription = {
          type: "unsubscribe",
          payload: {
            resource_type: resourceType,
            resource_id: resourceId,
          },
        };
        _globalWs.send(JSON.stringify(unsubscription));
        console.log(`Unsubscribed from ${key}`);
      }
    },
    [],
  );

  useEffect(() => {
    // Only setup once on mount; setupWebSocket has internal checks to prevent re-connecting
    setupWebSocket();

    // Heartbeat: keep the connection alive and detect silent drops
    const heartbeatInterval = setInterval(() => {
      if (_globalWs && _globalWs.readyState === WebSocket.OPEN) {
        _globalWs.send(JSON.stringify({ type: "ping" }));
      } else if (!_globalWs || _globalWs.readyState === WebSocket.CLOSED) {
        setupWebSocket();
      }
    }, 30000);

    return () => {
      clearInterval(heartbeatInterval);
      // Do NOT close the global socket here — other mounted instances still need it.
      // The socket is closed via onclose/reconnect logic or page unload.
    };
  }, []);

  return { subscribe, unsubscribe };
};
