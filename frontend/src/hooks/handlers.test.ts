import { beforeEach, describe, expect, it, vi } from "vitest";
import { rememberPendingRecoveryRequest } from "../utils/guestSession";
import { handleRecoveryAccepted } from "./handlers";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../utils/sound", () => ({
  playChatSound: vi.fn(),
  playMessageSound: vi.fn(),
  playNotificationSound: vi.fn(),
}));

describe("handleRecoveryAccepted", () => {
  const setCurrentUser = vi.fn();
  const setAccessToken = vi.fn();
  const setRefreshToken = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("skaia.guestSessionId", "expected-session");
    rememberPendingRecoveryRequest("expected-request", "expected-session");
    setCurrentUser.mockReset();
    setAccessToken.mockReset();
    setRefreshToken.mockReset();
  });

  it("rejects an authentication push for another guest session", () => {
    handleRecoveryAccepted(
      {
        data: {
          request: { id: "expected-request", guest_session_id: "attacker-session" },
          auth: { access_token: "attacker-token", user: { id: "7" } },
        },
      },
      setCurrentUser,
      setAccessToken,
      setRefreshToken
    );

    expect(setAccessToken).not.toHaveBeenCalled();
    expect(setRefreshToken).not.toHaveBeenCalled();
    expect(setCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects an unbound authentication push", () => {
    handleRecoveryAccepted(
      { data: { auth: { access_token: "attacker-token", user: { id: "7" } } } },
      setCurrentUser,
      setAccessToken,
      setRefreshToken
    );

    expect(setAccessToken).not.toHaveBeenCalled();
    expect(setCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects another recovery request in this guest session", () => {
    handleRecoveryAccepted(
      {
        data: {
          request: { id: "attacker-request", guest_session_id: "expected-session" },
          auth: { access_token: "attacker-token", user: { id: "7" } },
        },
      },
      setCurrentUser,
      setAccessToken,
      setRefreshToken
    );

    expect(setAccessToken).not.toHaveBeenCalled();
    expect(setCurrentUser).not.toHaveBeenCalled();
  });

  it("accepts the recovery request bound to this browser tab", () => {
    const user = { id: "7" };
    handleRecoveryAccepted(
      {
        data: {
          request: { id: "expected-request", guest_session_id: "expected-session" },
          auth: { access_token: "access", refresh_token: "refresh", user },
        },
      },
      setCurrentUser,
      setAccessToken,
      setRefreshToken
    );

    expect(setAccessToken).toHaveBeenCalledWith("access");
    expect(setRefreshToken).toHaveBeenCalledWith("refresh");
    expect(setCurrentUser).toHaveBeenCalledWith(user);
  });
});
