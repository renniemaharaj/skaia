package bible

const (
	TranslationCode = "KJV"
	CorpusBooks     = 66
	CorpusChapters  = 1189
	CorpusVerses    = 31102
	CorpusSHA512    = "7c2eff0219d59c683b1d12739a64facb22807770e05daf20cf1a4d22ef1b739d5ec03268abb8c3201fd69eb1014cc45a37697cb8abaceccd316c2e473db0b264"
	RenderingSHA512 = "16e487012df549a2b6f8661db65c626064fc054b95e31e8d4e7ca0ced37f28d6ad35a70e75c1c0b86edad0494f3110fec9114169a663731d2bf46970b2ebf5a8"
	SourceCommit    = "88723a44bb3e3f229a34f9cf11ce1b7acf971eee"
)

type LanguageMetadata struct {
	Name string `json:"name"`
	Code string `json:"code"`
}

type TranslationHistory struct {
	FirstPublished int    `json:"first_published"`
	EditorialBasis int    `json:"editorial_basis"`
	Description    string `json:"description"`
}

type CorpusVerification struct {
	LastVerified string `json:"last_verified"`
	Reference    string `json:"reference"`
	Method       string `json:"method"`
	VerseCount   int    `json:"verse_count"`
}

type RepositoryProvenance struct {
	CorpusOrigin string             `json:"corpus_origin"`
	Verification CorpusVerification `json:"verification"`
}

type TextFormat struct {
	Books            string `json:"books"`
	Structure        string `json:"structure"`
	PlainText        string `json:"plain_text"`
	RenderingMarkers string `json:"rendering_markers"`
	MarkerOffsets    string `json:"marker_offsets"`
}

// TranslationMetadata exposes the upstream translation metadata alongside the
// immutable identity of the exact snapshot embedded by Skaia.
type TranslationMetadata struct {
	SchemaVersion        int                  `json:"schema_version"`
	Code                 string               `json:"code"`
	Name                 string               `json:"name"`
	Abbreviation         string               `json:"abbreviation"`
	Language             LanguageMetadata     `json:"language"`
	TranslationHistory   TranslationHistory   `json:"translation_history"`
	RepositoryProvenance RepositoryProvenance `json:"repository_provenance"`
	TextFormat           TextFormat           `json:"text_format"`
	Books                int                  `json:"books"`
	Chapters             int                  `json:"chapters"`
	Verses               int                  `json:"verses"`
	SourceRepository     string               `json:"source_repository"`
	SourceCommit         string               `json:"source_commit"`
	CorpusSHA512         string               `json:"corpus_sha512"`
	RenderingSHA512      string               `json:"rendering_sha512"`
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

type TextSpan struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

type VerseMarkers struct {
	ParagraphStart bool       `json:"paragraph_start"`
	AddedWords     []TextSpan `json:"added_words"`
	WordsOfChrist  []TextSpan `json:"words_of_christ"`
}

type BookMarkers struct {
	SchemaVersion int                                `json:"schema_version"`
	Book          string                             `json:"book"`
	OffsetUnit    string                             `json:"offset_unit"`
	SpanEnd       string                             `json:"span_end"`
	Chapters      map[string]map[string]VerseMarkers `json:"chapters"`
}

// Book is the full immutable chapter, verse, and rendering-marker payload.
type Book struct {
	Translation string                       `json:"translation"`
	Title       string                       `json:"title"`
	Slug        string                       `json:"slug"`
	Chapters    map[string]map[string]string `json:"chapters"`
	Markers     BookMarkers                  `json:"markers"`
}

// BookList is returned by the public catalog endpoint.
type BookList struct {
	Translation TranslationMetadata `json:"translation"`
	Books       []BookSummary       `json:"books"`
}
