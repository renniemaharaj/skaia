# Voice Chat Architecture

## Overview
This specification defines the low-latency audio streaming architecture for the presence-based voice chat feature. To avoid introducing the complexities and connection overhead of WebRTC NAT traversal (TURN/STUN), we will route audio through the existing Go WebSocket backend as binary frames.

## Connection & Payload Format
Voice data will be multiplexed over the existing WebSocket connection (`/ws`). The Gorilla WebSocket `ReadPump` will be refactored to distinguish between `websocket.TextMessage` (existing JSON control plane) and `websocket.BinaryMessage` (audio/media plane).

### Binary Frame Structure
To minimize overhead, binary frames will use a strict, compact byte layout.

**Client to Server (Upstream):**
- **Byte 0**: Frame Type
  - `0x01`: Microphone Audio Data (Opus encoded)
  - `0x02`: Media/Music Audio Data (Opus encoded)
- **Byte 1-N**: Payload (Audio bytes)

**Server to Client (Downstream):**
- **Byte 0**: Frame Type (matches Upstream)
- **Byte 1-8**: Sender `UserID` (int64, Little Endian). For guests, this is `-ClientID`.
- **Byte 9-N**: Payload (Audio bytes)

## Backend Routing
Audio packets must be routed with minimal latency.
1. **Hub Channel**: A new high-capacity channel `audioUpdates chan AudioBroadcast` will be added to `Hub`.
2. **AudioBroadcast Struct**:
   ```go
   type AudioBroadcast struct {
       Sender *Client
       Type   byte
       Data   []byte
   }
   ```
3. **Dispatch**: In the `Hub.Run` loop, `audioUpdates` will be processed. The Hub will iterate through clients on the **same presence route** as the sender.
4. **Permissions**: Before broadcasting, the Hub will check an in-memory map of `VoicePermissions` for the route to ensure the sender is not muted or kicked by an admin.
5. **Send Buffer**: To prevent slow clients from blocking the audio pipeline, audio writes will use a non-blocking select on a dedicated `Client.AudioSend` channel, or drop the frame if the buffer is full.

## Admin Controls
Admin state (Muted Users, Route Voice Disabled) will be managed via the standard JSON control plane (e.g., `Message` Type `voice:control`).
When a route is voice-disabled, the backend will silently drop all incoming audio frames for that route.
The backend must authorize `voice:control` messages against the authenticated WebSocket client's JWT permissions. The initial control surface uses `home.manage`.

## Client-Side (Frontend)
1. **Capture**: Use `navigator.mediaDevices.getUserMedia({ audio: true })`.
2. **Encoding**: Use `MediaRecorder` or WebAudio API with Opus encoding to generate small binary chunks (e.g., 20ms-50ms).
3. **Transmission**: Send chunks as `ArrayBuffer` via the existing WebSocket instance.
4. **Playback**: Use `AudioContext` with a global `GainNode` and per-sender `MediaSource` queues for incoming WebM/Opus chunks.
5. **Volume Control**: A global GainNode will sit between the decoded streams and the audio destination to implement the global user volume control.

## Extensibility
The frame type `0x02` is reserved for media (music/podcasts). This allows the frontend to apply different spatialization or volume rules to background music versus voice chat.
