import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { biblePreferencesAtom, defaultBiblePreferences, normalizeBiblePreferences } from "./bible";

describe("Bible persisted preferences", () => {
  beforeEach(() => {
    vi.mocked(localStorage.setItem).mockClear();
  });

  it("normalizes malformed storage and bounds favorites", () => {
    const favorites = Array.from({ length: 510 }, (_, index) => ({
      bookSlug: "matthew",
      bookTitle: "Matthew",
      chapter: "06",
      verse: String(index + 1),
      title: `Matthew 6:${index + 1}`,
    }));
    expect(
      normalizeBiblePreferences({
        selection: { bookSlug: " Matthew ", chapter: "-1", verse: "025", isOpen: "yes" },
        speechEnabled: "yes",
        selectedVoiceURI: 99,
        favorites,
      })
    ).toMatchObject({
      selection: {
        bookSlug: "Matthew",
        chapter: "1",
        verse: "25",
        isOpen: false,
      },
      speechEnabled: false,
      selectedVoiceURI: "",
      favorites: expect.arrayContaining([
        expect.objectContaining({ chapter: "6", verse: "1", isOpen: true }),
      ]),
    });
    expect(normalizeBiblePreferences({ favorites }).favorites).toHaveLength(500);
    expect(normalizeBiblePreferences(null)).toBe(defaultBiblePreferences);
  });

  it("writes normalized updates through the storage atom", () => {
    const store = createStore();
    store.set(biblePreferencesAtom, current => ({
      ...current,
      selection: {
        bookSlug: "matthew",
        chapter: "06",
        verse: "025",
        isOpen: true,
      },
    }));
    expect(store.get(biblePreferencesAtom).selection).toEqual({
      bookSlug: "matthew",
      chapter: "6",
      verse: "25",
      isOpen: true,
    });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "bible.preferences",
      expect.stringContaining('"bookSlug":"matthew"')
    );
  });
});
