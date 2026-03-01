import { useEffect, useRef, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  forumCategoriesAtom,
  type ForumCategory,
  currentThreadAtom,
  threadCommentsAtom,
} from "../atoms/forum";
import { socketAtom, currentUserAtom } from "../atoms/auth";

interface WebSocketMessage {
  type: string;
  payload: {
    action: string;
    id?: string | number;
    data?: any;
  };
}

/**
 * Hook to manage resource subscriptions and listen for backend propagated changes
 * When the backend changes a resource, it propagates only to clients that have viewed it
 */
export const useWebSocketSync = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const setForumCategories = useSetAtom(forumCategoriesAtom);
  const setCurrentThread = useSetAtom(currentThreadAtom);
  const setThreadComments = useSetAtom(threadCommentsAtom);
  const setSocket = useSetAtom(socketAtom);
  const connectingRef = useRef(false);
  // Tracks all active subscriptions so they can be replayed on reconnect
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const currentUser = useAtomValue(currentUserAtom);
  // Keep refs so the stable ws.onmessage callback always has the latest user info
  const currentUserIdRef = useRef<string | null>(null);
  const currentUserPermissionsRef = useRef<string[] | null>(null);
  currentUserIdRef.current = currentUser?.id ?? null;
  currentUserPermissionsRef.current = currentUser?.permissions ?? null;

  const setupWebSocket = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (connectingRef.current) {
      console.log("[setupWebSocket] Connection already in progress, skipping");
      return;
    }

    // Don't reconnect if already connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log("[setupWebSocket] Already connected, skipping");
      return;
    }

    connectingRef.current = true;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        connectingRef.current = false;
        console.log("WebSocket connected for change propagation");
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
            const { action, id } = payload;
            console.log(`Received user update: ${action} for user ${id}`);
            // Update user atom if needed (implement custom hook for users)
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

            // Handle thread deletion
            if (action === "thread_deleted") {
              setCurrentThread((prev) => {
                if (prev && String(prev.id) === String(id)) {
                  return null;
                }
                return prev;
              });
            }

            // Handle post/comment operations
            if (action === "post_created") {
              setThreadComments((prev) => {
                // Add new post if it's not already in the list
                const newPost = data.new_post;
                const exists = prev.some(
                  (p) => String(p.id) === String(newPost.id),
                );
                if (!exists) {
                  // Enrich permissions for the receiving client
                  const userId = currentUserIdRef.current;
                  const perms = currentUserPermissionsRef.current;
                  const isOwner =
                    userId != null &&
                    String(newPost.user_id) === String(userId);
                  const enriched = {
                    ...newPost,
                    can_delete:
                      isOwner ||
                      (perms?.includes("forum.delete-post") ?? false),
                    can_edit:
                      isOwner || (perms?.includes("forum.edit-post") ?? false),
                    can_like_comments:
                      perms?.includes("thread.canLikeComments") ?? false,
                  };
                  return [...prev, enriched];
                }
                return prev;
              });
            }

            if (action === "post_deleted") {
              setThreadComments((prev) =>
                prev.filter((p) => String(p.id) !== String(data.post_id)),
              );
            }

            if (action === "post_updated") {
              setThreadComments((prev) =>
                prev.map((p) =>
                  String(p.id) === String(data.post_id)
                    ? {
                        ...p,
                        content: data.content || p.content,
                        updated_at: data.updated_at || p.updated_at,
                      }
                    : p,
                ),
              );
            }
            if (action === "post_liked") {
              const actingUserId = String(data.user_id);
              setThreadComments((prev) =>
                prev.map((p) =>
                  String(p.id) === String(data.post_id)
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

            if (action === "post_unliked") {
              const actingUserId = String(data.user_id);
              setThreadComments((prev) =>
                prev.map((p) =>
                  String(p.id) === String(data.post_id)
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
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        connectingRef.current = false;
        console.error("WebSocket error:", error);
      };

      ws.onclose = () => {
        connectingRef.current = false;
        console.log("WebSocket disconnected");
        setSocket(null);
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          setupWebSocket();
        }, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      connectingRef.current = false;
      console.error("WebSocket connection error:", error);
      // Retry connection
      setTimeout(() => {
        setupWebSocket();
      }, 3000);
    }
  }, [setForumCategories, setCurrentThread, setSocket]);

  /**
   * Subscribe to a specific resource so client receives propagated updates
   * Backend tracks this subscription and sends updates for changes to that resource
   */
  const subscribe = useCallback(
    (resourceType: string, resourceId: number | string) => {
      const key = `${resourceType}:${resourceId}`;
      // Always track so reconnects can replay this subscription
      subscriptionsRef.current.add(key);

      if (!wsRef.current) {
        console.warn(
          `[subscribe] WebSocket not initialized for ${key}, queued for reconnect`,
        );
        return;
      }
      if (wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn(
          `[subscribe] WebSocket not OPEN (state=${wsRef.current.readyState}) for ${key}, queued for reconnect`,
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
      wsRef.current.send(JSON.stringify(subscription));
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

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const unsubscription = {
          type: "unsubscribe",
          payload: {
            resource_type: resourceType,
            resource_id: resourceId,
          },
        };
        wsRef.current.send(JSON.stringify(unsubscription));
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
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      } else if (
        !wsRef.current ||
        wsRef.current.readyState === WebSocket.CLOSED
      ) {
        setupWebSocket();
      }
    }, 30000);

    return () => {
      clearInterval(heartbeatInterval);
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
    };
  }, []);

  return { subscribe, unsubscribe };
};
