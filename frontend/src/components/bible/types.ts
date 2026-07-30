export interface BibleTranslationMetadata {
  code: string;
  name: string;
  books: number;
  chapters: number;
  verses: number;
  source_repository: string;
  source_commit: string;
  corpus_sha512: string;
  provenance_notice: string;
}

export interface BibleBookSummary {
  title: string;
  slug: string;
  testament: string;
  division: string;
  canonical_order: number;
  division_order: number;
  book_order: number;
  chapter_count: number;
  verse_count: number;
}

export interface BibleCatalog {
  translation: BibleTranslationMetadata;
  books: BibleBookSummary[];
}

export interface BibleBook {
  translation: string;
  title: string;
  slug: string;
  chapters: Record<string, Record<string, string>>;
}

export interface BibleSelection {
  bookSlug: string;
  chapter: string;
  verse: string;
  isOpen: boolean;
}

export interface BibleFavorite extends BibleSelection {
  title: string;
  bookTitle: string;
}

export interface BiblePreferences {
  selection: BibleSelection;
  speechEnabled: boolean;
  selectedVoiceURI: string;
  favorites: BibleFavorite[];
}

export type BibleURLMode = "query" | "path";

export interface BibleLocationInput {
  book: string;
  chapter: string;
  verse: string;
  isOpen: boolean;
}

export interface ResolvedBibleLocation extends BibleSelection {
  bookTitle: string;
  mode: BibleURLMode;
}
