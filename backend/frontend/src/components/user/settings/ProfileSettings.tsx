import { Loader, Save, Trash2 } from "lucide-react";
import type { ProfileUser } from "../types";
import { useProfileEdit } from "../useProfileEdit";
import "../UserProfile.css";
import Button from "../../input/Button";
import Select from "../../input/Select";

interface Props {
  user: ProfileUser;
  isOwnProfile: boolean;
  setUser: React.Dispatch<React.SetStateAction<ProfileUser | null>>;
}

const BACKGROUND_POSITION_OPTIONS = [
  { value: "", label: "Default" },
  { value: "center", label: "Center" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "top left", label: "Top Left" },
  { value: "top right", label: "Top Right" },
  { value: "bottom left", label: "Bottom Left" },
  { value: "bottom right", label: "Bottom Right" },
  { value: "center top", label: "Center Top" },
  { value: "center bottom", label: "Center Bottom" },
];

export default function ProfileSettings({ user, isOwnProfile, setUser }: Props) {
  const {
    editBio,
    setEditBio,
    editDisplayName,
    setEditDisplayName,
    editAvatarUrl,
    setEditAvatarUrl,
    editBannerUrl,
    setEditBannerUrl,
    avatarPreview,
    bannerPreview,
    handleAvatarChange,
    handleBannerChange,
    editSaving,
    editError,
    handleSave,
    editBackgroundImageUrl,
    setEditBackgroundImageUrl,
    editBackgroundVideoUrl,
    setEditBackgroundVideoUrl,
    editBackgroundPosition,
    setEditBackgroundPosition,
    editFontFamily,
    setEditFontFamily,
    editProfileCardArtUrl,
    setEditProfileCardArtUrl,
    backgroundImagePreview,
    backgroundVideoPreview,
    profileCardArtPreview,
    handleBackgroundImageChange,
    handleBackgroundVideoChange,
    handleProfileCardArtChange,
  } = useProfileEdit({
    user,
    isOwnProfile,
    onSaved: updated => {
      setUser(u => (u ? { ...u, ...updated } : u));
    },
  });

  return (
    <div className="modal-form compact-form-card">
      <section className="section">
        <div className="section__header">
          <h3>Profile Settings</h3>
          <p>Update your public profile details and aesthetics.</p>
        </div>

        <div className="section__content">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                className="form-input"
                value={editDisplayName}
                onChange={e => setEditDisplayName(e.target.value)}
                placeholder="Display name"
              />
            </div>

            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Bio</label>
              <textarea
                className="form-input"
                value={editBio}
                onChange={e => setEditBio(e.target.value)}
                rows={3}
                placeholder="Tell the community about yourself…"
              />
            </div>
          </div>

          <div
            className="form-grid"
            style={{ marginTop: "1.5rem" }}
          >
            <div className="form-group">
              <label className="form-label">Avatar Image</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => handleAvatarChange(e.target.files?.[0] ?? null)}
                  style={{ fontSize: "0.875rem", flex: 1 }}
                />
                <button
                  className="action-btn danger"
                  onClick={() => {
                    setEditAvatarUrl("");
                    handleAvatarChange(null);
                  }}
                  title="Reset Avatar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {(avatarPreview || editAvatarUrl) && (
                <img
                  src={avatarPreview || editAvatarUrl}
                  alt="Avatar preview"
                  className="up-img-preview up-img-preview-avatar"
                />
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Banner Image</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => handleBannerChange(e.target.files?.[0] ?? null)}
                  style={{ fontSize: "0.875rem", flex: 1 }}
                />
                <button
                  className="action-btn danger"
                  onClick={() => {
                    setEditBannerUrl("");
                    handleBannerChange(null);
                  }}
                  title="Reset Banner"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {(bannerPreview || editBannerUrl) && (
                <img
                  src={bannerPreview || editBannerUrl}
                  alt="Banner preview"
                  className="up-img-preview up-img-preview-banner"
                />
              )}
            </div>
          </div>

          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--border-color)",
              margin: "1.5rem 0",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h4 style={{ margin: 0 }}>Cosmetics &amp; Skins</h4>
            <Button
              variant="action"
              size="sm"
              onClick={() => {
                setEditBackgroundImageUrl("");
                handleBackgroundImageChange(null);
                setEditBackgroundVideoUrl("");
                handleBackgroundVideoChange(null);
                setEditProfileCardArtUrl("");
                handleProfileCardArtChange(null);
              }}
            >
              Reset Media Cosmetics
            </Button>
          </div>

          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Font Family</label>
              <input
                type="text"
                className="form-input"
                value={editFontFamily}
                onChange={e => setEditFontFamily(e.target.value)}
                placeholder="Inter, Roboto, Arial, 'Comic Sans MS', sans-serif"
              />
            </div>

            {/* Background Image - file upload + URL fallback */}
            <div className="form-group">
              <label className="form-label">Background Image</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="text"
                  className="form-input"
                  value={editBackgroundImageUrl}
                  onChange={e => setEditBackgroundImageUrl(e.target.value)}
                  placeholder="Or paste a URL…"
                  style={{ flex: 1 }}
                />
                <button
                  className="action-btn danger"
                  onClick={() => {
                    setEditBackgroundImageUrl("");
                    handleBackgroundImageChange(null);
                  }}
                  title="Reset Background Image"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={e => handleBackgroundImageChange(e.target.files?.[0] ?? null)}
                style={{ fontSize: "0.875rem" }}
              />
              {(backgroundImagePreview || editBackgroundImageUrl) && (
                <img
                  src={backgroundImagePreview || editBackgroundImageUrl}
                  alt="Background preview"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "120px",
                    objectFit: "cover",
                    borderRadius: "8px",
                  }}
                />
              )}
            </div>

            {/* Background Video - file upload + URL fallback */}
            <div className="form-group">
              <label className="form-label">Background Video</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="text"
                  className="form-input"
                  value={editBackgroundVideoUrl}
                  onChange={e => setEditBackgroundVideoUrl(e.target.value)}
                  placeholder="Or paste a URL… (mp4/webm)"
                  style={{ flex: 1 }}
                />
                <button
                  className="action-btn danger"
                  onClick={() => {
                    setEditBackgroundVideoUrl("");
                    handleBackgroundVideoChange(null);
                  }}
                  title="Reset Background Video"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                type="file"
                accept="video/mp4,video/webm"
                onChange={e => handleBackgroundVideoChange(e.target.files?.[0] ?? null)}
                style={{ fontSize: "0.875rem" }}
              />
              {(backgroundVideoPreview || editBackgroundVideoUrl) && (
                <video
                  src={backgroundVideoPreview || editBackgroundVideoUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  style={{
                    maxWidth: "100%",
                    maxHeight: "120px",
                    objectFit: "cover",
                    borderRadius: "8px",
                  }}
                />
              )}
            </div>

            {/* Background Position - select dropdown */}
            <div className="form-group">
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Background Position</label>
                <button
                  className="action-btn danger"
                  onClick={() => setEditBackgroundPosition("")}
                  title="Reset Background Position"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <Select
                value={editBackgroundPosition}
                onChange={e => setEditBackgroundPosition(e.target.value)}
                options={BACKGROUND_POSITION_OPTIONS}
              />
            </div>

            {/* Profile Card Art - file upload + URL fallback */}
            <div className="form-group">
              <label className="form-label">Profile Card Art</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="text"
                  className="form-input"
                  value={editProfileCardArtUrl}
                  onChange={e => setEditProfileCardArtUrl(e.target.value)}
                  placeholder="Or paste a URL…"
                  style={{ flex: 1 }}
                />
                <button
                  className="action-btn danger"
                  onClick={() => {
                    setEditProfileCardArtUrl("");
                    handleProfileCardArtChange(null);
                  }}
                  title="Reset Profile Card Art"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={e => handleProfileCardArtChange(e.target.files?.[0] ?? null)}
                style={{ fontSize: "0.875rem" }}
              />
              {(profileCardArtPreview || editProfileCardArtUrl) && (
                <img
                  src={profileCardArtPreview || editProfileCardArtUrl}
                  alt="Card art preview"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "120px",
                    objectFit: "cover",
                    borderRadius: "8px",
                  }}
                />
              )}
            </div>
          </div>

          {editError && (
            <div
              style={{
                color: "var(--error-color)",
                padding: "0.5rem",
                background: "var(--error-bg)",
                borderRadius: "var(--radius-md)",
                marginTop: "1rem",
              }}
            >
              {editError}
            </div>
          )}

          <div className="form-actions" style={{ marginTop: "1.5rem" }}>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={editSaving}
              iconLeft={editSaving ? <Loader size={16} className="spinning" /> : <Save size={16} />}
            >
              Save Profile
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
