import type { MutableRefObject } from "react";
import { toast } from "sonner";
import { type User } from "../atoms/auth";
import { type AppNotification } from "../atoms/notifications";
import { type CheckoutResponse } from "../atoms/store";
import { formatCents } from "../utils/money";
import { playChatSound, playMessageSound, playNotificationSound } from "../utils/sound";
import { sendWebSocketMessage } from "../utils/wsProtobuf";
import { applyWsUpdate } from "../utils/wsRegistry";

export interface WebSocketMessage {
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

export type Setter<T> = (value: T | ((prev: T) => T)) => void;
export type ValueSetter<T> = (value: T) => void;

const EVENT_BUS_TYPES = new Set([
  "mediascraper:result",
  "mediascraper:started",
  "mediascraper:dropped",
  "grengo:job_update",
  "grengo:action_ack",
  "grengo:stats_update",
  "grengo:storage_update",
  "grengo:hardware_update",
  "logs:stream",
  "provisioning:progress",
  "provisioning:status",
  "recovery_request:update",
  "voice:signal",
]);

const registryPayload = (payload: WebSocketMessage["payload"]) => payload?.data ?? payload;

const registryKey = (type: string, payload: WebSocketMessage["payload"]) =>
  payload?.action ? `${type}:${payload.action}` : type;

export const applyMessageUpdate = (type: string, payload: WebSocketMessage["payload"]) => {
  if (type === "voice:control" || type.startsWith("voice:")) {
    return applyWsUpdate(type, registryPayload(payload));
  }
  return applyWsUpdate(registryKey(type, payload), registryPayload(payload));
};

export const dispatchEventBusMessage = (type: string, payload: any) => {
  switch (type) {
    case "mediascraper:jobs": {
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

    case "media:sfx":
      window.dispatchEvent(new CustomEvent("media:sfx", { detail: payload?.sfx_type }));
      return true;

    case "page:update":
      window.dispatchEvent(
        new CustomEvent("page:live:event", {
          detail: { action: payload?.action, data: payload?.data },
        })
      );
      return true;

    default:
      if (!EVENT_BUS_TYPES.has(type)) return false;
      window.dispatchEvent(new CustomEvent(type, { detail: payload }));
      return true;
  }
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

export const handleUserUpdate = (
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

export const handleForumUpdate = (
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

export const handleStoreUpdate = (payload: WebSocketMessage["payload"]) => {
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

export const handleNotification = (payload: AppNotification) => {
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

export const handleGlobalChat = (
  payload: any,
  currentUserIdRef: MutableRefObject<string | null>
) => {
  applyWsUpdate("global:chat", payload);
  if (String(payload.user_id) !== String(currentUserIdRef.current)) {
    playChatSound();
  }
};

export const handleInboxUpdate = (
  payload: WebSocketMessage["payload"],
  activeConversationId: string | null
) => {
  const wasActiveDeleted =
    payload?.action === "conversation_deleted" &&
    payload?.data?.id &&
    String(activeConversationId) === String(payload.data.id);

  applyMessageUpdate("inbox:update", payload);

  if (wasActiveDeleted) {
    toast.error("You are no longer in this conversation");
  }
};

export const handleInboxMessage = (
  payload: any,
  currentUserIdRef: MutableRefObject<string | null>
) => {
  applyWsUpdate("inbox:message", payload);
  if (String(payload?.sender_id ?? "") !== String(currentUserIdRef.current)) {
    playMessageSound();
  }
};

export const handleConfigUpdate = (payload: WebSocketMessage["payload"]) => {
  applyMessageUpdate("config:update", payload);
  window.dispatchEvent(
    new CustomEvent("config:live:event", {
      detail: { action: payload?.action, data: payload?.data },
    })
  );
};

export const handleRecoveryAccepted = (
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
