import { Save, Loader } from "lucide-react";
import { useProfileEdit } from "../users/useProfileEdit";
import type { ProfileUser } from "../users/types";
import "../users/UserProfile.css";

interface Props {
  user: ProfileUser;
  isOwnProfile: boolean;
  setUser: React.Dispatch<React.SetStateAction<ProfileUser | null>>;
}

export default function ProfileSettings({ user, isOwnProfile, setUser }: Props) {
  const {
    editBio,
    setEditBio,
    editDisplayName,
    setEditDisplayName,
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
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
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
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <label style={{ fontWeight: 500 }}>Avatar Image</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
                  style={{ fontSize: "0.875rem" }}
                />
                {(avatarPreview || user.avatar_url) && (
                  <img
                    src={avatarPreview || user.avatar_url || ""}
                    alt="Avatar preview"
                    className="up-img-preview up-img-preview-avatar"
                  />
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <label style={{ fontWeight: 500 }}>Banner Image</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleBannerChange(e.target.files?.[0] ?? null)}
                  style={{ fontSize: "0.875rem" }}
                />
                {(bannerPreview || user.banner_url) && (
                  <img
                    src={bannerPreview || user.banner_url || ""}
                    alt="Banner preview"
                    className="up-img-preview up-img-preview-banner"
                  />
                )}
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "1rem 0" }} />
            <h4 style={{ margin: 0 }}>Cosmetics & Skins</h4>

            <div className="grid grid-2" style={{ gap: "1.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "1 / -1" }}>
                <label style={{ fontWeight: 500 }}>Font Family (e.g. 'Comic Sans MS', sans-serif)</label>
                <input
                  type="text"
                  className="input"
                  value={editFontFamily}
                  onChange={(e) => setEditFontFamily(e.target.value)}
                  placeholder="Leave empty for default"
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontWeight: 500 }}>Background Image URL</label>
                <input
                  type="text"
                  className="input"
                  value={editBackgroundImageUrl}
                  onChange={(e) => setEditBackgroundImageUrl(e.target.value)}
                  placeholder="https://..."
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontWeight: 500 }}>Background Video URL</label>
                <input
                  type="text"
                  className="input"
                  value={editBackgroundVideoUrl}
                  onChange={(e) => setEditBackgroundVideoUrl(e.target.value)}
                  placeholder="https://... (mp4/webm)"
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontWeight: 500 }}>Background Position</label>
                <input
                  type="text"
                  className="input"
                  value={editBackgroundPosition}
                  onChange={(e) => setEditBackgroundPosition(e.target.value)}
                  placeholder="e.g. center, top left"
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontWeight: 500 }}>Profile Card Art URL</label>
                <input
                  type="text"
                  className="input"
                  value={editProfileCardArtUrl}
                  onChange={(e) => setEditProfileCardArtUrl(e.target.value)}
                  placeholder="https://..."
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                />
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
