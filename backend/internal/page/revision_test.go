package page

import (
	"errors"
	"testing"
)

type revisionAcceptanceStore map[string]int64

func (s revisionAcceptanceStore) apply(sectionID string, expected int64) error {
	actual := s[sectionID]
	if err := RequireExpectedSectionRevision(expected, actual); err != nil {
		return err
	}
	s[sectionID] = actual + 1
	return nil
}

func TestSameSectionStaleRevisionConflictsWithoutMutation(t *testing.T) {
	store := revisionAcceptanceStore{"section-a": 3}
	if err := store.apply("section-a", 3); err != nil {
		t.Fatal(err)
	}
	if err := store.apply("section-a", 3); !errors.Is(err, ErrSectionRevisionConflict) {
		t.Fatalf("expected stale same-section write to conflict, got %v", err)
	}
	if store["section-a"] != 4 {
		t.Fatalf("conflicting write changed the revision to %d", store["section-a"])
	}
}

func TestDifferentSectionExpectedRevisionsAdvanceIndependently(t *testing.T) {
	store := revisionAcceptanceStore{"section-a": 7, "section-b": 11}
	if err := store.apply("section-a", 7); err != nil {
		t.Fatal(err)
	}
	if err := store.apply("section-b", 11); err != nil {
		t.Fatal(err)
	}
	if store["section-a"] != 8 || store["section-b"] != 12 {
		t.Fatalf("independent writes did not converge: %#v", store)
	}
}

func TestExpectedRevisionGateFailsClosedWhenRevisionIsMissing(t *testing.T) {
	for _, values := range [][2]int64{{0, 1}, {1, 0}, {-1, 1}} {
		if err := RequireExpectedSectionRevision(values[0], values[1]); !errors.Is(err, ErrExpectedSectionRevisionRequired) {
			t.Fatalf("expected missing revision rejection for %v, got %v", values, err)
		}
	}
}

func TestRevisionConflictContainsOnlyExpectedAndActualMetadata(t *testing.T) {
	err := RequireExpectedSectionRevision(2, 4)
	var conflict *SectionRevisionConflict
	if !errors.As(err, &conflict) {
		t.Fatalf("expected typed revision conflict, got %v", err)
	}
	if conflict.Expected != 2 || conflict.Actual != 4 {
		t.Fatalf("unexpected conflict metadata: %#v", conflict)
	}
}
