package user_test

import (
"database/sql"
"testing"

"github.com/skaia/backend/internal/testutil"
"github.com/skaia/backend/internal/user"
"github.com/skaia/backend/models"
"github.com/stretchr/testify/assert"
"github.com/stretchr/testify/require"
)

// newUserRepo is a convenience helper used by all extra repository tests.
func newUserRepo(t *testing.T, db *sql.DB) user.Repository {
t.Helper()
return user.NewRepository(db)
}

// ── Roles ─────────────────────────────────────────────────────────────────────

func TestUserRepository_GetAllRoles(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := newUserRepo(t, db)
roles, err := repo.GetAllRoles()
require.NoError(t, err)
assert.GreaterOrEqual(t, len(roles), 1, "at least one role must exist from migrations")
}

func TestUserRepository_AddRoleByName_Then_RemoveRoleByName(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := newUserRepo(t, db)
name := testutil.UniqueStr("rolebynameusr")
u, err := repo.Create(&models.User{Username: name, Email: name + "@example.com"}, "hash")
require.NoError(t, err)
require.NoError(t, repo.AddRoleByName(u.ID, "admin"))
fetched, err := repo.GetByID(u.ID)
require.NoError(t, err)
assert.Contains(t, fetched.Roles, "admin", "admin role must appear after AddRoleByName")
require.NoError(t, repo.RemoveRoleByName(u.ID, "admin"))
fetched2, err := repo.GetByID(u.ID)
require.NoError(t, err)
assert.NotContains(t, fetched2.Roles, "admin", "admin role must be absent after RemoveRoleByName")
}

func TestUserRepository_AddRole_Then_RemoveRole(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := newUserRepo(t, db)
// Resolve the numeric role ID for "admin" using GetAllRoles.
roles, err := repo.GetAllRoles()
require.NoError(t, err)
var adminRoleID int64
for _, r := range roles {
if r.Name == "admin" {
adminRoleID = r.ID
}
}
require.NotZero(t, adminRoleID, "admin role must exist in seed data")
name := testutil.UniqueStr("addrole_usr")
u, err := repo.Create(&models.User{Username: name, Email: name + "@example.com"}, "hash")
require.NoError(t, err)
require.NoError(t, repo.AddRole(u.ID, adminRoleID))
fetched, err := repo.GetByID(u.ID)
require.NoError(t, err)
assert.Contains(t, fetched.Roles, "admin")
require.NoError(t, repo.RemoveRole(u.ID, adminRoleID))
fetched2, err := repo.GetByID(u.ID)
require.NoError(t, err)
assert.NotContains(t, fetched2.Roles, "admin")
}

// ── Permissions ──────────────────────────────────────────────────────────────

func TestUserRepository_GetAllPermissions(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := newUserRepo(t, db)
perms, err := repo.GetAllPermissions()
require.NoError(t, err)
assert.GreaterOrEqual(t, len(perms), 1, "at least one permission must exist from migrations")
}

func TestUserRepository_AddPermission_HasPermission_RemovePermission(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := newUserRepo(t, db)
name := testutil.UniqueStr("perm_rw_usr")
u, err := repo.Create(&models.User{Username: name, Email: name + "@example.com"}, "hash")
require.NoError(t, err)
const permName = "forums.create-category"
// Must not have it initially.
has, err := repo.HasPermission(u.ID, permName)
require.NoError(t, err)
assert.False(t, has)
// Add it.
require.NoError(t, repo.AddPermission(u.ID, permName))
has2, err := repo.HasPermission(u.ID, permName)
require.NoError(t, err)
assert.True(t, has2)
// Remove it.
require.NoError(t, repo.RemovePermission(u.ID, permName))
has3, err := repo.HasPermission(u.ID, permName)
require.NoError(t, err)
assert.False(t, has3)
}

// ── Suspension ────────────────────────────────────────────────────────────────

func TestUserRepository_Suspend_And_Unsuspend(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := newUserRepo(t, db)
name := testutil.UniqueStr("suspend_usr")
u, err := repo.Create(&models.User{Username: name, Email: name + "@example.com"}, "hash")
require.NoError(t, err)
assert.False(t, u.IsSuspended)
// Suspend.
require.NoError(t, repo.Suspend(u.ID, "test suspension reason"))
fetched, err := repo.GetByID(u.ID)
require.NoError(t, err)
assert.True(t, fetched.IsSuspended)
require.NotNil(t, fetched.SuspendedReason)
assert.Equal(t, "test suspension reason", *fetched.SuspendedReason)
// Unsuspend.
require.NoError(t, repo.Unsuspend(u.ID))
fetched2, err := repo.GetByID(u.ID)
require.NoError(t, err)
assert.False(t, fetched2.IsSuspended)
}

// ── Edge cases ────────────────────────────────────────────────────────────────

func TestUserRepository_UpdatePreservesEmail(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := newUserRepo(t, db)
name := testutil.UniqueStr("emailpreserve")
email := name + "@example.com"
u, err := repo.Create(&models.User{Username: name, Email: email}, "hash")
require.NoError(t, err)
u.DisplayName = "New Display Name"
updated, err := repo.Update(u)
require.NoError(t, err)
assert.Equal(t, email, updated.Email)
}

func TestUserRepository_SearchEmpty_ReturnsEmptySlice(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := newUserRepo(t, db)
results, err := repo.Search("zzz_no_one_has_this_name_xyz_99999", 10, 0)
require.NoError(t, err)
assert.Empty(t, results)
}

func TestUserRepository_ListPagination(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := newUserRepo(t, db)
for i := 0; i < 5; i++ {
n := testutil.UniqueStr("paguser")
_, err := repo.Create(&models.User{Username: n, Email: n + "@example.com"}, "hash")
require.NoError(t, err)
}
page1, err := repo.List(3, 0)
require.NoError(t, err)
assert.LessOrEqual(t, len(page1), 3)
page2, err := repo.List(3, 3)
require.NoError(t, err)
ids1 := make(map[int64]bool)
for _, u := range page1 {
ids1[u.ID] = true
}
for _, u := range page2 {
assert.False(t, ids1[u.ID], "user %d appeared on both pages", u.ID)
}
}
