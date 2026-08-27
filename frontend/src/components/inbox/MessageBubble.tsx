import { Ban, FileText } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { InboxMessage } from "../../atoms/inbox";
import { formatFullDateTime, formatLocalTime } from "../../utils/serverTime";
import { GlassMenu } from "../ui/GlassMenu";
import UserAvatar from "../user/UserAvatar";
import UserProfileOverlay from "../user/UserProfileOverlay";
import { MessageAttachment } from "./MessageAttachment";

interface MessageBubbleProps {
  message: InboxMessage;
  currentUserId: string | undefined;
}

export function MessageBubble({ message, currentUserId }: MessageBubbleProps) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const richSystemCard = renderRichSystemCard(message);

  if (
    message.message_type === "system_group_created" ||
    message.message_type === "system_group_update"
  ) {
    return (
      <div className="inbox-msg-system">
        <span>
          {message.message_type === "system_group_created" ? (
            <>
              <strong>{message.sender_name}</strong> {message.content} on{" "}
              {formatLocalTime(message.created_at)}
            </>
          ) : (
            message.content
          )}
        </span>
      </div>
    );
  }

  const isMe = String(message.sender_id) === String(currentUserId);
  const openMessageMenu = (event: MouseEvent) => {
    event.preventDefault();
    setMenuPos({ x: event.clientX, y: event.clientY });
  };

  return (
    <div className={`inbox-msg${isMe ? " inbox-msg--me" : ""}`}>
      {!isMe && (
        <span className="inbox-msg-avatar">
          <UserProfileOverlay
            userId={message.sender_id}
            fallbackName={message.sender_name}
            fallbackAvatar={message.sender_avatar || undefined}
          >
            <div className="inbox-avatar-fill">
              <UserAvatar
                src={message.sender_avatar || undefined}
                alt={message.sender_name}
                size={28}
                initials={message.sender_name?.[0]?.toUpperCase()}
              />
            </div>
          </UserProfileOverlay>
        </span>
      )}
      <div className="inbox-msg-body">
        {!isMe && <span className="inbox-msg-author">{message.sender_name}</span>}
        <MessageAttachment
          messageType={message.message_type}
          name={message.attachment_name || undefined}
          size={message.attachment_size}
          url={message.attachment_url || undefined}
        />
        {message.message_type === "page_card" && renderPageCard(message)}
        {richSystemCard}
        {message.content && (!message.message_type || message.message_type === "text") && (
          <p className="inbox-msg-content" onClick={openMessageMenu}>
            {message.content}
          </p>
        )}
        {message.content &&
          message.message_type &&
          message.message_type !== "text" &&
          !richSystemCard &&
          message.message_type !== "page_card" &&
          message.content !== message.attachment_name && (
            <p className="inbox-msg-content inbox-msg-caption">{message.content}</p>
          )}
        <span className="inbox-msg-time" title={formatFullDateTime(message.created_at)}>
          {formatLocalTime(message.created_at)}
        </span>
      </div>
      {menuPos && (
        <GlassMenu
          x={menuPos.x}
          y={menuPos.y}
          options={[
            {
              title: "Copy Text",
              icon: <FileText size={14} />,
              onClick: () => {
                if (message.content) navigator.clipboard.writeText(message.content);
                toast.success("Copied to clipboard");
              },
            },
            {
              title: "Report",
              icon: <Ban size={14} />,
              onClick: () => toast.error("Reported message"),
            },
          ]}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  );
}

function renderPageCard(message: InboxMessage) {
  const card = parseMessageJSON(message.content);
  if (!card) return <p className="inbox-msg-content">{message.content}</p>;
  const route = String(card.route || `/page/${String(card.slug || "")}`);
  return (
    <Link to={route} className="inbox-page-card">
      <div className="inbox-page-card__icon">
        <FileText size={20} />
      </div>
      <div className="inbox-page-card__body">
        <span className="inbox-page-card__label">New page created</span>
        <span className="inbox-page-card__title">{String(card.title || card.slug || "Page")}</span>
        {card.description ? (
          <span className="inbox-page-card__desc">{String(card.description)}</span>
        ) : null}
        <span className="inbox-page-card__link">Open your page</span>
      </div>
    </Link>
  );
}

function renderRichSystemCard(message: InboxMessage) {
  if (!message.message_type?.startsWith("order_")) return null;
  const card = parseMessageJSON(message.content);
  if (!card || !card.order_id) return null;
  const orderId = String(card.order_id);
  const status = String(card.status || "pending");
  const statusLabel: Record<string, string> = {
    pending: "Order Pending",
    vendor_review: "Vendor Review",
    accepted: "Order Accepted",
    processing: "Order Processing",
    completed: "Order Completed",
    cancelled: "Order Cancelled",
    rejected: "Order Rejected",
    failed: "Order Failed",
  };
  const eventLabel: Record<string, string> = {
    order_created: "Order Confirmed",
    order_received: "Order Received",
    order_status: "Order Update",
    order_deleted: "Order Deleted",
  };
  const items = Array.isArray(card.items) ? card.items : [];
  const itemCount = Number(card.item_count || items.length || 0);
  const total = typeof card.total_price === "number" ? formatCompactDollars(card.total_price) : "";
  return (
    <Link
      to={String(card.route || `/store/orders/${orderId}`)}
      className="inbox-page-card inbox-page-card--compact"
    >
      <div className="inbox-page-card__icon">
        <FileText size={16} />
      </div>
      <div className="inbox-page-card__body">
        <span className="inbox-page-card__label">
          {eventLabel[message.message_type] || "System"}
        </span>
        <span className="inbox-page-card__title">
          {statusLabel[status] ?? `Status: ${status}`} · #{orderId}
        </span>
        <span className="inbox-page-card__desc">
          {[itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "", total]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="inbox-page-card__link">View order</span>
      </div>
    </Link>
  );
}

function parseMessageJSON(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function formatCompactDollars(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const dollars = Math.abs(cents) / 100;
  if (dollars < 1000) return `${sign}$${dollars.toFixed(2)}`;
  const thousands = dollars / 1000;
  const value = thousands >= 10 ? Math.round(thousands).toString() : thousands.toFixed(1);
  return `${sign}$${value.replace(/\.0$/, "")}k`;
}
