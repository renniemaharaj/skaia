import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  accessTokenAtom,
  currentUserAtom,
  isAuthenticatedAtom,
  refreshTokenAtom,
  socketAtom,
} from "../atoms/auth";
import { wsBaseUrlAtom } from "../atoms/config";
import { activeConversationIdAtom } from "../atoms/inbox";
import { pendingTpRouteAtom, pendingTpUserAtom } from "../atoms/presence";
import {
  applyMessageUpdate,
  dispatchEventBusMessage,
  handleConfigUpdate,
  handleForumUpdate,
  handleGlobalChat,
  handleInboxMessage,
  handleInboxUpdate,
  handleNotification,
  handleRecoveryAccepted,
  handleStoreUpdate,
  handleUserUpdate,
} from "./handlers";
import "../utils/wsResources";
import {
  WS_PROTO_SUBPROTOCOL,
  decodeWebSocketProto,
  sendWebSocketMessage,
} from "../utils/wsProtobuf";

/**
 * Module-level singleton - shared across every hook instance in the same JS context.
 * Prevents multiple concurrent WebSocket connections when the hook is called from
 * both Layout and a page-level component at the same time.
 */
let _globalWs: WebSocket | null = null;
let _globalConnecting = false;

const appendWsParam = (url: string, key: string, value: string) =>
  `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

const parseWebSocketMessage = async (data: MessageEvent["data"]) => {
  if (data instanceof Blob || data instanceof ArrayBuffer) {
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
    const message = await decodeWebSocketProto(buffer);
    return { message, payload: message.payload as any };
  }

  throw new Error("WebSocket text frames are not supported");
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
      const url = token ? appendWsParam(wsUrl, "token", token) : wsUrl;
      const ws = new WebSocket(url, [WS_PROTO_SUBPROTOCOL]);
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
          const parsed = await parseWebSocketMessage(event.data);
          const { message, payload } = parsed;
          const type = message.type;

          switch (type) {
            case "error": {
              const errPayload = payload as {
                message?: string;
                action?: string;
              };
              if (errPayload.message) {
                toast.error(errPayload.message, { duration: 5000 });
              }
              return;
            }

            case "user:update":
              handleUserUpdate(
                payload,
                currentUserIdRef,
                setCurrentUser,
                setAccessToken,
                setRefreshToken
              );
              return;

            case "tp": {
              const route = payload?.route;
              if (typeof route === "string" && route) {
                setPendingTpRoute(route);
                const userId = (message as any).user_id ?? (message as any).userId;
                if (userId) setPendingTpUser(userId);
              }
              return;
            }

            case "mfa:required":
              window.dispatchEvent(
                new CustomEvent("auth:mfa-required", {
                  detail: {
                    reasonCode: payload?.reason_code,
                    action: payload?.action,
                  },
                })
              );
              return;

            case "forum:update":
              handleForumUpdate(ws, payload, subscriptionsRef, currentUserIdRef);
              return;

            case "global:chat":
              handleGlobalChat(payload, currentUserIdRef);
              return;

            case "store:update":
              handleStoreUpdate(payload);
              return;

            case "notification":
              handleNotification(payload);
              return;

            case "inbox:update":
              handleInboxUpdate(payload, activeConversationId);
              return;

            case "inbox:message":
              handleInboxMessage(payload, currentUserIdRef);
              return;

            case "config:update":
              handleConfigUpdate(payload);
              return;

            case "recovery_request:accepted":
              handleRecoveryAccepted(payload, setCurrentUser, setAccessToken, setRefreshToken);
              return;

            default:
              if (dispatchEventBusMessage(type, payload)) return;
              applyMessageUpdate(type, payload);
          }
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
