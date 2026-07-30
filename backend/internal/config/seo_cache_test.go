package config

import "testing"

type seoInvalidationRepository struct {
	Repository
	upsertErr error
	deleteErr error
}

func (r *seoInvalidationRepository) UpsertConfig(string, string) error {
	return r.upsertErr
}

func (r *seoInvalidationRepository) DeleteConfig(string) error {
	return r.deleteErr
}

func TestSEOConfigWritesInvalidateSemanticCache(t *testing.T) {
	repo := &seoInvalidationRepository{}
	invalidations := 0
	svc := NewService(repo, WithSEOInvalidator(func() { invalidations++ }))

	if err := svc.UpsertConfig("branding", `{}`); err != nil {
		t.Fatal(err)
	}
	if err := svc.UpsertConfig("seo", `{}`); err != nil {
		t.Fatal(err)
	}
	if err := svc.UpsertConfig("footer", `{}`); err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteConfig("seo"); err != nil {
		t.Fatal(err)
	}

	if invalidations != 3 {
		t.Fatalf("invalidations = %d, want 3", invalidations)
	}
}
