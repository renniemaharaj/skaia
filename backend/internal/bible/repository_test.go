package bible

import (
	"errors"
	"io/fs"
	"testing"
)

func TestEmbeddedRepositoryCorpusContract(t *testing.T) {
	repo, err := NewRepository()
	if err != nil {
		t.Fatalf("NewRepository() error = %v", err)
	}

	metadata := repo.Metadata()
	if metadata.Books != CorpusBooks || metadata.Chapters != CorpusChapters || metadata.Verses != CorpusVerses {
		t.Fatalf("metadata totals = %d/%d/%d", metadata.Books, metadata.Chapters, metadata.Verses)
	}
	if metadata.CorpusSHA512 != CorpusSHA512 ||
		metadata.RenderingSHA512 != RenderingSHA512 ||
		metadata.SourceCommit != SourceCommit {
		t.Fatalf("unexpected corpus identity: %#v", metadata)
	}
	if metadata.TranslationHistory.FirstPublished != 1611 ||
		metadata.TranslationHistory.EditorialBasis != 1769 ||
		metadata.RepositoryProvenance.Verification.Reference == "" ||
		metadata.RepositoryProvenance.Verification.VerseCount != CorpusVerses {
		t.Fatalf("unexpected translation provenance: %#v", metadata)
	}

	files, err := fs.Glob(corpusFS, "corpus/*.json")
	if err != nil {
		t.Fatalf("glob corpus: %v", err)
	}
	if len(files) != CorpusBooks+1 {
		t.Fatalf("embedded root JSON files = %d, want %d", len(files), CorpusBooks+1)
	}
	markerFiles, err := fs.Glob(corpusFS, "corpus/markers/*.json")
	if err != nil {
		t.Fatalf("glob marker corpus: %v", err)
	}
	if len(markerFiles) != CorpusBooks {
		t.Fatalf("embedded marker JSON files = %d, want %d", len(markerFiles), CorpusBooks)
	}

	books := repo.ListBooks()
	if len(books) != CorpusBooks {
		t.Fatalf("ListBooks() length = %d, want %d", len(books), CorpusBooks)
	}
	if books[0].Title != "Genesis" || books[len(books)-1].Title != "Revelation" {
		t.Fatalf("unexpected canonical order: first=%q last=%q", books[0].Title, books[len(books)-1].Title)
	}

	chapters := 0
	verses := 0
	seenSlugs := make(map[string]struct{}, CorpusBooks)
	for _, summary := range books {
		if _, exists := seenSlugs[summary.Slug]; exists {
			t.Fatalf("duplicate slug %q", summary.Slug)
		}
		seenSlugs[summary.Slug] = struct{}{}
		chapters += summary.ChapterCount
		verses += summary.VerseCount
	}
	if chapters != CorpusChapters || verses != CorpusVerses {
		t.Fatalf("summary totals = %d/%d, want %d/%d", chapters, verses, CorpusChapters, CorpusVerses)
	}
}

func TestEmbeddedRepositoryKnownVerseAndAliases(t *testing.T) {
	repo, err := NewRepository()
	if err != nil {
		t.Fatalf("NewRepository() error = %v", err)
	}

	matthew, err := repo.GetBook("Matthew")
	if err != nil {
		t.Fatalf("GetBook(Matthew) error = %v", err)
	}
	const expected = "Therefore I say unto you, Take no thought for your life, what ye shall eat, or what ye shall drink; nor yet for your body, what ye shall put on. Is not the life more than meat, and the body than raiment?"
	if got := matthew.Chapters["6"]["25"]; got != expected {
		t.Fatalf("Matthew 6:25 = %q", got)
	}
	markers := matthew.Markers
	if markers.OffsetUnit != "Unicode code points" || markers.SpanEnd != "exclusive" {
		t.Fatalf("unexpected marker offsets: %#v", markers)
	}
	matthew625 := markers.Chapters["6"]["25"]
	if !matthew625.ParagraphStart ||
		len(matthew625.AddedWords) != 0 ||
		len(matthew625.WordsOfChrist) != 1 ||
		matthew625.WordsOfChrist[0] != (TextSpan{Start: 0, End: 203}) {
		t.Fatalf("unexpected Matthew 6:25 markers: %#v", matthew625)
	}
	matthew53 := markers.Chapters["5"]["3"]
	if !matthew53.ParagraphStart ||
		len(matthew53.AddedWords) != 1 ||
		matthew53.AddedWords[0] != (TextSpan{Start: 8, End: 11}) ||
		len(matthew53.WordsOfChrist) != 2 {
		t.Fatalf("unexpected Matthew 5:3 markers: %#v", matthew53)
	}

	for _, alias := range []string{"Psalms", "psalms", "Psalm", "song_of_solomon", "1 JOHN"} {
		if _, err := repo.GetBook(alias); err != nil {
			t.Errorf("GetBook(%q) error = %v", alias, err)
		}
	}
	psalms, err := repo.GetBook("Psalm")
	if err != nil {
		t.Fatalf("GetBook(Psalm) error = %v", err)
	}
	if psalms.Title != "Psalms" || psalms.Slug != "psalms" {
		t.Fatalf("singular alias resolved to %#v", psalms)
	}

	if _, err := repo.GetBook("not-a-book"); !errors.Is(err, ErrBookNotFound) {
		t.Fatalf("unknown book error = %v, want ErrBookNotFound", err)
	}
}

func TestLegacyDivisionOrderIsComplete(t *testing.T) {
	repo, err := NewRepository()
	if err != nil {
		t.Fatalf("NewRepository() error = %v", err)
	}

	divisionNames := map[int]string{}
	for _, book := range repo.ListBooks() {
		if existing, ok := divisionNames[book.DivisionOrder]; ok && existing != book.Division {
			t.Fatalf("division order %d maps to both %q and %q", book.DivisionOrder, existing, book.Division)
		}
		divisionNames[book.DivisionOrder] = book.Division
	}
	if len(divisionNames) != 9 {
		t.Fatalf("division count = %d, want 9", len(divisionNames))
	}
	if divisionNames[1] != "Canonical Gospels" || divisionNames[9] != "Prophetic Books" {
		t.Fatalf("unexpected legacy division order: %#v", divisionNames)
	}
}
