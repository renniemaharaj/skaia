import type {
  BibleBookSummary,
  BibleLocationInput,
  BibleURLMode,
  ResolvedBibleLocation,
} from "./types";

export interface ParsedBibleLocation {
  mode: BibleURLMode;
  input?: BibleLocationInput;
  error?: string;
}

function positiveInteger(value: string | null): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? String(parsed) : null;
}

export function normalizeBookLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseBibleLocation(pathname: string, search: string): ParsedBibleLocation {
  const pathMatch = pathname.match(/^\/kjv\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/?$/i);
  if (pathMatch) {
    let book: string;
    try {
      book = decodeURIComponent(pathMatch[1]);
    } catch {
      return { mode: "path", error: "The book name in this Bible link is malformed." };
    }
    const chapter = positiveInteger(pathMatch[2]);
    const verse = positiveInteger(pathMatch[3]);
    const state = pathMatch[4].toLowerCase();
    if (!chapter || !verse || (state !== "open" && state !== "closed")) {
      return {
        mode: "path",
        error: "This Bible path must include a valid chapter, verse, and open or closed state.",
      };
    }
    return {
      mode: "path",
      input: { book, chapter, verse, isOpen: state === "open" },
    };
  }

  const params = new URLSearchParams(search);
  const values = {
    book: params.get("bt"),
    chapter: params.get("c"),
    verse: params.get("v"),
    open: params.get("o"),
  };
  const present = Object.values(values).filter(value => value !== null).length;
  if (present === 0) return { mode: "query" };
  if (present !== 4) {
    return {
      mode: "query",
      error: "This Bible link is incomplete. It needs book, chapter, verse, and reader state.",
    };
  }

  const chapter = positiveInteger(values.chapter);
  const verse = positiveInteger(values.verse);
  if (!values.book || !chapter || !verse || (values.open !== "0" && values.open !== "1")) {
    return {
      mode: "query",
      error: "This Bible link contains an invalid book, chapter, verse, or reader state.",
    };
  }
  return {
    mode: "query",
    input: {
      book: values.book,
      chapter,
      verse,
      isOpen: values.open === "1",
    },
  };
}

export function resolveBookSummary(
  books: BibleBookSummary[],
  value: string
): BibleBookSummary | undefined {
  let normalized = normalizeBookLookup(value);
  if (normalized === "psalm") normalized = "psalms";
  return books.find(
    book =>
      normalizeBookLookup(book.slug) === normalized ||
      normalizeBookLookup(book.title) === normalized
  );
}

export function resolveBibleLocation(
  books: BibleBookSummary[],
  parsed: ParsedBibleLocation
): ResolvedBibleLocation | undefined {
  if (!parsed.input) return undefined;
  const book = resolveBookSummary(books, parsed.input.book);
  if (!book) return undefined;
  return {
    bookSlug: book.slug,
    bookTitle: book.title,
    chapter: parsed.input.chapter,
    verse: parsed.input.verse,
    isOpen: parsed.input.isOpen,
    mode: parsed.mode,
  };
}

export function bibleLocationURL(location: ResolvedBibleLocation, mode: BibleURLMode): string {
  if (mode === "path") {
    return `/kjv/${encodeURIComponent(location.bookSlug)}/${location.chapter}/${location.verse}/${
      location.isOpen ? "open" : "closed"
    }`;
  }
  const params = new URLSearchParams({
    bt: location.bookTitle,
    c: location.chapter,
    v: location.verse,
    o: location.isOpen ? "1" : "0",
  });
  return `/kjv?${params.toString()}`;
}
