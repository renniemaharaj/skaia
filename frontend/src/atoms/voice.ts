import { atom } from "jotai";
import { registerResource } from "../utils/wsRegistry";

export interface VoicePermissions {
  route: string;
  voiceEnabled: boolean;
  mutedUsers: Record<number, boolean>;
  kickedUsers: Record<number, boolean>;
}

// Current route's voice permissions
export const voicePermissionsAtom = atom<VoicePermissions>({
  route: "",
  voiceEnabled: true,
  mutedUsers: {},
  kickedUsers: {},
});

export const enlargedStreamIdAtom = atom<string | null>(null);

export const useV2RTCAtom = atom<boolean>(false);

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
    }
    if (data.action === "enable") next.voiceEnabled = true;
    if (data.action === "disable") next.voiceEnabled = false;
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
