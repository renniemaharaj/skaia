export interface WebRTCStream {
  peerId: string;
  stream: MediaStream;
  startedAt: string;
}

export interface VoiceSignalPayload {
  route?: string;
  target_user_id?: number;
  sender_user_id?: number;
  kind: "offer" | "answer" | "candidate" | "leave";
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

export type SignalSender = (targetUserId: number, payload: VoiceSignalPayload) => void;

export class WebRTCManager {
  private peerConnections = new Map<string, RTCPeerConnection>();
  private remoteAudioRefs = new Map<string, HTMLAudioElement>();
  private remoteStreams: WebRTCStream[] = [];
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private peerConnectionStates = new Map<string, RTCPeerConnectionState>();
  private failedTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private signalingQueues = new Map<string, Promise<void>>();
  private negotiationTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private makingOffer = new Map<string, boolean>();
  private ignoreOffer = new Map<string, boolean>();

  private audioContext: AudioContext | null = null;
  private vadAnalysers = new Map<string, AnalyserNode>();
  private vadLoopId: number | null = null;
  private vadWasSpeaking = new Map<string, boolean>();

  public onStreamsChanged?: (streams: WebRTCStream[]) => void;
  public onMicUsersChanged?: (users: string[]) => void;
  public onAutoplayBlocked?: () => void;
  public onSpeaking?: (peerId: string) => void;
  public onConnectionStatesChanged?: (states: Record<string, RTCPeerConnectionState>) => void;

  private globalVolume = 1.0;
  private isPlayerMuted = false;

  private sendSignal: SignalSender;
  private myUserId: number;

  constructor(myUserId: number, sendSignal: SignalSender) {
    this.myUserId = myUserId;
    this.sendSignal = sendSignal;
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
    return this.peerConnections;
  }

  public closePeer(peerId: string, notify = true) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onnegotiationneeded = null;
      pc.close();
      this.peerConnections.delete(peerId);
      this.peerConnectionStates.delete(peerId);
      this.notifyConnectionStates();
    }
    this.pendingCandidates.delete(peerId);
    this.signalingQueues.delete(peerId);

    const timeout = this.failedTimeouts.get(peerId);
    if (timeout) {
      clearTimeout(timeout);
      this.failedTimeouts.delete(peerId);
    }

    const negTimeout = this.negotiationTimeouts.get(peerId);
    if (negTimeout) {
      clearTimeout(negTimeout);
      this.negotiationTimeouts.delete(peerId);
    }

    this.makingOffer.delete(peerId);
    this.ignoreOffer.delete(peerId);

    const analyser = this.vadAnalysers.get(peerId);
    if (analyser) {
      analyser.disconnect();
      this.vadAnalysers.delete(peerId);
    }
    this.vadWasSpeaking.delete(peerId);

    if (this.vadAnalysers.size === 0 && this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    const keysToRemove = Array.from(this.remoteAudioRefs.keys()).filter(k =>
      k.startsWith(`${peerId}-`)
    );
    for (const k of keysToRemove) {
      const audio = this.remoteAudioRefs.get(k);
      if (audio) {
        audio.pause();
        audio.srcObject = null;
        this.remoteAudioRefs.delete(k);
      }
    }

    this.remoteStreams = this.remoteStreams.filter(s => s.peerId !== peerId);
    this.onStreamsChanged?.(this.remoteStreams);
    this.updateMicUsers();

    const numericPeerId = Number(peerId);
    if (notify && Number.isFinite(numericPeerId)) {
      this.sendSignal(numericPeerId, { kind: "leave" });
    }
  }

  public closeAll() {
    for (const peerId of Array.from(this.peerConnections.keys())) {
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
    const activePeers = Array.from(this.remoteAudioRefs.keys()).map(k => k.split("-")[0]);
    this.onMicUsersChanged?.(Array.from(new Set(activePeers)));
  }

  private startVADLoop() {
    if (this.vadLoopId) return;

    const loop = () => {
      if (this.vadAnalysers.size === 0) {
        this.vadLoopId = null;
        return;
      }

      for (const [key, analyser] of this.vadAnalysers.entries()) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const isSpeakingNow = average > 10;
        const wasSpeaking = this.vadWasSpeaking.get(key) || false;

        if (isSpeakingNow && !wasSpeaking) {
          this.onSpeaking?.(key);
        }
        if (isSpeakingNow) {
          this.onSpeaking?.(key);
        }
        this.vadWasSpeaking.set(key, isSpeakingNow);
      }

      this.vadLoopId = requestAnimationFrame(loop);
    };

    this.vadLoopId = requestAnimationFrame(loop);
  }

  private addLocalTracksToPc(pc: RTCPeerConnection, streams: (MediaStream | null)[]) {
    for (const stream of streams) {
      if (!stream) continue;
      stream.getTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track === track)) {
          pc.addTrack(track, stream);
        }
      });
    }
  }

  public ensureConnection(
    peerId: number,
    isInitiator: boolean,
    localStreams: (MediaStream | null)[]
  ) {
    const key = String(peerId);
    let pc = this.peerConnections.get(key);
    if (pc) return pc;

    pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        // Add your TURN servers here
      ],
    });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.addTransceiver("video", { direction: "recvonly" });
    this.peerConnections.set(key, pc);
    this.peerConnectionStates.set(key, pc.connectionState);
    this.notifyConnectionStates();

    this.addLocalTracksToPc(pc, localStreams);

    pc.onicecandidate = event => {
      if (event.candidate) {
        this.sendSignal(peerId, {
          kind: "candidate",
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onnegotiationneeded = () => {
      const existing = this.negotiationTimeouts.get(key);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(async () => {
        try {
          this.makingOffer.set(key, true);
          await pc!.setLocalDescription();
          this.sendSignal(peerId, { kind: "offer", sdp: pc!.localDescription!.sdp });
        } catch (e) {
          console.error("Negotiation error", e);
        } finally {
          this.makingOffer.set(key, false);
        }
      }, 50);
      this.negotiationTimeouts.set(key, timeout);
    };

    pc.ontrack = event => {
      const [stream] = event.streams;
      if (!stream) return;

      if (!this.remoteStreams.some(s => s.stream.id === stream.id && s.peerId === key)) {
        this.remoteStreams = [
          ...this.remoteStreams,
          { peerId: key, stream, startedAt: new Date().toISOString() },
        ];
        this.onStreamsChanged?.(this.remoteStreams);
      }

      stream.addEventListener("removetrack", () => {
        if (stream.getTracks().length === 0) {
          this.remoteStreams = this.remoteStreams.filter(s => s.stream.id !== stream.id);
          this.onStreamsChanged?.(this.remoteStreams);
          const audioKey = `${key}-${stream.id}`;
          const audio = this.remoteAudioRefs.get(audioKey);
          if (audio) {
            audio.pause();
            audio.srcObject = null;
            this.remoteAudioRefs.delete(audioKey);
          }
          this.updateMicUsers();
        } else {
          this.remoteStreams = [...this.remoteStreams];
          this.onStreamsChanged?.(this.remoteStreams);
        }
      });

      event.track.addEventListener("ended", () => {
        if (stream.getTracks().every(t => t.readyState === "ended")) {
          this.remoteStreams = this.remoteStreams.filter(s => s.stream.id !== stream.id);
          this.onStreamsChanged?.(this.remoteStreams);
          const audioKey = `${key}-${stream.id}`;
          const audio = this.remoteAudioRefs.get(audioKey);
          if (audio) {
            audio.pause();
            audio.srcObject = null;
            this.remoteAudioRefs.delete(audioKey);
          }
          this.updateMicUsers();
        } else {
          this.remoteStreams = [...this.remoteStreams];
          this.onStreamsChanged?.(this.remoteStreams);
        }
      });

      if (event.track.kind === "audio") {
        const audioKey = `${key}-${stream.id}`;
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

        if (!this.audioContext) {
          this.audioContext = new AudioContext();
        }

        const source = this.audioContext.createMediaStreamSource(new MediaStream([event.track]));
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        this.vadAnalysers.set(key, analyser);
        this.startVADLoop();

        const updateAudioMuteState = () => {
          if (audio) {
            const hasVideo = stream.getVideoTracks().length > 0;
            audio!.muted = hasVideo || this.isPlayerMuted;
          }
        };
        updateAudioMuteState();
        stream.addEventListener("addtrack", updateAudioMuteState);

        event.track.addEventListener("ended", () => {
          stream.removeEventListener("addtrack", updateAudioMuteState);
        });
      }
    };

    pc.onconnectionstatechange = () => {
      this.peerConnectionStates.set(key, pc!.connectionState);
      this.notifyConnectionStates();

      if (pc!.connectionState === "failed") {
        pc!
          .createOffer({ iceRestart: true })
          .then(offer => {
            return pc!.setLocalDescription(offer);
          })
          .then(() => {
            this.sendSignal(peerId, { kind: "offer", sdp: pc!.localDescription!.sdp });
          })
          .catch(e => console.error("ICE restart error", e));

        const timeout = setTimeout(() => {
          if (pc!.connectionState === "failed") {
            this.closePeer(key, false);
          }
        }, 10000);
        this.failedTimeouts.set(key, timeout);
      } else if (pc!.connectionState === "connected") {
        const timeout = this.failedTimeouts.get(key);
        if (timeout) {
          clearTimeout(timeout);
          this.failedTimeouts.delete(key);
        }
      } else if (pc!.connectionState === "closed") {
        this.closePeer(key, false);
      }
    };

    if (isInitiator) {
      // The local tracks were added above, which will trigger onnegotiationneeded automatically.
      // So no need to manually call createOffer here if we rely on the debouncer.
    }

    return pc;
  }

  private queueSignal(key: string, fn: () => Promise<void>) {
    const prev = this.signalingQueues.get(key) ?? Promise.resolve();
    const next = prev.then(fn).catch(e => console.error("Signal queue error", e));
    this.signalingQueues.set(key, next);
    return next;
  }

  public async handleSignal(
    peerId: number,
    signal: VoiceSignalPayload,
    localStreams: (MediaStream | null)[]
  ) {
    const key = String(peerId);

    if (signal.kind === "leave") {
      this.closePeer(key, false);
      return;
    }

    return this.queueSignal(key, async () => {
      const pc = this.ensureConnection(peerId, false, localStreams);

      const flushCandidates = async () => {
        const candidates = this.pendingCandidates.get(key) || [];
        this.pendingCandidates.delete(key);
        for (const candidate of candidates) {
          await pc.addIceCandidate(candidate).catch(e => console.error("Flush candidate error", e));
        }
      };

      const polite = this.myUserId < peerId;
      const makingOffer = this.makingOffer.get(key) || false;

      if (signal.kind === "offer" && signal.sdp) {
        const offerCollision = makingOffer || pc.signalingState !== "stable";

        this.ignoreOffer.set(key, !polite && offerCollision);
        if (this.ignoreOffer.get(key)) {
          return;
        }

        if (offerCollision) {
          await Promise.all([
            pc.setLocalDescription({ type: "rollback" }),
            pc.setRemoteDescription({ type: "offer", sdp: signal.sdp }),
          ]);
        } else {
          await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        }

        await flushCandidates();
        this.addLocalTracksToPc(pc, localStreams);
        await pc.setLocalDescription();
        this.sendSignal(peerId, { kind: "answer", sdp: pc.localDescription!.sdp });
        return;
      }

      if (signal.kind === "answer" && signal.sdp) {
        await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await flushCandidates();
        return;
      }

      if (signal.kind === "candidate" && signal.candidate) {
        try {
          if (!pc.remoteDescription) {
            const queued = this.pendingCandidates.get(key) || [];
            queued.push(signal.candidate);
            this.pendingCandidates.set(key, queued);
            return;
          }
          await pc.addIceCandidate(signal.candidate);
        } catch (e) {
          if (!this.ignoreOffer.get(key)) {
            console.error("Add candidate error", e);
          }
        }
      }
    });
  }

  public broadcastTracks(stream: MediaStream) {
    stream.getTracks().forEach(track => {
      for (const pc of this.peerConnections.values()) {
        const senders = pc.getSenders();
        if (!senders.some(s => s.track === track)) {
          pc.addTrack(track, stream);
        }
      }
    });
  }

  public removeTracks(stream: MediaStream) {
    const tracks = stream.getTracks();
    for (const pc of this.peerConnections.values()) {
      const senders = pc.getSenders();
      senders.forEach(sender => {
        if (sender.track && tracks.includes(sender.track)) {
          pc.removeTrack(sender);
        }
      });
    }
    tracks.forEach(t => t.stop());
  }
}
