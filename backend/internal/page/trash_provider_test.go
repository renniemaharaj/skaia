package page

import (
	"context"
	"strconv"
	"testing"

	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/internal/trash"
)

func TestPageAllocationTrashProviderUsesManagerOnlyQueries(t *testing.T) {
	db := testutil.OpenTestDB(t)
	actorID := seededActorID(t, db)

	var allocationID int64
	err := db.QueryRow(
		`INSERT INTO user_page_allocations(user_id, max_pages, used_pages)
		 VALUES ($1, 7, 0)
		 ON CONFLICT (user_id) DO UPDATE
		 SET max_pages=EXCLUDED.max_pages, deleted_at=NULL, deleted_by=NULL
		 RETURNING id`,
		actorID,
	).Scan(&allocationID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(
		`UPDATE user_page_allocations
		 SET deleted_at=NOW(), deleted_by=$2
		 WHERE id=$1`,
		allocationID, actorID,
	); err != nil {
		t.Fatal(err)
	}

	var provider trash.Provider
	for _, candidate := range NewTrashProviders(db) {
		if candidate.Resource() == "page_allocation" {
			provider = candidate
			break
		}
	}
	if provider == nil {
		t.Fatal("page allocation trash provider was not registered")
	}

	ordinary, err := provider.ListDeleted(context.Background(), actorID, false, 25, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(ordinary) != 0 {
		t.Fatalf("ordinary user saw manager-only allocations: %#v", ordinary)
	}

	managed, err := provider.ListDeleted(context.Background(), actorID, true, 25, 0)
	if err != nil {
		t.Fatal(err)
	}
	id := strconv.FormatInt(allocationID, 10)
	if len(managed) != 1 || managed[0].ID != id {
		t.Fatalf("unexpected managed allocation trash: %#v", managed)
	}
	if err := provider.Restore(context.Background(), actorID, false, id); err != trash.ErrNotFound {
		t.Fatalf("ordinary restore returned %v, want not found", err)
	}
	if err := provider.Restore(context.Background(), actorID, true, id); err != nil {
		t.Fatal(err)
	}
}
