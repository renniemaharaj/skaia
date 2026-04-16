import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useAtomValue } from "jotai";
import { currentUserAtom, hasPermissionAtom } from "../../atoms/auth";
import { toast } from "sonner";

import { useUserData } from "./useUserData";
import { useProfileEdit } from "./useProfileEdit";
import { useThreadsFeed } from "../../hooks/useThreadsFeed";

import UserProfileCard from "./UserProfileCard";
import UserManagePanel from "./UserManagePanel";
import UserThreadsFeed from "./UserThreadsFeed";
import UserUploads from "./UserUploads";
import EditProfileDialog from "./EditProfileDialog";
import SuspendDialog from "./SuspendDialog";

import { apiRequest } from "../../utils/api";
import "./UserProfile.css";

interface UserProfileProps {
  userIdOverride?: string;
  hideUploads?: boolean;
  handleThreads?: (
    threadsPanelHandle: React.ReactElement,
  ) => React.ReactElement;
  handlePermissions?: (
    permissionsPanelHandle: React.ReactElement,
  ) => React.ReactElement;
}

const UserProfile: React.FC<UserProfileProps> = ({
  userIdOverride,
  hideUploads,
  handleThreads,
  handlePermissions,
}) => {
  const { userId } = useParams<{ userId: string }>();
  const effectiveUserId = userIdOverride || userId;

  const currentUser = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);

  const canManage = hasPermission("user.manage-others");
  const canSuspend = hasPermission("user.suspend");
  const isOwnProfile = String(currentUser?.id) === String(effectiveUserId);
  const canEdit = canManage || isOwnProfile;
  const canResetPassword = (canManage && !isOwnProfile) || isOwnProfile;

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
  } = useUserData(effectiveUserId, canManage);

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

  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const handleResetPassword = async () => {
    if (!user?.id) return;
    if (
      !window.confirm(
        `Reset password for ${user.display_name || user.username}? A new password will be sent to their inbox.`,
      )
    )
      return;
    setResetPasswordLoading(true);
    try {
      await apiRequest(`/users/${user.id}/reset-password`, { method: "POST" });
      toast.success("Password reset — new password sent to user's inbox");
    } catch {
      toast.error("Failed to reset password");
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const {
    threads,
    isLoading: threadsLoading,
    loading: threadsLoadingOlder,
    feedRef: threadsFeedRef,
    sentinelRef: threadsSentinelRef,
    handleScroll: threadsHandleScroll,
  } = useThreadsFeed({ authorId: effectiveUserId });

  if (loading)
    return <div className="up-container up-loading">Loading profile…</div>;
  if (error || !user)
    return (
      <div className="up-container up-error">{error ?? "User not found"}</div>
    );

  const displayAvatar = user.avatar_url || null;
  const displayBanner = user.banner_url || null;

  const permissionPanel = (
    <UserManagePanel
      user={user}
      allRoles={allRoles}
      allPermissions={allPermissions}
      roleTogglingSet={roleTogglingSet}
      permTogglingSet={permTogglingSet}
      onRoleToggle={handleRoleToggle}
      onPermissionToggle={handlePermissionToggle}
      currentUserRoles={currentUser?.roles ?? []}
    />
  );

  const threadsPanel = (
    <UserThreadsFeed
      displayName={user.display_name || user.username}
      threads={threads}
      isLoading={threadsLoading}
      loading={threadsLoadingOlder}
      feedRef={threadsFeedRef}
      sentinelRef={threadsSentinelRef}
      handleScroll={threadsHandleScroll}
    />
  );

  return (
    <div className="up-container">
      <UserProfileCard
        user={user}
        displayAvatar={displayAvatar}
        displayBanner={displayBanner}
        canEdit={canEdit}
        canSuspend={canSuspend}
        canResetPassword={canResetPassword}
        isOwnProfile={isOwnProfile}
        suspendLoading={suspendLoading}
        resetPasswordLoading={resetPasswordLoading}
        onEditOpen={() => setEditOpen(true)}
        onSuspendOpen={() => setSuspendDialogOpen(true)}
        onUnsuspend={handleUnsuspend}
        onResetPassword={handleResetPassword}
      />

      {handlePermissions
        ? handlePermissions(permissionPanel)
        : canManage
          ? permissionPanel
          : null}

      {!hideUploads && (
        <UserUploads
          userId={effectiveUserId}
          displayName={user.display_name || user.username}
        />
      )}

      {handleThreads ? handleThreads(threadsPanel) : threadsPanel}

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
