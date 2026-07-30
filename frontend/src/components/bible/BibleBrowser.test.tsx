import { Provider } from "jotai";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BibleCatalog } from "./types";
import BibleBrowser from "./BibleBrowser";

const catalog: BibleCatalog = {
  translation: {
    code: "KJV",
    name: "King James Version",
    books: 66,
    chapters: 1189,
    verses: 31102,
    source_repository: "https://example.com/kjv",
    source_commit: "test",
    corpus_sha512: "hash",
    provenance_notice: "Edition not documented.",
  },
  books: [
    {
      title: "Matthew",
      slug: "matthew",
      testament: "New Testament",
      division: "Canonical Gospels",
      canonical_order: 40,
      division_order: 1,
      book_order: 1,
      chapter_count: 28,
      verse_count: 1071,
    },
    {
      title: "Isaiah",
      slug: "isaiah",
      testament: "Old Testament",
      division: "Prophetic Books",
      canonical_order: 23,
      division_order: 9,
      book_order: 1,
      chapter_count: 66,
      verse_count: 1292,
    },
  ],
};

describe("Bible directory", () => {
  it("switches to the shared table view, searches metadata, and opens a row", async () => {
    const user = userEvent.setup();
    const onSelectBook = vi.fn();
    const { container } = render(
      <Provider>
        <BibleBrowser
          catalog={catalog}
          activeBookSlug=""
          loadingBookSlug=""
          onSelectBook={onSelectBook}
        />
      </Provider>
    );

    expect(screen.getByRole("heading", { name: "Holy Bible" })).toBeInTheDocument();
    await user.click(screen.getByTitle("List view"));
    expect(container.querySelector(".table-view")).toBeInTheDocument();
    expect(screen.getByText("Testament")).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Search books, divisions, or testaments…"),
      "prophetic"
    );
    expect(screen.getByRole("button", { name: "Open Isaiah" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Matthew" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Isaiah" }));
    expect(onSelectBook).toHaveBeenCalledWith(expect.objectContaining({ slug: "isaiah" }));
  });
});
