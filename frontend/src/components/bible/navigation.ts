import type { BibleBook, BibleSelection } from "./types";

function numericKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort((a, b) => Number(a) - Number(b));
}

export function isValidBibleSelection(book: BibleBook, selection: BibleSelection): boolean {
  return Boolean(book.chapters[selection.chapter]?.[selection.verse]);
}

export function adjacentBibleSelection(
  book: BibleBook,
  selection: BibleSelection,
  offset: number
): BibleSelection | null {
  if (!isValidBibleSelection(book, selection) || offset === 0) return selection;

  const direction = offset > 0 ? 1 : -1;
  let remaining = Math.abs(offset);
  let chapter = selection.chapter;
  let verse = selection.verse;
  const chapterKeys = numericKeys(book.chapters);

  while (remaining > 0) {
    const verseKeys = numericKeys(book.chapters[chapter]);
    const verseIndex = verseKeys.indexOf(verse);
    const candidate = verseKeys[verseIndex + direction];
    if (candidate) {
      verse = candidate;
      remaining -= 1;
      continue;
    }

    const chapterIndex = chapterKeys.indexOf(chapter);
    const nextChapter = chapterKeys[chapterIndex + direction];
    if (!nextChapter) return null;
    chapter = nextChapter;
    const nextVerseKeys = numericKeys(book.chapters[chapter]);
    verse = direction > 0 ? nextVerseKeys[0] : nextVerseKeys[nextVerseKeys.length - 1];
    remaining -= 1;
  }

  return { ...selection, chapter, verse };
}

export interface BibleVerseSlice {
  chapter: string;
  verse: string;
  text: string;
}

export function bibleVerseSlice(
  book: BibleBook,
  selection: BibleSelection,
  count = 5
): BibleVerseSlice[] {
  const result: BibleVerseSlice[] = [];
  let current: BibleSelection | null = selection;
  while (current && result.length < count) {
    const text = book.chapters[current.chapter]?.[current.verse];
    if (!text) break;
    result.push({ chapter: current.chapter, verse: current.verse, text });
    current = adjacentBibleSelection(book, current, 1);
  }
  return result;
}
