package user

import (
	"testing"
)

func newTestService(t *testing.T) (*Service, func()) {
	// Initialize test repository and service
	repo := newTestRepo(t)
	cache := NewCache()
	svc := NewService(repo, cache)
	cleanup := func() {
		// Cleanup resources if needed
	}
	return svc, cleanup
}

func newTestRepo(t *testing.T) Repository {
	// Return a mock or in-memory repository for testing
	// This should implement the Repository interface
	return nil // Replace with actual test repository
}
