package bible

import (
	"crypto/sha512"
	"embed"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

var ErrBookNotFound = errors.New("bible book not found")

//go:embed corpus/*.json corpus/SHA512SUMS corpus/SOURCE.md corpus/UPSTREAM_README.md
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

	repo := &embeddedRepository{
		metadata: TranslationMetadata{
			Code:             TranslationCode,
			Name:             "King James Version",
			Books:            CorpusBooks,
			Chapters:         CorpusChapters,
			Verses:           CorpusVerses,
			SourceRepository: "https://github.com/renniemaharaj/kjv-bible",
			SourceCommit:     SourceCommit,
			CorpusSHA512:     CorpusSHA512,
			ProvenanceNotice: "The upstream transcription and exact KJV edition are not documented.",
		},
		summaries: make([]BookSummary, 0, CorpusBooks),
		books:     make(map[string]*Book, CorpusBooks),
		aliases:   make(map[string]string, CorpusBooks*2),
	}

	hasher := sha512.New()
	_, _ = hasher.Write([]byte("KJV-JSON-CORPUS\x00v1\x00"))
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

	return repo, nil
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
