import { useState } from "react";
import { useAtomValue } from "jotai";
import { Crown, UserPlus, X, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { hasPermissionAtom, currentUserAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import PersonPicker from "../ui/PersonPicker";
import UserAvatar from "../user/UserAvatar";
import type { User } from "../../atoms/auth";
import type { PageUser } from "../../hooks/usePageData";
import "./PageOwnershipPanel.css";

interface PageOwnershipPanelProps {
  pageId: number;
  owner: PageUser | null;
  editors: PageUser[];
  onUpdate: () => void;
}

export default function PageOwnershipPanel({
  pageId,
  owner,
  editors,
  onUpdate,
}: PageOwnershipPanelProps) {
  const hasPermission = useAtomValue(hasPermissionAtom);
  const isAdmin = hasPermission("home.manage");
  const currentUser = useAtomValue(currentUserAtom);
  const isOwner =
    owner && currentUser && Number(owner.id) === Number(currentUser.id);

  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [showEditorPicker, setShowEditorPicker] = useState(false);

  const canManage = isAdmin || isOwner;

  if (!canManage && !owner && editors.length === 0) return null;

  const handleSetOwner = async (user: User) => {
    try {
      await apiRequest(`/pages/${pageId}/owner`, {
        method: "PUT",
        body: JSON.stringify({ user_id: Number(user.id) }),
      });
      toast.success(
        `Ownership assigned to ${user.display_name || user.username}`,
      );
      setShowOwnerPicker(false);
      onUpdate();
    } catch {
      toast.error("Failed to assign owner");
    }
  };

  const handleClearOwner = async () => {
    try {
      await apiRequest(`/pages/${pageId}/owner`, { method: "DELETE" });
      toast.success("Ownership removed");
      onUpdate();
    } catch {
      toast.error("Failed to remove owner");
    }
  };

  const handleAddEditor = async (user: User) => {
    try {
      await apiRequest(`/pages/${pageId}/editors`, {
        method: "POST",
        body: JSON.stringify({ user_id: Number(user.id) }),
      });
      toast.success(`${user.display_name || user.username} added as editor`);
      setShowEditorPicker(false);
      onUpdate();
    } catch {
      toast.error("Failed to add editor");
    }
  };

  const handleRemoveEditor = async (userId: number) => {
    try {
      await apiRequest(`/pages/${pageId}/editors/${userId}`, {
        method: "DELETE",
      });
      toast.success("Editor removed");
      onUpdate();
    } catch {
      toast.error("Failed to remove editor");
    }
  };

  const editorExcludeIds = [
    ...(owner ? [owner.id] : []),
    ...editors.map((e) => e.id),
  ];

  return (
    <div className="page-ownership card card--compact">
      {/* Owner section */}
      <div className="page-ownership__section">
        <div className="page-ownership__header">
          <Crown size={14} />
          <span className="page-ownership__label">Owner</span>
        </div>
        {owner ? (
          <div className="page-ownership__user">
            <span className="page-ownership__avatar">
              <UserAvatar
                src={owner.avatar_url || undefined}
                alt={owner.display_name || owner.username}
                size={16}
                initials={(owner.display_name ||
                  owner.username)?.[0]?.toUpperCase()}
              />
            </span>
            <span className="page-ownership__name">
              {owner.display_name || owner.username}
            </span>
            {canManage && (
              <div className="page-ownership__actions">
                {(isAdmin || isOwner) && (
                  <button
                    className="page-ownership__btn page-ownership__btn--subtle"
                    onClick={() => setShowOwnerPicker(true)}
                    title="Transfer ownership"
                  >
                    <ArrowRightLeft size={12} />
                  </button>
                )}
                {isAdmin && (
                  <button
                    className="page-ownership__btn page-ownership__btn--danger"
                    onClick={handleClearOwner}
                    title="Remove owner"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : canManage ? (
          <button
            className="page-ownership__add-btn"
            onClick={() => setShowOwnerPicker(true)}
          >
            <UserPlus size={14} />
            <span>Assign owner</span>
          </button>
        ) : (
          <span className="page-ownership__empty">No owner</span>
        )}
        {showOwnerPicker && (
          <PersonPicker
            onSelect={handleSetOwner}
            onClose={() => setShowOwnerPicker(false)}
            placeholder="Search for new owner…"
            className="page-ownership__picker"
          />
        )}
      </div>

      {/* Editors section */}
      <div className="page-ownership__section">
        <div className="page-ownership__header">
          <UserPlus size={14} />
          <span className="page-ownership__label">Editors</span>
          {canManage && !showEditorPicker && (
            <button
              className="page-ownership__add-btn page-ownership__add-btn--inline"
              onClick={() => setShowEditorPicker(true)}
              title="Add editor"
            >
              <UserPlus size={12} />
            </button>
          )}
        </div>
        {editors.length > 0 ? (
          <div className="page-ownership__list">
            {editors.map((editor) => (
              <div key={editor.id} className="page-ownership__user">
                <span className="page-ownership__avatar">
                  <UserAvatar
                    src={editor.avatar_url || undefined}
                    alt={editor.display_name || editor.username}
                    size={16}
                    initials={(editor.display_name ||
                      editor.username)?.[0]?.toUpperCase()}
                  />
                </span>
                <span className="page-ownership__name">
                  {editor.display_name || editor.username}
                </span>
                {canManage && (
                  <button
                    className="page-ownership__btn page-ownership__btn--danger"
                    onClick={() => handleRemoveEditor(editor.id)}
                    title="Remove editor"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="page-ownership__empty">No editors</span>
        )}
        {showEditorPicker && (
          <PersonPicker
            onSelect={handleAddEditor}
            onClose={() => setShowEditorPicker(false)}
            placeholder="Search for editor…"
            excludeIds={editorExcludeIds}
            className="page-ownership__picker"
          />
        )}
      </div>
    </div>
  );
}
