import { useEffect, useRef, useState, useCallback } from "react";
import { WebRTCManager, type WebRTCStream, type VoiceSignalPayload } from "./WebRTCManager";

export function useWebRTCManager(
  myUserId: number,
  sendSignal: (targetUserId: number, payload: VoiceSignalPayload) => void,
  globalVolume: number,
  isPlayerMuted: boolean
) {
  const sendSignalRef = useRef(sendSignal);
  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);

  const managerRef = useRef<WebRTCManager | null>(null);

  if (!managerRef.current) {
    const stableSend = (targetUserId: number, payload: VoiceSignalPayload) => {
      sendSignalRef.current(targetUserId, payload);
    };
    managerRef.current = new WebRTCManager(myUserId, stableSend);
  }
  const manager = managerRef.current;

  const [remoteStreams, setRemoteStreams] = useState<WebRTCStream[]>([]);
  const [remoteMicUsers, setRemoteMicUsers] = useState<string[]>([]);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [peerConnectionStates, setPeerConnectionStates] = useState<
    Record<string, RTCPeerConnectionState>
  >({});

  useEffect(() => {
    manager.onStreamsChanged = streams => setRemoteStreams([...streams]);
    manager.onMicUsersChanged = users => setRemoteMicUsers([...users]);
    manager.onAutoplayBlocked = () => setAutoplayBlocked(true);
    manager.onConnectionStatesChanged = states => setPeerConnectionStates(states);

    // We can dispatch the custom event here instead of inside the manager
    manager.onSpeaking = peerId => {
      window.dispatchEvent(new CustomEvent("voice:speaking", { detail: peerId }));
    };

    return () => {
      manager.onStreamsChanged = undefined;
      manager.onMicUsersChanged = undefined;
      manager.onAutoplayBlocked = undefined;
      manager.onConnectionStatesChanged = undefined;
      manager.onSpeaking = undefined;
    };
  }, [manager]);

  useEffect(() => {
    manager.setAudioState(globalVolume, isPlayerMuted);
  }, [manager, globalVolume, isPlayerMuted]);

  useEffect(() => {
    return () => {
      manager.closeAll();
    };
  }, [manager]);

  const handleSignal = useCallback(
    async (peerId: number, signal: VoiceSignalPayload, localStreams: (MediaStream | null)[]) => {
      await manager.handleSignal(peerId, signal, localStreams);
    },
    [manager]
  );

  const ensureConnection = useCallback(
    (peerId: number, isInitiator: boolean, localStreams: (MediaStream | null)[]) => {
      return manager.ensureConnection(peerId, isInitiator, localStreams);
    },
    [manager]
  );

  const closePeer = useCallback(
    (peerId: string, notify = true) => {
      manager.closePeer(peerId, notify);
    },
    [manager]
  );

  const broadcastTracks = useCallback(
    (stream: MediaStream) => {
      manager.broadcastTracks(stream);
    },
    [manager]
  );

  const removeTracks = useCallback(
    (stream: MediaStream) => {
      manager.removeTracks(stream);
    },
    [manager]
  );

  const getActivePeerIds = useCallback(() => {
    return Array.from(manager.getPeerConnections().keys());
  }, [manager]);

  return {
    remoteStreams,
    remoteMicUsers,
    handleSignal,
    ensureConnection,
    closePeer,
    broadcastTracks,
    removeTracks,
    getActivePeerIds,
    autoplayBlocked,
    setAutoplayBlocked,
    peerConnectionStates,
  };
}
