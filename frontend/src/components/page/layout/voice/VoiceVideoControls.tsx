import { Video, VideoOff } from "lucide-react";
import type { User } from "../../../../atoms/auth";
import type { OnlineUser } from "../../../../atoms/presence";
import Select from "../../../ui/Select";
import UserAvatar from "../../../user/UserAvatar";
import UserProfileOverlay from "../../../user/UserProfileOverlay";

interface VoiceVideoControlsProps {
  cameraActive: boolean;
  canSpeak: boolean;
  onToggleCamera: () => void;
  videoDevices: MediaDeviceInfo[];
  selectedVideoDeviceId: string;
  onVideoDeviceChange: (deviceId: string) => void;
  activeCameraUserIds: Set<string>;
  currentUser: User | null;
  onlineUsers: OnlineUser[];
  myPresenceId: string | number;
}

export function VoiceVideoControls({
  cameraActive,
  canSpeak,
  onToggleCamera,
  videoDevices,
  selectedVideoDeviceId,
  onVideoDeviceChange,
  activeCameraUserIds,
  currentUser,
  onlineUsers,
  myPresenceId,
}: VoiceVideoControlsProps) {
  return (
    <div className="ui-panel vp-settings-panel vp-settings-stack vp-settings-stack--spaced">
      <div className="vp-setting-row vp-setting-row--flush">
        <span className="vp-setting-label">
          {cameraActive ? (
            <Video size={14} className="vp-text-primary" />
          ) : (
            <VideoOff size={14} className="vp-text-secondary" />
          )}
          Camera
        </span>
        <label className="vp-switch">
          <input
            type="checkbox"
            checked={cameraActive}
            onChange={onToggleCamera}
            disabled={!canSpeak}
          />
          <div className="vp-switch-track">
            <div className="vp-switch-thumb" />
          </div>
        </label>
      </div>
      <Select
        size="sm"
        variant="minimal"
        value={selectedVideoDeviceId}
        onChange={event => onVideoDeviceChange(event.target.value)}
        options={videoDevices.map(device => ({
          label: device.label || "Camera",
          value: device.deviceId,
        }))}
      />
      {activeCameraUserIds.size > 0 && (
        <div className="vp-active-users">
          {Array.from(activeCameraUserIds).map(userId => {
            const isCurrentUser = userId === String(myPresenceId);
            const user =
              isCurrentUser && currentUser
                ? {
                    user_name: currentUser.display_name || currentUser.username,
                    avatar: currentUser.avatar_url,
                  }
                : onlineUsers.find(item => String(item.user_id) === userId);
            if (!user) return null;
            return (
              <UserProfileOverlay
                key={`cam-${userId}`}
                userId={userId}
                fallbackName={user.user_name}
                fallbackAvatar={user.avatar || undefined}
              >
                <div className="vp-camera-avatar">
                  <UserAvatar src={user.avatar || undefined} alt={user.user_name} size={20} />
                </div>
              </UserProfileOverlay>
            );
          })}
        </div>
      )}
    </div>
  );
}
