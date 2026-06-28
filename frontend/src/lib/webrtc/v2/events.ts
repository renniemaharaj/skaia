export type SkaiaRTCEvents = {
  trackAdded: { peerId: string; track: MediaStreamTrack; stream: MediaStream };
  trackRemoved: { peerId: string; track: MediaStreamTrack; stream: MediaStream };
  speaking: { peerId: string };
  stoppedSpeaking: { peerId: string };
  connectionStateChange: { peerId: string; state: RTCPeerConnectionState };
  peersChanged: { peers: string[] };
  autoplayBlocked: void;
  micUsersChanged: { peers: string[] };
  streamsChanged: { streams: { peerId: string; stream: MediaStream; startedAt: string }[] };
};

export class TypedEventEmitter<T extends Record<string, any>> {
  private listeners: { [K in keyof T]?: Array<(payload: T[K]) => void> } = {};

  public on<K extends keyof T>(event: K, listener: (payload: T[K]) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(listener);
    return () => this.off(event, listener);
  }

  public off<K extends keyof T>(event: K, listener: (payload: T[K]) => void) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter(l => l !== listener);
  }

  public emit<K extends keyof T>(event: K, payload: T[K]) {
    if (!this.listeners[event]) return;
    for (const listener of this.listeners[event]!) {
      listener(payload);
    }
  }
}
