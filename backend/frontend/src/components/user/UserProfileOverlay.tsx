import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../utils/api";
import {
	loadUserProfile,
	subscribeUserProfile,
} from "../../utils/userRequests";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import RoleBadge from "./RoleBadge";
import UserAvatar from "./UserAvatar";
import type { ProfileUser, Role } from "./types";
import "./UserProfileOverlay.css";

interface UserProfileOverlayProps {
  userId: string | number;
  fallbackName?: string;
  fallbackAvatar?: string;
  fallbackRoles?: string[];
  disableClick?: boolean;
  children: React.ReactNode;
}

let overlayRoleCache: Role[] | null = null;
let overlayRoleRequest: Promise<Role[]> | null = null;

const loadOverlayRoles = () => {
  if (overlayRoleCache) return Promise.resolve(overlayRoleCache);
  if (!overlayRoleRequest) {
    overlayRoleRequest = apiRequest<Role[]>("/users/roles")
			.then((data) => {
        overlayRoleCache = Array.isArray(data) ? data : [];
        return overlayRoleCache;
      })
      .catch(() => [])
      .finally(() => {
        overlayRoleRequest = null;
      });
  }
  return overlayRoleRequest;
};

const UserProfileOverlay: React.FC<UserProfileOverlayProps> = ({
  userId,
  fallbackName,
  fallbackAvatar,
  fallbackRoles,
  disableClick,
  children,
}) => {
  const navigate = useNavigate();
  const [showOverlay, setShowOverlay] = useState(false);
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const retriedAvatarURLs = useRef(new Set<string>());
  const resolvedUser = user && String(user.id) === String(userId) ? user : null;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const updatePosition = () => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const cardWidth = 320;
      let left = rect.left;

      // Prevent overflowing right edge of screen
      if (left + cardWidth > window.innerWidth - 16) {
        left = window.innerWidth - cardWidth - 16;
      }
      if (left < 16) left = 16;

      let top = rect.bottom + 8;

      // Prevent overflowing bottom edge of screen
      if (top + 200 > window.innerHeight) {
        // 200 is rough height
        top = rect.top - 8 - 200; // open upwards if not enough space (will rely on actual height if possible, but rough guess is okay for fixed)
      }

      setPopoverStyle({
        position: "fixed",
        top: top,
        left: left,
        zIndex: 9999,
      });
    }
  };

  useEffect(() => {
    if (showOverlay) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [showOverlay]);

  useEffect(() => subscribeUserProfile(userId, setUser), [userId]);

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setShowOverlay(true);
      fetchUserData();
    }, 400); // 400ms delay before showing
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, 300); // 300ms grace period before hiding
  };

  const openProfile = () => {
    if (!disableClick) {
      navigate(`/users/${userId}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disableClick || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    openProfile();
  };

  const fetchUserData = async () => {
    if (resolvedUser || loading) return;
    setLoading(true);
    try {
      const [fetchedUser, fetchedRoles] = await Promise.all([
        loadUserProfile(userId),
        loadOverlayRoles(),
      ]);
      setUser(fetchedUser);
      setAllRoles(fetchedRoles ?? []);
    } catch (e) {
      console.error("Failed to fetch user data for overlay", e);
    } finally {
      setLoading(false);
    }
  };

  // Compute visual details based on fetched user OR fallbacks
  const displayName =
		resolvedUser?.display_name ||
		resolvedUser?.username ||
		fallbackName ||
		"Unknown User";
  const avatarUrl = resolvedUser?.avatar_url || fallbackAvatar;
  const bannerUrl = resolvedUser?.banner_url || "/banner_7783x7783.png";
  const roles = resolvedUser?.roles || fallbackRoles || [];

  const rolesWithDetails = allRoles
		.filter((r) => roles.includes(r.name))
    .sort((a, b) => b.power_level - a.power_level);
  const topRole = rolesWithDetails[0];
  const themeColor = topRole?.theme_color;
  const glowColor = topRole?.glow_color;

  return (
    <div
      className="upo-wrapper"
      ref={wrapperRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
			onClick={(e) => {
        if (disableClick) return;
        e.stopPropagation();
        e.preventDefault();
        openProfile();
      }}
      onKeyDown={handleKeyDown}
      role={!disableClick ? "link" : undefined}
      tabIndex={!disableClick ? 0 : undefined}
      style={!disableClick ? { cursor: "pointer" } : undefined}
    >
      {children}

      {showOverlay &&
        document.body &&
        createPortal(
          <div
            className="upo-popover"
            style={popoverStyle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
          >
						<ContentFlatCard
              className="upo-card"
							spotlightColor={
								themeColor || "var(--primary-color, rgba(255, 255, 255, 0.25))"
							}
            >
              <div className="upo-banner">
                <img src={bannerUrl} alt="Banner" className="upo-banner-img" />
              </div>

              <div className="upo-content">
                <div className="upo-avatar-wrapper">
                  <UserAvatar
                    src={avatarUrl}
                    alt={displayName}
                    size={64}
                    initials={displayName[0]?.toUpperCase()}
                    onImageError={() => {
											if (
												!avatarUrl ||
												retriedAvatarURLs.current.has(avatarUrl)
											)
												return;
                      retriedAvatarURLs.current.add(avatarUrl);
                      void loadUserProfile(userId).catch(() => {});
                    }}
                    style={
                      glowColor
                        ? {
                            boxShadow: `0 0 10px ${glowColor}`,
                            border: `2px solid ${glowColor}`,
                          }
                        : {}
                    }
                  />
                </div>

                <div className="upo-info">
                  <h3 className="upo-display-name">{displayName}</h3>
                  {resolvedUser?.username && (
                    <p className="upo-username">@{resolvedUser.username}</p>
                  )}

                  <div
                    className="upo-roles"
                    style={{
                      display: "flex",
                      gap: "0.4rem",
                      flexWrap: "wrap",
                      marginTop: "0.2rem",
                    }}
                  >
										{roles.map((r) => {
											const roleDetails = allRoles.find((ar) => ar.name === r);
                      return <RoleBadge key={r} role={roleDetails || r} />;
                    })}
                  </div>

									{resolvedUser?.bio && (
										<p className="upo-bio">{resolvedUser.bio}</p>
									)}
                </div>

                <div className="upo-actions">
                  <button
                    type="button"
                    className="btn btn-ghost upo-action-btn"
                    onClick={() => navigate(`/users/${userId}`)}
                  >
                    View Profile
                  </button>
                </div>
              </div>
						</ContentFlatCard>
          </div>,
					document.body,
        )}
    </div>
  );
};

export default UserProfileOverlay;
