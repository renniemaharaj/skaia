import { useEffect, useRef, useState, useCallback } from "react";
import { useAtomValue } from "jotai";
import { WebRTCManager, type WebRTCStream, type VoiceSignalPayload } from "./WebRTCManager";
import { SkaiaRTC } from "./v2/SkaiaRTC";
import { useLiveKitRTCAtom, useV2RTCAtom } from "../../atoms/voice";
import type { SignalPayload } from "./PeerSession";
import { LiveKitRTC } from "./livekit/LiveKitRTC";

export function useWebRTCManager(
  myUserId: number,
  sendSignal: (targetUserId: number, payload: VoiceSignalPayload) => void,
  globalVolume: number,
  isPlayerMuted: boolean,
  getLocalStreams?: () => MediaStream[],
  route = "",
  guestSessionId = ""
) {
  const useV2 = useAtomValue(useV2RTCAtom);
  const useLiveKit = useAtomValue(useLiveKitRTCAtom);
  const mode = useLiveKit ? "livekit" : useV2 ? "skaia" : "mesh";

  const sendSignalRef = useRef(sendSignal);
  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);

  const managerRef = useRef<WebRTCManager | SkaiaRTC | LiveKitRTC | null>(null);
  const managerModeRef = useRef<string | null>(null);
  const managerRouteRef = useRef<string>("");
  const managerUserRef = useRef<number | null>(null);

  if (
    !managerRef.current ||
    managerModeRef.current !== mode ||
    managerRouteRef.current !== route ||
    managerUserRef.current !== myUserId
  ) {
    if (managerRef.current) {
      managerRef.current.closeAll();
    }
    const stableSend = (targetUserId: number, payload: VoiceSignalPayload) => {
      sendSignalRef.current(targetUserId, payload);
    };
    if (mode === "livekit") {
      managerRef.current = new LiveKitRTC({
        route,
        identity: myUserId,
        guestSessionId,
      });
    } else if (mode === "skaia") {
      managerRef.current = new SkaiaRTC(myUserId, stableSend, getLocalStreams || (() => []));
    } else {
      managerRef.current = new WebRTCManager(myUserId, stableSend);
    }
    managerModeRef.current = mode;
    managerRouteRef.current = route;
    managerUserRef.current = myUserId;
  }
  const manager = managerRef.current;

  const [remoteStreams, setRemoteStreams] = useState<WebRTCStream[]>([]);
  const [remoteMicUsers, setRemoteMicUsers] = useState<string[]>([]);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [peerConnectionStates, setPeerConnectionStates] = useState<
    Record<string, RTCPeerConnectionState>
  >({});

  useEffect(() => {
    if (manager instanceof LiveKitRTC) {
      manager.onStreamsChanged = streams => setRemoteStreams([...streams]);
      manager.onMicUsersChanged = users => setRemoteMicUsers([...users]);
      manager.onAutoplayBlocked = () => setAutoplayBlocked(true);
      manager.onConnectionStatesChanged = states => setPeerConnectionStates(states);
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
    } else if (manager instanceof SkaiaRTC) {
      const onStreamsChanged = (payload: { streams: any }) =>
        setRemoteStreams([...payload.streams]);
      const onMicUsersChanged = (payload: { peers: any }) => setRemoteMicUsers([...payload.peers]);
      const onAutoplayBlocked = () => setAutoplayBlocked(true);
      const onConnectionStatesChanged = () => {
        setPeerConnectionStates(manager.peerManager.connectionManager.getStates());
      };
      const onSpeaking = (payload: { peerId: string }) => {
        window.dispatchEvent(new CustomEvent("voice:speaking", { detail: payload.peerId }));
      };

      manager.events.on("streamsChanged", onStreamsChanged);
      manager.events.on("micUsersChanged", onMicUsersChanged);
      manager.events.on("autoplayBlocked", onAutoplayBlocked);
      manager.events.on("connectionStateChange", onConnectionStatesChanged);
      manager.events.on("speaking", onSpeaking);

      return () => {
        manager.events.off("streamsChanged", onStreamsChanged);
        manager.events.off("micUsersChanged", onMicUsersChanged);
        manager.events.off("autoplayBlocked", onAutoplayBlocked);
        manager.events.off("connectionStateChange", onConnectionStatesChanged);
        manager.events.off("speaking", onSpeaking);
      };
    } else {
      manager.onStreamsChanged = streams => setRemoteStreams([...streams]);
      manager.onMicUsersChanged = users => setRemoteMicUsers([...users]);
      manager.onAutoplayBlocked = () => setAutoplayBlocked(true);
      manager.onConnectionStatesChanged = states => setPeerConnectionStates(states);

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
    }
  }, [manager]);

  useEffect(() => {
    if (manager instanceof SkaiaRTC) {
      manager.playbackManager.setAudioState(globalVolume, isPlayerMuted);
    } else if (manager instanceof LiveKitRTC) {
      manager.setAudioState(globalVolume, isPlayerMuted);
    } else {
      manager.setAudioState(globalVolume, isPlayerMuted);
    }
  }, [manager, globalVolume, isPlayerMuted]);

  useEffect(() => {
    return () => {
      manager.closeAll();
    };
  }, [manager]);

  const handleSignal = useCallback(
    async (peerId: number, signal: VoiceSignalPayload) => {
      const streams = getLocalStreams ? getLocalStreams() : [];
      if (manager instanceof LiveKitRTC) {
        return;
      } else if (manager instanceof SkaiaRTC) {
        await manager.handleSignal(peerId, signal as SignalPayload, streams);
      } else if (manager instanceof WebRTCManager) {
        await manager.handleSignal(peerId, signal as SignalPayload, streams);
      }
    },
    [manager, getLocalStreams]
  );

  const ensureConnection = useCallback(
    (peerId: number, isInitiator: boolean, localStreams: (MediaStream | null)[]) => {
      if (manager instanceof SkaiaRTC) {
        return manager.ensureConnection(peerId, isInitiator, localStreams);
      } else if (manager instanceof LiveKitRTC) {
        return manager.ensureConnection();
      } else {
        return manager.ensureConnection(peerId, isInitiator, localStreams);
      }
    },
    [manager]
  );

  const closePeer = useCallback(
    (peerId: string, notify = true) => {
      if (manager instanceof SkaiaRTC) {
        manager.peerManager.closePeer(peerId, notify);
      } else if (manager instanceof LiveKitRTC) {
        // LiveKit participant removal is driven by the SFU room membership.
      } else if (manager instanceof WebRTCManager) {
        manager.closePeer(peerId, notify);
      }
    },
    [manager]
  );

  const broadcastTracks = useCallback(
    (streams: (MediaStream | null)[] | MediaStream | null) => {
      const arr = Array.isArray(streams) ? streams : [streams];
      manager.broadcastTracks(arr);
    },
    [manager]
  );

  const removeTracks = useCallback(
    (streams: (MediaStream | null)[] | MediaStream | null) => {
      const arr = Array.isArray(streams) ? streams : [streams];
      manager.removeTracks(arr);
    },
    [manager]
  );

  const getActivePeerIds = useCallback(() => {
    if (manager instanceof SkaiaRTC) {
      return Array.from(manager.peerManager.getSessions().keys());
    } else if (manager instanceof LiveKitRTC) {
      return Array.from(manager.getPeerConnections().keys());
    } else {
      return Array.from(manager.getPeerConnections().keys());
    }
  }, [manager]);

  const syncActivePeers = useCallback(
    (validPeerIds: string[], localStreams: (MediaStream | null)[]) => {
      if (manager instanceof SkaiaRTC) {
        manager.syncActivePeers(validPeerIds);
      } else if (manager instanceof LiveKitRTC) {
        manager.syncActivePeers();
      } else if (manager instanceof WebRTCManager) {
        manager.syncActivePeers(validPeerIds, localStreams);
      }
    },
    [manager]
  );

  return {
    remoteStreams,
    remoteMicUsers,
    handleSignal,
    ensureConnection,
    closePeer,
    sendSignal: (targetUserId: number, payload: VoiceSignalPayload) => {
      if (manager instanceof WebRTCManager) {
        manager.sendSignal(targetUserId, payload);
      }
    },
    broadcastTracks,
    removeTracks,
    getActivePeerIds,
    syncActivePeers,
    autoplayBlocked,
    setAutoplayBlocked,
    peerConnectionStates,
    mode,
  };
}
