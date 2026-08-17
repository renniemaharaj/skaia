package forum

import (
	"testing"

	"github.com/skaia/backend/models"
)

type documentationCategoryRepository struct {
	CategoryRepository
	categories []*models.ForumCategory
}

func (r documentationCategoryRepository) List() ([]*models.ForumCategory, error) {
	return r.categories, nil
}

type documentationThreadRepository struct {
	ThreadRepository
	articles []models.ForumDocumentationArticle
	query    string
	limit    int
}

func (r *documentationThreadRepository) DocumentationArticles(query string, limit int) ([]models.ForumDocumentationArticle, error) {
	r.query = query
	r.limit = limit
	return r.articles, nil
}

func TestDocumentationManifestUsesForumOwnedProjection(t *testing.T) {
	categories := []*models.ForumCategory{{ID: 2, Name: "Guides"}}
	articles := []models.ForumDocumentationArticle{{ID: 9, CategoryID: 2, Title: "Deployment"}}
	threads := &documentationThreadRepository{articles: articles}
	service := NewService(documentationCategoryRepository{categories: categories}, threads, nil, nil)

	manifest, err := service.DocumentationManifest("deploy")
	if err != nil {
		t.Fatalf("DocumentationManifest() error = %v", err)
	}
	if len(manifest.Categories) != 1 || manifest.Categories[0].ID != 2 || len(manifest.Articles) != 1 || manifest.Articles[0].ID != 9 {
		t.Fatalf("DocumentationManifest() = %#v", manifest)
	}
	if threads.query != "deploy" || threads.limit != 2000 {
		t.Fatalf("projection called with query %q and limit %d", threads.query, threads.limit)
	}
}
