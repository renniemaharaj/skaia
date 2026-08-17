package docs

import (
	"errors"
	"testing"

	"github.com/skaia/backend/models"
)

type serviceTestRepo struct {
	Repository
	doc       *models.Documentation
	created   *models.Documentation
	updateErr error
}

func (r *serviceTestRepo) GetByID(id int64) (*models.Documentation, error) {
	if r.doc == nil || r.doc.ID != id {
		return nil, ErrNotFound
	}
	copy := *r.doc
	return &copy, nil
}
func (r *serviceTestRepo) GetBySlug(slug string) (*models.Documentation, error) {
	if r.doc == nil || r.doc.Slug != slug {
		return nil, ErrNotFound
	}
	copy := *r.doc
	return &copy, nil
}
func (r *serviceTestRepo) Create(doc *models.Documentation) error {
	copy := *doc
	copy.ID = 9
	copy.Revision = 1
	r.created = &copy
	*doc = copy
	return nil
}
func (r *serviceTestRepo) Update(doc *models.Documentation, expected int64) error { return r.updateErr }

type serviceTestAuth struct {
	allowed map[string]bool
	fail    bool
}

func (a serviceTestAuth) HasPermission(_ int64, permission string) (bool, error) {
	if a.fail {
		return false, errors.New("lookup failed")
	}
	return a.allowed[permission], nil
}

func TestCreateNormalizesSlugAndRequiresCreatePermission(t *testing.T) {
	repo := &serviceTestRepo{}
	service := NewService(repo, serviceTestAuth{allowed: map[string]bool{"docs.create": true}}, nil)
	doc := &models.Documentation{Slug: "  Product Guides  ", Title: "Product Guides", Visibility: "public"}
	if err := service.Create(doc, 42); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if repo.created.Slug != "product-guides" || repo.created.OwnerID != 42 || !doc.CanEdit {
		t.Fatalf("unexpected created document: %#v", doc)
	}

	denied := NewService(&serviceTestRepo{}, serviceTestAuth{fail: true}, nil)
	if err := denied.Create(&models.Documentation{Slug: "safe", Title: "Safe", Visibility: "public"}, 42); !errors.Is(err, ErrForbidden) {
		t.Fatalf("fail-closed create error=%v", err)
	}
}

func TestPrivateDocumentationDoesNotDiscloseWithoutPolicy(t *testing.T) {
	repo := &serviceTestRepo{doc: &models.Documentation{ID: 1, Slug: "private", Title: "Private", Visibility: "private", OwnerID: 7}}
	service := NewService(repo, serviceTestAuth{allowed: map[string]bool{}}, nil)
	if _, err := service.GetByID(1, 8); !errors.Is(err, ErrNotFound) {
		t.Fatalf("private read error=%v", err)
	}
	owned, err := service.GetByID(1, 7)
	if err != nil || !owned.CanEdit {
		t.Fatalf("owner read=%#v err=%v", owned, err)
	}
}

func TestUpdatePreservesOptimisticConflict(t *testing.T) {
	repo := &serviceTestRepo{doc: &models.Documentation{ID: 1, Slug: "docs", Title: "Docs", Visibility: "public", OwnerID: 7}, updateErr: ErrConflict}
	service := NewService(repo, serviceTestAuth{}, nil)
	err := service.Update(&models.Documentation{ID: 1, Slug: "docs", Title: "Changed", Visibility: "public"}, 7, 1)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("Update error=%v", err)
	}
}

func TestReservedAndEmptySlugsAreRejected(t *testing.T) {
	for _, slug := range []string{"mine", "---", "articles"} {
		repo := &serviceTestRepo{}
		service := NewService(repo, serviceTestAuth{allowed: map[string]bool{"docs.create": true}}, nil)
		err := service.Create(&models.Documentation{Slug: slug, Title: "Title", Visibility: "public"}, 1)
		if !errors.Is(err, ErrInvalid) {
			t.Fatalf("slug %q error=%v", slug, err)
		}
	}
}
