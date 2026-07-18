package page

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/skaia/backend/models"
)

type cutoverReadRepository struct {
	*memoryInteractiveRepository
	ready      bool
	readyErr   error
	normalized string
	loadErr    error
	lastRuns   int
	lastWindow time.Duration
}

func (r *cutoverReadRepository) NormalizedPageReadReady(_ int64, runs int, window time.Duration) (bool, error) {
	r.lastRuns, r.lastWindow = runs, window
	return r.ready, r.readyErr
}

func (r *cutoverReadRepository) LoadNormalizedPageContent(_ int64) (string, error) {
	return r.normalized, r.loadErr
}

func TestNormalizedSectionReadsUsePageSpecificCutoverGate(t *testing.T) {
	legacy := `[{"id":1,"section_type":"rich_text","config":{"content":"legacy"}}]`
	normalized := `[{"id":1,"section_type":"rich_text","config":{"content":"normalized"}}]`
	repo := &cutoverReadRepository{
		memoryInteractiveRepository: &memoryInteractiveRepository{page: models.Page{ID: 1, Content: legacy}},
		normalized:                  normalized,
	}
	svc := NewService(repo, nil, WithNormalizedSectionReads(true, 4, 2*time.Hour))

	page, err := svc.GetByID(1)
	if err != nil || page.Content != legacy {
		t.Fatalf("unready page did not retain compatibility read: %#v, %v", page, err)
	}
	repo.ready = true
	page, err = svc.GetByID(1)
	if err != nil || page.Content != normalized {
		t.Fatalf("ready page did not use normalized read: %#v, %v", page, err)
	}
	if repo.lastRuns != 4 || repo.lastWindow != 2*time.Hour {
		t.Fatalf("cutover thresholds were not passed to repository: %d, %s", repo.lastRuns, repo.lastWindow)
	}
	if repo.memoryInteractiveRepository.page.Content != legacy {
		t.Fatal("read projection mutated the rollback document")
	}
}

func TestNormalizedSectionReadFailuresDoNotFallBackAfterCutover(t *testing.T) {
	repo := &cutoverReadRepository{
		memoryInteractiveRepository: &memoryInteractiveRepository{page: models.Page{ID: 1, Content: `[]`}},
		ready:                       true, loadErr: errors.New("normalized storage unavailable"),
	}
	_, err := NewService(repo, nil, WithNormalizedSectionReads(true, 1, 0)).GetByID(1)
	if err == nil || !strings.Contains(err.Error(), "load normalized page content") {
		t.Fatalf("normalized read failure silently fell back: %v", err)
	}
	repo.readyErr = errors.New("cutover telemetry unavailable")
	repo.loadErr = nil
	_, err = NewService(repo, nil, WithNormalizedSectionReads(true, 1, 0)).GetByID(1)
	if err == nil || !strings.Contains(err.Error(), "read readiness") {
		t.Fatalf("readiness failure silently fell back: %v", err)
	}
}
