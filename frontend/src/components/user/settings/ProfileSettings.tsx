import { ShieldCheck, Trash2, UserRound } from "lucide-react";
import type { ProfileUser } from "../types";
import { useProfileEdit } from "../useProfileEdit";
import "../UserProfile.css";
import Button from "../../input/Button";
import Select from "../../input/Select";
import { FormFileInput, FormSectionIntro, ManagedForm, type ManagedFormTab } from "../../form";
import { MediaPlaceholder } from "../../ui/MediaPlaceholder";
import UserAvatar from "../UserAvatar";

interface Props {
  user: ProfileUser;
  isOwnProfile: boolean;
  setUser: React.Dispatch<React.SetStateAction<ProfileUser | null>>;
  basePath: string;
  exitPath: string;
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

export default function ProfileSettings({
  user,
  isOwnProfile,
  setUser,
  basePath,
  exitPath,
}: Props) {
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

  const tabs: ManagedFormTab[] = [
    {
      id: "profile",
      label: "Profile",
      icon: <UserRound size={15} />,
      active: true,
      to: `${basePath}/profile`,
    },
    {
      id: "security",
      label: "Security",
      icon: <ShieldCheck size={15} />,
      active: false,
      to: `${basePath}/security`,
    },
  ];

  return (
    <ManagedForm<{ profile: string }>
      id="profile-settings-form"
      title="User Settings"
      eyebrow="Account settings"
      description={`Manage settings and preferences for ${isOwnProfile ? "your account" : user.username}.`}
      initialValues={{ profile: String(user.id) }}
      onSubmit={async () => {
        await handleSave();
      }}
      cancelTo={exitPath}
      submitLabel="Save profile"
      submitDisabled={editSaving}
      tabs={tabs}
      tabsLabel="User settings"
    >
      <FormSectionIntro
        icon={<UserRound size={18} />}
        title="Profile Settings"
        description="Update your public profile details and aesthetics."
      />

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

        <div className="form-grid" style={{ marginTop: "1.5rem" }}>
          <div className="form-group">
            <label className="form-label">Avatar Image</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <FormFileInput
                label="Upload avatar image"
                accept="image/jpeg,image/png,image/webp"
                mediaType="image"
                onChange={handleAvatarChange}
                onSelectUpload={upload => {
                  handleAvatarChange(null);
                  setEditAvatarUrl(upload.url);
                }}
              />
              <button
                type="button"
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
              <UserAvatar
                src={avatarPreview || editAvatarUrl}
                alt="Avatar preview"
                className="up-img-preview up-img-preview-avatar"
                size={96}
              />
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Banner Image</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <FormFileInput
                label="Upload banner image"
                accept="image/jpeg,image/png,image/webp"
                mediaType="image"
                onChange={handleBannerChange}
                onSelectUpload={upload => {
                  handleBannerChange(null);
                  setEditBannerUrl(upload.url);
                }}
              />
              <button
                type="button"
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
              <MediaPlaceholder
                href={bannerPreview || editBannerUrl}
                alt="Banner preview"
                className="up-img-preview up-img-preview-banner"
                fit="cover"
                layout="thumbnail"
                mediaType="image"
                preserveFrame
                showCaption={false}
                size={{ height: 120, width: "100%" }}
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
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
                type="button"
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
            <FormFileInput
              label="Upload background image"
              accept="image/jpeg,image/png,image/webp,image/gif"
              mediaType="image"
              onChange={handleBackgroundImageChange}
              onSelectUpload={upload => {
                handleBackgroundImageChange(null);
                setEditBackgroundImageUrl(upload.url);
              }}
            />
            {(backgroundImagePreview || editBackgroundImageUrl) && (
              <MediaPlaceholder
                href={backgroundImagePreview || editBackgroundImageUrl}
                alt="Background preview"
                fit="cover"
                layout="thumbnail"
                mediaType="image"
                preserveFrame
                showCaption={false}
                size={{ height: 120, width: "100%" }}
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
                type="button"
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
            <FormFileInput
              label="Upload background video"
              accept="video/mp4,video/webm"
              mediaType="video"
              onChange={handleBackgroundVideoChange}
              onSelectUpload={upload => {
                handleBackgroundVideoChange(null);
                setEditBackgroundVideoUrl(upload.url);
              }}
            />
            {(backgroundVideoPreview || editBackgroundVideoUrl) && (
              <MediaPlaceholder
                alt="Background video preview"
                autoPlay
                controls={false}
                fit="cover"
                href={backgroundVideoPreview || editBackgroundVideoUrl}
                layout="thumbnail"
                loop
                mediaType="video"
                muted
                playsInline
                preserveFrame
                showCaption={false}
                size={{ height: 120, width: "100%" }}
              />
            )}
          </div>

          {/* Background Position - select dropdown */}
          <div className="form-group">
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <label className="form-label" style={{ marginBottom: 0 }}>
                Background Position
              </label>
              <button
                type="button"
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
                type="button"
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
            <FormFileInput
              label="Upload profile card art"
              accept="image/jpeg,image/png,image/webp,image/gif"
              mediaType="image"
              onChange={handleProfileCardArtChange}
              onSelectUpload={upload => {
                handleProfileCardArtChange(null);
                setEditProfileCardArtUrl(upload.url);
              }}
            />
            {(profileCardArtPreview || editProfileCardArtUrl) && (
              <MediaPlaceholder
                href={profileCardArtPreview || editProfileCardArtUrl}
                alt="Card art preview"
                fit="cover"
                layout="thumbnail"
                mediaType="image"
                preserveFrame
                showCaption={false}
                size={{ height: 120, width: "100%" }}
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
      </div>
    </ManagedForm>
  );
}
