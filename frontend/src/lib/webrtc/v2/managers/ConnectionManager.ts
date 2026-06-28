import { TypedEventEmitter } from "../events";
import type { SkaiaRTCEvents } from "../events";
import type { PeerSession } from "../../PeerSession";

export class ConnectionManager {
  private events: TypedEventEmitter<SkaiaRTCEvents>;

  private peerConnectionStates = new Map<string, RTCPeerConnectionState>();
  private connectionStatesTimestamps = new Map<
    string,
    { state: RTCPeerConnectionState; time: number }
  >();
  private failedTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  private triggerReconnection: (peerId: string) => void;
  private triggerClose: (peerId: string) => void;
  private unsubs: Array<() => void> = [];

  constructor(
    events: TypedEventEmitter<SkaiaRTCEvents>,
    triggerReconnection: (peerId: string) => void,
    triggerClose: (peerId: string) => void
  ) {
    this.events = events;
    this.triggerReconnection = triggerReconnection;
    this.triggerClose = triggerClose;
  }

  public getStates() {
    const states: Record<string, RTCPeerConnectionState> = {};
    for (const [key, state] of this.peerConnectionStates.entries()) {
      states[key] = state;
    }
    return states;
  }

  public monitorSession(peerId: string, session: PeerSession) {
    this.peerConnectionStates.set(peerId, session.pc.connectionState);
    this.connectionStatesTimestamps.set(peerId, {
      state: session.pc.connectionState,
      time: Date.now(),
    });

    // Initial emit for new session
    this.events.emit("connectionStateChange", { peerId, state: session.pc.connectionState });

    session.pc.onconnectionstatechange = () => {
      const state = session.pc.connectionState;
      this.peerConnectionStates.set(peerId, state);
      this.connectionStatesTimestamps.set(peerId, { state, time: Date.now() });
      this.events.emit("connectionStateChange", { peerId, state });

      if (state === "failed") {
        try {
          session.pc.restartIce();
        } catch (e) {
          console.error("ICE restart error", e);
        }

        const timeout = setTimeout(() => {
          if (session.pc.connectionState === "failed") {
            this.triggerClose(peerId);
          }
        }, 10000);
        this.failedTimeouts.set(peerId, timeout);
      } else if (state === "connected") {
        const timeout = this.failedTimeouts.get(peerId);
        if (timeout) {
          clearTimeout(timeout);
          this.failedTimeouts.delete(peerId);
        }
      } else if (state === "closed") {
        // Recursion guard is usually fine if peerSessions.delete happened,
        // but we can null out onconnectionstatechange
        session.pc.onconnectionstatechange = null;
        this.triggerClose(peerId);
      }
    };
  }

  public removePeer(peerId: string) {
    this.peerConnectionStates.delete(peerId);
    this.connectionStatesTimestamps.delete(peerId);
    const timeout = this.failedTimeouts.get(peerId);
    if (timeout) {
      clearTimeout(timeout);
      this.failedTimeouts.delete(peerId);
    }
  }

  public removeAll() {
    for (const timeout of this.failedTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.failedTimeouts.clear();
    this.peerConnectionStates.clear();
    this.connectionStatesTimestamps.clear();
  }

  public checkHealth(validPeerIds: Set<string>) {
    const now = Date.now();
    for (const peerId of this.peerConnectionStates.keys()) {
      if (!validPeerIds.has(peerId)) continue;

      const state = this.peerConnectionStates.get(peerId);
      const meta = this.connectionStatesTimestamps.get(peerId);

      let needsHeal = false;
      if (state === "failed" || state === "closed") {
        needsHeal = true;
      } else if (state === "connecting" && meta && now - meta.time > 5000) {
        needsHeal = true;
      } else if (state === "new" && meta && now - meta.time > 2000) {
        needsHeal = true;
      }

      if (needsHeal) {
        this.triggerReconnection(peerId);
      }
    }
  }

  public dispose() {
    this.removeAll();
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }
}
