import { describe, expect, it } from "vitest";
import {
  bibleLocationURL,
  parseBibleLocation,
  resolveBibleLocation,
  resolveBookSummary,
} from "./location";
import type { BibleBookSummary } from "./types";

const books: BibleBookSummary[] = [
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
    title: "Psalms",
    slug: "psalms",
    testament: "Old Testament",
    division: "Wisdom Books",
    canonical_order: 19,
    division_order: 8,
    book_order: 2,
    chapter_count: 150,
    verse_count: 2461,
  },
  {
    title: "Song of Solomon",
    slug: "song-of-solomon",
    testament: "Old Testament",
    division: "Wisdom Books",
    canonical_order: 22,
    division_order: 8,
    book_order: 5,
    chapter_count: 8,
    verse_count: 117,
  },
];

describe("Bible location codec", () => {
  it("parses the legacy query contract", () => {
    expect(parseBibleLocation("/kjv", "?bt=Matthew&c=6&v=25&o=1")).toEqual({
      mode: "query",
      input: {
        book: "Matthew",
        chapter: "6",
        verse: "25",
        isOpen: true,
      },
    });
  });

  it("parses and canonicalizes the path contract", () => {
    const parsed = parseBibleLocation("/kjv/song-of-solomon/02/03/closed", "");
    expect(parsed).toEqual({
      mode: "path",
      input: {
        book: "song-of-solomon",
        chapter: "2",
        verse: "3",
        isOpen: false,
      },
    });
    expect(resolveBibleLocation(books, parsed)).toMatchObject({
      bookSlug: "song-of-solomon",
      bookTitle: "Song of Solomon",
      mode: "path",
    });
  });

  it("rejects incomplete and malformed links", () => {
    expect(parseBibleLocation("/kjv", "?bt=Matthew&c=6").error).toMatch(/incomplete/i);
    expect(parseBibleLocation("/kjv/matthew/0/25/open", "").error).toMatch(/valid chapter/i);
    expect(parseBibleLocation("/kjv/matthew/6/25/maybe", "").error).toMatch(/open or closed/i);
  });

  it("supports the corrected Psalms title and legacy singular alias", () => {
    expect(resolveBookSummary(books, "Psalm")?.slug).toBe("psalms");
    expect(resolveBookSummary(books, "PSALMS")?.title).toBe("Psalms");
  });

  it("round-trips canonical query and path output", () => {
    const location = {
      bookSlug: "matthew",
      bookTitle: "Matthew",
      chapter: "6",
      verse: "25",
      isOpen: true,
      mode: "query" as const,
    };
    expect(bibleLocationURL(location, "query")).toBe("/kjv?bt=Matthew&c=6&v=25&o=1");
    expect(bibleLocationURL(location, "path")).toBe("/kjv/matthew/6/25/open");
  });
});
