import { useCallback, useEffect, useRef } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import {
  socketAtom,
  socketConnectedAtom,
  forumThreadsAtom,
  forumPostsAtom,
  onlineUsersAtom,
  uiUpdateQueueAtom,
  accessTokenAtom,
  currentUserAtom,
} from "../atoms/auth";

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8080";

export interface SocketMessage {
  type: "auth" | "update" | "delete" | "create" | "sync" | "presence" | "like" | "unlike" | "error";
  action?: string;
  data?: Record<string, any>;
  entityType?: "thread" | "post" | "user" | "permission" | "like";
  errorMessage?: string;
}

/**
 * Hook for managing WebSocket connection and real-time updates
 */
export const useWebSocket = () => {
  const setSocket = useSetAtom(socketAtom);
  const setSocketConnected = useSetAtom(socketConnectedAtom);
  const setForumThreads = useSetAtom(forumThreadsAtom);
  const setForumPosts = useSetAtom(forumPostsAtom);
  const setOnlineUsers = useSetAtom(onlineUsersAtom);
  const setUIUpdateQueue = useSetAtom(uiUpdateQueueAtom);
  const accessToken = useAtomValue(accessTokenAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleSocketMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: SocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case "auth":
            // Authentication confirmation
            if (message.data?.success) {
              console.log("WebSocket authenticated");
            }
            break;

          case "sync":
            // Sync data from server
            if (message.data?.threads) {
              setForumThreads(message.data.threads);
            }
            if (message.data?.posts) {
              setForumPosts(message.data.posts);
            }
            break;

          case "create":
            // New item created
            if (message.entityType === "thread") {
              setForumThreads((threads) => [...threads, message.data]);
            } else if (message.entityType === "post") {
              setForumPosts((posts) => [...posts, message.data]);
            }
            setUIUpdateQueue((queue) => [
              ...queue,
              {
                id: message.data?.id || Math.random().toString(),
                type: message.entityType as any,
                action: "create",
                data: message.data,
                timestamp: Date.now(),
              },
            ]);
            break;

          case "update":
            // Item updated
            if (message.entityType === "thread") {
              setForumThreads((threads) =>
                threads.map((t: any) =>
                  t.id === message.data?.id ? { ...t, ...message.data } : t,
                ),
              );
            } else if (message.entityType === "post") {
              setForumPosts((posts) =>
                posts.map((p: any) =>
                  p.id === message.data?.id ? { ...p, ...message.data } : p,
                ),
              );
            }
            setUIUpdateQueue((queue) => [
              ...queue,
              {
                id: message.data?.id || Math.random().toString(),
                type: message.entityType as any,
                action: "update",
                data: message.data,
                timestamp: Date.now(),
              },
            ]);
            break;

          case "delete":
            // Item deleted
            if (message.entityType === "thread") {
              setForumThreads((threads) =>
                threads.filter((t: any) => t.id !== message.data?.id),
              );
            } else if (message.entityType === "post") {
              setForumPosts((posts) =>
                posts.filter((p: any) => p.id !== message.data?.id),
              );
            }
            setUIUpdateQueue((queue) => [
              ...queue,
              {
                id: message.data?.id || Math.random().toString(),
                type: message.entityType as any,
                action: "delete",
                data: message.data,
                timestamp: Date.now(),
              },
            ]);
            break;

          case "presence":
            // Online users changed
            if (message.data?.users) {
              setOnlineUsers(message.data.users);
            }
            break;

          case "like":
          case "unlike":
            // Post like/unlike
            if (message.entityType === "post") {
              setForumPosts((posts) =>
                posts.map((p: any) =>
                  p.id === message.data?.postId
                    ? {
                        ...p,
                        likes: message.data?.likes || p.likes,
                        isLiked: message.type === "like" ? true : false,
                      }
                    : p,
                ),
              );
            }
            setUIUpdateQueue((queue) => [
              ...queue,
              {
                id: message.data?.postId || Math.random().toString(),
                type: "like" as any,
                action: message.type === "like" ? "like" : "unlike" as any,
                data: message.data,
                timestamp: Date.now(),
              },
            ]);
            break;

          case "error":
            console.error("WebSocket error:", message.errorMessage);
            break;

          default:
            console.warn("Unknown message type:", message.type);
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    },
    [setForumThreads, setForumPosts, setOnlineUsers, setUIUpdateQueue],
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(`${WS_BASE_URL}/ws`);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setSocketConnected(true);
        setSocket(ws);

        // Authenticate the connection
        if (accessToken && currentUser) {
          ws.send(
            JSON.stringify({
              type: "auth",
              data: {
                token: accessToken,
                user_id: currentUser.id,
              },
            }),
          );
        }

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, 30000);
      };

      ws.onmessage = handleSocketMessage;

      ws.onerror = (event) => {
        console.error("WebSocket error:", event);
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setSocketConnected(false);
        setSocket(null);

        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("Failed to create WebSocket:", err);
      // Retry in 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [
    accessToken,
    currentUser,
    setSocket,
    setSocketConnected,
    handleSocketMessage,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
  }, []);

  const send = useCallback((message: SocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket not connected");
    }
  }, []);

  // Connect when authenticated
  useEffect(() => {
    if (accessToken && currentUser) {
      connect();

      return () => {
        disconnect();
      };
    }
  }, [accessToken, currentUser, connect, disconnect]);

  return { send, connect, disconnect };
};

/**
 * Hook for sending real-time updates (creating, updating, deleting)
 */
export const useRealtimeUpdate = () => {
  const { send } = useWebSocket();

  const createThread = useCallback(
    (threadData: any) => {
      send({
        type: "create",
        entityType: "thread",
        data: threadData,
      });
    },
    [send],
  );

  const updateThread = useCallback(
    (threadId: string, updates: any) => {
      send({
        type: "update",
        entityType: "thread",
        data: { id: threadId, ...updates },
      });
    },
    [send],
  );

  const deleteThread = useCallback(
    (threadId: string) => {
      send({
        type: "delete",
        entityType: "thread",
        data: { id: threadId },
      });
    },
    [send],
  );

  const createPost = useCallback(
    (postData: any) => {
      send({
        type: "create",
        entityType: "post",
        data: postData,
      });
    },
    [send],
  );

  const updatePost = useCallback(
    (postId: string, updates: any) => {
      send({
        type: "update",
        entityType: "post",
        data: { id: postId, ...updates },
      });
    },
    [send],
  );

  const deletePost = useCallback(
    (postId: string) => {
      send({
        type: "delete",
        entityType: "post",
        data: { id: postId },
      });
    },
    [send],
  );

  const likePost = useCallback(
    (postId: string) => {
      send({
        type: "like",
        entityType: "post",
        data: { postId },
      });
    },
    [send],
  );

  const unlikePost = useCallback(
    (postId: string) => {
      send({
        type: "unlike",
        entityType: "post",
        data: { postId },
      });
    },
    [send],
  );

  return {
    createThread,
    updateThread,
    deleteThread,
    createPost,
    updatePost,
    deletePost,
    likePost,
    unlikePost,
  };
};
