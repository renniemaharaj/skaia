import { useState, useEffect } from "react";
import { apiRequest } from "../../utils/api";
import type { ProfileUser } from "./types";

interface UseProfileEditOptions {
  user: ProfileUser | null;
  isOwnProfile: boolean;
  onSaved: (updated: Partial<ProfileUser>) => void;
}

export function useProfileEdit({
  user,
  isOwnProfile,
  onSaved,
}: UseProfileEditOptions) {
  const [editOpen, setEditOpen] = useState(false);
  const [editBio, setEditBio] = useState(user?.bio ?? "");
  const [editDisplayName, setEditDisplayName] = useState(
    user?.display_name ?? "",
  );

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [bannerPreview, setBannerPreview] = useState("");

  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Sync text fields when user data loads
  useEffect(() => {
    if (user) {
      setEditBio(user.bio ?? "");
      setEditDisplayName(user.display_name ?? "");
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup object URL previews when dialog closes
  useEffect(() => {
    if (!editOpen) {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      setAvatarFile(null);
      setBannerFile(null);
      setAvatarPreview("");
      setBannerPreview("");
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

  const handleSave = async () => {
    if (!user) return;
    setEditSaving(true);
    setEditError(null);
    try {
      let finalAvatarUrl = user.avatar_url ?? "";
      let finalBannerUrl = user.banner_url ?? "";

      if (avatarFile) {
        const fd = new FormData();
        fd.append("photo", avatarFile);
        const endpoint = isOwnProfile
          ? "/users/me/photo"
          : `/users/${user.id}/photo`;
        const res = await apiRequest<{ url: string }>(endpoint, {
          method: "POST",
          body: fd,
        });
        if (res?.url) finalAvatarUrl = res.url;
      }

      if (bannerFile) {
        const fd = new FormData();
        fd.append("banner", bannerFile);
        const endpoint = isOwnProfile
          ? "/users/me/banner"
          : `/users/${user.id}/banner`;
        const res = await apiRequest<{ url: string }>(endpoint, {
          method: "POST",
          body: fd,
        });
        if (res?.url) finalBannerUrl = res.url;
      }

      const updated = await apiRequest<ProfileUser>(`/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          display_name: editDisplayName,
          bio: editBio,
          avatar_url: finalAvatarUrl,
          banner_url: finalBannerUrl,
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
      setAvatarFile(null);
      setBannerFile(null);
      setAvatarPreview("");
      setBannerPreview("");
    }
  };

  return {
    editOpen,
    setEditOpen,
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
  };
}
