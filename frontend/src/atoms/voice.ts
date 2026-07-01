import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { registerResource } from "../utils/wsRegistry";

export interface VoicePermissions {
  route: string;
  voiceEnabled: boolean;
  guestsAllowed: boolean;
  mutedUsers: Record<number, boolean>;
  kickedUsers: Record<number, boolean>;
  canManage: boolean;
  useLiveKit: boolean;
  ownerId?: number;
}

// Current route's voice permissions
export const voicePermissionsAtom = atom<VoicePermissions>({
  route: "",
  voiceEnabled: true,
  guestsAllowed: false,
  mutedUsers: {},
  kickedUsers: {},
  canManage: false,
  useLiveKit: true,
});

export const enlargedStreamIdAtom = atom<string | null>(null);

export interface StreamRoutePlaybackState {
  route: string;
  activeVideoCount: number;
}

export const streamRoutePlaybackAtom = atom<StreamRoutePlaybackState>({
  route: "",
  activeVideoCount: 0,
});

export const useV2RTCAtom = atomWithStorage<boolean>("useV2RTC", false);
// export const useLiveKitRTCAtom = atomWithStorage<boolean>("useLiveKitRTC", false);

registerResource(
  "voice:control",
  voicePermissionsAtom,
  (
    prev,
    data: {
      route: string;
      action: string;
      target_user_id?: number;
    }
  ) => {
    const next = { ...prev };
    if (prev.route !== data.route) {
      next.route = data.route;
      next.mutedUsers = {};
      next.kickedUsers = {};
      next.voiceEnabled = true;
      next.guestsAllowed = false;
      next.canManage = false;
      next.useLiveKit = true;
      next.ownerId = undefined;
    }
    if (data.action === "enable") next.voiceEnabled = true;
    if (data.action === "disable") next.voiceEnabled = false;
    if (data.action === "allow_guests") next.guestsAllowed = true;
    if (data.action === "deny_guests") next.guestsAllowed = false;
    if (data.action === "use_livekit") next.useLiveKit = true;
    if (data.action === "use_p2p") next.useLiveKit = false;
    if (data.action === "mute" && data.target_user_id) {
      next.mutedUsers = {
        ...next.mutedUsers,
        [data.target_user_id]: true,
      };
    }
    if (data.action === "unmute" && data.target_user_id) {
      const mutedUsers = { ...next.mutedUsers };
      delete mutedUsers[data.target_user_id];
      next.mutedUsers = mutedUsers;
    }
    if (data.action === "kick" && data.target_user_id) {
      next.kickedUsers = {
        ...next.kickedUsers,
        [data.target_user_id]: true,
      };
      next.mutedUsers = {
        ...next.mutedUsers,
        [data.target_user_id]: true,
      };
    }
    return next;
  }
);
