package forum_test

import (
	"context"
	"strconv"
	"testing"

	"github.com/skaia/backend/internal/forum"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/internal/trash"
	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/require"
)

func TestForumTrashProviderOwnScopeRestoreAndParentConflict(t *testing.T) {
	db := testutil.OpenTestDB(t)
	actorID := createTestUser(t, db)
	strangerID := createTestUser(t, db)
	categories := forum.NewCategoryRepository(db)
	threads := forum.NewThreadRepository(db)
	category, err := categories.Create(&models.ForumCategory{Name: testutil.UniqueStr("trash_category")})
	require.NoError(t, err)
	thread, err := threads.Create(&models.ForumThread{
		CategoryID: category.ID,
		UserID:     actorID,
		Title:      testutil.UniqueStr("trash_thread"),
		Content:    "retained",
	})
	require.NoError(t, err)

	require.NoError(t, threads.Delete(thread.ID, actorID))
	_, err = threads.GetByID(thread.ID)
	require.Error(t, err)

	var threadProvider trash.Provider
	var categoryProvider trash.Provider
	for _, provider := range forum.NewTrashProviders(db) {
		switch provider.Resource() {
		case "forum_thread":
			threadProvider = provider
		case "forum_category":
			categoryProvider = provider
		}
	}
	require.NotNil(t, threadProvider)
	require.NotNil(t, categoryProvider)

	own, err := threadProvider.ListDeleted(context.Background(), actorID, false, 25, 0)
	require.NoError(t, err)
	var trashedID string
	for _, item := range own {
		if item.ID == stringID(thread.ID) {
			trashedID = item.ID
			break
		}
	}
	require.Equal(t, stringID(thread.ID), trashedID)
	hidden, err := threadProvider.ListDeleted(context.Background(), strangerID, false, 25, 0)
	require.NoError(t, err)
	require.Empty(t, hidden)
	require.ErrorIs(t, threadProvider.Restore(context.Background(), strangerID, false, trashedID), trash.ErrNotFound)

	require.NoError(t, categories.Delete(category.ID, actorID))
	require.ErrorIs(t, threadProvider.Restore(context.Background(), actorID, false, trashedID), trash.ErrConflict)
	require.NoError(t, categoryProvider.Restore(context.Background(), actorID, false, stringID(category.ID)))
	require.NoError(t, threadProvider.Restore(context.Background(), actorID, false, trashedID))
	_, err = threads.GetByID(thread.ID)
	require.NoError(t, err)

	var restores int
	err = db.QueryRow(
		`SELECT COUNT(*) FROM resource_lifecycle_events
		 WHERE resource_type='forum_thread' AND resource_id=$1 AND action='restore'`,
		trashedID,
	).Scan(&restores)
	require.NoError(t, err)
	require.Equal(t, 1, restores)
}

func stringID(id int64) string {
	return strconv.FormatInt(id, 10)
}
