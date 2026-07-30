package bible

// Repository provides immutable access to the embedded corpus.
type Repository interface {
	Metadata() TranslationMetadata
	ListBooks() []BookSummary
	GetBook(book string) (*Book, error)
}
