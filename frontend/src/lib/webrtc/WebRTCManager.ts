import type { SignalPayload } from "./PeerSession";
import { PeerSession } from "./PeerSession";
import { VoiceActivityDetector } from "./VoiceActivityDetector";

export type VoiceSignalPayload = SignalPayload;
export type WebRTCStream = { peerId: string; stream: MediaStream; startedAt: string };

export class WebRTCManager {
  private peerSessions = new Map<string, PeerSession>();
  private peerConnectionStates = new Map<string, RTCPeerConnectionState>();
  private connectionStatesTimestamps = new Map<
    string,
    { state: RTCPeerConnectionState; time: number }
  >();
  private failedTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingCloses = new Map<string, ReturnType<typeof setTimeout>>();

  private remoteStreams: { peerId: string; stream: MediaStream; startedAt: string }[] = [];
  private remoteAudioRefs = new Map<string, HTMLAudioElement>();
  private vad = new VoiceActivityDetector();
  private globalVolume = 1;
  private isPlayerMuted = false;

  public onStreamsChanged?: (
    streams: { peerId: string; stream: MediaStream; startedAt: string }[]
  ) => void;
  public onMicUsersChanged?: (userIds: string[]) => void;
  public onSpeaking?: (userId: string) => void;
  public onAutoplayBlocked?: () => void;
  public onConnectionStatesChanged?: (states: Record<string, RTCPeerConnectionState>) => void;

  private sendSignalToSocket: (targetUserId: number, payload: any) => void;
  private myUserId: number | null;

  constructor(
    myUserId: number | null,
    sendSignalToSocket: (targetUserId: number, payload: any) => void
  ) {
    this.myUserId = myUserId;
    this.sendSignalToSocket = sendSignalToSocket;

    this.vad.onSpeaking = peerId => {
      this.onSpeaking?.(peerId);
    };
  }

  public setAudioState(volume: number, muted: boolean) {
    this.globalVolume = volume;
    this.isPlayerMuted = muted;
    for (const audio of this.remoteAudioRefs.values()) {
      audio.volume = volume;
      const stream = audio.srcObject as MediaStream;
      if (stream) {
        const hasVideo = stream.getVideoTracks().length > 0;
        audio.muted = hasVideo || muted;
      }
    }
  }

  public getPeerConnections() {
    return this.peerSessions;
  }

  public sendSignal(targetUserId: number, payload: SignalPayload) {
    this.sendSignalToSocket(targetUserId, payload);
  }

  public handleSignal(peerId: number, signal: SignalPayload, localStreams: (MediaStream | null)[]) {
    const key = String(peerId);
    console.log(`[WebRTCManager] Received signal ${signal.kind} from ${peerId} at ${Date.now()}`);

    // If they leave, destroy the stale peer.
    if (signal.kind === "leave") {
      this.closePeer(key, false);
      return;
    }

    if (signal.kind === "hello") {
      this.closePeer(key, false);
      this.ensureConnection(peerId, false, localStreams);
      return;
    }

    const session = this.ensureConnection(peerId, false, localStreams);
    return session.handleSignal(signal);
  }

  private handlePendingCloseTimeout = (peerId: string) => {
    this.closePeer(peerId, false);
    this.pendingCloses.delete(peerId);
  };

  public syncActivePeers(validPeerIds: string[], localStreams: (MediaStream | null)[]) {
    const validSet = new Set(validPeerIds);
    const now = Date.now();

    for (const peerId of this.peerSessions.keys()) {
      if (!validSet.has(peerId)) {
        if (!this.pendingCloses.has(peerId)) {
          const timeout = setTimeout(() => this.handlePendingCloseTimeout(peerId), 5000);
          this.pendingCloses.set(peerId, timeout);
        }
      } else {
        const timeout = this.pendingCloses.get(peerId);
        if (timeout) {
          clearTimeout(timeout);
          this.pendingCloses.delete(peerId);
        }

        // Auto-healing check for active peers
        const session = this.peerSessions.get(peerId);
        if (session) {
          const state = session.pc.connectionState;
          const meta = this.connectionStatesTimestamps.get(peerId);

          let needsHeal = false;
          if (state === "failed" || state === "closed") {
            needsHeal = true;
          } else if (state === "connecting" && meta && now - meta.time > 5000) {
            console.warn(`[Auto-heal] Peer ${peerId} stuck in connecting for ${now - meta.time}ms`);
            needsHeal = true;
          } else if (state === "new" && meta && now - meta.time > 2000) {
            console.warn(`[Auto-heal] Peer ${peerId} stuck in new for ${now - meta.time}ms`);
            needsHeal = true;
          }

          if (needsHeal) {
            console.log(`[Auto-heal] Reconnecting peer ${peerId}`);
            this.closePeer(peerId, false);
            this.ensureConnection(Number(peerId), true, localStreams);
          }
        }
      }
    }
  }

  public ensureConnection(
    peerId: number,
    broadcastHello: boolean,
    localStreams: (MediaStream | null)[]
  ): PeerSession {
    const key = String(peerId);
    let session = this.peerSessions.get(key);
    if (session) return session;

    const polite = Number(this.myUserId) < peerId;

    // In production, we should pass STUN/TURN servers here.
    const iceServers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];

    session = new PeerSession(key, polite, payload => this.sendSignal(peerId, payload), iceServers);
    console.log(`[WebRTCManager] Created new session for peer ${peerId} at ${Date.now()}`);

    this.peerSessions.set(key, session);
    this.peerConnectionStates.set(key, session.pc.connectionState);

    if (broadcastHello) {
      this.sendSignal(peerId, { kind: "hello" });
    }

    this.connectionStatesTimestamps.set(key, {
      state: session.pc.connectionState,
      time: Date.now(),
    });
    this.notifyConnectionStates();

    session.pc.ontrack = event => this.handleTrack(key, event);

    session.pc.onconnectionstatechange = () => {
      const state = session!.pc.connectionState;

      console.log(`[Peer ${peerId}] State transition`, {
        signaling: session!.pc.signalingState,
        connection: session!.pc.connectionState,
        senders: session!.pc.getSenders().length,
        receivers: session!.pc.getReceivers().length,
        transceivers: session!.pc.getTransceivers().length,
      });

      this.peerConnectionStates.set(key, state);
      this.connectionStatesTimestamps.set(key, { state, time: Date.now() });
      this.notifyConnectionStates();

      if (state === "failed") {
        try {
          session!.pc.restartIce();
        } catch (e) {
          console.error("ICE restart error", e);
        }

        const timeout = setTimeout(() => {
          if (session!.pc.connectionState === "failed") {
            this.closePeer(key, false);
          }
        }, 10000);
        this.failedTimeouts.set(key, timeout);
      } else if (state === "connected") {
        const timeout = this.failedTimeouts.get(key);
        if (timeout) {
          clearTimeout(timeout);
          this.failedTimeouts.delete(key);
        }
      } else if (state === "closed") {
        this.closePeer(key, false);
      }
    };

    session.pc.onsignalingstatechange = () => {
      console.log(`[Peer ${peerId}] Signaling transition`, {
        signaling: session!.pc.signalingState,
        connection: session!.pc.connectionState,
        senders: session!.pc.getSenders().length,
        receivers: session!.pc.getReceivers().length,
        transceivers: session!.pc.getTransceivers().length,
      });
    };

    // Explicitly publish tracks and let onnegotiationneeded handle negotiation
    if (localStreams.some(s => s !== null)) {
      session.publishTracks(localStreams).catch(console.error);
    }

    return session;
  }

  private handleTrack(key: string, event: RTCTrackEvent) {
    const [stream] = event.streams;
    if (!stream) return;

    if (!this.remoteStreams.some(s => s.stream === stream && s.peerId === key)) {
      this.remoteStreams = [
        ...this.remoteStreams,
        { peerId: key, stream, startedAt: new Date().toISOString() },
      ];
      this.onStreamsChanged?.(this.remoteStreams);
    }

    if (event.track.kind === "audio") {
      this.vad.trackAudio(key, event.track.id, stream, event.track);

      const audioKey = `${key}-${event.track.id}`;
      let audio = this.remoteAudioRefs.get(audioKey);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.setAttribute("playsinline", "true");
        audio.volume = this.globalVolume;
        this.remoteAudioRefs.set(audioKey, audio);
        this.updateMicUsers();
      }
      if (audio.srcObject !== stream) {
        audio.srcObject = stream;
        audio.play().catch(err => {
          if (err.name === "NotAllowedError") {
            this.onAutoplayBlocked?.();
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

      event.track.addEventListener("ended", () => {
        stream.removeEventListener("addtrack", updateAudioMuteState);
      });
    }

    event.track.addEventListener("ended", () => {
      this.vad.untrackAudio(key, event.track.id, stream.id);
      this.cleanupEndedStream(key, stream);
    });

    stream.addEventListener("removetrack", () => {
      this.cleanupEndedStream(key, stream);
    });
  }

  private cleanupEndedStream(key: string, stream: MediaStream) {
    if (stream.getTracks().every(t => t.readyState === "ended")) {
      this.remoteStreams = this.remoteStreams.filter(s => s.stream !== stream);
      this.onStreamsChanged?.(this.remoteStreams);

      for (const track of stream.getAudioTracks()) {
        const audioKey = `${key}-${track.id}`;
        const audio = this.remoteAudioRefs.get(audioKey);
        if (audio) {
          audio.pause();
          audio.srcObject = null;
          this.remoteAudioRefs.delete(audioKey);
        }
      }
      this.updateMicUsers();
    } else {
      this.remoteStreams = [...this.remoteStreams];
      this.onStreamsChanged?.(this.remoteStreams);
    }
  }

  public async broadcastTracks(streams: (MediaStream | null)[]) {
    for (const session of this.peerSessions.values()) {
      await session.publishTracks(streams);
    }
  }

  public async removeTracks(streams: (MediaStream | null)[]) {
    for (const session of this.peerSessions.values()) {
      await session.removeTracks(streams);
    }
  }

  public closePeer(peerId: string, notify = true) {
    console.log(`[WebRTCManager] closePeer called for ${peerId} at ${Date.now()}`);
    const session = this.peerSessions.get(peerId);
    if (session) {
      session.close();
      this.peerSessions.delete(peerId);
      this.peerConnectionStates.delete(peerId);
      this.connectionStatesTimestamps.delete(peerId);
      this.notifyConnectionStates();
    }

    const timeout = this.failedTimeouts.get(peerId);
    if (timeout) {
      clearTimeout(timeout);
      this.failedTimeouts.delete(peerId);
    }

    const pendingCloseTimeout = this.pendingCloses.get(peerId);
    if (pendingCloseTimeout) {
      clearTimeout(pendingCloseTimeout);
      this.pendingCloses.delete(peerId);
    }

    this.vad.untrackPeer(peerId);

    // Clean up all remote streams and audio elements associated with this peer
    const remainingStreams = [];
    for (const s of this.remoteStreams) {
      if (s.peerId === peerId) {
        for (const track of s.stream.getAudioTracks()) {
          const audioKey = `${peerId}-${track.id}`;
          const audio = this.remoteAudioRefs.get(audioKey);
          if (audio) {
            audio.pause();
            audio.srcObject = null;
            this.remoteAudioRefs.delete(audioKey);
          }
        }
      } else {
        remainingStreams.push(s);
      }
    }

    if (this.remoteStreams.length !== remainingStreams.length) {
      this.remoteStreams = remainingStreams;
      this.onStreamsChanged?.(this.remoteStreams);
      this.updateMicUsers();
    }

    if (notify) {
      const numericPeerId = Number(peerId);
      if (Number.isFinite(numericPeerId)) {
        this.sendSignal(numericPeerId, { kind: "leave" });
      }
    }
  }

  public closeAll() {
    for (const peerId of Array.from(this.peerSessions.keys())) {
      this.closePeer(peerId, false);
    }
    this.remoteStreams = [];
    this.onStreamsChanged?.([]);
    this.onMicUsersChanged?.([]);
  }

  private notifyConnectionStates() {
    if (!this.onConnectionStatesChanged) return;
    const states: Record<string, RTCPeerConnectionState> = {};
    for (const [key, state] of this.peerConnectionStates.entries()) {
      states[key] = state;
    }
    this.onConnectionStatesChanged(states);
  }

  private updateMicUsers() {
    const activePeers = new Set<string>();
    for (const audioKey of this.remoteAudioRefs.keys()) {
      const peerId = audioKey.split("-")[0];
      activePeers.add(peerId);
    }
    this.onMicUsersChanged?.(Array.from(activePeers));
  }
}
