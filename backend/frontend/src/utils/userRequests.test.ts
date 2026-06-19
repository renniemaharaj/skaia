import { afterEach, describe, expect, it, vi } from "vitest";

import { loadUserProfile, subscribeUserProfile } from "./userRequests";

const profile = (displayName: string) => ({
  id: 7,
  username: "admin",
  email: "admin@example.com",
  display_name: displayName,
  avatar_url: "/uploads/admin.png",
  is_suspended: false,
  permissions: [],
  roles: ["superuser"],
  created_at: "2026-06-19T00:00:00Z",
});

describe("user profile requests", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("publishes every newer result to all mounted consumers", async () => {
    vi.useFakeTimers();
    let name = "Administrator";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ users: [profile(name)] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    const firstCard = vi.fn();
    const overlay = vi.fn();
    const unsubscribeCard = subscribeUserProfile(7, firstCard);
    const unsubscribeOverlay = subscribeUserProfile(7, overlay);

    const initial = loadUserProfile(7);
    await vi.advanceTimersByTimeAsync(10);
    await initial;
    expect(firstCard).toHaveBeenLastCalledWith(expect.objectContaining({ display_name: name }));
    expect(overlay).toHaveBeenLastCalledWith(expect.objectContaining({ display_name: name }));

    name = "Latest Display Name";
    const refresh = loadUserProfile(7);
    await vi.advanceTimersByTimeAsync(10);
    await refresh;
    expect(firstCard).toHaveBeenLastCalledWith(expect.objectContaining({ display_name: name }));
    expect(overlay).toHaveBeenLastCalledWith(expect.objectContaining({ display_name: name }));

    unsubscribeCard();
    unsubscribeOverlay();
  });

  it("retries one failed request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "temporary" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ users: [profile("Recovered")] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const request = loadUserProfile(7);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(210);

    await expect(request).resolves.toEqual(expect.objectContaining({ display_name: "Recovered" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
