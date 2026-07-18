package security

import (
	"errors"
	"testing"

	"github.com/skaia/backend/models"
)

type pageAccessStub struct {
	page      *models.Page
	pageErr   error
	isEditor  bool
	editorErr error
}

func (s pageAccessStub) GetByID(int64) (*models.Page, error) { return s.page, s.pageErr }
func (s pageAccessStub) IsEditor(int64, int64) (bool, error) { return s.isEditor, s.editorErr }

type permissionStub struct {
	allowed bool
	err     error
}

func (s permissionStub) HasPermission(int64, string) (bool, error) { return s.allowed, s.err }

func TestPageEditorPolicyAllowsOwnerEditorAndAdministrator(t *testing.T) {
	ownerID := int64(7)
	for name, policy := range map[string]*PagePolicy{
		"owner":  NewPagePolicy(pageAccessStub{page: &models.Page{OwnerID: &ownerID}}, permissionStub{}),
		"editor": NewPagePolicy(pageAccessStub{page: &models.Page{}, isEditor: true}, permissionStub{}),
		"admin":  NewPagePolicy(pageAccessStub{page: &models.Page{}}, permissionStub{allowed: true}),
	} {
		t.Run(name, func(t *testing.T) {
			actorID := int64(9)
			if name == "owner" {
				actorID = ownerID
			}
			if err := policy.RequirePageEditor(1, actorID); err != nil {
				t.Fatalf("authorized %s rejected: %v", name, err)
			}
		})
	}
}

func TestPageEditorPolicyFailsClosedOnDependencyErrors(t *testing.T) {
	dependencyFailure := errors.New("dependency unavailable")
	for name, policy := range map[string]*PagePolicy{
		"page":       NewPagePolicy(pageAccessStub{pageErr: dependencyFailure}, permissionStub{allowed: true}),
		"permission": NewPagePolicy(pageAccessStub{page: &models.Page{}, editorErr: dependencyFailure}, permissionStub{err: dependencyFailure}),
		"nil":        nil,
	} {
		t.Run(name, func(t *testing.T) {
			if err := policy.RequirePageEditor(1, 9); !errors.Is(err, ErrPolicyDenied) {
				t.Fatalf("dependency failure did not deny: %v", err)
			}
		})
	}
}
