package forum_test

import (
"testing"

"github.com/skaia/backend/internal/forum"
"github.com/skaia/backend/internal/testutil"
"github.com/skaia/backend/models"
"github.com/stretchr/testify/assert"
"github.com/stretchr/testify/require"
)

// ── CategoryRepository extra ──────────────────────────────────────────────────

func TestCategoryRepository_GetByName(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := forum.NewCategoryRepository(db)
name := testutil.UniqueStr("by_name_cat")
cat, err := repo.Create(&models.ForumCategory{Name: name, Description: "desc"})
require.NoError(t, err)
fetched, err := repo.GetByName(name)
require.NoError(t, err)
assert.Equal(t, cat.ID, fetched.ID)
assert.Equal(t, name, fetched.Name)
}

func TestCategoryRepository_Update(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := forum.NewCategoryRepository(db)
name := testutil.UniqueStr("update_cat")
cat, err := repo.Create(&models.ForumCategory{Name: name})
require.NoError(t, err)
cat.Description = "Updated description"
updated, err := repo.Update(cat)
require.NoError(t, err)
assert.Equal(t, "Updated description", updated.Description)
// Verify persistence.
fetched, err := repo.GetByID(cat.ID)
require.NoError(t, err)
assert.Equal(t, "Updated description", fetched.Description)
}

// ── ThreadRepository extra ────────────────────────────────────────────────────

func TestThreadRepository_Update(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("upd_tcat")})
thread, err := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("original"), Content: "original content",
})
require.NoError(t, err)
thread.Title = "Updated title"
thread.Content = "Updated content"
updated, err := threadRepo.Update(thread)
require.NoError(t, err)
assert.Equal(t, "Updated title", updated.Title)
assert.Equal(t, "Updated content", updated.Content)
// Verify persistence.
fetched, err := threadRepo.GetByID(thread.ID)
require.NoError(t, err)
assert.Equal(t, "Updated content", fetched.Content)
}

func TestThreadRepository_Delete(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("del_tcat")})
thread, err := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("to_delete"), Content: "going away",
})
require.NoError(t, err)
require.NoError(t, threadRepo.Delete(thread.ID))
_, err = threadRepo.GetByID(thread.ID)
require.Error(t, err, "deleted thread must not be retrievable")
}

func TestThreadRepository_GetByUser(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("byusr_cat")})
for i := 0; i < 3; i++ {
_, err := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("user_thread"), Content: "by user",
})
require.NoError(t, err)
}
threads, err := threadRepo.GetByUser(uid, 10, 0)
require.NoError(t, err)
assert.Len(t, threads, 3)
for _, th := range threads {
assert.Equal(t, uid, th.UserID)
}
}

func TestThreadRepository_GetByUser_Pagination(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("pag_ucat")})
for i := 0; i < 5; i++ {
_, err := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("pag_thread"), Content: "page test",
})
require.NoError(t, err)
}
page1, err := threadRepo.GetByUser(uid, 2, 0)
require.NoError(t, err)
assert.Len(t, page1, 2)
page2, err := threadRepo.GetByUser(uid, 2, 2)
require.NoError(t, err)
assert.Len(t, page2, 2)
// Pages must be disjoint.
ids := make(map[int64]bool)
for _, th := range page1 {
ids[th.ID] = true
}
for _, th := range page2 {
assert.False(t, ids[th.ID], "thread %d appeared on both pages", th.ID)
}
}

func TestThreadRepository_IncrementViewCount(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("vc_cat")})
thread, err := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("viewcount"), Content: "view test",
})
require.NoError(t, err)
require.Equal(t, 0, thread.ViewCount)
require.NoError(t, threadRepo.IncrementViewCount(thread.ID))
fetched, err := threadRepo.GetByID(thread.ID)
require.NoError(t, err)
assert.Equal(t, 1, fetched.ViewCount)
require.NoError(t, threadRepo.IncrementViewCount(thread.ID))
fetched2, err := threadRepo.GetByID(thread.ID)
require.NoError(t, err)
assert.Equal(t, 2, fetched2.ViewCount)
}

func TestThreadRepository_IsLikedByUser_WhenNotLiked(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("notliked_cat")})
thread, _ := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("notliked"), Content: "x",
})
liked, err := threadRepo.IsLikedByUser(thread.ID, uid)
require.NoError(t, err)
assert.False(t, liked, "thread must not be liked by default")
}

func TestThreadRepository_LikeIdempotent(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("idem_cat")})
thread, _ := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("idem_like"), Content: "x",
})
// Like twice — ON CONFLICT DO NOTHING means count stays at 1.
count1, err := threadRepo.Like(thread.ID, uid)
require.NoError(t, err)
assert.EqualValues(t, 1, count1)
count2, err := threadRepo.Like(thread.ID, uid)
require.NoError(t, err)
assert.EqualValues(t, 1, count2, "duplicate like must not increment count beyond 1")
}

// ── CommentRepository extra ───────────────────────────────────────────────────

func TestCommentRepository_GetByThread(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
commentRepo := forum.NewCommentRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("gbt_cat")})
thread, _ := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("gbt_thread"), Content: "x",
})
for i := 0; i < 4; i++ {
_, err := commentRepo.Create(&models.ThreadComment{
ThreadID: thread.ID, UserID: uid,
Content: "comment content",
})
require.NoError(t, err)
}
comments, err := commentRepo.GetByThread(thread.ID, 10, 0)
require.NoError(t, err)
assert.Len(t, comments, 4)
for _, c := range comments {
assert.Equal(t, thread.ID, c.ThreadID)
}
}

func TestCommentRepository_GetByThread_Pagination(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
commentRepo := forum.NewCommentRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("cpag_cat")})
thread, _ := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("cpag_thread"), Content: "x",
})
for i := 0; i < 5; i++ {
_, err := commentRepo.Create(&models.ThreadComment{
ThreadID: thread.ID, UserID: uid, Content: "pag comment",
})
require.NoError(t, err)
}
p1, err := commentRepo.GetByThread(thread.ID, 2, 0)
require.NoError(t, err)
assert.Len(t, p1, 2)
p2, err := commentRepo.GetByThread(thread.ID, 2, 2)
require.NoError(t, err)
assert.Len(t, p2, 2)
ids := make(map[int64]bool)
for _, c := range p1 {
ids[c.ID] = true
}
for _, c := range p2 {
assert.False(t, ids[c.ID], "comment %d on both pages", c.ID)
}
}

func TestCommentRepository_Update(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
commentRepo := forum.NewCommentRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("updc_cat")})
thread, _ := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("updc_thread"), Content: "x",
})
comment, err := commentRepo.Create(&models.ThreadComment{
ThreadID: thread.ID, UserID: uid, Content: "original comment",
})
require.NoError(t, err)
comment.Content = "updated comment"
updated, err := commentRepo.Update(comment)
require.NoError(t, err)
assert.Equal(t, "updated comment", updated.Content)
fetched, err := commentRepo.GetByID(comment.ID)
require.NoError(t, err)
assert.Equal(t, "updated comment", fetched.Content)
}

func TestCommentRepository_LikeUnlike(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
commentRepo := forum.NewCommentRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("cl_cat")})
thread, _ := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("cl_thread"), Content: "x",
})
comment, err := commentRepo.Create(&models.ThreadComment{
ThreadID: thread.ID, UserID: uid, Content: "likeable comment",
})
require.NoError(t, err)
// Like.
count, err := commentRepo.Like(comment.ID, uid)
require.NoError(t, err)
assert.EqualValues(t, 1, count)
liked, err := commentRepo.IsLikedByUser(comment.ID, uid)
require.NoError(t, err)
assert.True(t, liked)
// Unlike.
count2, err := commentRepo.Unlike(comment.ID, uid)
require.NoError(t, err)
assert.EqualValues(t, 0, count2)
liked2, err := commentRepo.IsLikedByUser(comment.ID, uid)
require.NoError(t, err)
assert.False(t, liked2)
}

func TestCommentRepository_IsLikedByUser_WhenNotLiked(t *testing.T) {
db := testutil.OpenTestDB(t)
catRepo := forum.NewCategoryRepository(db)
threadRepo := forum.NewThreadRepository(db)
commentRepo := forum.NewCommentRepository(db)
uid := createTestUser(t, db)
cat, _ := catRepo.Create(&models.ForumCategory{Name: testutil.UniqueStr("cnl_cat")})
thread, _ := threadRepo.Create(&models.ForumThread{
CategoryID: cat.ID, UserID: uid,
Title: testutil.UniqueStr("cnl_thread"), Content: "x",
})
comment, _ := commentRepo.Create(&models.ThreadComment{
ThreadID: thread.ID, UserID: uid, Content: "not liked",
})
liked, err := commentRepo.IsLikedByUser(comment.ID, uid)
require.NoError(t, err)
assert.False(t, liked)
}
