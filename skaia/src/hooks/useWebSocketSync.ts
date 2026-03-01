import { useEffect, useRef, useCallback } from "react";
import { useSetAtom } from "jotai";
import {
  forumCategoriesAtom,
  type ForumCategory,
  currentThreadAtom,
} from "../atoms/forum";
import { socketAtom } from "../atoms/auth";

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
  const setSocket = useSetAtom(socketAtom);
  const connectingRef = useRef(false);

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
            console.log(`Received forum propagation: ${action} for ${id}`);

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
                if (prev && (prev.id === String(id) || prev.id === id)) {
                  // Clear the thread if viewing the deleted one
                  return null;
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
                  // Remove category
                  return prevCategories.filter((c) => c.id !== id);
                }

                case "category_updated": {
                  // Update existing category
                  return prevCategories.map((c) =>
                    c.id === id
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
                  // Update the 2 most recent threads for this category
                  return prevCategories.map((c) =>
                    c.id === id
                      ? {
                          ...c,
                          threads: data.threads || c.threads,
                          updated_at: new Date().toISOString(),
                        }
                      : c,
                  );
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
      if (!wsRef.current) {
        console.warn(
          `[subscribe] WebSocket not initialized for ${resourceType}:${resourceId}`,
        );
        return;
      }
      if (wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn(
          `[subscribe] WebSocket not OPEN (state=${wsRef.current.readyState}) for ${resourceType}:${resourceId}`,
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
        `[subscribe] Sent subscribe message for ${resourceType}:${resourceId}`,
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
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const unsubscription = {
          type: "unsubscribe",
          payload: {
            resource_type: resourceType,
            resource_id: resourceId,
          },
        };
        wsRef.current.send(JSON.stringify(unsubscription));
        console.log(`Unsubscribed from ${resourceType}:${resourceId}`);
      }
    },
    [],
  );

  useEffect(() => {
    // Only setup once on mount; setupWebSocket has internal checks to prevent re-connecting
    setupWebSocket();

    return () => {
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
    };
  }, []);

  return { subscribe, unsubscribe };
};
