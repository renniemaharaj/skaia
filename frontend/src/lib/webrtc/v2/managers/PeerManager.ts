import { TypedEventEmitter } from "../events";
import type { SkaiaRTCEvents } from "../events";
import { PeerSession } from "../../PeerSession";
import type { SignalPayload } from "../../PeerSession";
import { ConnectionManager } from "./ConnectionManager";
import type { TrackManager } from "./TrackManager";
import type { PlaybackManager } from "./PlaybackManager";
import type { VoiceActivityManager } from "./VoiceActivityManager";

export class PeerManager {
  private peerSessions = new Map<string, PeerSession>();
  private pendingCloses = new Map<string, ReturnType<typeof setTimeout>>();
  public connectionManager: ConnectionManager;

  private myUserId: number | null;
  private sendSignalToSocket: (targetUserId: number, payload: any) => void;
  private getLocalStreams: () => MediaStream[];
  private trackManager: TrackManager;
  private playbackManager: PlaybackManager;
  private voiceActivityManager: VoiceActivityManager;

  constructor(
    events: TypedEventEmitter<SkaiaRTCEvents>,
    myUserId: number | null,
    sendSignalToSocket: (targetUserId: number, payload: any) => void,
    getLocalStreams: () => MediaStream[],
    trackManager: TrackManager,
    playbackManager: PlaybackManager,
    voiceActivityManager: VoiceActivityManager
  ) {
    this.myUserId = myUserId;
    this.sendSignalToSocket = sendSignalToSocket;
    this.getLocalStreams = getLocalStreams;
    this.trackManager = trackManager;
    this.playbackManager = playbackManager;
    this.voiceActivityManager = voiceActivityManager;

    this.connectionManager = new ConnectionManager(
      events,
      peerId => this.reconnectPeer(peerId),
      peerId => this.closePeer(peerId, false)
    );
  }

  public getSession(peerId: string): PeerSession | undefined {
    return this.peerSessions.get(peerId);
  }

  public getSessions(): Map<string, PeerSession> {
    return this.peerSessions;
  }

  public handleSignal(peerId: number, signal: SignalPayload) {
    const key = String(peerId);

    if (signal.kind === "leave") {
      this.closePeer(key, false);
      return;
    }

    if (signal.kind === "hello") {
      const session = this.ensureConnection(peerId, false);
      session.negotiate("received-hello");
      return;
    }

    const session = this.ensureConnection(peerId, false);
    return session.handleSignal(signal);
  }

  public ensureConnection(peerId: number, broadcastHello: boolean): PeerSession {
    const key = String(peerId);
    let session = this.peerSessions.get(key);
    if (session) return session;

    const polite = Number(this.myUserId) < peerId;

    const iceServers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];

    session = new PeerSession(
      key,
      polite,
      payload => this.sendSignalToSocket(peerId, payload),
      iceServers
    );
    this.peerSessions.set(key, session);

    if (broadcastHello) {
      this.sendSignalToSocket(peerId, { kind: "hello" });
    }

    this.connectionManager.monitorSession(key, session);

    session.pc.ontrack = event => {
      this.trackManager.handleTrackEvent(key, event);
    };

    const streams = this.getLocalStreams();
    if (streams.length > 0) {
      session.publishTracks(streams).catch(console.error);
    }

    return session;
  }

  public broadcastTracks(streams: MediaStream[]) {
    for (const session of this.peerSessions.values()) {
      session
        .publishTracks(streams)
        .then(() => session.negotiate("broadcast-tracks"))
        .catch(console.error);
    }
  }

  public removeTracks(streams: MediaStream[]) {
    for (const session of this.peerSessions.values()) {
      session
        .removeTracks(streams)
        .then(() => session.negotiate("remove-tracks"))
        .catch(console.error);
    }
  }

  private reconnectPeer(peerId: string) {
    this.closePeer(peerId, false);
    // Since getLocalStreams is injected, auto-heal works perfectly now
    this.ensureConnection(Number(peerId), true);
  }

  public syncActivePeers(validPeerIds: string[]) {
    const validSet = new Set(validPeerIds);

    for (const peerId of this.peerSessions.keys()) {
      if (!validSet.has(peerId)) {
        if (!this.pendingCloses.has(peerId)) {
          const timeout = setTimeout(() => {
            this.closePeer(peerId, false);
            this.pendingCloses.delete(peerId);
          }, 5000);
          this.pendingCloses.set(peerId, timeout);
        }
      } else {
        const timeout = this.pendingCloses.get(peerId);
        if (timeout) {
          clearTimeout(timeout);
          this.pendingCloses.delete(peerId);
        }
      }
    }

    this.connectionManager.checkHealth(validSet);
  }

  public closePeer(peerId: string, notify = true) {
    const session = this.peerSessions.get(peerId);
    if (session) {
      session.close();
      this.peerSessions.delete(peerId);
    }

    const pendingCloseTimeout = this.pendingCloses.get(peerId);
    if (pendingCloseTimeout) {
      clearTimeout(pendingCloseTimeout);
      this.pendingCloses.delete(peerId);
    }

    this.connectionManager.removePeer(peerId);
    this.playbackManager.removePeer(peerId);
    this.trackManager.removePeer(peerId);
    this.voiceActivityManager.removePeer(peerId);

    if (notify) {
      const numericPeerId = Number(peerId);
      if (Number.isFinite(numericPeerId)) {
        this.sendSignalToSocket(numericPeerId, { kind: "leave" });
      }
    }
  }

  public closeAll() {
    for (const peerId of Array.from(this.peerSessions.keys())) {
      this.closePeer(peerId, false);
    }
    this.connectionManager.dispose();
  }
}
