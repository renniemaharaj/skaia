import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { onlineUsersAtom } from "../../atoms/presence";
import { apiRequest } from "../../utils/api";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import RoleBadge from "./RoleBadge";
import UserAvatar from "./UserAvatar";
import UserProfileOverlay from "./UserProfileOverlay";
import type { ProfileUser } from "./types";
import "./UserInlineCard.css";

interface UserInlineCardProps {
  userId?: string | number;
  name?: string;
  avatar?: string;
  roles?: string[];
  isGuest?: boolean;
  compact?: boolean;
}

export default function UserInlineCard({
  userId,
  name,
  avatar,
  roles,
  isGuest = false,
  compact = false,
}: UserInlineCardProps) {
  const onlineUsers = useAtomValue(onlineUsersAtom);
  const [user, setUser] = useState<ProfileUser | null>(null);
  const normalizedUserId = userId === undefined ? "" : String(userId);

  useEffect(() => {
    if (isGuest || !normalizedUserId || user || (name && avatar && roles)) return;
    let cancelled = false;
    apiRequest<ProfileUser>(`/users/${normalizedUserId}`)
      .then(data => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [avatar, isGuest, name, normalizedUserId, roles, user]);

  const isOnline = useMemo(() => {
    if (isGuest || !normalizedUserId) return true;
    return onlineUsers.some(u => String(u.user_id) === normalizedUserId);
  }, [isGuest, normalizedUserId, onlineUsers]);

  const displayName = user?.display_name || user?.username || name || (isGuest ? "Guest" : "User");
  const avatarUrl = user?.avatar_url || avatar;
  const displayRoles = user?.roles || roles || [];
  const initials = displayName[0]?.toUpperCase() || "?";

  const card = (
    <ContentFlatCard
      className={`user-inline-card${compact ? " user-inline-card--compact" : ""}${
        isGuest ? " user-inline-card--guest" : ""
      }`}
    >
      <span className="user-inline-card__avatar-wrap">
        <UserAvatar src={avatarUrl} alt={displayName} size={compact ? 24 : 30} initials={initials} />
        {isOnline && <span className="user-inline-card__online-dot" />}
      </span>
      <span className="user-inline-card__body">
        <span className="user-inline-card__name">{displayName}</span>
        <span className="user-inline-card__meta">
          <span className="user-inline-card__status">{isOnline ? "Online" : "Offline"}</span>
          {displayRoles.length > 0 && (
            <span className="user-inline-card__roles">
              {displayRoles.slice(0, compact ? 1 : 2).map(role => (
                <RoleBadge key={role} role={role} className="user-inline-card__role" />
              ))}
            </span>
          )}
        </span>
      </span>
    </ContentFlatCard>
  );

  if (isGuest || !normalizedUserId) return card;

  return (
    <UserProfileOverlay
      userId={normalizedUserId}
      fallbackName={displayName}
      fallbackAvatar={avatarUrl}
      fallbackRoles={displayRoles}
    >
      {card}
    </UserProfileOverlay>
  );
}
