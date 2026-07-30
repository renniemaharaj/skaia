package bible

const (
	TranslationCode = "KJV"
	CorpusBooks     = 66
	CorpusChapters  = 1189
	CorpusVerses    = 31102
	CorpusSHA512    = "f49b390066c3113fbb708b96406acc6a02dffe9c56835154d73b6caa45123ede112544ede09e0ed8db43c1d7481feed46a1a2bb212d8261b25b9aaa6d7a3a8b2"
	SourceCommit    = "6ace898"
)

// TranslationMetadata describes the embedded corpus without overstating its
// textual provenance.
type TranslationMetadata struct {
	Code             string `json:"code"`
	Name             string `json:"name"`
	Books            int    `json:"books"`
	Chapters         int    `json:"chapters"`
	Verses           int    `json:"verses"`
	SourceRepository string `json:"source_repository"`
	SourceCommit     string `json:"source_commit"`
	CorpusSHA512     string `json:"corpus_sha512"`
	ProvenanceNotice string `json:"provenance_notice"`
}

// BookSummary is the backend-owned navigation contract for one Bible book.
type BookSummary struct {
	Title          string `json:"title"`
	Slug           string `json:"slug"`
	Testament      string `json:"testament"`
	Division       string `json:"division"`
	CanonicalOrder int    `json:"canonical_order"`
	DivisionOrder  int    `json:"division_order"`
	BookOrder      int    `json:"book_order"`
	ChapterCount   int    `json:"chapter_count"`
	VerseCount     int    `json:"verse_count"`
}

// Book is the full immutable chapter-and-verse payload for one book.
type Book struct {
	Translation string                       `json:"translation"`
	Title       string                       `json:"title"`
	Slug        string                       `json:"slug"`
	Chapters    map[string]map[string]string `json:"chapters"`
}

// BookList is returned by the public catalog endpoint.
type BookList struct {
	Translation TranslationMetadata `json:"translation"`
	Books       []BookSummary       `json:"books"`
}
