import { SignalQueue } from "./SignalQueue";

export type SignalPayload = {
  route?: string;
  target_user_id?: number;
  sender_user_id?: number;
  kind: "offer" | "answer" | "candidate" | "leave" | "hello";
  sdp?: string;
  candidate?: RTCIceCandidateInit;
};

export class PeerSession {
  public pc: RTCPeerConnection;
  private signalQueue = new SignalQueue();
  private makingOffer = false;
  private ignoreOffer = false;
  private needsNegotiation = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  public readonly peerId: string;
  private readonly polite: boolean;
  private readonly sendSignal: (payload: SignalPayload) => void;

  constructor(
    peerId: string,
    polite: boolean,
    sendSignal: (payload: SignalPayload) => void,
    iceServers: RTCIceServer[] = []
  ) {
    this.peerId = peerId;
    this.polite = polite;
    this.sendSignal = sendSignal;

    this.pc = new RTCPeerConnection({ iceServers });
    console.log(`[PeerSession] Created RTCPeerConnection for ${peerId} at ${Date.now()}`);

    this.pc.onicecandidate = event => {
      if (event.candidate) {
        this.sendSignal({
          kind: "candidate",
          candidate: event.candidate.toJSON(),
        });
      }
    };

    this.pc.onnegotiationneeded = () => {
      this.negotiate("onnegotiationneeded");
    };
  }

  public async negotiate(_reason?: string) {
    this.needsNegotiation = true;
    this.triggerNegotiation();
  }

  private triggerNegotiation() {
    this.signalQueue.enqueue(async () => {
      if (!this.needsNegotiation) return;
      if (this.pc.signalingState !== "stable") return;

      this.needsNegotiation = false;
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        console.log(`[PeerSession] Generated offer for ${this.peerId} at ${Date.now()}`);
        this.sendSignal({ kind: "offer", sdp: this.pc.localDescription!.sdp });
      } catch (e) {
        console.error(`[Peer ${this.peerId}] Negotiation error`, e);
      } finally {
        this.makingOffer = false;
      }
    });
  }

  private async flushCandidates() {
    const candidates = [...this.pendingCandidates];
    this.pendingCandidates = [];
    for (const candidate of candidates) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch (e) {
        if (!this.ignoreOffer) {
          console.error(`[Peer ${this.peerId}] Flush candidate error`, e);
        }
      }
    }
  }

  public async handleSignal(signal: SignalPayload) {
    return this.signalQueue.enqueue(async () => {
      try {
        if (signal.kind === "offer" && signal.sdp) {
          const offerCollision = this.makingOffer || this.pc.signalingState !== "stable";

          this.ignoreOffer = !this.polite && offerCollision;
          if (this.ignoreOffer) return;

          if (offerCollision) {
            this.needsNegotiation = true;
            await this.pc.setLocalDescription({ type: "rollback" });
            await this.pc.setRemoteDescription({
              type: "offer",
              sdp: signal.sdp,
            });
          } else {
            await this.pc.setRemoteDescription({
              type: "offer",
              sdp: signal.sdp,
            });
          }

          await this.flushCandidates();
          await this.pc.setLocalDescription();
          console.log(`[PeerSession] Generated answer for ${this.peerId} at ${Date.now()}`);
          this.sendSignal({
            kind: "answer",
            sdp: this.pc.localDescription!.sdp,
          });

          if (this.needsNegotiation) this.triggerNegotiation();
        } else if (signal.kind === "answer" && signal.sdp) {
          await this.pc.setRemoteDescription({
            type: "answer",
            sdp: signal.sdp,
          });
          await this.flushCandidates();

          if (this.needsNegotiation) this.triggerNegotiation();
        } else if (signal.kind === "candidate" && signal.candidate) {
          try {
            if (!this.pc.remoteDescription) {
              this.pendingCandidates.push(signal.candidate);
              return;
            }
            await this.pc.addIceCandidate(signal.candidate);
          } catch (e) {
            if (!this.ignoreOffer) {
              console.error(`[Peer ${this.peerId}] ICE candidate error`, e);
            }
          }
        }
      } catch (e) {
        console.error(`[Peer ${this.peerId}] Signal handling error`, e);
      }
    });
  }

  public async publishTracks(streams: (MediaStream | null)[]) {
    for (const stream of streams) {
      if (!stream) continue;
      stream.getTracks().forEach(track => {
        if (!this.pc.getSenders().some(s => s.track === track)) {
          this.pc.addTrack(track, stream);
        }
      });
    }

    // Ensure transceivers with local tracks are allowed to send
    for (const transceiver of this.pc.getTransceivers()) {
      if (transceiver.sender.track) {
        if (transceiver.direction === "recvonly") {
          transceiver.direction = "sendrecv";
        } else if (transceiver.direction === "inactive") {
          transceiver.direction = "sendonly";
        }
      }
    }
  }

  public async removeTracks(streams: (MediaStream | null)[]) {
    for (const stream of streams) {
      if (!stream) continue;
      const tracks = stream.getTracks();
      const senders = this.pc.getSenders();
      for (const sender of senders) {
        if (sender.track && tracks.includes(sender.track)) {
          this.pc.removeTrack(sender);
        }
      }
    }
  }

  public close() {
    console.log(`[PeerSession] Closing RTCPeerConnection for ${this.peerId} at ${Date.now()}`);
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onnegotiationneeded = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }
}
