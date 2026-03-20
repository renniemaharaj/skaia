import { useEffect, useRef, useState, useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  MessageSquare,
  Heart,
  Trash2,
  Edit,
  Eye,
  UserX,
  UserCheck,
  Mail,
  X,
  CheckCheck,
  Trash,
} from "lucide-react";
import {
  notificationsAtom,
  unreadNotifCountAtom,
  type AppNotification,
  type NotificationType,
} from "../../atoms/notifications";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { relativeTimeAgo } from "../../utils/serverTime";
import "./NotificationBell.css";

const PAGE_SIZE = 30;

const typeIcon = (type: NotificationType) => {
  switch (type) {
    case "comment_on_thread":
      return <MessageSquare size={14} />;
    case "thread_liked":
      return <Heart size={14} />;
    case "comment_liked":
      return <Heart size={14} />;
    case "thread_deleted":
      return <Trash2 size={14} />;
    case "comment_deleted":
      return <Trash2 size={14} />;
    case "thread_edited":
      return <Edit size={14} />;
    case "profile_viewed":
      return <Eye size={14} />;
    case "suspended":
      return <UserX size={14} />;
    case "banned":
      return <UserX size={14} />;
    case "unsuspended":
      return <UserCheck size={14} />;
    case "direct_message":
      return <Mail size={14} />;
    default:
      return <Bell size={14} />;
  }
};

const NotificationBell = () => {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const [notifs, setNotifs] = useAtom(notificationsAtom);
  const unread = useAtomValue(unreadNotifCountAtom);
  const [open, setOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Load initial page of notifications once per session
  useEffect(() => {
    if (!isAuthenticated || notifs.length > 0) return;
    apiRequest<AppNotification[]>(`/notifications?limit=${PAGE_SIZE}&offset=0`)
      .then((data) => {
        setNotifs(data ?? []);
        if ((data ?? []).length < PAGE_SIZE) setHasMore(false);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  // Auto-scroll to bottom (newest) whenever the panel opens or new notifs arrive.
  // Use `scrollTop` on the scroll container to avoid scrolling the page viewport.
  useEffect(() => {
    if (!open || !feedRef.current) return;

    requestAnimationFrame(() => {
      const list = feedRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
  }, [open, notifs.length]);

  // Load older notifications when the top sentinel becomes visible
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await apiRequest<AppNotification[]>(
        `/notifications?limit=${PAGE_SIZE}&offset=${notifs.length}`,
      );
      const rows = data ?? [];
      if (rows.length === 0 || rows.length < PAGE_SIZE) setHasMore(false);
      if (rows.length > 0) {
        const list = feedRef.current;
        const prevHeight = list?.scrollHeight ?? 0;
        // Atom is newest-first; older items go to the end so reversed display
        // puts them at the top of the feed.
        setNotifs((prev) => [...prev, ...rows]);
        requestAnimationFrame(() => {
          if (list) list.scrollTop += list.scrollHeight - prevHeight;
        });
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, notifs.length, setNotifs]);

  useEffect(() => {
    if (!open || !topSentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: feedRef.current, threshold: 0.1 },
    );
    observer.observe(topSentinelRef.current);
    return () => observer.disconnect();
  }, [open, loadMore]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markRead = async (id: string) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: "PUT" });
      setNotifs((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await apiRequest("/notifications/read-all", { method: "PUT" });
      setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  };

  const deleteNotif = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest(`/notifications/${id}`, { method: "DELETE" });
      setNotifs((prev) => prev.filter((n) => n.id !== id));
    } catch {}
  };

  const clearAll = async () => {
    try {
      await apiRequest("/notifications", { method: "DELETE" });
      setNotifs([]);
      setHasMore(false);
    } catch {}
  };

  const handleClick = (n: AppNotification) => {
    if (!n.is_read) markRead(n.id);
    if (n.route) {
      setOpen(false);
      navigate(n.route);
    }
  };

  if (!isAuthenticated) return null;

  // Reverse for feed display: oldest at top, newest at bottom
  const feed = notifs.slice().reverse();

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button
        className={`notif-bell-btn${open ? " notif-bell-btn--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            <div className="notif-panel-actions">
              <button
                className="notif-panel-close"
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close notifications"
              >
                <X size={16} />
              </button>
              {unread > 0 && (
                <button
                  className="notif-mark-all"
                  onClick={markAllRead}
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                  <span>Mark all read</span>
                </button>
              )}
              {notifs.length > 0 && (
                <button
                  className="notif-clear-all"
                  onClick={clearAll}
                  title="Clear all notifications"
                >
                  <Trash size={14} />
                  <span>Clear all</span>
                </button>
              )}
            </div>
          </div>

          <div className="notif-list" ref={feedRef}>
            {/* Top sentinel triggers infinite-scroll load of older entries */}
            <div ref={topSentinelRef} className="notif-top-sentinel">
              {loadingMore && <p className="notif-loading">Loading older…</p>}
              {!hasMore && notifs.length > 0 && (
                <p className="notif-no-more">No older notifications</p>
              )}
            </div>

            {feed.length === 0 && !loadingMore && (
              <p className="notif-empty">You're all caught up!</p>
            )}

            {feed.map((n) => (
              <div
                key={n.id}
                className={`notif-item${!n.is_read ? " notif-item--unread" : ""}${n.route ? " notif-item--clickable" : ""}`}
                onClick={() => handleClick(n)}
              >
                <span className={`notif-type-icon notif-type-icon--${n.type}`}>
                  {typeIcon(n.type)}
                </span>
                <div className="notif-body">
                  <p className="notif-message">{n.message}</p>
                  <span className="notif-time">
                    {relativeTimeAgo(n.created_at)}
                  </span>
                </div>
                <button
                  className="notif-delete-btn"
                  title="Dismiss"
                  onClick={(e) => deleteNotif(n.id, e)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {/* Bottom anchor — auto-scroll to newest */}
            <div ref={feedEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
