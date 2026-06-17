import { CalendarIcon, MessageCircleIcon, ClockIcon, EyeIcon } from "lucide-react";
import "./ViewThreadMeta.css";
import { truncate } from "lodash";
import { useAtomValue } from "jotai";
import { currentThreadAtom } from "../../atoms/forum";
// import { formatDate } from "../../utils/serverTime";
import UserLink from "../user/UserLink";
import UserProfileOverlay from "../user/UserProfileOverlay";
import UserAvatar from "../user/UserAvatar";
import { useEffect, useState } from "react";
import { apiRequest } from "../../utils/api";
import type { ProfileUser, Role } from "../user/types";
import RoleBadge from "../user/RoleBadge";

type Author = {
  name: string;
  profilePicture?: string;
  role?: string;
};

type ThreadMeta = {
  threadId?: string;
  createdAt: string;
  replyCount: number;
  lastActivity: string;
  views: number;
  status: "Open" | "Closed" | "Archived";
};

const ViewThreadMeta = ({
  threadId,
  actions,
}: { threadId: string | undefined; actions?: React.ReactNode }) => {
  const currentThread = useAtomValue(currentThreadAtom);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [authorProfile, setAuthorProfile] = useState<ProfileUser | null>(null);

  useEffect(() => {
    if (currentThread?.user_id) {
      apiRequest<Role[]>("/users/roles")
        .then(res => res && setAllRoles(res))
        .catch(() => {});
      apiRequest<ProfileUser>(`/users/${currentThread.user_id}`)
        .then(res => res && setAuthorProfile(res))
        .catch(() => {});
    }
  }, [currentThread?.user_id]);

  const author: Author = {
    name: authorProfile?.display_name || currentThread?.user_name || "Unknown User",
    profilePicture: authorProfile?.avatar_url || currentThread?.user_avatar || "",
    role: currentThread?.user_roles?.join(", ") || "Member",
  };

  const threadMeta: ThreadMeta = {
    threadId,
    createdAt: currentThread?.created_at?.split("T")[0] || "Unknown",
    replyCount: currentThread?.reply_count || 0,
    lastActivity: currentThread?.updated_at?.split("T")[0] || "Unknown",
    views: currentThread?.view_count || 0,
    status: currentThread?.is_locked ? "Closed" : "Open",
  };

  const rawHtml = currentThread?.content || "";
  const extractPreviewText = (html: string) => {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent?.trim().replace(/\s+/g, " ") || "";
  };
  const previewText = truncate(extractPreviewText(rawHtml), { length: 250 });

  const statusClass = `vtm-status vtm-status--${threadMeta.status.toLowerCase()}`;

  const metrics = [
    {
      id: "replies",
      icon: MessageCircleIcon,
      label: `${threadMeta.replyCount} Replies`,
    },
    {
      id: "views",
      icon: EyeIcon,
      label: `${threadMeta.views} Views`,
    },
    {
      id: "created",
      icon: CalendarIcon,
      label: `Created ${threadMeta.createdAt}`,
    },
    {
      id: "activity",
      icon: ClockIcon,
      label: `Updated ${threadMeta.lastActivity}`,
    },
  ];

  const cardStyle: React.CSSProperties = {};
  return (
    <div className="card vtm-panel" style={cardStyle}>
      <div className="vtm-header">
        <UserProfileOverlay
          userId={currentThread?.user_id || ""}
          fallbackName={author.name}
          fallbackAvatar={author.profilePicture}
          fallbackRoles={currentThread?.user_roles}
        >
          <div className="vtm-icon vtm-icon-avatar">
            <UserAvatar
              src={author.profilePicture}
              alt={author.name}
              size={48}
              initials={author.name[0]?.toUpperCase()}
            />
          </div>
        </UserProfileOverlay>
        <div className="vtm-info">
          <div className="vtm-label">Thread Viewer</div>
          <h1 className="vtm-title">{currentThread?.title || "Untitled Thread"}</h1>
          {previewText ? (
            <p className="vtm-description">{previewText}</p>
          ) : (
            <p className="vtm-description">No description available.</p>
          )}
          <div className="vtm-meta-row">
            <div className="vtm-group">
              <span className="vtm-info-label">Author</span>
              <div className="vtm-author-group">
                <UserLink
                  userId={currentThread?.user_id || ""}
                  displayName={author.name}
                  className="vtm-author-link"
                />
                <div
                  className="vtm-roles"
                  style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}
                >
                  {currentThread?.user_roles &&
                    currentThread.user_roles.map(r => {
                      const roleDetails = allRoles.find(ar => ar.name === r);
                      return <RoleBadge key={r} role={roleDetails || r} />;
                    })}
                </div>
              </div>
            </div>
            <div className="vtm-group">
              <span className={statusClass}>{threadMeta.status}</span>
              <span className="vtm-id">ID: {truncate(threadMeta.threadId, { length: 10 })}</span>
            </div>
          </div>
        </div>
        {actions && <div className="vtm-actions">{actions}</div>}
      </div>

      <div className="vtm-metrics">
        {metrics.map(metric => {
          const Icon = metric.icon;
          return (
            <div key={metric.id} className="vtm-chip">
              {metric.id === "activity" ? (
                <UserProfileOverlay
                  userId={currentThread?.last_edited_by?.toString() || currentThread?.user_id || ""}
                  fallbackName={currentThread?.last_edited_by_name || author.name}
                  fallbackAvatar={currentThread?.last_edited_by_avatar || author.profilePicture}
                >
                  <UserAvatar
                    src={currentThread?.last_edited_by_avatar || author.profilePicture}
                    alt={currentThread?.last_edited_by_name || author.name}
                    size={14}
                    initials={(currentThread?.last_edited_by_name || author.name)[0]?.toUpperCase()}
                  />
                </UserProfileOverlay>
              ) : (
                <Icon size={14} />
              )}
              <span>{metric.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ViewThreadMeta;
