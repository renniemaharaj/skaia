import {
  Camera,
  Edit3,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  ShieldOff,
  UserCheck,
  UserX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProfileUser } from "./types";
import { formatDate } from "./useUserData";
import UserAvatar from "../../components/user/UserAvatar";

interface Props {
  user: ProfileUser;
  displayAvatar: string | null;
  displayBanner: string | null;
  canEdit: boolean;
  canSuspend: boolean;
  canResetPassword: boolean;
  isOwnProfile: boolean;
  suspendLoading: boolean;
  resetPasswordLoading: boolean;
  onEditOpen: () => void;
  onSuspendOpen: () => void;
  onUnsuspend: () => void;
  onResetPassword: () => void;
}

const UserProfileCard = ({
  user,
  displayAvatar,
  displayBanner,
  canEdit,
  canSuspend,
  canResetPassword,
  isOwnProfile,
  suspendLoading,
  resetPasswordLoading,
  onEditOpen,
  onSuspendOpen,
  onUnsuspend,
  onResetPassword,
}: Props) => {
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const hasMoreActions = (canSuspend && !isOwnProfile) || canResetPassword;

  return (
    <>
      {/* Banner */}
      <div className="up-banner">
        <img
          src={displayBanner || "/banner_7783x7783.png"}
          alt="Profile banner"
          className="up-banner-img"
        />
        {canEdit && (
          <button
            className="up-banner-edit-btn"
            title="Edit profile"
            onClick={onEditOpen}
          >
            <Camera size={16} />
            Edit Banner
          </button>
        )}
      </div>

      {/* Profile card */}
      <div className="up-card">
        {user.is_suspended && (
          <div className="up-suspended-banner">
            <ShieldOff size={16} />
            <span>This account is suspended</span>
            {user.suspended_reason && (
              <span className="up-suspended-reason">
                : {user.suspended_reason}
              </span>
            )}
          </div>
        )}

        <div className="up-header">
          <div className="up-avatar-wrap">
            <UserAvatar
              src={displayAvatar || undefined}
              alt={user.display_name || user.username || "User"}
              size={100}
              initials={(user.display_name ||
                user.username ||
                "?")[0]?.toUpperCase()}
              className="up-avatar"
            />
          </div>

          <div className="up-header-info">
            <h1 className="up-display-name">
              {user.display_name || user.username}
            </h1>
            <p className="up-username">@{user.username}</p>
            {user.email && canSuspend && (
              <p className="up-email">{user.email}</p>
            )}
            <div className="up-roles">
              {(user.roles ?? []).map((r) => (
                <span key={r} className={`up-badge up-badge-${r}`}>
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div className="up-actions">
            {!isOwnProfile && (
              <button
                className="up-btn up-btn-primary"
                onClick={() => navigate(`/inbox?with=${user.id}`)}
                title="Send message"
              >
                <MessageCircle size={14} /> Message
              </button>
            )}
            {canEdit && (
              <button className="up-btn up-btn-secondary" onClick={onEditOpen}>
                <Edit3 size={14} /> Edit Profile
              </button>
            )}
            {hasMoreActions && (
              <div className="up-more-wrap" ref={moreRef}>
                <button
                  className={`up-btn up-btn-secondary${moreOpen ? " active" : ""}`}
                  onClick={() => setMoreOpen((v) => !v)}
                  title="More actions"
                >
                  <MoreHorizontal size={14} />
                </button>
                {moreOpen && (
                  <div className="up-more-menu">
                    {canSuspend &&
                      !isOwnProfile &&
                      (user.is_suspended ? (
                        <button
                          className="up-more-item up-more-item--success"
                          onClick={() => {
                            setMoreOpen(false);
                            onUnsuspend();
                          }}
                          disabled={suspendLoading}
                        >
                          <UserCheck size={14} /> Unsuspend
                        </button>
                      ) : (
                        <button
                          className="up-more-item up-more-item--danger"
                          onClick={() => {
                            setMoreOpen(false);
                            onSuspendOpen();
                          }}
                          disabled={suspendLoading}
                        >
                          <UserX size={14} /> Suspend
                        </button>
                      ))}
                    {canResetPassword && (
                      <button
                        className="up-more-item up-more-item--warning"
                        onClick={() => {
                          setMoreOpen(false);
                          onResetPassword();
                        }}
                        disabled={resetPasswordLoading}
                      >
                        <RefreshCw size={14} /> Reset Password
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {user.bio && (
          <div className="up-bio">
            <p>{user.bio}</p>
          </div>
        )}

        <div className="up-meta">
          <span className="up-meta-item">
            Member since {formatDate(user.created_at)}
          </span>
        </div>
      </div>
    </>
  );
};

export default UserProfileCard;
