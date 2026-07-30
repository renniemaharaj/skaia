package bible

import (
	"bytes"
	"crypto/sha512"
	"embed"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"unicode/utf8"
)

var ErrBookNotFound = errors.New("bible book not found")

//go:embed corpus/*.json corpus/markers/*.json corpus/SHA512SUMS corpus/SOURCE.md corpus/UPSTREAM_README.md corpus/markers/README.md
var corpusFS embed.FS

type embeddedRepository struct {
	metadata  TranslationMetadata
	summaries []BookSummary
	books     map[string]*Book
	aliases   map[string]string
}

// NewRepository validates and loads the exact embedded corpus.
func NewRepository() (Repository, error) {
	if len(canonicalCatalog) != CorpusBooks {
		return nil, fmt.Errorf("bible catalog has %d books, want %d", len(canonicalCatalog), CorpusBooks)
	}

	sourceMetadata, sourceMetadataRaw, err := loadTranslationMetadata()
	if err != nil {
		return nil, err
	}
	repo := &embeddedRepository{
		metadata: TranslationMetadata{
			SchemaVersion:        sourceMetadata.SchemaVersion,
			Code:                 sourceMetadata.Abbreviation,
			Name:                 sourceMetadata.Name,
			Abbreviation:         sourceMetadata.Abbreviation,
			Language:             sourceMetadata.Language,
			TranslationHistory:   sourceMetadata.TranslationHistory,
			RepositoryProvenance: sourceMetadata.RepositoryProvenance,
			TextFormat:           sourceMetadata.TextFormat,
			Books:                CorpusBooks,
			Chapters:             CorpusChapters,
			Verses:               CorpusVerses,
			SourceRepository:     "https://github.com/renniemaharaj/kjv-bible",
			SourceCommit:         SourceCommit,
			CorpusSHA512:         CorpusSHA512,
			RenderingSHA512:      RenderingSHA512,
		},
		summaries: make([]BookSummary, 0, CorpusBooks),
		books:     make(map[string]*Book, CorpusBooks),
		aliases:   make(map[string]string, CorpusBooks*2),
	}

	hasher := sha512.New()
	_, _ = hasher.Write([]byte("KJV-JSON-CORPUS\x00v1\x00"))
	renderingHasher := sha512.New()
	_, _ = renderingHasher.Write([]byte("KJV-JSON-RENDERING\x00v1\x00"))
	writeCorpusFrame(renderingHasher, "kjv.json", sourceMetadataRaw)
	totalChapters := 0
	totalVerses := 0

	for canonicalIndex, entry := range canonicalCatalog {
		filename := entry.title + ".json"
		raw, err := corpusFS.ReadFile("corpus/" + filename)
		if err != nil {
			return nil, fmt.Errorf("read embedded %s: %w", filename, err)
		}
		writeCorpusFrame(hasher, filename, raw)

		var chapters map[string]map[string]string
		if err := json.Unmarshal(raw, &chapters); err != nil {
			return nil, fmt.Errorf("decode embedded %s: %w", filename, err)
		}
		chapterCount, verseCount, err := validateBook(entry.title, chapters)
		if err != nil {
			return nil, err
		}
		markers, markerRaw, err := loadBookMarkers(entry.title, chapters)
		if err != nil {
			return nil, err
		}
		writeCorpusFrame(renderingHasher, "markers/"+filename, markerRaw)
		totalChapters += chapterCount
		totalVerses += verseCount

		summary := BookSummary{
			Title:          entry.title,
			Slug:           entry.slug,
			Testament:      entry.testament,
			Division:       entry.division,
			CanonicalOrder: canonicalIndex + 1,
			DivisionOrder:  entry.divisionOrder,
			BookOrder:      entry.bookOrder,
			ChapterCount:   chapterCount,
			VerseCount:     verseCount,
		}
		repo.summaries = append(repo.summaries, summary)
		repo.books[entry.slug] = &Book{
			Translation: TranslationCode,
			Title:       entry.title,
			Slug:        entry.slug,
			Chapters:    chapters,
			Markers:     markers,
		}
		repo.aliases[normalizeBookKey(entry.slug)] = entry.slug
		repo.aliases[normalizeBookKey(entry.title)] = entry.slug
	}

	// Preserve the legacy singular alias while the canonical corpus uses Psalms.
	repo.aliases["psalm"] = "psalms"

	if totalChapters != CorpusChapters || totalVerses != CorpusVerses {
		return nil, fmt.Errorf(
			"embedded corpus totals %d chapters/%d verses, want %d/%d",
			totalChapters,
			totalVerses,
			CorpusChapters,
			CorpusVerses,
		)
	}
	fingerprint := hex.EncodeToString(hasher.Sum(nil))
	if fingerprint != CorpusSHA512 {
		return nil, fmt.Errorf("embedded corpus fingerprint %s does not match tracked %s", fingerprint, CorpusSHA512)
	}
	renderingFingerprint := hex.EncodeToString(renderingHasher.Sum(nil))
	if renderingFingerprint != RenderingSHA512 {
		return nil, fmt.Errorf(
			"embedded rendering fingerprint %s does not match tracked %s",
			renderingFingerprint,
			RenderingSHA512,
		)
	}

	return repo, nil
}

type sourceTranslationMetadata struct {
	SchemaVersion        int                  `json:"schema_version"`
	Name                 string               `json:"name"`
	Abbreviation         string               `json:"abbreviation"`
	Language             LanguageMetadata     `json:"language"`
	TranslationHistory   TranslationHistory   `json:"translation_history"`
	RepositoryProvenance RepositoryProvenance `json:"repository_provenance"`
	TextFormat           TextFormat           `json:"text_format"`
}

func loadTranslationMetadata() (sourceTranslationMetadata, []byte, error) {
	raw, err := corpusFS.ReadFile("corpus/kjv.json")
	if err != nil {
		return sourceTranslationMetadata{}, nil, fmt.Errorf("read embedded kjv.json: %w", err)
	}
	var metadata sourceTranslationMetadata
	if err := decodeStrict(raw, &metadata); err != nil {
		return sourceTranslationMetadata{}, nil, fmt.Errorf("decode embedded kjv.json: %w", err)
	}
	if metadata.SchemaVersion != 1 ||
		metadata.Name != "King James Version" ||
		metadata.Abbreviation != TranslationCode ||
		metadata.Language.Code != "en" ||
		metadata.TranslationHistory.FirstPublished != 1611 ||
		metadata.TranslationHistory.EditorialBasis != 1769 ||
		metadata.RepositoryProvenance.Verification.VerseCount != CorpusVerses {
		return sourceTranslationMetadata{}, nil, errors.New("embedded kjv.json does not match the supported KJV metadata contract")
	}
	return metadata, raw, nil
}

func loadBookMarkers(
	title string,
	chapters map[string]map[string]string,
) (BookMarkers, []byte, error) {
	raw, err := corpusFS.ReadFile("corpus/markers/" + title + ".json")
	if err != nil {
		return BookMarkers{}, nil, fmt.Errorf("read embedded %s markers: %w", title, err)
	}
	var markers BookMarkers
	if err := decodeStrict(raw, &markers); err != nil {
		return BookMarkers{}, nil, fmt.Errorf("decode embedded %s markers: %w", title, err)
	}
	if markers.SchemaVersion != 1 ||
		markers.Book != title ||
		markers.OffsetUnit != "Unicode code points" ||
		markers.SpanEnd != "exclusive" {
		return BookMarkers{}, nil, fmt.Errorf("embedded %s markers have an unsupported contract", title)
	}
	if len(markers.Chapters) != len(chapters) {
		return BookMarkers{}, nil, fmt.Errorf("embedded %s markers do not align with the book chapters", title)
	}
	for chapterKey, chapter := range chapters {
		markerChapter, ok := markers.Chapters[chapterKey]
		if !ok || len(markerChapter) != len(chapter) {
			return BookMarkers{}, nil, fmt.Errorf("embedded %s chapter %s markers do not align", title, chapterKey)
		}
		for verseKey, text := range chapter {
			verseMarkers, ok := markerChapter[verseKey]
			if !ok {
				return BookMarkers{}, nil, fmt.Errorf("embedded %s %s:%s markers are missing", title, chapterKey, verseKey)
			}
			textLength := utf8.RuneCountInString(text)
			if err := validateSpans(verseMarkers.AddedWords, textLength); err != nil {
				return BookMarkers{}, nil, fmt.Errorf("embedded %s %s:%s added-word markers: %w", title, chapterKey, verseKey, err)
			}
			if err := validateSpans(verseMarkers.WordsOfChrist, textLength); err != nil {
				return BookMarkers{}, nil, fmt.Errorf("embedded %s %s:%s red-letter markers: %w", title, chapterKey, verseKey, err)
			}
		}
	}
	return markers, raw, nil
}

func validateSpans(spans []TextSpan, textLength int) error {
	previousEnd := 0
	for index, span := range spans {
		if span.Start < 0 || span.End <= span.Start || span.End > textLength {
			return fmt.Errorf("span %d [%d,%d) is outside text length %d", index, span.Start, span.End, textLength)
		}
		if index > 0 && span.Start < previousEnd {
			return fmt.Errorf("span %d overlaps the previous span", index)
		}
		previousEnd = span.End
	}
	return nil
}

func decodeStrict(raw []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("unexpected trailing JSON value")
		}
		return err
	}
	return nil
}

func writeCorpusFrame(hasher interface{ Write([]byte) (int, error) }, filename string, raw []byte) {
	var nameLength [4]byte
	binary.BigEndian.PutUint32(nameLength[:], uint32(len(filename)))
	_, _ = hasher.Write(nameLength[:])
	_, _ = hasher.Write([]byte(filename))

	var fileLength [8]byte
	binary.BigEndian.PutUint64(fileLength[:], uint64(len(raw)))
	_, _ = hasher.Write(fileLength[:])
	_, _ = hasher.Write(raw)
}

func validateBook(title string, chapters map[string]map[string]string) (int, int, error) {
	if len(chapters) == 0 {
		return 0, 0, fmt.Errorf("embedded %s has no chapters", title)
	}
	verses := 0
	for chapterNumber := 1; chapterNumber <= len(chapters); chapterNumber++ {
		chapterKey := strconv.Itoa(chapterNumber)
		chapter, ok := chapters[chapterKey]
		if !ok || len(chapter) == 0 {
			return 0, 0, fmt.Errorf("embedded %s chapter %s is missing or empty", title, chapterKey)
		}
		for verseNumber := 1; verseNumber <= len(chapter); verseNumber++ {
			verseKey := strconv.Itoa(verseNumber)
			text, ok := chapter[verseKey]
			if !ok || strings.TrimSpace(text) == "" {
				return 0, 0, fmt.Errorf("embedded %s %s:%s is missing or empty", title, chapterKey, verseKey)
			}
		}
		verses += len(chapter)
	}
	return len(chapters), verses, nil
}

func normalizeBookKey(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.NewReplacer("_", "-", " ", "-").Replace(value)
	for strings.Contains(value, "--") {
		value = strings.ReplaceAll(value, "--", "-")
	}
	return strings.Trim(value, "-")
}

func (r *embeddedRepository) Metadata() TranslationMetadata {
	return r.metadata
}

func (r *embeddedRepository) ListBooks() []BookSummary {
	return append([]BookSummary(nil), r.summaries...)
}

func (r *embeddedRepository) GetBook(book string) (*Book, error) {
	slug, ok := r.aliases[normalizeBookKey(book)]
	if !ok {
		return nil, ErrBookNotFound
	}
	result, ok := r.books[slug]
	if !ok {
		return nil, ErrBookNotFound
	}
	return result, nil
}
