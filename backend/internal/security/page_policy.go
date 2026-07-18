package security

import (
	"errors"

	"github.com/skaia/backend/models"
)

var ErrPolicyDenied = errors.New("security policy denied the action")

type PageAccess interface {
	GetByID(id int64) (*models.Page, error)
	IsEditor(pageID, userID int64) (bool, error)
}

type PermissionChecker interface {
	HasPermission(userID int64, permission string) (bool, error)
}

// PagePolicy is the centralized, fail-closed authorization boundary for
// privileged page operations that are not satisfied by route middleware alone.
type PagePolicy struct {
	pages       PageAccess
	permissions PermissionChecker
}

func NewPagePolicy(pages PageAccess, permissions PermissionChecker) *PagePolicy {
	return &PagePolicy{pages: pages, permissions: permissions}
}

func (p *PagePolicy) RequireInteractiveResponseManager(pageID, actorID int64) error {
	return p.RequirePageEditor(pageID, actorID)
}

// RequirePageEditor is the single fail-closed policy gate for page-definition,
// palette, section, item, and ordering mutations.
func (p *PagePolicy) RequirePageEditor(pageID, actorID int64) error {
	if p == nil || p.pages == nil || actorID <= 0 {
		return ErrPolicyDenied
	}
	page, err := p.pages.GetByID(pageID)
	if err != nil || page == nil {
		return ErrPolicyDenied
	}
	if page.OwnerID != nil && *page.OwnerID == actorID {
		return nil
	}
	if isEditor, err := p.pages.IsEditor(pageID, actorID); err == nil && isEditor {
		return nil
	}
	if p.permissions == nil {
		return ErrPolicyDenied
	}
	isAdmin, err := p.permissions.HasPermission(actorID, "home.manage")
	if err != nil || !isAdmin {
		return ErrPolicyDenied
	}
	return nil
}
