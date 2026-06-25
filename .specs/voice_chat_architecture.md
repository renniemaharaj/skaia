# Voice Chat Architecture

## Overview

Presence-based voice uses WebRTC for realtime media transport. The application
WebSocket remains the control plane only: it carries protobuf envelopes for
presence, media queue state, admin voice controls, and WebRTC signaling.

## Transport Contract

- `/ws` uses only the `skaia.proto.v1` subprotocol.
- WebSocket binary frames are protobuf envelopes. They must never be inspected as
  media bytes by leading byte.
- Voice/audio/video/screen media bytes use WebRTC `RTCPeerConnection` tracks.
- WebSocket `voice:signal` messages carry SDP offers, SDP answers, ICE
  candidates, and leave notifications.

## Signaling Payload

```json
{
  "route": "/current/path",
  "target_user_id": 123,
  "sender_user_id": 456,
  "kind": "offer|answer|candidate|leave",
  "sdp": "optional SDP",
  "candidate": { "optional": "RTCIceCandidateInit" }
}
```

The backend sets `sender_user_id` from authenticated or guest presence identity
and relays only to the requested target in the same session and route.

## Permissions

Admin state remains on `voice:control` and is enforced server-side for signaling:

- route disabled: drop signaling
- sender muted: drop signaling
- sender kicked: drop signaling
- cross-route signaling: drop signaling

The backend does not trust client-provided sender identity.

## Client Behavior

1. Capture microphone audio with `navigator.mediaDevices.getUserMedia`.
2. Create `RTCPeerConnection` objects for same-route peers discovered through
   presence.
3. Send offers, answers, and ICE candidates through `voice:signal`.
4. Attach remote tracks to local audio elements.
5. Tear down peer connections on microphone off, route changes, disconnects, or
   leave signaling.

## Future Extension

Video and screen capture should be added as additional WebRTC tracks using the
same signaling channel. Keep `/ws` free of media payload bytes so protobuf
control frames remain unambiguous.
