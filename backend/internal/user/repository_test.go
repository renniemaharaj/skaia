package user_test

import (
"testing"

"github.com/skaia/backend/internal/testutil"
"github.com/skaia/backend/internal/user"
"github.com/skaia/backend/models"
"github.com/stretchr/testify/assert"
"github.com/stretchr/testify/require"
)

func TestUserRepository_CreateAndGetByID(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := user.NewRepository(db)

u := &models.User{
Username:    testutil.UniqueStr("alice"),
Email:       testutil.UniqueStr("alice") + "@example.com",
DisplayName: "Alice",
}

created, err := repo.Create(u, "hashedpassword")
require.NoError(t, err)
require.NotZero(t, created.ID)

fetched, err := repo.GetByID(created.ID)
require.NoError(t, err)
assert.Equal(t, created.Username, fetched.Username)
assert.Equal(t, created.Email, fetched.Email)
}

func TestUserRepository_GetByUsername(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := user.NewRepository(db)

name := testutil.UniqueStr("bob")
_, err := repo.Create(&models.User{
Username: name,
Email:    name + "@example.com",
}, "hash")
require.NoError(t, err)

fetched, err := repo.GetByUsername(name)
require.NoError(t, err)
assert.Equal(t, name, fetched.Username)
}

func TestUserRepository_GetByEmail(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := user.NewRepository(db)

name := testutil.UniqueStr("carol")
email := name + "@example.com"
_, err := repo.Create(&models.User{
Username: name,
Email:    email,
}, "hash")
require.NoError(t, err)

fetched, err := repo.GetByEmail(email)
require.NoError(t, err)
assert.Equal(t, email, fetched.Email)
}

func TestUserRepository_Update(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := user.NewRepository(db)

name := testutil.UniqueStr("dave")
created, err := repo.Create(&models.User{
Username: name,
Email:    name + "@example.com",
}, "hash")
require.NoError(t, err)

created.DisplayName = "Dave Updated"
updated, err := repo.Update(created)
require.NoError(t, err)
assert.Equal(t, "Dave Updated", updated.DisplayName)
}

func TestUserRepository_Delete(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := user.NewRepository(db)

name := testutil.UniqueStr("eve")
created, err := repo.Create(&models.User{
Username: name,
Email:    name + "@example.com",
}, "hash")
require.NoError(t, err)

err = repo.Delete(created.ID)
require.NoError(t, err)

_, err = repo.GetByID(created.ID)
require.Error(t, err)
}

func TestUserRepository_List(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := user.NewRepository(db)

for i := 0; i < 3; i++ {
n := testutil.UniqueStr("list_user")
_, err := repo.Create(&models.User{
Username: n,
Email:    n + "@example.com",
}, "hash")
require.NoError(t, err)
}

users, err := repo.List(100, 0)
require.NoError(t, err)
assert.GreaterOrEqual(t, len(users), 3)
}

func TestUserRepository_Search(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := user.NewRepository(db)

unique := testutil.UniqueStr("search_target")
_, err := repo.Create(&models.User{
Username: unique,
Email:    unique + "@example.com",
}, "hash")
require.NoError(t, err)

results, err := repo.Search(unique, 10, 0)
require.NoError(t, err)
require.NotEmpty(t, results)
assert.Equal(t, unique, results[0].Username)
}

func TestUserRepository_HasPermission(t *testing.T) {
db := testutil.OpenTestDB(t)
repo := user.NewRepository(db)

name := testutil.UniqueStr("perm_user")
created, err := repo.Create(&models.User{
Username: name,
Email:    name + "@example.com",
}, "hash")
require.NoError(t, err)

has, err := repo.HasPermission(created.ID, "some.nonexistent.perm")
require.NoError(t, err)
assert.False(t, has)
}
