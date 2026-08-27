import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import type { User } from "../../../../atoms/auth";
import type { OnlineUser } from "../../../../atoms/presence";
import Button from "../../../ui/Button";
import Select from "../../../ui/Select";
import UserAvatar from "../../../user/UserAvatar";
import UserProfileOverlay from "../../../user/UserProfileOverlay";

interface VoiceAudioControlsProps {
  playerMuted: boolean;
  onTogglePlayerMute: () => void;
  micActive: boolean;
  canSpeak: boolean;
  onToggleMic: () => void;
  audioDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string;
  onAudioDeviceChange: (deviceId: string) => void;
  activeMicUserIds: Set<string>;
  currentUser: User | null;
  onlineUsers: OnlineUser[];
  myPresenceId: string | number;
  activeSpeakers: Record<string, number>;
  now: number;
  peerConnectionStates: Record<string, string>;
}

export function VoiceAudioControls({
  playerMuted,
  onTogglePlayerMute,
  micActive,
  canSpeak,
  onToggleMic,
  audioDevices,
  selectedAudioDeviceId,
  onAudioDeviceChange,
  activeMicUserIds,
  currentUser,
  onlineUsers,
  myPresenceId,
  activeSpeakers,
  now,
  peerConnectionStates,
}: VoiceAudioControlsProps) {
  return (
    <div className="ui-panel vp-settings-panel vp-settings-stack">
      <div className="vp-settings-heading">
        <h4>Audio Controls</h4>
        <Button
          size="icon"
          variant="ghost"
          onClick={onTogglePlayerMute}
          title={playerMuted ? "Unmute All" : "Mute All"}
        >
          {playerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </Button>
      </div>
      <div className="vp-setting-row vp-setting-row--flush">
        <span className="vp-setting-label">
          {micActive ? (
            <Mic size={14} className="vp-text-primary" />
          ) : (
            <MicOff size={14} className="vp-text-secondary" />
          )}
          Voice Chat
        </span>
        <label className="vp-switch">
          <input type="checkbox" checked={micActive} onChange={onToggleMic} disabled={!canSpeak} />
          <div className="vp-switch-track">
            <div className="vp-switch-thumb" />
          </div>
        </label>
      </div>
      {audioDevices.length > 0 && (
        <Select
          size="sm"
          variant="minimal"
          value={selectedAudioDeviceId}
          onChange={event => onAudioDeviceChange(event.target.value)}
          options={audioDevices.map(device => ({
            label: device.label || "Microphone",
            value: device.deviceId,
          }))}
        />
      )}
      {activeMicUserIds.size > 0 && (
        <div className="vp-active-users">
          {Array.from(activeMicUserIds).map(userId => {
            const isCurrentUser = userId === String(myPresenceId);
            const isSpeaking = now - (activeSpeakers[userId] || 0) < 300;
            const user =
              isCurrentUser && currentUser
                ? {
                    user_name: currentUser.display_name || currentUser.username,
                    avatar: currentUser.avatar_url,
                  }
                : onlineUsers.find(item => String(item.user_id) === userId);
            if (!user) return null;
            const connectionState =
              peerConnectionStates[userId] || (isCurrentUser ? "connected" : "connecting");
            return (
              <UserProfileOverlay
                key={userId}
                userId={userId}
                fallbackName={user.user_name}
                fallbackAvatar={user.avatar || undefined}
              >
                <div
                  className={`vp-peer-avatar${isSpeaking ? " vp-peer-avatar--speaking" : ""}`}
                  title={`Connection: ${connectionState}`}
                >
                  <UserAvatar src={user.avatar || undefined} alt={user.user_name} size={28} />
                  {!isCurrentUser && (
                    <span
                      className={`vp-peer-state vp-peer-state--${connectionState}`}
                      aria-label={`Connection ${connectionState}`}
                    />
                  )}
                </div>
              </UserProfileOverlay>
            );
          })}
        </div>
      )}
    </div>
  );
}
