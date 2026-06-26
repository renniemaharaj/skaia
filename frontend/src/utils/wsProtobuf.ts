import protobuf from "protobufjs";

export const WS_PROTO_SUBPROTOCOL = "skaia.proto.v1";

interface OutgoingWebSocketMessage {
  type: string;
  user_id?: number;
  payload?: unknown;
}

interface ProtobufEnvelope {
  type?: string;
  userId?: number | LongLike;
  payload?: Uint8Array;
}

interface LongLike {
  toNumber(): number;
}

const root = protobuf.Root.fromJSON({
  nested: {
    skaia: {
      nested: {
        ws: {
          nested: {
            WebSocketMessage: {
              fields: {
                type: { type: "string", id: 1 },
                userId: { type: "int64", id: 2 },
                payload: { type: "bytes", id: 3 },
              },
            },
            ServerMessage: {
              fields: {
                type: { type: "string", id: 1 },
                userId: { type: "int64", id: 2 },
                payload: { type: "bytes", id: 3 },
              },
            },
          },
        },
      },
    },
  },
});

const clientMessageType = root.lookupType("skaia.ws.WebSocketMessage");
const serverMessageType = root.lookupType("skaia.ws.ServerMessage");

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const encodeWebSocketProto = (
  message: OutgoingWebSocketMessage
): Uint8Array<ArrayBuffer> => {
  const payload = encodePayload(message.payload);
  const err = clientMessageType.verify({
    type: message.type,
    userId: message.user_id ?? 0,
    payload,
  });
  if (err) {
    throw new Error(err);
  }
  const encoded = clientMessageType
    .encode({ type: message.type, userId: message.user_id ?? 0, payload })
    .finish();

  // Force ArrayBuffer (not SharedArrayBuffer) — satisfies ws.send()
  return new Uint8Array(
    encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer
  );
};

export const decodeWebSocketProto = async (
  data: Blob | ArrayBuffer
): Promise<{
  type: string;
  user_id: number;
  payload: unknown;
}> => {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const decoded = serverMessageType.decode(new Uint8Array(buffer)) as ProtobufEnvelope;
  return {
    type: decoded.type ?? "",
    user_id: toNumber(decoded.userId),
    payload: decodePayload(decoded.payload),
  };
};

export const sendWebSocketMessage = (ws: WebSocket, message: OutgoingWebSocketMessage) => {
  ws.send(encodeWebSocketProto(message));
};

const encodePayload = (payload: unknown): Uint8Array => {
  if (payload === undefined || payload === null) return new Uint8Array();
  if (payload instanceof Uint8Array) return payload;
  if (typeof payload === "string") return textEncoder.encode(payload);
  return textEncoder.encode(JSON.stringify(payload));
};

const decodePayload = (payload?: Uint8Array): unknown => {
  if (!payload || payload.length === 0) return {};
  const text = textDecoder.decode(payload);
  if (text === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const toNumber = (value: number | LongLike | undefined): number => {
  if (typeof value === "number") return value;
  return value?.toNumber() ?? 0;
};
