import { Save, X } from "lucide-react";

interface Props {
  editDisplayName: string;
  setEditDisplayName: (v: string) => void;
  editBio: string;
  setEditBio: (v: string) => void;
  avatarPreview: string;
  bannerPreview: string;
  currentAvatarUrl: string | null;
  currentBannerUrl: string | null;
  editSaving: boolean;
  editError: string | null;
  onAvatarChange: (file: File | null) => void;
  onBannerChange: (file: File | null) => void;
  onSave: () => void;
  onClose: () => void;
}

const EditProfileDialog = ({
  editDisplayName,
  setEditDisplayName,
  editBio,
  setEditBio,
  avatarPreview,
  bannerPreview,
  currentAvatarUrl,
  currentBannerUrl,
  editSaving,
  editError,
  onAvatarChange,
  onBannerChange,
  onSave,
  onClose,
}: Props) => {
  return (
    <div className="up-dialog-overlay" onClick={onClose}>
      <div className="up-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="up-dialog-header">
          <h3>Edit Profile</h3>
          <button className="up-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="up-dialog-body">
          <label className="up-field">
            <span>Display Name</span>
            <input
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder="Display name"
            />
          </label>

          <label className="up-field">
            <span>Bio</span>
            <textarea
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              rows={3}
              placeholder="Tell the community about yourself…"
            />
          </label>

          <label className="up-field">
            <span>Avatar Image</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => onAvatarChange(e.target.files?.[0] ?? null)}
            />
          </label>
          {(avatarPreview || currentAvatarUrl) && (
            <img
              src={avatarPreview || currentAvatarUrl || ""}
              alt="Avatar preview"
              className="up-img-preview up-img-preview-avatar"
            />
          )}

          <label className="up-field">
            <span>Banner Image</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => onBannerChange(e.target.files?.[0] ?? null)}
            />
          </label>
          {(bannerPreview || currentBannerUrl) && (
            <img
              src={bannerPreview || currentBannerUrl || ""}
              alt="Banner preview"
              className="up-img-preview up-img-preview-banner"
            />
          )}

          {editError && <p className="up-edit-error">{editError}</p>}
        </div>

        <div className="up-dialog-footer">
          <button
            className="up-btn up-btn-secondary"
            onClick={onClose}
            disabled={editSaving}
          >
            Cancel
          </button>
          <button
            className="up-btn up-btn-primary"
            onClick={onSave}
            disabled={editSaving}
          >
            {editSaving ? <span className="up-spinner" /> : <Save size={14} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditProfileDialog;
