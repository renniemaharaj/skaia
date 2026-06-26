import { useEffect, useState } from "react";
import { uploader } from "../../atoms/uploadAtom";
import { apiRequest } from "../../utils/api";
import type { ProfileUser } from "./types";

interface UseProfileEditOptions {
  user: ProfileUser | null;
  isOwnProfile: boolean;
  onSaved: (updated: Partial<ProfileUser>) => void;
}

export function useProfileEdit({ user, onSaved }: UseProfileEditOptions) {
  const [editOpen, setEditOpen] = useState(false);
  const [editBio, setEditBio] = useState(user?.bio ?? "");
  const [editDisplayName, setEditDisplayName] = useState(user?.display_name ?? "");
  const [editBackgroundImageUrl, setEditBackgroundImageUrl] = useState(
    user?.background_image_url ?? ""
  );
  const [editBackgroundVideoUrl, setEditBackgroundVideoUrl] = useState(
    user?.background_video_url ?? ""
  );
  const [editBackgroundPosition, setEditBackgroundPosition] = useState(
    user?.background_position ?? ""
  );
  const [editFontFamily, setEditFontFamily] = useState(user?.font_family ?? "");
  const [editProfileCardArtUrl, setEditProfileCardArtUrl] = useState(
    user?.profile_card_art_url ?? ""
  );
  const [editAvatarUrl, setEditAvatarUrl] = useState(user?.avatar_url ?? "");
  const [editBannerUrl, setEditBannerUrl] = useState(user?.banner_url ?? "");

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [bannerPreview, setBannerPreview] = useState("");

  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [backgroundVideoFile, setBackgroundVideoFile] = useState<File | null>(null);
  const [profileCardArtFile, setProfileCardArtFile] = useState<File | null>(null);
  const [backgroundImagePreview, setBackgroundImagePreview] = useState("");
  const [backgroundVideoPreview, setBackgroundVideoPreview] = useState("");
  const [profileCardArtPreview, setProfileCardArtPreview] = useState("");

  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Sync text fields when user data loads
  useEffect(() => {
    if (user) {
      setEditBio(user.bio ?? "");
      setEditDisplayName(user.display_name ?? "");
      setEditBackgroundImageUrl(user.background_image_url ?? "");
      setEditBackgroundVideoUrl(user.background_video_url ?? "");
      setEditBackgroundPosition(user.background_position ?? "");
      setEditFontFamily(user.font_family ?? "");
      setEditProfileCardArtUrl(user.profile_card_art_url ?? "");
      setEditAvatarUrl(user.avatar_url ?? "");
      setEditBannerUrl(user.banner_url ?? "");
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup object URL previews when dialog closes
  useEffect(() => {
    if (!editOpen) {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      if (backgroundImagePreview) URL.revokeObjectURL(backgroundImagePreview);
      if (backgroundVideoPreview) URL.revokeObjectURL(backgroundVideoPreview);
      if (profileCardArtPreview) URL.revokeObjectURL(profileCardArtPreview);
      setAvatarFile(null);
      setBannerFile(null);
      setBackgroundImageFile(null);
      setBackgroundVideoFile(null);
      setProfileCardArtFile(null);
      setAvatarPreview("");
      setBannerPreview("");
      setBackgroundImagePreview("");
      setBackgroundVideoPreview("");
      setProfileCardArtPreview("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen]);

  const handleAvatarChange = (file: File | null) => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : "");
  };

  const handleBannerChange = (file: File | null) => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerFile(file);
    setBannerPreview(file ? URL.createObjectURL(file) : "");
  };

  const handleBackgroundImageChange = (file: File | null) => {
    if (backgroundImagePreview) URL.revokeObjectURL(backgroundImagePreview);
    setBackgroundImageFile(file);
    setBackgroundImagePreview(file ? URL.createObjectURL(file) : "");
  };

  const handleBackgroundVideoChange = (file: File | null) => {
    if (backgroundVideoPreview) URL.revokeObjectURL(backgroundVideoPreview);
    setBackgroundVideoFile(file);
    setBackgroundVideoPreview(file ? URL.createObjectURL(file) : "");
  };

  const handleProfileCardArtChange = (file: File | null) => {
    if (profileCardArtPreview) URL.revokeObjectURL(profileCardArtPreview);
    setProfileCardArtFile(file);
    setProfileCardArtPreview(file ? URL.createObjectURL(file) : "");
  };

  const handleSave = async () => {
    if (!user) return;
    setEditSaving(true);
    setEditError(null);
    try {
      let finalAvatarUrl = editAvatarUrl;
      let finalBannerUrl = editBannerUrl;
      let finalBgImageUrl = editBackgroundImageUrl;
      let finalBgVideoUrl = editBackgroundVideoUrl;
      let finalCardArtUrl = editProfileCardArtUrl;

      if (avatarFile) {
        const res = await uploader.upload(avatarFile, { uploadType: "image" });
        if (res?.url) finalAvatarUrl = res.url;
      }

      if (bannerFile) {
        const res = await uploader.upload(bannerFile, { uploadType: "image" });
        if (res?.url) finalBannerUrl = res.url;
      }

      if (backgroundImageFile) {
        const res = await uploader.upload(backgroundImageFile, { uploadType: "image" });
        if (res?.url) finalBgImageUrl = res.url;
      }

      if (backgroundVideoFile) {
        const res = await uploader.upload(backgroundVideoFile, { uploadType: "video" });
        if (res?.url) finalBgVideoUrl = res.url;
      }

      if (profileCardArtFile) {
        const res = await uploader.upload(profileCardArtFile, { uploadType: "image" });
        if (res?.url) finalCardArtUrl = res.url;
      }

      const updated = await apiRequest<ProfileUser>(`/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          display_name: editDisplayName,
          bio: editBio,
          avatar_url: finalAvatarUrl,
          banner_url: finalBannerUrl,
          background_image_url: finalBgImageUrl || "",
          background_video_url: finalBgVideoUrl || "",
          background_position: editBackgroundPosition || "",
          font_family: editFontFamily || "",
          profile_card_art_url: finalCardArtUrl || "",
        }),
      });

      onSaved({
        ...(updated ?? {}),
        avatar_url: finalAvatarUrl,
        banner_url: finalBannerUrl,
      });
      setEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSaving(false);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      if (backgroundImagePreview) URL.revokeObjectURL(backgroundImagePreview);
      if (backgroundVideoPreview) URL.revokeObjectURL(backgroundVideoPreview);
      if (profileCardArtPreview) URL.revokeObjectURL(profileCardArtPreview);
      setAvatarFile(null);
      setBannerFile(null);
      setBackgroundImageFile(null);
      setBackgroundVideoFile(null);
      setProfileCardArtFile(null);
      setAvatarPreview("");
      setBannerPreview("");
      setBackgroundImagePreview("");
      setBackgroundVideoPreview("");
      setProfileCardArtPreview("");
      // Notify uploads list to refresh
      window.dispatchEvent(new Event("user:uploads:changed"));
    }
  };

  return {
    editOpen,
    setEditOpen,
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
  };
}
