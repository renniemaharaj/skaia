import protobuf from "protobufjs";
import { describe, expect, it, vi } from "vitest";
import { resolveWsApiResponse } from "./api";

vi.mock("../hooks/useWebSocketSync", () => ({
  getGlobalWs: () => null,
}));

const responseType = protobuf.Root.fromJSON({
  nested: {
    ApiResponse: {
      fields: {
        requestId: { type: "uint64", id: 1 },
        status: { type: "uint32", id: 2 },
        body: { type: "bytes", id: 3 },
      },
    },
  },
}).lookupType("ApiResponse");

describe("WebSocket API response correlation", () => {
  it("rejects an unsolicited or mismatched response ID", () => {
    const payload = responseType
      .encode({
        requestId: 4_294_967_000,
        status: 200,
        body: new TextEncoder().encode('{"token":"attacker"}'),
      })
      .finish();

    expect(resolveWsApiResponse(payload)).toBe(false);
  });
});
