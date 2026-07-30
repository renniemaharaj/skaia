package bible

// Service owns the public read contract for the immutable corpus.
type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) ListBooks() BookList {
	return BookList{
		Translation: s.repo.Metadata(),
		Books:       s.repo.ListBooks(),
	}
}

func (s *Service) GetBook(book string) (*Book, error) {
	return s.repo.GetBook(book)
}
