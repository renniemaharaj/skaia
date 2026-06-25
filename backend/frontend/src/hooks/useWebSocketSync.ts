import { useAtomValue, useSetAtom } from "jotai";
import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  type User,
  accessTokenAtom,
  currentUserAtom,
  isAuthenticatedAtom,
  refreshTokenAtom,
  socketAtom,
} from "../atoms/auth";
import { wsBaseUrlAtom } from "../atoms/config";
import { activeConversationIdAtom } from "../atoms/inbox";
import { type AppNotification } from "../atoms/notifications";
import { pendingTpRouteAtom, pendingTpUserAtom } from "../atoms/presence";
import { type CheckoutResponse } from "../atoms/store";
import { formatCents } from "../utils/money";
import { playChatSound, playMessageSound, playNotificationSound } from "../utils/sound";
import "../utils/wsResources";
import {
  WS_JSON_SUBPROTOCOL,
  WS_PROTO_SUBPROTOCOL,
  decodeWebSocketProto,
  sendWebSocketMessage,
  shouldUseProtobufWebSocket,
} from "../utils/wsProtobuf";
import { applyWsUpdate } from "../utils/wsRegistry";

interface WebSocketMessage {
  type: string;
  userId?: number;
  user_id?: number;
  payload: {
    action?: string;
    id?: string | number;
    data?: any;
    [key: string]: any;
  };
}

type Setter<T> = (value: T | ((prev: T) => T)) => void;
type ValueSetter<T> = (value: T) => void;

/**
 * Module-level singleton - shared across every hook instance in the same JS context.
 * Prevents multiple concurrent WebSocket connections when the hook is called from
 * both Layout and a page-level component at the same time.
 */
let _globalWs: WebSocket | null = null;
let _globalConnecting = false;
// Module-level mirror of activeConversationIdAtom so the singleton onmessage
// closure always has the latest value even across multiple hook instances.
let _activeConversationId: string | null = null;

const EVENT_BUS_TYPES = new Set([
  "mediascraper:result",
  "mediascraper:started",
  "mediascraper:pending",
  "grengo:job_update",
  "grengo:action_ack",
  "grengo:stats_update",
  "grengo:storage_update",
  "grengo:hardware_update",
  "logs:stream",
  "provisioning:progress",
  "provisioning:status",
  "recovery_request:update",
]);

const appendWsParam = (url: string, key: string, value: string) =>
  `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

const isAudioFrame = (buffer: ArrayBuffer) => {
  const first = new Uint8Array(buffer)[0];
  return first === 0x01 || first === 0x02 || first === 0x03;
};

const parseWebSocketMessage = async (ws: WebSocket, data: MessageEvent["data"]) => {
  if (data instanceof Blob || data instanceof ArrayBuffer) {
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
    if (ws.protocol === WS_PROTO_SUBPROTOCOL && !isAudioFrame(buffer)) {
      const message = await decodeWebSocketProto(buffer);
      return { message, payload: message.payload };
    }
    window.dispatchEvent(new CustomEvent("voice:binary", { detail: data }));
    return null;
  }

  const message: WebSocketMessage = JSON.parse(data);
  const payload =
    typeof message.payload === "string" ? JSON.parse(message.payload) : message.payload;
  return { message, payload };
};

const registryPayload = (payload: WebSocketMessage["payload"]) => payload?.data ?? payload;

const registryKey = (type: string, payload: WebSocketMessage["payload"]) =>
  payload?.action ? `${type}:${payload.action}` : type;

const applyMessageUpdate = (type: string, payload: WebSocketMessage["payload"]) =>
  applyWsUpdate(registryKey(type, payload), registryPayload(payload));

const dispatchEventBusMessage = (type: string, payload: any) => {
  if (type === "mediascraper:jobs") {
    const { active_jobs, cache_hits_1h, new_scrapes_1h } = payload as {
      active_jobs?: number;
      cache_hits_1h?: number;
      new_scrapes_1h?: number;
    };
    if (active_jobs !== undefined) {
      window.dispatchEvent(
        new CustomEvent("mediascraper:jobs", {
          detail: { active_jobs, cache_hits_1h, new_scrapes_1h },
        })
      );
    }
    return true;
  }

  if (type === "media:sfx") {
    window.dispatchEvent(new CustomEvent("media:sfx", { detail: payload?.sfx_type }));
    return true;
  }

  if (type === "page:update") {
    window.dispatchEvent(
      new CustomEvent("page:live:event", {
        detail: { action: payload?.action, data: payload?.data },
      })
    );
    return true;
  }

  if (!EVENT_BUS_TYPES.has(type)) return false;
  window.dispatchEvent(new CustomEvent(type, { detail: payload }));
  return true;
};

const subscribeToForumCategory = (
  ws: WebSocket,
  subscriptions: MutableRefObject<Set<string>>,
  categoryId: string | number
) => {
  const key = `forum_category:${categoryId}`;
  subscriptions.current.add(key);
  if (ws.readyState !== WebSocket.OPEN) return;
  sendWebSocketMessage(ws, {
    type: "subscribe",
    payload: {
      resource_type: "forum_category",
      resource_id: categoryId,
    },
  });
};

const handleUserUpdate = (
  payload: any,
  currentUserIdRef: MutableRefObject<string | null>,
  setCurrentUser: Setter<User | null>,
  setAccessToken: ValueSetter<string | null>,
  setRefreshToken: ValueSetter<string | null>
) => {
  const { action: userAction, data: userData } = payload;

  if (userAction === "permissions_changed" && userData) {
    const myId = currentUserIdRef.current;
    if (myId && String(userData.id) === String(myId)) {
      setCurrentUser(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          roles: userData.roles ?? prev.roles,
          permissions: userData.permissions ?? prev.permissions,
        };
      });
      if (userData.new_token) setAccessToken(userData.new_token);
    }
    window.dispatchEvent(
      new CustomEvent("user:profile:updated", {
        detail: {
          userId: String(userData.id),
          user: {
            roles: userData.roles,
            permissions: userData.permissions,
          },
        },
      })
    );
  }

  if (payload?.data?.user) {
    const updatedUser = payload.data.user as User;
    const newToken = payload.data.new_token as string | undefined;
    const myId = currentUserIdRef.current;

    if (payload?.data?.mfa_challenge_triggered && myId && String(updatedUser.id) === String(myId)) {
      window.dispatchEvent(
        new CustomEvent("auth:mfa-required", {
          detail: { reasonCode: payload?.data?.mfa_reason_code },
        })
      );
    }

    window.dispatchEvent(
      new CustomEvent("user:profile:updated", {
        detail: {
          userId: String(updatedUser.id),
          user: updatedUser,
        },
      })
    );

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

  if (userAction === "user_updated" && (userData as any)?.action === "uploads_changed") {
    const { id } = payload as { id?: number };
    window.dispatchEvent(
      new CustomEvent("user:uploads:changed", {
        detail: { userId: String(id ?? 0) },
      })
    );
  }
};

const handleForumUpdate = (
  ws: WebSocket,
  payload: WebSocketMessage["payload"],
  subscriptions: MutableRefObject<Set<string>>,
  currentUserIdRef: MutableRefObject<string | null>
) => {
  const { action, data } = payload;

  if (action === "category_created" && data?.id) {
    subscribeToForumCategory(ws, subscriptions, data.id);
  }

  applyMessageUpdate("forum:update", payload);

  if (action === "comment_created") {
    const newComment = data?.new_comment;
    const isOwner =
      currentUserIdRef.current != null &&
      String(newComment?.user_id) === String(currentUserIdRef.current);
    if (newComment && !isOwner) {
      const preview =
        newComment.content?.length > 80
          ? `${newComment.content.slice(0, 80)}...`
          : newComment.content;
      toast(`${newComment.author_name || "Someone"} commented`, {
        description: preview,
        duration: 5000,
      });
    }
  }
};

const handleStoreUpdate = (payload: WebSocketMessage["payload"]) => {
  applyMessageUpdate("store:update", payload);

  if (payload?.action === "purchase_success") {
    const resp = payload.data as CheckoutResponse;
    toast.success("Payment successful!", {
      description: `Order #${resp?.order?.id} - ${formatCents(resp?.order?.total_price || 0)}`,
      duration: 8000,
    });
  }
  if (payload?.action === "purchase_failure") {
    const resp = payload.data as CheckoutResponse;
    toast.error("Payment failed", {
      description: resp?.message ?? "Please try again.",
      duration: 8000,
    });
  }
};

const handleNotification = (payload: AppNotification) => {
  applyWsUpdate("notification", payload);
  playNotificationSound();
  toast(payload.message, {
    duration: 6000,
    action: payload.route
      ? {
          label: "View",
          onClick: () => {
            window.location.assign(payload.route);
          },
        }
      : undefined,
  });
};

const handleGlobalChat = (payload: any, currentUserIdRef: MutableRefObject<string | null>) => {
  applyWsUpdate("global:chat", payload);
  if (String(payload.user_id) !== String(currentUserIdRef.current)) {
    playChatSound();
  }
};

const handleInboxUpdate = (payload: WebSocketMessage["payload"]) => {
  const wasActiveDeleted =
    payload?.action === "conversation_deleted" &&
    payload?.data?.id &&
    String(_activeConversationId) === String(payload.data.id);

  applyMessageUpdate("inbox:update", payload);

  if (wasActiveDeleted) {
    toast.error("You are no longer in this conversation");
  }
};

const handleInboxMessage = (payload: any, currentUserIdRef: MutableRefObject<string | null>) => {
  applyWsUpdate("inbox:message", payload);
  if (String(payload?.sender_id ?? "") !== String(currentUserIdRef.current)) {
    playMessageSound();
  }
};

const handleConfigUpdate = (payload: WebSocketMessage["payload"]) => {
  applyMessageUpdate("config:update", payload);
  window.dispatchEvent(
    new CustomEvent("config:live:event", {
      detail: { action: payload?.action, data: payload?.data },
    })
  );
};

const handleRecoveryAccepted = (
  payload: any,
  setCurrentUser: Setter<User | null>,
  setAccessToken: ValueSetter<string | null>,
  setRefreshToken: ValueSetter<string | null>
) => {
  const auth = payload?.data?.auth;
  if (!auth?.access_token || !auth?.user) return;
  setAccessToken(auth.access_token);
  if (auth.refresh_token) {
    setRefreshToken(auth.refresh_token);
  }
  setCurrentUser(auth.user);
  toast.success("Your recovery request was accepted");
  window.dispatchEvent(new CustomEvent("recovery_request:accepted", { detail: payload }));
};

/**
 * Hook to manage resource subscriptions and listen for backend propagated changes.
 * Pure atom updates are registered next to their atoms and applied through wsRegistry.
 */
export const useWebSocketSync = () => {
  const setSocket = useSetAtom(socketAtom);
  const setPendingTpRoute = useSetAtom(pendingTpRouteAtom);
  const setPendingTpUser = useSetAtom(pendingTpUserAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const wsUrl = useAtomValue(wsBaseUrlAtom);

  // Tracks all active subscriptions so they can be replayed on reconnect.
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const currentUser = useAtomValue(currentUserAtom);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = currentUser?.id ?? null;

  const activeConversationId = useAtomValue(activeConversationIdAtom);
  _activeConversationId = activeConversationId;

  // read token so the WS connection is authenticated server-side
  const accessToken = useAtomValue(accessTokenAtom);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const setupWebSocket = useCallback(() => {
    // Global singleton guard - only one WS connection per browser context.
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
      const useProto = shouldUseProtobufWebSocket();
      let url = token ? appendWsParam(wsUrl, "token", token) : wsUrl;
      if (useProto) {
        url = appendWsParam(url, "encoding", "proto");
      }
      const protocols = useProto
        ? [WS_PROTO_SUBPROTOCOL, WS_JSON_SUBPROTOCOL]
        : [WS_JSON_SUBPROTOCOL];
      const ws = new WebSocket(url, protocols);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        _globalConnecting = false;
        console.log("WebSocket connected for change propagation");
        _globalWs = ws;
        setSocket(ws);

        // Re-subscribe to all tracked resources after (re)connect
        for (const key of subscriptionsRef.current) {
          const [resourceType, resourceId] = key.split(":");
          sendWebSocketMessage(ws, {
            type: "subscribe",
            payload: { resource_type: resourceType, resource_id: resourceId },
          });
          console.log(`[reconnect] Re-subscribed to ${key}`);
        }
      };

      ws.onmessage = async event => {
        try {
          const parsed = await parseWebSocketMessage(ws, event.data);
          if (!parsed) return;
          const { message, payload } = parsed;
          const type = message.type;

          if (type === "error") {
            const errPayload = payload as { message?: string; action?: string };
            if (errPayload.message) {
              toast.error(errPayload.message, { duration: 5000 });
            }
            return;
          }

          if (dispatchEventBusMessage(type, payload)) return;

          if (type === "user:update") {
            handleUserUpdate(
              payload,
              currentUserIdRef,
              setCurrentUser,
              setAccessToken,
              setRefreshToken
            );
            return;
          }

          if (type === "tp") {
            const route = payload?.route;
            if (typeof route === "string" && route) {
              setPendingTpRoute(route);
              const userId = (message as any).user_id ?? (message as any).userId;
              if (userId) setPendingTpUser(userId);
            }
            return;
          }

          if (type === "mfa:required") {
            window.dispatchEvent(
              new CustomEvent("auth:mfa-required", {
                detail: {
                  reasonCode: payload?.reason_code,
                  action: payload?.action,
                },
              })
            );
            return;
          }

          if (type === "forum:update") {
            handleForumUpdate(ws, payload, subscriptionsRef, currentUserIdRef);
            return;
          }

          if (type === "global:chat") {
            handleGlobalChat(payload, currentUserIdRef);
            return;
          }

          if (type === "store:update") {
            handleStoreUpdate(payload);
            return;
          }

          if (type === "notification") {
            handleNotification(payload as AppNotification);
            return;
          }

          if (type === "inbox:update") {
            handleInboxUpdate(payload);
            return;
          }

          if (type === "inbox:message") {
            handleInboxMessage(payload, currentUserIdRef);
            return;
          }

          if (type === "config:update") {
            handleConfigUpdate(payload);
            return;
          }

          if (type === "recovery_request:accepted") {
            handleRecoveryAccepted(payload, setCurrentUser, setAccessToken, setRefreshToken);
            return;
          }

          applyMessageUpdate(type, payload);
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };

      ws.onerror = error => {
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
    setSocket,
    setPendingTpRoute,
    setPendingTpUser,
    setCurrentUser,
    setAccessToken,
    setRefreshToken,
    wsUrl,
  ]);

  // Reconnect only when the *user identity* changes (login / logout),
  // NOT on every token refresh.  Permission propagation updates the token
  // in-place - that must NOT tear down the socket or we create a
  // disconnect/reconnect loop that drops messages.
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    // Only reconnect when auth state actually flips (logged-in <-> logged-out).
    if (prevAuthRef.current === isAuthenticated) return;
    prevAuthRef.current = isAuthenticated;
    if (!_globalWs) return;
    _globalWs.close();
    _globalWs = null;
  }, [isAuthenticated]);

  /**
   * Subscribe to a specific resource so client receives propagated updates.
   * Backend tracks this subscription and sends updates for changes to that resource.
   */
  const subscribe = useCallback((resourceType: string, resourceId: number | string) => {
    const key = `${resourceType}:${resourceId}`;
    // Always track so reconnects can replay this subscription
    subscriptionsRef.current.add(key);

    if (!_globalWs) {
      console.warn(`[subscribe] WebSocket not initialized for ${key}, queued for reconnect`);
      return;
    }
    if (_globalWs.readyState !== WebSocket.OPEN) {
      console.warn(
        `[subscribe] WebSocket not OPEN (state=${_globalWs.readyState}) for ${key}, queued for reconnect`
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
    sendWebSocketMessage(_globalWs, subscription);
  }, []);

  /**
   * Unsubscribe from a resource (e.g., when user leaves a page)
   */
  const unsubscribe = useCallback((resourceType: string, resourceId: number | string) => {
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
      sendWebSocketMessage(_globalWs, unsubscription);
      console.log(`Unsubscribed from ${key}`);
    }
  }, []);

  useEffect(() => {
    // Only setup once on mount; setupWebSocket has internal checks to prevent re-connecting
    setupWebSocket();

    // Heartbeat: keep the connection alive and detect silent drops
    const heartbeatInterval = setInterval(() => {
      if (_globalWs && _globalWs.readyState === WebSocket.OPEN) {
        sendWebSocketMessage(_globalWs, { type: "ping" });
      } else if (!_globalWs || _globalWs.readyState === WebSocket.CLOSED) {
        setupWebSocket();
      }
    }, 30000);

    return () => {
      clearInterval(heartbeatInterval);
      // Do NOT close the global socket here - other mounted instances still need it.
      // The socket is closed via onclose/reconnect logic or page unload.
    };
  }, []);

  return { subscribe, unsubscribe };
};

export const sendGrengoJobAction = (
  action: string,
  name?: string,
  command?: string,
  args?: string[]
): Promise<string> => {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const waitForAck = new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("grengo:action_ack", handleAck);
      reject(new Error("Timed out waiting for grengo action acknowledgement"));
    }, 15000);

    function handleAck(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.request_id !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("grengo:action_ack", handleAck);
      if (!detail.accepted) {
        reject(new Error(detail.error || "Grengo action was rejected"));
        return;
      }
      resolve(detail.job_id);
    }

    window.addEventListener("grengo:action_ack", handleAck);
  });

  if (_globalWs && _globalWs.readyState === WebSocket.OPEN) {
    sendWebSocketMessage(_globalWs, {
      type: "grengo:action",
      payload: { request_id: requestId, action, name, command, args },
    });
  } else {
    window.dispatchEvent(
      new CustomEvent("grengo:action_ack", {
        detail: {
          request_id: requestId,
          accepted: false,
          error: "WebSocket not connected, cannot send grengo action",
        },
      })
    );
  }
  return waitForAck;
};
