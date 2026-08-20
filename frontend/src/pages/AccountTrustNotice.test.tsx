import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountTrustNotice from "./AccountTrustNotice";

describe("AccountTrustNotice", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.setItem("auth.accessToken", "token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("explains optional TOTP and the server countdown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tier: "provisional",
          established: false,
          totp_enabled: false,
          remaining_seconds: 90,
        }),
      })
    );
    render(
      <MemoryRouter>
        <AccountTrustNotice userId="7" />
      </MemoryRouter>
    );

    expect(await screen.findByText(/ready for browsing and global chat/i)).toBeInTheDocument();
    expect(screen.getByText(/1:30/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /set up totp/i })).toHaveAttribute(
      "href",
      "/settings/security"
    );
  });

  it("stays visible while the account is provisional", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tier: "provisional", remaining_seconds: 30 }),
      })
    );
    render(
      <MemoryRouter>
        <AccountTrustNotice userId="7" />
      </MemoryRouter>
    );
    expect(await screen.findByLabelText("New account limits")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue browsing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });
});
