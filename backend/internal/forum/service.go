package forum

import (
	"github.com/skaia/backend/models"
)

// Service coordinates repository access with caching.
type Service struct {
	categories CategoryRepository
	threads    ThreadRepository
	comments   CommentRepository
	cache      *ThreadCache
}

// NewService creates a Service with the provided repositories and cache.
func NewService(cats CategoryRepository, threads ThreadRepository, comments CommentRepository, cache *ThreadCache) *Service {
	return &Service{
		categories: cats,
		threads:    threads,
		comments:   comments,
		cache:      cache,
	}
}

// Category methods

func (s *Service) GetCategory(id int64) (*models.ForumCategory, error) {
	return s.categories.GetByID(id)
}

func (s *Service) GetCategoryByName(name string) (*models.ForumCategory, error) {
	return s.categories.GetByName(name)
}

func (s *Service) ListCategories() ([]*models.ForumCategory, error) {
	return s.categories.List()
}

func (s *Service) CreateCategory(cat *models.ForumCategory) (*models.ForumCategory, error) {
	return s.categories.Create(cat)
}

func (s *Service) UpdateCategory(cat *models.ForumCategory) (*models.ForumCategory, error) {
	return s.categories.Update(cat)
}

func (s *Service) DeleteCategory(id int64) error {
	return s.categories.Delete(id)
}

// Thread methods

func (s *Service) GetThread(id int64) (*models.ForumThread, error) {
	if t, ok := s.cache.GetByID(id); ok {
		return t, nil
	}
	t, err := s.threads.GetByID(id)
	if err != nil {
		return nil, err
	}
	s.cache.SetByID(id, t)
	return t, nil
}

func (s *Service) ListCategoryThreads(categoryID int64, limit, offset int) ([]*models.ForumThread, error) {
	return s.threads.GetByCategory(categoryID, limit, offset)
}

func (s *Service) CreateThread(thread *models.ForumThread) (*models.ForumThread, error) {
	return s.threads.Create(thread)
}

func (s *Service) UpdateThread(thread *models.ForumThread) (*models.ForumThread, error) {
	t, err := s.threads.Update(thread)
	if err == nil {
		s.cache.Invalidate(t.ID)
	}
	return t, err
}

func (s *Service) DeleteThread(id int64) error {
	err := s.threads.Delete(id)
	if err == nil {
		s.cache.Invalidate(id)
	}
	return err
}

func (s *Service) IncrementViewCount(id int64) error {
	return s.threads.IncrementViewCount(id)
}

func (s *Service) LikeThread(threadID, userID int64) (int64, error) {
	count, err := s.threads.Like(threadID, userID)
	if err == nil {
		s.cache.Invalidate(threadID)
	}
	return count, err
}

func (s *Service) UnlikeThread(threadID, userID int64) (int64, error) {
	count, err := s.threads.Unlike(threadID, userID)
	if err == nil {
		s.cache.Invalidate(threadID)
	}
	return count, err
}

func (s *Service) IsThreadLikedByUser(threadID, userID int64) (bool, error) {
	return s.threads.IsLikedByUser(threadID, userID)
}

// Comment methods

func (s *Service) GetComment(id int64) (*models.ThreadComment, error) {
	return s.comments.GetByID(id)
}

func (s *Service) ListThreadComments(threadID int64, limit, offset int) ([]*models.ThreadComment, error) {
	return s.comments.GetByThread(threadID, limit, offset)
}

func (s *Service) CreateComment(comment *models.ThreadComment) (*models.ThreadComment, error) {
	c, err := s.comments.Create(comment)
	if err == nil {
		s.cache.Invalidate(c.ThreadID)
	}
	return c, err
}

func (s *Service) UpdateComment(comment *models.ThreadComment) (*models.ThreadComment, error) {
	return s.comments.Update(comment)
}

func (s *Service) DeleteComment(id int64) error {
	comment, err := s.comments.GetByID(id)
	if err != nil {
		return err
	}
	if err := s.comments.Delete(id); err != nil {
		return err
	}
	s.cache.Invalidate(comment.ThreadID)
	return nil
}

func (s *Service) LikeComment(commentID, userID int64) (int64, error) {
	return s.comments.Like(commentID, userID)
}

func (s *Service) UnlikeComment(commentID, userID int64) (int64, error) {
	return s.comments.Unlike(commentID, userID)
}

func (s *Service) IsCommentLikedByUser(commentID, userID int64) (bool, error) {
	return s.comments.IsLikedByUser(commentID, userID)
}
