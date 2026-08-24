import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ForumPageShell } from "./ForumPageShell";

describe("ForumPageShell", () => {
  it("provides the shared module back rail around forum child content", () => {
    const { container } = render(
      <MemoryRouter>
        <ForumPageShell>
          <article>Thread content</article>
        </ForumPageShell>
      </MemoryRouter>
    );

    expect(container.querySelector(".module-page-shell.forum-module-shell")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Forum" })).toHaveAttribute("href", "/forum");
    expect(screen.getByText("Thread content")).toBeInTheDocument();
  });
});
