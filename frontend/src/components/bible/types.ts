export interface BibleTranslationMetadata {
  schema_version: number;
  code: string;
  name: string;
  abbreviation: string;
  language: {
    name: string;
    code: string;
  };
  translation_history: {
    first_published: number;
    editorial_basis: number;
    description: string;
  };
  repository_provenance: {
    corpus_origin: string;
    verification: {
      last_verified: string;
      reference: string;
      method: string;
      verse_count: number;
    };
  };
  text_format: {
    books: string;
    structure: string;
    plain_text: string;
    rendering_markers: string;
    marker_offsets: string;
  };
  books: number;
  chapters: number;
  verses: number;
  source_repository: string;
  source_commit: string;
  corpus_sha512: string;
  rendering_sha512: string;
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
  markers: BibleBookMarkers;
}

export interface BibleTextSpan {
  start: number;
  end: number;
}

export interface BibleVerseMarkers {
  paragraph_start: boolean;
  added_words: BibleTextSpan[];
  words_of_christ: BibleTextSpan[];
}

export interface BibleBookMarkers {
  schema_version: number;
  book: string;
  offset_unit: "Unicode code points";
  span_end: "exclusive";
  chapters: Record<string, Record<string, BibleVerseMarkers>>;
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
