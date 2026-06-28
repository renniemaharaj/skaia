import { TypedEventEmitter } from "../events";
import type { SkaiaRTCEvents } from "../events";
import { VoiceActivityDetector } from "../../VoiceActivityDetector";

export class VoiceActivityManager {
  private events: TypedEventEmitter<SkaiaRTCEvents>;
  private detector = new VoiceActivityDetector();
  private unsubs: Array<() => void> = [];

  constructor(events: TypedEventEmitter<SkaiaRTCEvents>) {
    this.events = events;

    this.detector.onSpeaking = (peerId: string) => {
      this.events.emit("speaking", { peerId });
    };

    this.unsubs.push(
      this.events.on("trackAdded", payload => {
        if (payload.track.kind === "audio") {
          this.detector.trackAudio(payload.peerId, payload.track.id, payload.stream, payload.track);
        }
      }),
      this.events.on("trackRemoved", payload => {
        if (payload.track.kind === "audio") {
          this.detector.untrackAudio(payload.peerId, payload.track.id, payload.stream.id);
        }
      })
    );
  }

  public removePeer(peerId: string) {
    this.detector.untrackPeer(peerId);
  }

  public removeAll() {
    // VAD relies on explicit untracks, could implement global clear if needed
  }

  public dispose() {
    this.removeAll();
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }
}
