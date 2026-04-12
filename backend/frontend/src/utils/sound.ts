/**
 * Sound notification utility.
 *
 * Plays short tones for real-time social events (inbox, notifications, global
 * chat) — NOT for optimistic UI updates.  Uses the Web Audio API to synthesise
 * tones so we don't need to ship any audio files.
 */

let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!_audioCtx) {
    _audioCtx = new AudioContext();
  }
  // Chrome (and others) suspend the context until a user gesture.  Calling
  // resume() is safe to call even if it's already running.
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

// ── Sound‑enabled preference (persisted in localStorage) ─────────────────

const SOUND_KEY = "skaia:sound_enabled";
const VOLUME_KEY = "skaia:sound_volume";
const DEFAULT_VOLUME = 0.7;

export function isSoundEnabled(): boolean {
  try {
    const val = localStorage.getItem(SOUND_KEY);
    return val !== "false";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, String(enabled));
  } catch {
    // ignore
  }
}

/** Get the volume level (0–1). */
export function getSoundVolume(): number {
  try {
    const val = localStorage.getItem(VOLUME_KEY);
    if (val === null) return DEFAULT_VOLUME;
    const n = parseFloat(val);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

/** Set the volume level (0–1). Also enables/disables sound at boundaries. */
export function setSoundVolume(level: number) {
  const clamped = Math.max(0, Math.min(1, level));
  try {
    localStorage.setItem(VOLUME_KEY, String(clamped));
    setSoundEnabled(clamped > 0);
  } catch {
    // ignore
  }
}

// ── Tone presets ─────────────────────────────────────────────────────────

type SoundPreset = "notification" | "message" | "chat";

interface ToneParams {
  frequency: number;
  frequency2?: number;
  duration: number;
  volume: number;
  type: OscillatorType;
}

const presets: Record<SoundPreset, ToneParams> = {
  notification: {
    frequency: 880,
    frequency2: 1100,
    duration: 0.15,
    volume: 0.12,
    type: "sine",
  },
  message: {
    frequency: 660,
    frequency2: 880,
    duration: 0.12,
    volume: 0.1,
    type: "sine",
  },
  chat: {
    frequency: 520,
    duration: 0.08,
    volume: 0.06,
    type: "sine",
  },
};

// Throttle: don't play more than one sound per 800ms to avoid spamming.
let _lastPlayed = 0;
const THROTTLE_MS = 800;

function playTone(params: ToneParams) {
  const now = Date.now();
  if (now - _lastPlayed < THROTTLE_MS) return;
  _lastPlayed = now;

  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;

    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const vol = params.volume * getSoundVolume();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + params.duration);

    const osc = ctx.createOscillator();
    osc.type = params.type;
    osc.frequency.setValueAtTime(params.frequency, t);
    if (params.frequency2) {
      osc.frequency.linearRampToValueAtTime(
        params.frequency2,
        t + params.duration * 0.5,
      );
    }
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + params.duration);
  } catch {
    // Audio not available — silently ignore.
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/** Play a notification sound (for social notifications from the server). */
export function playNotificationSound() {
  if (!isSoundEnabled()) return;
  playTone(presets.notification);
}

/** Play a message sound (for inbox DM received). */
export function playMessageSound() {
  if (!isSoundEnabled()) return;
  playTone(presets.message);
}

/** Play a chat sound (for global chat messages from others). */
export function playChatSound() {
  if (!isSoundEnabled()) return;
  playTone(presets.chat);
}
