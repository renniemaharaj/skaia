import { describe, expect, it } from "vitest";
import { adjacentBibleSelection, bibleVerseSlice, isValidBibleSelection } from "./navigation";
import type { BibleBook, BibleSelection } from "./types";

const book: BibleBook = {
  translation: "KJV",
  title: "Example",
  slug: "example",
  chapters: {
    "1": { "1": "one", "2": "two", "3": "three" },
    "2": { "1": "four", "2": "five" },
  },
  markers: {
    schema_version: 1,
    book: "Example",
    offset_unit: "Unicode code points",
    span_end: "exclusive",
    chapters: {},
  },
};

const selection: BibleSelection = {
  bookSlug: "example",
  chapter: "1",
  verse: "2",
  isOpen: true,
};

describe("Bible navigation", () => {
  it("moves across chapter boundaries in both directions", () => {
    expect(adjacentBibleSelection(book, selection, 2)).toMatchObject({
      chapter: "2",
      verse: "1",
    });
    expect(
      adjacentBibleSelection(book, { ...selection, chapter: "2", verse: "1" }, -1)
    ).toMatchObject({ chapter: "1", verse: "3" });
  });

  it("returns null at the book boundary", () => {
    expect(adjacentBibleSelection(book, { ...selection, chapter: "1", verse: "1" }, -1)).toBeNull();
    expect(adjacentBibleSelection(book, { ...selection, chapter: "2", verse: "2" }, 1)).toBeNull();
  });

  it("validates coordinates and returns the current plus four shadow verses", () => {
    expect(isValidBibleSelection(book, selection)).toBe(true);
    expect(isValidBibleSelection(book, { ...selection, verse: "9" })).toBe(false);
    expect(bibleVerseSlice(book, selection, 5)).toEqual([
      { chapter: "1", verse: "2", text: "two" },
      { chapter: "1", verse: "3", text: "three" },
      { chapter: "2", verse: "1", text: "four" },
      { chapter: "2", verse: "2", text: "five" },
    ]);
  });
});
