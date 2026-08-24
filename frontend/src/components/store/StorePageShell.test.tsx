import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { StorePageShell } from "./StorePageShell";

describe("StorePageShell", () => {
  it("keeps the navigation rail outside page-specific content geometry", () => {
    const { container } = render(
      <MemoryRouter>
        <StorePageShell
          className="wallet-page"
          backTo="/store"
          title="Wallet"
          meta={<span>Owner Administrator</span>}
        >
          <div>Wallet content</div>
        </StorePageShell>
      </MemoryRouter>
    );

    const shell = container.querySelector(".module-page-shell.store-page-shell");
    const bar = container.querySelector(".module-page-shell__bar");
    const content = container.querySelector(".module-page-shell__content.wallet-page");

    expect(shell).not.toHaveClass("wallet-page");
    expect(content).toBeInTheDocument();
    expect(shell?.firstElementChild).toBe(bar);
    expect(bar?.compareDocumentPosition(content as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getByRole("link", { name: "Back to Store" })).toHaveAttribute("href", "/store");
    expect(screen.getByRole("heading", { name: "Wallet" })).toBeInTheDocument();
  });
});
