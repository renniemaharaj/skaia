import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { SetStateAction } from "react";
import type { BiblePreferences } from "../components/bible/types";

export const defaultBiblePreferences: BiblePreferences = {
  selection: {
    bookSlug: "",
    chapter: "1",
    verse: "1",
    isOpen: false,
  },
  speechEnabled: false,
  selectedVoiceURI: "",
  favorites: [],
};

const storedBiblePreferencesAtom = atomWithStorage<unknown>(
  "bible.preferences",
  defaultBiblePreferences
);

function stringValue(value: unknown, fallback = "", maxLength = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function positiveIntegerString(value: unknown, fallback = "1"): string {
  const candidate = stringValue(value, fallback, 12);
  if (!/^\d+$/.test(candidate)) return fallback;
  const number = Number.parseInt(candidate, 10);
  return number > 0 ? String(number) : fallback;
}

export function normalizeBiblePreferences(value: unknown): BiblePreferences {
  if (!value || typeof value !== "object") return defaultBiblePreferences;
  const candidate = value as Record<string, unknown>;
  const rawSelection =
    candidate.selection && typeof candidate.selection === "object"
      ? (candidate.selection as Record<string, unknown>)
      : {};
  const rawFavorites = Array.isArray(candidate.favorites) ? candidate.favorites : [];
  const favorites = rawFavorites
    .slice(0, 500)
    .filter(
      (favorite): favorite is Record<string, unknown> =>
        Boolean(favorite) && typeof favorite === "object"
    )
    .map(favorite => ({
      bookSlug: stringValue(favorite.bookSlug),
      bookTitle: stringValue(favorite.bookTitle),
      chapter: positiveIntegerString(favorite.chapter),
      verse: positiveIntegerString(favorite.verse),
      isOpen: typeof favorite.isOpen === "boolean" ? favorite.isOpen : true,
      title: stringValue(favorite.title),
    }))
    .filter(favorite => favorite.bookSlug && favorite.bookTitle && favorite.title);

  return {
    selection: {
      bookSlug: stringValue(rawSelection.bookSlug),
      chapter: positiveIntegerString(rawSelection.chapter),
      verse: positiveIntegerString(rawSelection.verse),
      isOpen: typeof rawSelection.isOpen === "boolean" ? rawSelection.isOpen : false,
    },
    speechEnabled: typeof candidate.speechEnabled === "boolean" ? candidate.speechEnabled : false,
    selectedVoiceURI: stringValue(candidate.selectedVoiceURI, "", 512),
    favorites,
  };
}

export const biblePreferencesAtom = atom(
  get => normalizeBiblePreferences(get(storedBiblePreferencesAtom)),
  (get, set, update: SetStateAction<BiblePreferences>) => {
    const current = normalizeBiblePreferences(get(storedBiblePreferencesAtom));
    const next = typeof update === "function" ? update(current) : update;
    set(storedBiblePreferencesAtom, normalizeBiblePreferences(next));
  }
);
