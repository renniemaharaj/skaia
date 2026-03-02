import React from "react";
import { useParams } from "react-router-dom";
import { useAtomValue } from "jotai";
import { currentUserAtom, hasPermissionAtom } from "../../atoms/auth";

import { useUserData } from "./useUserData";
import { useProfileEdit } from "./useProfileEdit";
import { useThreadsFeed } from "./useThreadsFeed";

import UserProfileCard from "./UserProfileCard";
import UserManagePanel from "./UserManagePanel";
import UserThreadsFeed from "./UserThreadsFeed";
import EditProfileDialog from "./EditProfileDialog";
import SuspendDialog from "./SuspendDialog";

import "./UserProfile.css";

const UserProfile: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const currentUser = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);

  const canManage = hasPermission("user.manage-others");
  const canSuspend = hasPermission("user.suspend");
  const isOwnProfile = String(currentUser?.id) === String(userId);
  const canEdit = canManage || isOwnProfile;

  const {
    user,
    setUser,
    loading,
    error,
    allPermissions,
    allRoles,
    permTogglingSet,
    roleTogglingSet,
    handlePermissionToggle,
    handleRoleToggle,
    suspendDialogOpen,
    setSuspendDialogOpen,
    suspendReason,
    setSuspendReason,
    suspendLoading,
    handleSuspend,
    handleUnsuspend,
  } = useUserData(userId, canManage);

  const {
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
  } = useProfileEdit({
    user,
    isOwnProfile,
    onSaved: (updated) => setUser((u) => (u ? { ...u, ...updated } : u)),
  });

  const { threads, threadsLoading, sentinelRef } = useThreadsFeed(userId);

  if (loading)
    return <div className="up-container up-loading">Loading profile…</div>;
  if (error || !user)
    return (
      <div className="up-container up-error">{error ?? "User not found"}</div>
    );

  const displayAvatar = user.avatar_url || user.photo_url || null;
  const displayBanner = user.banner_url || null;

  return (
    <div className="up-container">
      <UserProfileCard
        user={user}
        displayAvatar={displayAvatar}
        displayBanner={displayBanner}
        canEdit={canEdit}
        canSuspend={canSuspend}
        isOwnProfile={isOwnProfile}
        suspendLoading={suspendLoading}
        onEditOpen={() => setEditOpen(true)}
        onSuspendOpen={() => setSuspendDialogOpen(true)}
        onUnsuspend={handleUnsuspend}
      />

      {canManage && (
        <UserManagePanel
          user={user}
          allRoles={allRoles}
          allPermissions={allPermissions}
          roleTogglingSet={roleTogglingSet}
          permTogglingSet={permTogglingSet}
          onRoleToggle={handleRoleToggle}
          onPermissionToggle={handlePermissionToggle}
        />
      )}

      <UserThreadsFeed
        displayName={user.display_name || user.username}
        threads={threads}
        threadsLoading={threadsLoading}
        sentinelRef={sentinelRef}
      />

      {editOpen && (
        <EditProfileDialog
          editDisplayName={editDisplayName}
          setEditDisplayName={setEditDisplayName}
          editBio={editBio}
          setEditBio={setEditBio}
          avatarPreview={avatarPreview}
          bannerPreview={bannerPreview}
          currentAvatarUrl={displayAvatar}
          currentBannerUrl={displayBanner}
          editSaving={editSaving}
          editError={editError}
          onAvatarChange={handleAvatarChange}
          onBannerChange={handleBannerChange}
          onSave={handleSave}
          onClose={() => setEditOpen(false)}
        />
      )}

      {suspendDialogOpen && (
        <SuspendDialog
          displayName={user.display_name || user.username}
          suspendReason={suspendReason}
          setSuspendReason={setSuspendReason}
          suspendLoading={suspendLoading}
          onConfirm={handleSuspend}
          onClose={() => setSuspendDialogOpen(false)}
        />
      )}
    </div>
  );
};

export default UserProfile;
