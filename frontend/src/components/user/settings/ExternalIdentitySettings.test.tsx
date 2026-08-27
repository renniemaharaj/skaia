import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../utils/api";
import ExternalIdentitySettings from "./ExternalIdentitySettings";

vi.mock("../../../utils/api", () => ({ apiRequest: vi.fn() }));

describe("ExternalIdentitySettings", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockImplementation(async endpoint => {
      if (endpoint === "/external-identities/providers") {
        return [
          { id: 2, key: "game", name: "Game account", public_display_allowed: true },
        ] as never;
      }
      if (endpoint === "/external-identities/links") {
        return [
          {
            id: 9,
            provider_id: 2,
            provider_key: "game",
            provider: "Game account",
            subject: "opaque-42",
            display_name: "Player 42",
            public: false,
            verified_at: "2026-08-23T12:00:00Z",
          },
        ] as never;
      }
      return {} as never;
    });
  });

  it("uses the shared settings surface for linked identity privacy and reverification", async () => {
    render(
      <MemoryRouter>
        <ExternalIdentitySettings basePath="/settings" exitPath="/users/7" />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Player 42")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Linked identities" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("button", { name: "Reverify" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make public" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlink Player 42" })).toBeInTheDocument();
  });
});
