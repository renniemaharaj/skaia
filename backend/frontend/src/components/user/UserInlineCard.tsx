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

type RoleLike = string | { name: string; theme_color?: string; glow_color?: string };

interface UserInlineCardProps {
  userId?: string | number;
  name?: string;
  avatar?: string;
  roles?: RoleLike[];
  isGuest?: boolean;
  compact?: boolean;
}

let roleCatalogCache: RoleLike[] | null = null;
let roleCatalogRequest: Promise<RoleLike[]> | null = null;
const inlineUserCache = new Map<string, ProfileUser>();
const inlineUserRequests = new Map<string, Promise<ProfileUser>>();

const loadRoleCatalog = () => {
  if (roleCatalogCache) return Promise.resolve(roleCatalogCache);
  if (!roleCatalogRequest) {
    roleCatalogRequest = apiRequest<RoleLike[]>("/users/roles")
      .then(data => {
        roleCatalogCache = Array.isArray(data) ? data : [];
        return roleCatalogCache;
      })
      .finally(() => {
        roleCatalogRequest = null;
      });
  }
  return roleCatalogRequest;
};

const loadInlineUser = (userId: string) => {
  const cached = inlineUserCache.get(userId);
  if (cached) return Promise.resolve(cached);
  const existing = inlineUserRequests.get(userId);
  if (existing) return existing;
  const request = apiRequest<ProfileUser>(`/users/${userId}`)
    .then(data => {
      inlineUserCache.set(userId, data);
      return data;
    })
    .finally(() => {
      inlineUserRequests.delete(userId);
    });
  inlineUserRequests.set(userId, request);
  return request;
};

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
  const [roleCatalog, setRoleCatalog] = useState<RoleLike[] | null>(roleCatalogCache);
  const normalizedUserId = userId === undefined ? "" : String(userId);

  useEffect(() => {
    if (isGuest || !normalizedUserId || user || (name && roles)) return;
    let cancelled = false;
    loadInlineUser(normalizedUserId)
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
  const displayRoleDetails = useMemo(() => {
    const catalog = roleCatalog ?? [];
    return displayRoles.map(role => {
      if (typeof role !== "string") return role;
      const detail = catalog.find(item => typeof item !== "string" && item.name === role);
      return detail || role;
    });
  }, [displayRoles, roleCatalog]);
  const initials = displayName[0]?.toUpperCase() || "?";

  useEffect(() => {
    if (roleCatalog || displayRoles.length === 0) return;
    let cancelled = false;
    loadRoleCatalog()
      .then(data => {
        if (!Array.isArray(data) || cancelled) return;
        setRoleCatalog(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [displayRoles.length, roleCatalog]);

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
          {displayRoleDetails.length > 0 && (
            <span className="user-inline-card__roles">
              {displayRoleDetails.map(role => (
                <RoleBadge
                  key={typeof role === "string" ? role : role.name}
                  role={role}
                  className="user-inline-card__role"
                />
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
      fallbackRoles={displayRoles.map(role => (typeof role === "string" ? role : role.name))}
    >
      {card}
    </UserProfileOverlay>
  );
}
