import { atom } from "jotai";

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

// User's global volume (0.0 to 1.0)
export const globalVolumeAtom = atom<number>(0.8);
