package page

import (
	"errors"
	"fmt"
)

var (
	ErrExpectedSectionRevisionRequired = errors.New("expected section revision is required")
	ErrSectionRevisionConflict         = errors.New("section revision conflict")
)

// SectionRevisionConflict carries the values required for an API conflict
// payload without exposing section config or other page content.
type SectionRevisionConflict struct {
	Expected int64 `json:"expected_revision"`
	Actual   int64 `json:"actual_revision"`
}

func (e *SectionRevisionConflict) Error() string {
	return fmt.Sprintf("%s: expected %d, actual %d", ErrSectionRevisionConflict, e.Expected, e.Actual)
}

func (e *SectionRevisionConflict) Unwrap() error {
	return ErrSectionRevisionConflict
}

// RequireExpectedSectionRevision is the fail-closed optimistic-concurrency gate
// for future section-scoped mutations. Callers must run it against a locked row
// in the same transaction as the write.
func RequireExpectedSectionRevision(expected, actual int64) error {
	if expected < 1 || actual < 1 {
		return ErrExpectedSectionRevisionRequired
	}
	if expected != actual {
		return &SectionRevisionConflict{Expected: expected, Actual: actual}
	}
	return nil
}
