import {
  ConnectionState,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { apiRequest } from "../../../utils/api";
import type { WebRTCStream } from "../WebRTCManager";

export interface LiveKitTokenResponse {
  url: string;
  token: string;
  room: string;
  identity: string;
  ttl: number;
}

export interface LiveKitRTCOptions {
  route: string;
  identity: number;
  guestSessionId: string;
}

type PublishedTrack = {
  track: MediaStreamTrack;
  streamId: string;
};

type RemoteStreamEntry = WebRTCStream & {
  trackIds: Set<string>;
};

export class LiveKitRTC {
  private room: Room | null = null;
  private tokenPromise: Promise<LiveKitTokenResponse> | null = null;
  private connectPromise: Promise<void> | null = null;
  private publishedTracks = new Map<string, PublishedTrack>();
  private remoteStreams = new Map<string, RemoteStreamEntry>();
  private remoteAudioRefs = new Map<string, HTMLAudioElement>();
  private peerConnectionStates = new Map<string, RTCPeerConnectionState>();
  private globalVolume = 1;
  private isPlayerMuted = false;
  private options: LiveKitRTCOptions;

  public onStreamsChanged?: (streams: WebRTCStream[]) => void;
  public onMicUsersChanged?: (userIds: string[]) => void;
  public onSpeaking?: (userId: string) => void;
  public onAutoplayBlocked?: () => void;
  public onConnectionStatesChanged?: (states: Record<string, RTCPeerConnectionState>) => void;

  constructor(options: LiveKitRTCOptions) {
    this.options = options;
  }

  public setAudioState(volume: number, muted: boolean) {
    this.globalVolume = Math.max(0, Math.min(1, volume));
    this.isPlayerMuted = muted;
    for (const audio of this.remoteAudioRefs.values()) {
      audio.volume = this.globalVolume;
      audio.muted = this.isPlayerMuted;
    }
  }

  public getPeerConnections() {
    return this.peerConnectionStates;
  }

  public async handleSignal() {
    await this.ensureConnected();
  }

  public async ensureConnection() {
    await this.ensureConnected();
    return null;
  }

  public syncActivePeers() {
    if (!this.room) return;
    const connected = this.toPeerConnectionState(this.room.state);
    this.peerConnectionStates.clear();
    for (const participant of this.room.remoteParticipants.values()) {
      this.peerConnectionStates.set(participant.identity, connected);
    }
    this.emitConnectionStates();
  }

  public async broadcastTracks(streams: (MediaStream | null)[]) {
    const room = await this.ensureConnected();
    for (const stream of streams) {
      if (!stream) continue;
      for (const track of stream.getTracks()) {
        if (track.readyState === "ended" || this.publishedTracks.has(track.id)) continue;
        await room.localParticipant.publishTrack(track, {
          source: this.sourceForTrack(track, stream),
        });
        this.publishedTracks.set(track.id, { track, streamId: stream.id });
      }
    }
  }

  public async removeTracks(streams: (MediaStream | null)[]) {
    if (!this.room) return;
    for (const stream of streams) {
      if (!stream) continue;
      for (const track of stream.getTracks()) {
        await this.room.localParticipant.unpublishTrack(track, false);
        this.publishedTracks.delete(track.id);
      }
    }
  }

  public closeAll() {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
    for (const audio of this.remoteAudioRefs.values()) {
      audio.pause();
      audio.srcObject = null;
    }
    this.remoteAudioRefs.clear();
    this.remoteStreams.clear();
    this.peerConnectionStates.clear();
    this.publishedTracks.clear();
    this.tokenPromise = null;
    this.connectPromise = null;
    this.emitStreamsChanged();
    this.emitMicUsersChanged();
    this.emitConnectionStates();
  }

  private async ensureConnected() {
    if (this.room && this.room.state === ConnectionState.Connected) {
      return this.room;
    }
    if (!this.connectPromise) {
      this.connectPromise = this.connect();
    }
    try {
      await this.connectPromise;
    } catch (err) {
      this.connectPromise = null;
      this.tokenPromise = null;
      this.room = null;
      throw err;
    }
    if (!this.room) {
      throw new Error("LiveKit room failed to connect");
    }
    return this.room;
  }

  private async connect() {
    const token = await this.getToken();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    this.room = room;
    this.bindRoomEvents(room);
    await room.connect(token.url, token.token);
  }

  private getToken() {
    if (!this.tokenPromise) {
      this.tokenPromise = apiRequest<LiveKitTokenResponse>("/voice/livekit-token", {
        method: "POST",
        body: JSON.stringify({
          route: this.options.route,
          identity: this.options.identity,
          guest_session_id: this.options.guestSessionId,
        }),
      });
    }
    return this.tokenPromise;
  }

  private bindRoomEvents(room: Room) {
    room
      .on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed)
      .on(RoomEvent.TrackUnpublished, this.handleTrackUnpublished)
      .on(RoomEvent.ParticipantConnected, this.handleParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected)
      .on(RoomEvent.ConnectionStateChanged, this.handleConnectionStateChanged)
      .on(RoomEvent.ActiveSpeakersChanged, this.handleActiveSpeakersChanged);
  }

  private handleTrackSubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ) => {
    const mediaTrack = track.mediaStreamTrack;
    const streamKey = `${participant.identity}:${publication.trackSid}`;
    const stream = new MediaStream([mediaTrack]);
    (stream as MediaStream & { __skaiaSource?: Track.Source }).__skaiaSource = publication.source;
    const entry: RemoteStreamEntry = {
      peerId: participant.identity,
      stream,
      startedAt: new Date().toISOString(),
      trackIds: new Set([mediaTrack.id]),
    };
    this.remoteStreams.set(streamKey, entry);

    if (mediaTrack.kind === "audio") {
      this.attachRemoteAudio(streamKey, stream);
    }

    this.peerConnectionStates.set(participant.identity, "connected");
    this.emitStreamsChanged();
    this.emitMicUsersChanged();
    this.emitConnectionStates();
  };

  private handleTrackUnsubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ) => {
    this.removeRemoteTrack(participant.identity, publication.trackSid || track.sid || "");
  };

  private handleTrackUnpublished = (
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ) => {
    this.removeRemoteTrack(participant.identity, publication.trackSid);
  };

  private handleParticipantConnected = (participant: RemoteParticipant) => {
    this.peerConnectionStates.set(participant.identity, "connected");
    this.emitConnectionStates();
  };

  private handleParticipantDisconnected = (participant: RemoteParticipant) => {
    for (const key of Array.from(this.remoteStreams.keys())) {
      if (key.startsWith(`${participant.identity}:`)) {
        this.remoteStreams.delete(key);
        this.detachRemoteAudio(key);
      }
    }
    this.peerConnectionStates.delete(participant.identity);
    this.emitStreamsChanged();
    this.emitMicUsersChanged();
    this.emitConnectionStates();
  };

  private handleConnectionStateChanged = (state: ConnectionState) => {
    const mapped = this.toPeerConnectionState(state);
    if (this.room) {
      for (const participant of this.room.remoteParticipants.values()) {
        this.peerConnectionStates.set(participant.identity, mapped);
      }
    }
    this.emitConnectionStates();
    if (state === ConnectionState.Disconnected) {
      this.connectPromise = null;
    }
  };

  private handleActiveSpeakersChanged = (speakers: Array<{ identity: string }>) => {
    for (const speaker of speakers) {
      if (speaker.identity !== this.room?.localParticipant.identity) {
        this.onSpeaking?.(speaker.identity);
      }
    }
  };

  private removeRemoteTrack(peerId: string, trackSid: string) {
    const key = `${peerId}:${trackSid}`;
    this.remoteStreams.delete(key);
    this.detachRemoteAudio(key);
    this.emitStreamsChanged();
    this.emitMicUsersChanged();
  }

  private attachRemoteAudio(key: string, stream: MediaStream) {
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.volume = this.globalVolume;
    audio.muted = this.isPlayerMuted;
    audio.srcObject = stream;
    this.remoteAudioRefs.set(key, audio);
    audio.play().catch(err => {
      if (err?.name === "NotAllowedError") {
        this.onAutoplayBlocked?.();
      }
    });
  }

  private detachRemoteAudio(key: string) {
    const audio = this.remoteAudioRefs.get(key);
    if (!audio) return;
    audio.pause();
    audio.srcObject = null;
    this.remoteAudioRefs.delete(key);
  }

  private sourceForTrack(track: MediaStreamTrack, stream: MediaStream) {
    const hasScreenVideo = stream.getVideoTracks().some(videoTrack => {
      const settings = videoTrack.getSettings() as MediaTrackSettings & {
        displaySurface?: string;
      };
      return Boolean(settings.displaySurface);
    });
    if (track.kind === "audio") {
      return hasScreenVideo ? Track.Source.ScreenShareAudio : Track.Source.Microphone;
    }
    return hasScreenVideo ? Track.Source.ScreenShare : Track.Source.Camera;
  }

  private toPeerConnectionState(state: ConnectionState): RTCPeerConnectionState {
    switch (state) {
      case ConnectionState.Connected:
        return "connected";
      case ConnectionState.Connecting:
      case ConnectionState.Reconnecting:
      case ConnectionState.SignalReconnecting:
        return "connecting";
      case ConnectionState.Disconnected:
      default:
        return "disconnected";
    }
  }

  private emitStreamsChanged() {
    this.onStreamsChanged?.(
      Array.from(this.remoteStreams.values()).map(({ peerId, stream, startedAt }) => ({
        peerId,
        stream,
        startedAt,
      }))
    );
  }

  private emitMicUsersChanged() {
    const peers = new Set<string>();
    for (const [key, audio] of this.remoteAudioRefs.entries()) {
      if (audio.srcObject) {
        peers.add(key.split(":")[0]);
      }
    }
    this.onMicUsersChanged?.(Array.from(peers));
  }

  private emitConnectionStates() {
    const states: Record<string, RTCPeerConnectionState> = {};
    for (const [peerId, state] of this.peerConnectionStates.entries()) {
      states[peerId] = state;
    }
    this.onConnectionStatesChanged?.(states);
  }
}
