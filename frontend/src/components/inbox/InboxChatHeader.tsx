import {
  Ban,
  Info,
  Lock,
  MoreVertical,
  Shield,
  Trash2,
  Unlock,
  UserMinus,
  UserPlus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { InboxConversation } from "../../atoms/inbox";
import { GlassMenu } from "../ui/GlassMenu";
import PersonPicker from "../ui/PersonPicker";
import UserAvatar from "../user/UserAvatar";
import UserProfileOverlay from "../user/UserProfileOverlay";

export function InboxChatHeader({
  activeConv,
  isBlocked,
  blockedByCurrentUser,
  blockedByOtherUser,
  isMobile,
  showChatMenu,
  onMobileBack,
  onToggleChatMenu,
  onDelete,
  onBlock,
  onUnblock,
  currentUserId,
  onLock,
  onKick,
  onMute,
  onChangeRole,
  onAddUser,
}: {
  activeConv: InboxConversation;
  isBlocked: boolean | undefined;
  blockedByCurrentUser: boolean | undefined;
  blockedByOtherUser: boolean | undefined;
  isMobile: boolean;
  showChatMenu: boolean;
  onMobileBack: () => void;
  onToggleChatMenu: () => void;
  onDelete: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  currentUserId?: string;
  onLock: (locked: boolean) => void;
  onKick: (userId: string) => void;
  onMute: (userId: string, muted: boolean) => void;
  onChangeRole: (userId: string, role: string) => void;
  onAddUser: (user: any) => Promise<void>;
}) {
  const [showAddUser, setShowAddUser] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const isGroup = activeConv?.is_group;
  const other = activeConv?.other_user;
  const displayName = isGroup
    ? activeConv.title || `Group Chat (${activeConv.participants?.length || 0})`
    : other?.display_name || other?.username || "Unknown";

  const myParticipant = isGroup
    ? activeConv.participants?.find(p => p.id.toString() === currentUserId)
    : null;
  const isOwner = myParticipant?.role === "owner";
  const isManager = myParticipant?.role === "manager" || isOwner;

  const buildParticipantOptions = () => {
    if (!activeConv?.participants) return [];
    return activeConv.participants.map(p => {
      const isTargetOwner = p.role === "owner";
      const isTargetManager = p.role === "manager";
      const isSelf = p.id.toString() === currentUserId;

      const subOptions: any[] = [];
      if (!isSelf && isManager) {
        if (isOwner && !isTargetOwner) {
          subOptions.push({
            title: isTargetManager ? "Demote to Member" : "Promote to Manager",
            icon: <Shield size={14} />,
            onClick: () => onChangeRole(p.id.toString(), isTargetManager ? "member" : "manager"),
          });
        }
        if (!isTargetOwner && (!isTargetManager || isOwner)) {
          subOptions.push({
            title: p.is_muted ? "Unmute User" : "Mute User",
            icon: p.is_muted ? <Volume2 size={14} /> : <VolumeX size={14} />,
            onClick: () => onMute(p.id.toString(), !p.is_muted),
          });
          subOptions.push({
            title: "Remove from Group",
            icon: <UserMinus size={14} />,
            onClick: () => onKick(p.id.toString()),
          });
        }
      }

      return {
        title: p.display_name || p.username,
        info: p.role,
        icon: (
          <UserProfileOverlay
            userId={p.id}
            fallbackName={p.display_name || p.username}
            fallbackAvatar={p.avatar_url || undefined}
          >
            <div style={{ display: "flex", width: "100%", height: "100%" }}>
              <UserAvatar
                src={p.avatar_url || undefined}
                alt={p.username}
                size={24}
                initials={p.username[0]?.toUpperCase()}
              />
            </div>
          </UserProfileOverlay>
        ),
        subOptions: subOptions.length > 0 ? subOptions : undefined,
        onClick: subOptions.length === 0 ? () => {} : undefined,
      };
    });
  };

  return (
    <div className="inbox-chat-header">
      {isMobile && (
        <button className="inbox-back-btn" onClick={onMobileBack} title="Back to conversations">
          ←
        </button>
      )}
      <div className="inbox-chat-user">
        {isGroup ? (
          <>
            <span className="inbox-chat-avatar" style={{ marginRight: 12 }}>
              <UserAvatar src={undefined} alt="Group" size={32} initials="G" />
            </span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span className="inbox-chat-username">
                {displayName}{" "}
                {activeConv.is_locked && (
                  <Lock size={12} style={{ display: "inline", marginLeft: 4 }} />
                )}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-secondary)",
                  marginTop: "2px",
                  cursor: "pointer",
                }}
                onClick={e => {
                  e.preventDefault();
                  setMenuPos({ x: e.clientX, y: e.clientY });
                }}
              >
                {activeConv.participants?.map(p => p.display_name || p.username).join(", ")}
              </span>
            </div>
          </>
        ) : other ? (
          <>
            <Link to={`/users/${other.id}`} className="inbox-chat-user-link">
              <span className="inbox-chat-avatar">
                <UserProfileOverlay
                  userId={other.id}
                  fallbackName={other.display_name || other.username}
                  fallbackAvatar={other.avatar_url || undefined}
                  disableClick={true}
                >
                  <div style={{ display: "flex", width: "100%", height: "100%" }}>
                    <UserAvatar src={other.avatar_url || undefined} alt={displayName} size={32} />
                  </div>
                </UserProfileOverlay>
              </span>
              <span className="inbox-chat-username">{displayName}</span>
            </Link>
            {isBlocked && (
              <span className="inbox-block-status">
                <Info size={14} />
                {blockedByCurrentUser ? "You blocked this user" : "Blocked by user"}
              </span>
            )}
          </>
        ) : (
          <span className="inbox-chat-username">Conversation</span>
        )}
      </div>
      <div className="inbox-chat-actions" style={{ position: "relative" }}>
        {isGroup && isManager && (
          <button
            className="action-btn"
            onClick={() => {
              setShowAddUser(!showAddUser);
              if (showChatMenu) onToggleChatMenu(); // close menu if open
            }}
            title="Add People"
          >
            <UserPlus size={16} />
          </button>
        )}
        <button
          className="action-btn"
          onClick={() => {
            onToggleChatMenu();
            if (showAddUser) setShowAddUser(false); // close picker if open
          }}
          title="More options"
        >
          <MoreVertical size={16} />
        </button>

        {showAddUser && isGroup && isManager && (
          <div className="inbox-chat-menu" style={{ width: 300, right: 30, padding: "12px" }}>
            <h4
              style={{
                margin: "0 0 12px 0",
                fontSize: "13px",
                color: "var(--color-text)",
              }}
            >
              Add to Group
            </h4>
            <PersonPicker
              onSelect={user => {
                onAddUser(user)
                  .then(() => setShowAddUser(false))
                  .catch(() => {});
              }}
              excludeIds={activeConv.participants?.map(p => p.id) || []}
              placeholder="Search users..."
              onClose={() => setShowAddUser(false)}
            />
          </div>
        )}

        {showChatMenu && (
          <div className="inbox-chat-menu">
            {(!isGroup || isManager) && (
              <button onClick={onDelete}>
                <Trash2 size={14} /> Delete conversation
              </button>
            )}
            {isGroup && isManager && (
              <button onClick={() => onLock(!activeConv.is_locked)}>
                {activeConv.is_locked ? <Unlock size={14} /> : <Lock size={14} />}
                {activeConv.is_locked ? "Unlock Group" : "Lock Group"}
              </button>
            )}
            {isGroup && (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "1px solid var(--border-color)",
                }}
              >
                <button
                  onClick={() => onKick(currentUserId || "")}
                  style={{ color: "var(--color-danger)" }}
                >
                  <UserMinus size={14} /> Leave group
                </button>
              </div>
            )}
            {isGroup && (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "1px solid var(--border-color)",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    padding: "0 12px 4px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Participants
                </div>
                {activeConv.participants?.map(p => {
                  const pIsMe = p.id.toString() === currentUserId;
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          minWidth: 0,
                          paddingRight: "1rem",
                        }}
                      >
                        <UserProfileOverlay
                          userId={p.id}
                          fallbackName={p.display_name || p.username}
                          fallbackAvatar={p.avatar_url || undefined}
                        >
                          <div style={{ display: "flex", flexShrink: 0 }}>
                            <UserAvatar
                              src={p.avatar_url || undefined}
                              alt={p.display_name || p.username}
                              size={20}
                              initials={(p.display_name || p.username)?.[0]?.toUpperCase()}
                            />
                          </div>
                        </UserProfileOverlay>
                        <span
                          style={{
                            fontSize: "13px",
                            color: pIsMe ? "var(--color-primary)" : "inherit",
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.display_name || p.username} {pIsMe && "(You)"}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexShrink: 0,
                        }}
                      >
                        {p.role === "owner" && (
                          <span title="Owner" style={{ display: "flex" }}>
                            <Shield size={14} style={{ color: "gold" }} />
                          </span>
                        )}
                        {p.role === "manager" && (
                          <span title="Manager" style={{ display: "flex" }}>
                            <Shield size={14} style={{ color: "silver" }} />
                          </span>
                        )}
                        {p.is_muted && (
                          <span title="Muted" style={{ display: "flex" }}>
                            <VolumeX size={14} style={{ color: "var(--color-danger)" }} />
                          </span>
                        )}

                        {isManager && !pIsMe && p.role !== "owner" && (
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              marginLeft: "4px",
                            }}
                          >
                            <button
                              className="action-btn"
                              style={{
                                padding: "4px",
                                width: "auto",
                                height: "auto",
                                display: "flex",
                                background: "transparent",
                              }}
                              onClick={() => onMute(p.id.toString(), !p.is_muted)}
                              title={p.is_muted ? "Unmute" : "Mute"}
                            >
                              {p.is_muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                            </button>
                            {isOwner && p.role !== "owner" && (
                              <button
                                className="action-btn"
                                style={{
                                  padding: "4px",
                                  width: "auto",
                                  height: "auto",
                                  display: "flex",
                                  background: "transparent",
                                }}
                                onClick={() =>
                                  onChangeRole(
                                    p.id.toString(),
                                    p.role === "manager" ? "member" : "manager"
                                  )
                                }
                                title={p.role === "manager" ? "Demote" : "Promote"}
                              >
                                <Shield size={14} />
                              </button>
                            )}
                            <button
                              className="action-btn danger"
                              style={{
                                padding: "4px",
                                width: "auto",
                                height: "auto",
                                display: "flex",
                                background: "transparent",
                              }}
                              onClick={() => onKick(p.id.toString())}
                              title="Remove"
                            >
                              <UserMinus size={14} style={{ color: "var(--color-danger)" }} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!isGroup &&
              (blockedByCurrentUser ? (
                <button onClick={onUnblock}>
                  <Ban size={14} /> Unblock user
                </button>
              ) : blockedByOtherUser ? (
                <button disabled>
                  <Ban size={14} /> Blocked by user
                </button>
              ) : (
                <button onClick={onBlock}>
                  <Ban size={14} /> Block user
                </button>
              ))}
          </div>
        )}
      </div>
      {menuPos && (
        <GlassMenu
          x={menuPos.x}
          y={menuPos.y}
          options={buildParticipantOptions()}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  );
}
