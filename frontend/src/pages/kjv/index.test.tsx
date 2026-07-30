import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { useLocation } from "react-router-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { biblePreferencesAtom } from "../../atoms/bible";
import { fetchBibleBook, fetchBibleCatalog } from "../../components/bible/api";
import type { BibleBook, BibleCatalog } from "../../components/bible/types";
import KJVPage from "./index";

vi.mock("../../components/bible/api", () => ({
  fetchBibleCatalog: vi.fn(),
  fetchBibleBook: vi.fn(),
}));

const catalog: BibleCatalog = {
  translation: {
    schema_version: 1,
    code: "KJV",
    name: "King James Version",
    abbreviation: "KJV",
    language: { name: "English", code: "en" },
    translation_history: {
      first_published: 1611,
      editorial_basis: 1769,
      description: "KJV translation history.",
    },
    repository_provenance: {
      corpus_origin: "Maintained repository corpus.",
      verification: {
        last_verified: "2026-07-30",
        reference: "Bible SuperSearch KJV module 6.2.0, 1611 / 1769",
        method: "Verse comparison.",
        verse_count: 31102,
      },
    },
    text_format: {
      books: "<Book>.json",
      structure: "chapter and verse JSON objects",
      plain_text: "Clean text.",
      rendering_markers: "markers/<Book>.json",
      marker_offsets: "Unicode code points.",
    },
    books: 66,
    chapters: 1189,
    verses: 31102,
    source_repository: "https://example.com/kjv",
    source_commit: "test",
    corpus_sha512: "hash",
    rendering_sha512: "rendering-hash",
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
  ],
};

const matthew: BibleBook = {
  translation: "KJV",
  title: "Matthew",
  slug: "matthew",
  chapters: {
    "1": { "1": "Matthew chapter one." },
    "6": {
      "25": "Take no thought for your life.",
      "26": "Behold the fowls of the air.",
    },
  },
  markers: {
    schema_version: 1,
    book: "Matthew",
    offset_unit: "Unicode code points",
    span_end: "exclusive",
    chapters: {
      "1": {
        "1": {
          paragraph_start: true,
          added_words: [],
          words_of_christ: [],
        },
      },
      "6": {
        "25": {
          paragraph_start: true,
          added_words: [],
          words_of_christ: [{ start: 0, end: 30 }],
        },
        "26": {
          paragraph_start: false,
          added_words: [],
          words_of_christ: [{ start: 0, end: 28 }],
        },
      },
    },
  },
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(initialEntry: string) {
  const store = createStore();
  const result = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/kjv" element={<KJVPage />} />
          <Route path="/kjv/:book/:chapter/:verse/:readerState" element={<KJVPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </Provider>
  );
  return { ...result, store };
}

describe("KJV page deep links", () => {
  beforeEach(() => {
    vi.mocked(fetchBibleCatalog).mockReset().mockResolvedValue(catalog);
    vi.mocked(fetchBibleBook).mockReset().mockResolvedValue(matthew);
  });

  it("loads the legacy query link as the authoritative reader state", async () => {
    const { store } = renderPage("/kjv?bt=Matthew&c=6&v=25&o=1");
    expect((await screen.findAllByText("Take no thought for your life.")).length).toBeGreaterThan(
      0
    );
    expect(store.get(biblePreferencesAtom).selection).toEqual({
      bookSlug: "matthew",
      chapter: "6",
      verse: "25",
      isOpen: true,
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/kjv?bt=Matthew&c=6&v=25&o=1");
  });

  it("keeps path links in path form during reader navigation", async () => {
    const user = userEvent.setup();
    renderPage("/kjv/matthew/6/25/open");
    expect((await screen.findAllByText("Take no thought for your life.")).length).toBeGreaterThan(
      0
    );
    await user.click(screen.getByRole("button", { name: "Next Bible verse" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/kjv/matthew/6/26/open")
    );
    expect(screen.getAllByText("Behold the fowls of the air.").length).toBeGreaterThan(0);
  });

  it("does not show remembered scripture for an invalid coordinate", async () => {
    renderPage("/kjv?bt=Matthew&c=99&v=1&o=1");
    expect(await screen.findByText(/Matthew 99:1 does not exist/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Bible reader")).not.toBeInTheDocument();
  });

  it("creates a complete query URL when a book is selected from the base route", async () => {
    const user = userEvent.setup();
    renderPage("/kjv");
    await user.click(await screen.findByRole("button", { name: "Open Matthew" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/kjv?bt=Matthew&c=1&v=1&o=1")
    );
    expect((await screen.findAllByText("Matthew chapter one.")).length).toBeGreaterThan(0);
  });

  it("expands the reader to the viewport and exits fullscreen with Escape", async () => {
    const user = userEvent.setup();
    renderPage("/kjv/matthew/6/25/open");
    const enterFullscreen = await screen.findByRole("button", {
      name: "Enter fullscreen Bible reader",
    });
    const reader = screen.getByLabelText("Bible reader");

    await user.click(enterFullscreen);
    expect(reader).toHaveClass("bible-reader--fullscreen");
    expect(document.body.style.overflow).toBe("hidden");
    expect(
      screen.getByRole("button", { name: "Exit fullscreen Bible reader" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(reader).not.toHaveClass("bible-reader--fullscreen");
    expect(document.body.style.overflow).toBe("");
  });
});
