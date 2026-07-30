import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BibleVerseText, { segmentBibleVerse } from "./BibleVerseText";
import type { BibleVerseMarkers } from "./types";

const markers: BibleVerseMarkers = {
  paragraph_start: true,
  added_words: [{ start: 1, end: 4 }],
  words_of_christ: [{ start: 2, end: 5 }],
};

describe("Bible verse rendering markers", () => {
  it("segments Unicode code-point offsets and composes overlapping treatments", () => {
    expect(segmentBibleVerse("A😀BCDE", markers)).toEqual([
      { text: "A", addedWord: false, wordsOfChrist: false },
      { text: "😀", addedWord: true, wordsOfChrist: false },
      { text: "BC", addedWord: true, wordsOfChrist: true },
      { text: "D", addedWord: false, wordsOfChrist: true },
      { text: "E", addedWord: false, wordsOfChrist: false },
    ]);
  });

  it("renders added words and words of Christ without changing clean verse text", () => {
    const { container } = render(<BibleVerseText text="A😀BCDE" markers={markers} />);

    expect(container.textContent).toBe("A😀BCDE");
    expect(container.querySelector(".bible-verse-mark--added")?.textContent).toBe("😀");
    expect(
      container.querySelector(".bible-verse-mark--added.bible-verse-mark--christ")?.textContent
    ).toBe("BC");
    expect(container.querySelectorAll(".bible-verse-mark--christ")).toHaveLength(2);
  });

  it("leaves unmarked text as a plain text node", () => {
    const { container } = render(
      <BibleVerseText
        text="Plain verse"
        markers={{ paragraph_start: false, added_words: [], words_of_christ: [] }}
      />
    );

    expect(container.textContent).toBe("Plain verse");
    expect(container.querySelector("span")).toBeNull();
  });
});
