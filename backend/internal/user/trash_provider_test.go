package user_test

import (
	"context"
	"strconv"
	"testing"

	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/internal/trash"
	"github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/models"
)

func TestRoleTrashProviderUsesManagerOnlyQueries(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := user.NewRepository(db)
	name := testutil.UniqueStr("trash_role_actor")
	actor, err := repo.Create(&models.User{
		Username: name,
		Email:    name + "@example.com",
	}, "hash")
	if err != nil {
		t.Fatal(err)
	}
	role, err := repo.CreateRole(testutil.UniqueStr("trash_role"), "Trash test", 1, nil, nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.DeleteRole(role.ID); err != nil {
		t.Fatal(err)
	}

	var provider trash.Provider
	for _, candidate := range user.NewTrashProviders(db) {
		if candidate.Resource() == "role" {
			provider = candidate
			break
		}
	}
	if provider == nil {
		t.Fatal("role trash provider was not registered")
	}

	ordinary, err := provider.ListDeleted(context.Background(), actor.ID, false, 25, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(ordinary) != 0 {
		t.Fatalf("ordinary user saw manager-only roles: %#v", ordinary)
	}

	managed, err := provider.ListDeleted(context.Background(), actor.ID, true, 25, 0)
	if err != nil {
		t.Fatal(err)
	}
	id := strconv.FormatInt(role.ID, 10)
	found := false
	for _, item := range managed {
		if item.ID == id {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("deleted role %s missing from managed trash: %#v", id, managed)
	}
	if err := provider.Restore(context.Background(), actor.ID, false, id); err != trash.ErrNotFound {
		t.Fatalf("ordinary restore returned %v, want not found", err)
	}
	if err := provider.Restore(context.Background(), actor.ID, true, id); err != nil {
		t.Fatal(err)
	}
}
