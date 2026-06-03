import { Save, Loader, Trash2 } from "lucide-react";
import { useProfileEdit } from "../users/useProfileEdit";
import type { ProfileUser } from "../users/types";
import "../users/UserProfile.css";

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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-color)",
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
};

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
    onSaved: (updated) => {
      setUser((u) => (u ? { ...u, ...updated } : u));
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <section className="section">
        <div className="section__header">
          <h3>Profile Settings</h3>
          <p>Update your public profile details and aesthetics.</p>
        </div>

        <div className="section__content">
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            <div className="grid grid-2" style={{ gap: "1.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontWeight: 500 }}>Display Name</label>
                <input
                  type="text"
                  className="input"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="Display name"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "1 / -1" }}>
                <label style={{ fontWeight: 500 }}>Bio</label>
                <textarea
                  className="input"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                  placeholder="Tell the community about yourself…"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <label style={{ fontWeight: 500 }}>Avatar Image</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
                    style={{ fontSize: "0.875rem", flex: 1 }}
                  />
                  <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => { setEditAvatarUrl(""); handleAvatarChange(null); }} title="Reset Avatar">
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

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <label style={{ fontWeight: 500 }}>Banner Image</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleBannerChange(e.target.files?.[0] ?? null)}
                    style={{ fontSize: "0.875rem", flex: 1 }}
                  />
                  <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => { setEditBannerUrl(""); handleBannerChange(null); }} title="Reset Banner">
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

            <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "1rem 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ margin: 0 }}>Cosmetics &amp; Skins</h4>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
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
              </button>
            </div>

            <div className="grid grid-2" style={{ gap: "1.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "1 / -1" }}>
                <label style={{ fontWeight: 500 }}>Font Family</label>
                <input
                  type="text"
                  className="input"
                  value={editFontFamily}
                  onChange={(e) => setEditFontFamily(e.target.value)}
                  placeholder="Inter, Roboto, Arial, 'Comic Sans MS', sans-serif"
                  style={inputStyle}
                />
              </div>

              {/* Background Image - file upload + URL fallback */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontWeight: 500 }}>Background Image</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="text"
                    className="input"
                    value={editBackgroundImageUrl}
                    onChange={(e) => setEditBackgroundImageUrl(e.target.value)}
                    placeholder="Or paste a URL…"
                    style={{ ...inputStyle, fontSize: "0.8125rem", flex: 1 }}
                  />
                  <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => { setEditBackgroundImageUrl(""); handleBackgroundImageChange(null); }} title="Reset Background Image">
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => handleBackgroundImageChange(e.target.files?.[0] ?? null)}
                  style={{ fontSize: "0.875rem" }}
                />
                {(backgroundImagePreview || editBackgroundImageUrl) && (
                  <img
                    src={backgroundImagePreview || editBackgroundImageUrl}
                    alt="Background preview"
                    style={{ maxWidth: "100%", maxHeight: "120px", objectFit: "cover", borderRadius: "8px" }}
                  />
                )}
              </div>

              {/* Background Video - file upload + URL fallback */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontWeight: 500 }}>Background Video</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="text"
                    className="input"
                    value={editBackgroundVideoUrl}
                    onChange={(e) => setEditBackgroundVideoUrl(e.target.value)}
                    placeholder="Or paste a URL… (mp4/webm)"
                    style={{ ...inputStyle, fontSize: "0.8125rem", flex: 1 }}
                  />
                  <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => { setEditBackgroundVideoUrl(""); handleBackgroundVideoChange(null); }} title="Reset Background Video">
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  onChange={(e) => handleBackgroundVideoChange(e.target.files?.[0] ?? null)}
                  style={{ fontSize: "0.875rem" }}
                />
                {(backgroundVideoPreview || editBackgroundVideoUrl) && (
                  <video
                    src={backgroundVideoPreview || editBackgroundVideoUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    style={{ maxWidth: "100%", maxHeight: "120px", objectFit: "cover", borderRadius: "8px" }}
                  />
                )}
              </div>

              {/* Background Position - select dropdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ fontWeight: 500 }}>Background Position</label>
                  <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => setEditBackgroundPosition("")} title="Reset Background Position">
                    <Trash2 size={14} />
                  </button>
                </div>
                <select
                  className="input"
                  value={editBackgroundPosition}
                  onChange={(e) => setEditBackgroundPosition(e.target.value)}
                  style={inputStyle}
                >
                  {BACKGROUND_POSITION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Profile Card Art - file upload + URL fallback */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontWeight: 500 }}>Profile Card Art</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="text"
                    className="input"
                    value={editProfileCardArtUrl}
                    onChange={(e) => setEditProfileCardArtUrl(e.target.value)}
                    placeholder="Or paste a URL…"
                    style={{ ...inputStyle, fontSize: "0.8125rem", flex: 1 }}
                  />
                  <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => { setEditProfileCardArtUrl(""); handleProfileCardArtChange(null); }} title="Reset Profile Card Art">
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => handleProfileCardArtChange(e.target.files?.[0] ?? null)}
                  style={{ fontSize: "0.875rem" }}
                />
                {(profileCardArtPreview || editProfileCardArtUrl) && (
                  <img
                    src={profileCardArtPreview || editProfileCardArtUrl}
                    alt="Card art preview"
                    style={{ maxWidth: "100%", maxHeight: "120px", objectFit: "cover", borderRadius: "8px" }}
                  />
                )}
              </div>
            </div>

            {editError && <div style={{ color: "var(--error-color)", padding: "0.5rem", background: "var(--error-bg)", borderRadius: "var(--radius-md)" }}>{editError}</div>}

            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={editSaving}
              style={{ alignSelf: "flex-start", marginTop: "1rem" }}
            >
              {editSaving ? <Loader size={16} className="spinning" /> : <Save size={16} />}
              <span style={{ marginLeft: "0.5rem" }}>Save Profile</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
