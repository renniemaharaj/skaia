package customsection

import (
	"errors"
	"testing"

	"github.com/skaia/backend/models"
)

type presetPolicy struct {
	allowed bool
	err     error
}

func (p presetPolicy) HasPermission(int64, string) (bool, error) {
	return p.allowed, p.err
}

type trackingPresetRepository struct {
	presetAliasRepository
	creates int
}

func (r *trackingPresetRepository) Create(*models.CustomSection) error {
	r.creates++
	return nil
}

func TestPresetMutationPolicyFailsClosed(t *testing.T) {
	repository := &trackingPresetRepository{}
	preset := &models.CustomSection{Name: "Cards"}

	for _, service := range []*Service{
		NewService(repository),
		NewService(repository, presetPolicy{}),
		NewService(repository, presetPolicy{err: errors.New("permission store unavailable")}),
	} {
		if err := service.Create(12, preset); !errors.Is(err, ErrPresetMutationForbidden) {
			t.Fatalf("preset mutation did not fail closed: %v", err)
		}
	}
	if repository.creates != 0 {
		t.Fatalf("denied preset writes reached repository: %d", repository.creates)
	}
	if err := NewService(repository, presetPolicy{allowed: true}).Create(12, preset); err != nil {
		t.Fatalf("authorized preset write failed: %v", err)
	}
	if repository.creates != 1 {
		t.Fatalf("authorized preset write count = %d", repository.creates)
	}
}
