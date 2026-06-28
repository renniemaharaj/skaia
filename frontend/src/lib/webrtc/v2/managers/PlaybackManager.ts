import { TypedEventEmitter } from "../events";
import type { SkaiaRTCEvents } from "../events";

export class PlaybackManager {
  private events: TypedEventEmitter<SkaiaRTCEvents>;
  private remoteAudioRefs = new Map<string, HTMLAudioElement>();

  // Ensure default is positive and non-muted
  private globalVolume = 1.0;
  private isPlayerMuted = false;

  private unsubs: Array<() => void> = [];

  constructor(events: TypedEventEmitter<SkaiaRTCEvents>) {
    this.events = events;

    this.unsubs.push(
      this.events.on("trackAdded", payload => {
        if (payload.track.kind === "audio") {
          this.handleAudioTrack(payload.peerId, payload.track, payload.stream);
        }
      }),
      this.events.on("trackRemoved", payload => {
        if (payload.track.kind === "audio") {
          this.cleanupAudioTrack(payload.peerId, payload.track);
        }
      })
    );
  }

  /**
   * Wires the global audio control into all active audio tracks
   */
  public setAudioState(volume: number, muted: boolean) {
    this.globalVolume = Math.max(0, Math.min(1, volume)); // Clamp 0-1
    this.isPlayerMuted = muted;
    for (const audio of this.remoteAudioRefs.values()) {
      audio.volume = this.globalVolume;
      const stream = audio.srcObject as MediaStream;
      if (stream) {
        const hasVideo = stream.getVideoTracks().length > 0;
        audio.muted = hasVideo || this.isPlayerMuted;
      }
    }
  }

  private handleAudioTrack(peerId: string, track: MediaStreamTrack, stream: MediaStream) {
    const audioKey = `${peerId}-${track.id}`;
    let audio = this.remoteAudioRefs.get(audioKey);

    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.volume = this.globalVolume;
      this.remoteAudioRefs.set(audioKey, audio);
      this.emitMicUsersChanged();
    }

    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
      audio.play().catch(err => {
        if (err.name === "NotAllowedError") {
          this.events.emit("autoplayBlocked", undefined);
        }
      });
    }

    const updateAudioMuteState = () => {
      if (audio) {
        const hasVideo = stream.getVideoTracks().length > 0;
        audio.muted = hasVideo || this.isPlayerMuted;
      }
    };
    updateAudioMuteState();
    stream.addEventListener("addtrack", updateAudioMuteState);

    track.addEventListener("ended", () => {
      stream.removeEventListener("addtrack", updateAudioMuteState);
    });
  }

  private cleanupAudioTrack(peerId: string, track: MediaStreamTrack) {
    const audioKey = `${peerId}-${track.id}`;
    const audio = this.remoteAudioRefs.get(audioKey);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.remoteAudioRefs.delete(audioKey);
      this.emitMicUsersChanged();
    }
  }

  public removePeer(peerId: string) {
    for (const [key, audio] of this.remoteAudioRefs.entries()) {
      if (key.startsWith(`${peerId}-`)) {
        audio.pause();
        audio.srcObject = null;
        this.remoteAudioRefs.delete(key);
      }
    }
    this.emitMicUsersChanged();
  }

  public removeAll() {
    for (const audio of this.remoteAudioRefs.values()) {
      audio.pause();
      audio.srcObject = null;
    }
    this.remoteAudioRefs.clear();
    this.emitMicUsersChanged();
  }

  private emitMicUsersChanged() {
    const activePeers = new Set<string>();
    for (const audioKey of this.remoteAudioRefs.keys()) {
      const peerId = audioKey.split("-")[0];
      activePeers.add(peerId);
    }
    this.events.emit("micUsersChanged", { peers: Array.from(activePeers) });
  }

  public dispose() {
    this.removeAll();
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }
}
