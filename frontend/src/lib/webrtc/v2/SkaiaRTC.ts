import { TypedEventEmitter } from "./events";
import type { SkaiaRTCEvents } from "./events";
import { TrackManager } from "./managers/TrackManager";
import { PlaybackManager } from "./managers/PlaybackManager";
import { VoiceActivityManager } from "./managers/VoiceActivityManager";
import { PeerManager } from "./managers/PeerManager";
import type { SignalPayload } from "../PeerSession";

export class SkaiaRTC {
  public events = new TypedEventEmitter<SkaiaRTCEvents>();

  public trackManager: TrackManager;
  public playbackManager: PlaybackManager;
  public voiceActivityManager: VoiceActivityManager;
  public peerManager: PeerManager;

  constructor(
    myUserId: number | null,
    sendSignalToSocket: (targetUserId: number, payload: any) => void,
    getLocalStreams: () => MediaStream[]
  ) {
    this.trackManager = new TrackManager(this.events);
    this.playbackManager = new PlaybackManager(this.events);
    this.voiceActivityManager = new VoiceActivityManager(this.events);

    this.peerManager = new PeerManager(
      this.events,
      myUserId,
      sendSignalToSocket,
      getLocalStreams,
      this.trackManager,
      this.playbackManager,
      this.voiceActivityManager
    );
  }

  public handleSignal(
    peerId: number,
    signal: SignalPayload,
    _localStreams: (MediaStream | null)[]
  ) {
    return this.peerManager.handleSignal(peerId, signal);
  }

  public ensureConnection(
    peerId: number,
    broadcastHello: boolean,
    _localStreams: (MediaStream | null)[]
  ) {
    return this.peerManager.ensureConnection(peerId, broadcastHello);
  }

  public syncActivePeers(validPeerIds: string[]) {
    this.peerManager.syncActivePeers(validPeerIds);
  }

  public async broadcastTracks(streams: (MediaStream | null)[]) {
    await this.peerManager.broadcastTracks(streams.filter(Boolean) as MediaStream[]);
  }

  public async removeTracks(streams: (MediaStream | null)[]) {
    await this.peerManager.removeTracks(streams.filter(Boolean) as MediaStream[]);
  }

  public setAudioState(volume: number, muted: boolean) {
    this.playbackManager.setAudioState(volume, muted);
  }

  public getPeerConnections() {
    return this.peerManager.getSessions();
  }

  public closeAll() {
    this.peerManager.closeAll();
    this.trackManager.dispose();
    this.playbackManager.dispose();
    this.voiceActivityManager.dispose();
  }
}
