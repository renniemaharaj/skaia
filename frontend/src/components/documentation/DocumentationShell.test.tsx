import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DocumentationShell } from "./DocumentationShell";

describe("DocumentationShell", () => {
  it("provides searchable navigation, outline links, and keyboard drawer dismissal", () => {
    const onSearchChange = vi.fn();
    render(
      <MemoryRouter>
        <DocumentationShell
          title="Platform guides"
          catalogHref="/doc"
          catalogLabel="Documentation"
          searchValue=""
          onSearchChange={onSearchChange}
          sections={[
            {
              id: 1,
              title: "Start",
              articles: [{ id: 2, title: "Install", href: "/doc/platform/install", active: true }],
            },
          ]}
          headings={[{ id: "requirements", text: "Requirements", level: 2 }]}
        >
          <h1>Install</h1>
        </DocumentationShell>
      </MemoryRouter>
    );

    const search = screen.getByRole("searchbox", { name: "Search documentation" });
    expect(search).toHaveAttribute("placeholder", "Search guides…");
    fireEvent.change(search, { target: { value: "install" } });
    expect(onSearchChange).toHaveBeenCalledWith("install");
    expect(screen.getByRole("link", { name: "Requirements" })).toHaveAttribute(
      "href",
      "#requirements"
    );

    const menu = screen.getByRole("button", { name: "Open documentation navigation" });
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });
});
