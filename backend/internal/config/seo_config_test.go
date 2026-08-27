package config

import (
	"errors"
	"testing"
)

type seoConfigRepository struct {
	Repository
	key   string
	value string
}

func (r *seoConfigRepository) UpsertConfig(key, value string) error {
	r.key = key
	r.value = value
	return nil
}

type seoManagementPolicy struct {
	allowed bool
	err     error
}

func (p seoManagementPolicy) HasPermission(_ int64, permission string) (bool, error) {
	if permission != "home.manage" {
		return false, errors.New("unexpected permission")
	}
	return p.allowed, p.err
}

func TestSaveSEORequiresManagementPolicy(t *testing.T) {
	repo := &seoConfigRepository{}

	tests := []struct {
		name   string
		policy ManagementPolicy
		actor  int64
	}{
		{name: "missing policy", actor: 7},
		{name: "missing actor", policy: seoManagementPolicy{allowed: true}},
		{name: "denied", policy: seoManagementPolicy{}, actor: 7},
		{name: "lookup failure", policy: seoManagementPolicy{allowed: true, err: errors.New("db down")}, actor: 7},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			svc := NewService(repo, WithManagementPolicy(test.policy))
			if _, err := svc.SaveSEO(test.actor, `{"font_family":"Inter"}`); !errors.Is(err, ErrConfigMutationForbidden) {
				t.Fatalf("SaveSEO() error = %v, want %v", err, ErrConfigMutationForbidden)
			}
		})
	}
}

func TestSaveSEOValidatesAndNormalizesFontFamily(t *testing.T) {
	repo := &seoConfigRepository{}
	svc := NewService(repo, WithManagementPolicy(seoManagementPolicy{allowed: true}))

	payload, err := svc.SaveSEO(7, `{"description":"A site","font_family":"  Playfair   Display  "}`)
	if err != nil {
		t.Fatal(err)
	}
	if repo.key != "seo" {
		t.Fatalf("saved key = %q, want seo", repo.key)
	}
	want := `{"description":"A site","font_family":"Playfair Display"}`
	if string(payload) != want || repo.value != want {
		t.Fatalf("saved payload = %s, want %s", payload, want)
	}
}

func TestSaveSEORejectsUnsafeOrUnknownFields(t *testing.T) {
	svc := NewService(&seoConfigRepository{}, WithManagementPolicy(seoManagementPolicy{allowed: true}))

	for _, payload := range []string{
		`{"font_family":"Inter\"; color: red"}`,
		`{"font_family":"Inter, serif"}`,
		`{"font_family":12}`,
		`{"unexpected":"value"}`,
	} {
		if _, err := svc.SaveSEO(7, payload); !errors.Is(err, ErrInvalidSEOConfig) {
			t.Fatalf("SaveSEO(%s) error = %v, want %v", payload, err, ErrInvalidSEOConfig)
		}
	}
}
