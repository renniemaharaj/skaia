import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("jotai", async importOriginal => {
  const original = await importOriginal<typeof import("jotai")>();
  return {
    ...original,
    useAtomValue: (atom: string) => {
      if (atom === "forumCategoriesAtom") {
        return [
          {
            id: "7",
            name: "My Writing",
            description: "A category for my writing",
            display_order: 0,
            is_locked: false,
            is_pinned: false,
            created_at: "2026-08-03T00:00:00Z",
            updated_at: "2026-08-03T00:00:00Z",
          },
        ];
      }

      return null;
    },
  };
});

vi.mock("../../atoms/auth", () => ({ currentUserAtom: "currentUserAtom" }));
vi.mock("../../atoms/forum", () => ({ forumCategoriesAtom: "forumCategoriesAtom" }));
vi.mock("../../hooks/useGuestSandboxMode", () => ({
  useGuestSandboxMode: () => [false, vi.fn()],
}));
vi.mock("../../hooks/useThreadsFeed", () => ({
  useThreadsFeed: () => ({
    threads: [],
    isLoading: false,
    loading: false,
    feedRef: { current: null },
    sentinelRef: { current: null },
    handleScroll: vi.fn(),
  }),
}));
vi.mock("./Forum", () => ({ Forum: () => <div>Forum directory</div> }));
vi.mock("./CategoryThreadsFeed", () => ({ default: () => <div>Thread feed</div> }));

import CategoryThreadsPage from "./CategoryThreadsPage";

describe("CategoryThreadsPage", () => {
  it("keeps the category identity above a separately sized toolbar on mobile", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/threads/categories/7"]}>
        <Routes>
          <Route path="/threads/categories/:categoryId" element={<CategoryThreadsPage />} />
        </Routes>
      </MemoryRouter>
    );

    const header = container.querySelector(".category-threads-page__header");
    expect(header).toBeInTheDocument();
    expect(header?.children[0]).toHaveClass("category-threads-page__header-left");
    expect(header?.children[1]).toHaveClass("category-threads-page__header-actions");
    expect(screen.getByRole("heading", { name: "My Writing" })).toBeInTheDocument();
    expect(screen.getByText("A category for my writing")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search threads..." })).toBeInTheDocument();
  });

  it("starts the optional forum directory collapsed and expands only on request", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/threads/categories/7"]}>
        <Routes>
          <Route path="/threads/categories/:categoryId" element={<CategoryThreadsPage />} />
        </Routes>
      </MemoryRouter>
    );

    const toggle = screen.getByRole("button", { name: "Expand forum" });
    const directory = container.querySelector("#category-threads-forum-directory");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(directory).toHaveAttribute("aria-hidden", "true");
    expect(directory).not.toHaveClass("is-expanded");

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: "Collapse forum" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(directory).toHaveAttribute("aria-hidden", "false");
    expect(directory).toHaveClass("is-expanded");
  });
});
