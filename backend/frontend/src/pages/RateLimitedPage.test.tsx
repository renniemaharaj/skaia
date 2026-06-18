import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import RateLimitedPage from "./RateLimitedPage";

const renderPage = (challenge?: string) =>
  render(
    <MemoryRouter>
      <RateLimitedPage retrySeconds={60} challenge={challenge} />
    </MemoryRouter>
  );

describe("RateLimitedPage", () => {
  it("hides priority access controls when no TOTP challenge is offered", () => {
    renderPage();

    expect(screen.queryByText("Priority Access")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Priority Override Code")).not.toBeInTheDocument();
  });

  it("shows the TOTP override form when the server offers priority access", () => {
    renderPage("totp");

    expect(screen.getByLabelText("Priority Override Code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Authorize Bypass/i })).toBeInTheDocument();
  });
});
