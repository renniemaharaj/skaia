import { TypedEventEmitter } from "../events";
import type { SkaiaRTCEvents } from "../events";

export class TrackManager {
  private events: TypedEventEmitter<SkaiaRTCEvents>;

  // Track bookkeeping: peerId -> track.id -> MediaStreamTrack
  private peerTracks = new Map<string, Map<string, MediaStreamTrack>>();
  private peerStreams = new Map<string, Map<string, { stream: MediaStream; startedAt: string }>>();

  constructor(events: TypedEventEmitter<SkaiaRTCEvents>) {
    this.events = events;
  }

  public handleTrackEvent(peerId: string, event: RTCTrackEvent) {
    const [stream] = event.streams;
    if (!stream) return;

    let streams = this.peerStreams.get(peerId);
    if (!streams) {
      streams = new Map();
      this.peerStreams.set(peerId, streams);
    }
    if (!streams.has(stream.id)) {
      streams.set(stream.id, { stream, startedAt: new Date().toISOString() });
    }

    let tracks = this.peerTracks.get(peerId);
    if (!tracks) {
      tracks = new Map();
      this.peerTracks.set(peerId, tracks);
    }

    if (tracks.size >= 3) {
      console.warn(
        `[TrackManager] Rejecting track from peer ${peerId}: maximum track limit (3) reached`
      );
      stream.removeTrack(event.track);
      event.track.stop();
      return;
    }

    tracks.set(event.track.id, event.track);
    this.events.emit("trackAdded", { peerId, track: event.track, stream });
    this.emitStreamsChanged();

    event.track.addEventListener("ended", () => {
      this.cleanupTrack(peerId, event.track, stream);
    });

    stream.addEventListener("removetrack", () => {
      this.cleanupTrack(peerId, event.track, stream);
    });
  }

  private cleanupTrack(peerId: string, track: MediaStreamTrack, stream: MediaStream) {
    const tracks = this.peerTracks.get(peerId);
    if (tracks) {
      tracks.delete(track.id);
      if (tracks.size === 0) {
        this.peerTracks.delete(peerId);
        this.peerStreams.delete(peerId);
      }
    }

    const streams = this.peerStreams.get(peerId);
    if (streams && stream.getTracks().every(t => t.readyState === "ended")) {
      streams.delete(stream.id);
      if (streams.size === 0) {
        this.peerStreams.delete(peerId);
      }
    }

    this.events.emit("trackRemoved", { peerId, track, stream });
    this.emitStreamsChanged();
  }

  public removePeer(peerId: string) {
    this.peerTracks.delete(peerId);
    this.peerStreams.delete(peerId);
    this.emitStreamsChanged();
  }

  public removeAll() {
    this.peerTracks.clear();
    this.peerStreams.clear();
    this.emitStreamsChanged();
  }

  private emitStreamsChanged() {
    const streamsPayload = Array.from(this.peerStreams.entries()).flatMap(([peerId, streams]) =>
      Array.from(streams.values()).map(data => ({
        peerId,
        stream: data.stream,
        startedAt: data.startedAt,
      }))
    );
    this.events.emit("streamsChanged", { streams: streamsPayload });
  }

  public dispose() {
    this.removeAll();
  }
}
