package idgen

import (
	"sync"
	"testing"
)

func TestIDGenerator(t *testing.T) {
	var gen IDGenerator

	// --- Single-thread test ---
	id1 := gen.NewUniqueID()
	id2 := gen.NewUniqueID()

	if id1 != 1 || id2 != 2 {
		t.Errorf("expected sequential ids 1, 2; got %d, %d", id1, id2)
	}

	// --- Concurrency test ---
	const goroutines = 1000
	results := make(chan int, goroutines)
	var wg sync.WaitGroup

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- gen.NewUniqueID()
		}()
	}

	wg.Wait()
	close(results)

	seen := make(map[int]bool)
	seen[id1] = true
	seen[id2] = true
	for id := range results {
		if seen[id] {
			t.Errorf("duplicate id detected: %d", id)
		}
		seen[id] = true
	}

	if len(seen) != goroutines+2 { // +2 because we already generated 2 IDs earlier
		t.Errorf("expected %d unique ids, got %d", goroutines+2, len(seen))
	}
}
