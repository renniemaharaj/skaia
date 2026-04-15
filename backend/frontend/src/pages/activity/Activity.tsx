import { useState, useCallback } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { Activity as ActivityIcon, Loader } from "lucide-react";
import { activityEventsAtom, type ActivityEvent } from "../../atoms/events";
import { apiRequest } from "../../utils/api";
import { useCommentsFeed } from "../../hooks/useCommentsFeed";
import { relativeTimeAgo } from "../../utils/serverTime";
import UserAvatar from "../../components/user/UserAvatar";
import "./Activity.css";

interface EventsResponse {
  events: ActivityEvent[];
  total: number;
  has_more: boolean;
}

const LIMIT = 50;

function formatActivity(activity: string): string {
  return activity.replace(/\./g, " ").replace(/_/g, " ");
}

function activityLabel(activity: string): string {
  const parts = activity.split(".");
  if (parts.length < 2) return activity;
  return parts[0];
}

export default function Activity() {
  const events = useAtomValue(activityEventsAtom);
  const setEvents = useSetAtom(activityEventsAtom);
  const [total, setTotal] = useState(0);

  const loadPage = useCallback(
    async (offset: number): Promise<ActivityEvent[]> => {
      const data = await apiRequest<EventsResponse>(
        `/events?limit=${LIMIT}&offset=${offset}`,
      );
      if (offset === 0) {
        setTotal(data.total);
      }
      // API returns DESC (newest first). Reverse so oldest first (chat-style).
      return (data.events ?? []).slice().reverse();
    },
    [],
  );

  const {
    feedRef,
    sentinelRef,
    handleScroll,
    isLoading,
    isLoadingOlder,
    highlightedCommentId,
  } = useCommentsFeed<ActivityEvent>({
    comments: events,
    setComments: setEvents,
    loadPage,
    deps: [],
    getId: (e) => e.id,
    limit: LIMIT,
  });

  return (
    <div className="activity-page">
      <div className="activity-header">
        <ActivityIcon size={20} />
        <h2>Activity Log</h2>
        {total > 0 && <span className="activity-total">{total} events</span>}
      </div>

      <div className="activity-feed" ref={feedRef} onScroll={handleScroll}>
        <div ref={sentinelRef} className="activity-sentinel" />
        {isLoadingOlder && (
          <div className="activity-loading-older">
            <Loader size={16} className="activity-spinner" />
            Loading older events…
          </div>
        )}
        {isLoading ? (
          <div className="activity-empty">Loading activity…</div>
        ) : events.length === 0 ? (
          <div className="activity-empty">No events recorded yet.</div>
        ) : (
          events.map((evt) => (
            <div
              key={evt.id}
              className={`activity-event${
                evt.id === highlightedCommentId ? " activity-event-new" : ""
              }`}
            >
              <div className="activity-event-avatar">
                <UserAvatar
                  src={evt.avatar_url || undefined}
                  alt={evt.username || "System"}
                  size={28}
                  initials={(evt.username || "S")[0].toUpperCase()}
                />
              </div>
              <div className="activity-event-body">
                <div className="activity-event-meta">
                  <span className="activity-event-user">
                    {evt.username || "System"}
                  </span>
                  <span
                    className={`activity-event-badge activity-badge-${activityLabel(evt.activity)}`}
                  >
                    {activityLabel(evt.activity)}
                  </span>
                  <span className="activity-event-time">
                    {relativeTimeAgo(evt.created_at)}
                  </span>
                </div>
                <div className="activity-event-action">
                  {formatActivity(evt.activity)}
                  {evt.resource && (
                    <span className="activity-event-resource">
                      {" "}
                      on {evt.resource}
                      {evt.resource_id ? ` #${evt.resource_id}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
