package page

import "github.com/skaia/backend/models"

// Repository defines data-access operations for custom pages.
type Repository interface {
	GetBySlug(slug string) (*models.Page, error)
	GetByID(id int64) (*models.Page, error)
	Create(p *models.Page) error
	Update(p *models.Page) error
	Delete(id int64) error
	DeleteAll() error
	List() ([]*models.Page, error)

	// Ownership & editors
	SetOwner(pageID, ownerID int64) error
	ClearOwner(pageID int64) error
	AddEditor(pageID, userID, grantedBy int64) error
	RemoveEditor(pageID, userID int64) error
	GetEditors(pageID int64) ([]*models.PageUser, error)
	GetOwner(pageID int64) (*models.PageUser, error)
	IsEditor(pageID, userID int64) (bool, error)
	ListWithOwnership() ([]*models.Page, error)

	// Engagement
	LikePage(pageID, userID int64) (int64, error)
	UnlikePage(pageID, userID int64) (int64, error)
	IsPageLikedByUser(pageID, userID int64) (bool, error)
	GetPageLikeCount(pageID int64) (int, error)
	GetPageCommentCount(pageID int64) (int, error)

	// Comments
	CreateComment(c *models.PageComment) (*models.PageComment, error)
	GetComment(id int64) (*models.PageComment, error)
	ListComments(pageID int64, limit, offset int) ([]*models.PageComment, error)
	UpdateComment(c *models.PageComment) error
	DeleteComment(id int64) error
	LikeComment(commentID, userID int64) (int64, error)
	UnlikeComment(commentID, userID int64) (int64, error)
	IsCommentLikedByUser(commentID, userID int64) (bool, error)

	// Page allocations
	GetAllocation(userID int64) (*models.UserPageAllocation, error)
	UpsertAllocation(userID, maxPages int64) error
	IncrementUsed(userID int64) error
	DecrementUsed(userID int64) error
	ListAllocations() ([]*models.UserPageAllocation, error)
	DeleteAllocation(userID int64) error
	SetUsedPages(userID int64, count int) error
	CountOwnedPages(userID int64) (int, error)
	GetNoreplyUserID() (int64, error)
}
