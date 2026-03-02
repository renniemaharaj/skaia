package forum_test

import (
	"database/sql"
	"testing"

	"github.com/skaia/backend/internal/forum"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Category tests ---

func TestCategoryRepository_CreateAndGet(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := forum.NewCategoryRepository(db)

	cat, err := repo.Create(&models.ForumCategory{
		Name:        testutil.UniqueStr("General"),
		Description: "A general category",
	})
	require.NoError(t, err)
	require.NotZero(t, cat.ID)

	fetched, err := repo.GetByID(cat.ID)
	require.NoError(t, err)
	assert.Equal(t, cat.Name, fetched.Name)
}

func TestCategoryRepository_List(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := forum.NewCategoryRepository(db)

	for i := 0; i < 2; i++ {
		_, err := repo.Create(&models.ForumCategory{Name: testutil.UniqueStr("cat")})
		require.NoError(t, err)
	}

	cats, err := repo.List()
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(cats), 2)
}

func TestCategoryRepository_Delete(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := forum.NewCategoryRepository(db)

	cat, err := repo.Create(&models.ForumCategory{Name: testutil.UniqueStr("del_cat")})
	require.NoError(t, err)

	require.NoError(t, repo.Delete(cat.ID))

	_, err = repo.GetByID(cat.ID)
	require.Error(t, err)
}

// --- Thread tests ---

func TestThreadRepository_CreateAndGet(t *testing.T) {
	db := testutil.OpenTestDB(t)

	catRepo := forum.NewCategoryRepository(db)
	threadRepo := forum.NewThreadRepository(db)
	uid := createTestUser(t, db)

	cat, err := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("tcat")})
	require.NoError(t, err)

	thread, err := threadRepo.Create(&models.ForumThread{
		CategoryID: cat.ID,
		UserID:     uid,
		Title:      testutil.UniqueStr("A thread"),
		Content:    "Some content",
	})
	require.NoError(t, err)
	require.NotZero(t, thread.ID)

	fetched, err := threadRepo.GetByID(thread.ID)
	require.NoError(t, err)
	assert.Equal(t, thread.Title, fetched.Title)
}

func TestThreadRepository_GetByCategory(t *testing.T) {
	db := testutil.OpenTestDB(t)

	catRepo := forum.NewCategoryRepository(db)
	threadRepo := forum.NewThreadRepository(db)
	uid := createTestUser(t, db)

	cat, err := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("listcat")})
	require.NoError(t, err)

	for i := 0; i < 3; i++ {
		_, err := threadRepo.Create(&models.ForumThread{
			CategoryID: cat.ID,
			UserID:     uid,
			Title:      testutil.UniqueStr("thread"),
			Content:    "content",
		})
		require.NoError(t, err)
	}

	threads, err := threadRepo.GetByCategory(cat.ID, 10, 0)
	require.NoError(t, err)
	assert.Len(t, threads, 3)
}

func TestThreadRepository_LikeUnlike(t *testing.T) {
	db := testutil.OpenTestDB(t)

	catRepo := forum.NewCategoryRepository(db)
	threadRepo := forum.NewThreadRepository(db)
	uid := createTestUser(t, db)

	cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("lcat")})
	thread, _ := threadRepo.Create(&models.ForumThread{
		CategoryID: cat.ID,
		UserID:     uid,
		Title:      testutil.UniqueStr("likeable"),
		Content:    "x",
	})

	count, err := threadRepo.Like(thread.ID, uid)
	require.NoError(t, err)
	assert.EqualValues(t, 1, count)

	liked, err := threadRepo.IsLikedByUser(thread.ID, uid)
	require.NoError(t, err)
	assert.True(t, liked)

	count, err = threadRepo.Unlike(thread.ID, uid)
	require.NoError(t, err)
	assert.EqualValues(t, 0, count)
}

// --- Comment tests ---

func TestCommentRepository_CreateAndGet(t *testing.T) {
	db := testutil.OpenTestDB(t)

	catRepo := forum.NewCategoryRepository(db)
	threadRepo := forum.NewThreadRepository(db)
	commentRepo := forum.NewCommentRepository(db)
	uid := createTestUser(t, db)

	cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("cc")})
	thread, _ := threadRepo.Create(&models.ForumThread{
		CategoryID: cat.ID,
		UserID:     uid,
		Title:      testutil.UniqueStr("thread_for_comments"),
		Content:    "x",
	})

	comment, err := commentRepo.Create(&models.ThreadComment{
		ThreadID: thread.ID,
		UserID:   uid,
		Content:  "Hello!",
	})
	require.NoError(t, err)
	require.NotZero(t, comment.ID)

	// reply_count should be incremented
	t2, err := threadRepo.GetByID(thread.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, t2.ReplyCount)
}

func TestCommentRepository_Delete_DecrementsReplyCount(t *testing.T) {
	db := testutil.OpenTestDB(t)

	catRepo := forum.NewCategoryRepository(db)
	threadRepo := forum.NewThreadRepository(db)
	commentRepo := forum.NewCommentRepository(db)
	uid := createTestUser(t, db)

	cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("dc")})
	thread, _ := threadRepo.Create(&models.ForumThread{
		CategoryID: cat.ID,
		UserID:     uid,
		Title:      testutil.UniqueStr("thread_del"),
		Content:    "x",
	})
	comment, _ := commentRepo.Create(&models.ThreadComment{
		ThreadID: thread.ID,
		UserID:   uid,
		Content:  "going away",
	})

	require.NoError(t, commentRepo.Delete(comment.ID))

	t2, err := threadRepo.GetByID(thread.ID)
	require.NoError(t, err)
	assert.Equal(t, 0, t2.ReplyCount)
}

// createTestUser inserts a minimal user row and returns its ID.
func createTestUser(t *testing.T, db *sql.DB) int64 {
	t.Helper()
	name := testutil.UniqueStr("forum_user")
	var id int64
	err := db.QueryRow(
		`INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
		name, name+"@example.com", "hash",
	).Scan(&id)
	require.NoError(t, err)
	return id
}
