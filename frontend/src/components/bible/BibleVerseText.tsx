import type { BibleTextSpan, BibleVerseMarkers } from "./types";

export interface BibleVerseSegment {
  text: string;
  addedWord: boolean;
  wordsOfChrist: boolean;
}

function validSpans(spans: BibleTextSpan[], textLength: number): BibleTextSpan[] {
  return spans.filter(
    span =>
      Number.isInteger(span.start) &&
      Number.isInteger(span.end) &&
      span.start >= 0 &&
      span.end > span.start &&
      span.end <= textLength
  );
}

export function segmentBibleVerse(text: string, markers?: BibleVerseMarkers): BibleVerseSegment[] {
  const codePoints = Array.from(text);
  if (!markers || codePoints.length === 0) {
    return [{ text, addedWord: false, wordsOfChrist: false }];
  }

  const addedWords = validSpans(markers.added_words, codePoints.length);
  const wordsOfChrist = validSpans(markers.words_of_christ, codePoints.length);
  if (addedWords.length === 0 && wordsOfChrist.length === 0) {
    return [{ text, addedWord: false, wordsOfChrist: false }];
  }

  const boundaries = new Set([0, codePoints.length]);
  for (const span of [...addedWords, ...wordsOfChrist]) {
    boundaries.add(span.start);
    boundaries.add(span.end);
  }
  const orderedBoundaries = Array.from(boundaries).sort((left, right) => left - right);

  return orderedBoundaries.slice(0, -1).map((start, index) => {
    const end = orderedBoundaries[index + 1];
    return {
      text: codePoints.slice(start, end).join(""),
      addedWord: addedWords.some(span => span.start <= start && span.end >= end),
      wordsOfChrist: wordsOfChrist.some(span => span.start <= start && span.end >= end),
    };
  });
}

interface BibleVerseTextProps {
  text: string;
  markers?: BibleVerseMarkers;
}

export default function BibleVerseText({ text, markers }: BibleVerseTextProps) {
  const segments = segmentBibleVerse(text, markers);
  if (segments.length === 1 && !segments[0].addedWord && !segments[0].wordsOfChrist) {
    return <>{text}</>;
  }

  return (
    <>
      {segments.map((segment, index) => {
        const className = [
          segment.addedWord ? "bible-verse-mark--added" : "",
          segment.wordsOfChrist ? "bible-verse-mark--christ" : "",
        ]
          .filter(Boolean)
          .join(" ");
        if (!className) return segment.text;
        return (
          <span
            // The source offsets make the interval stable even when text repeats.
            key={`${index}:${segment.text}`}
            className={className}
          >
            {segment.text}
          </span>
        );
      })}
    </>
  );
}
