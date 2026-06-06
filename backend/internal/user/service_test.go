package user

import (
	"errors"
	"testing"

	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewDistinctSuperuserDemotionVoteRejectsSelfVote(t *testing.T) {
	svc := NewService(&fakeUserRepo{}, &Cache{})

	status, err := svc.NewDistinctSuperuserDemotionVote(42, 42)

	require.ErrorIs(t, err, ErrSelfSuperuserDemotionVote)
	assert.Nil(t, status)
}

func TestNewDistinctSuperuserDemotionVoteRemovesOnlySuperuserRole(t *testing.T) {
	repo := &fakeUserRepo{
		users: map[int64]*models.User{
			7: {
				ID:          7,
				Roles:       []string{"member", "superuser"},
				Permissions: []string{"custom.permission"},
			},
		},
		nextStatus: &SuperuserDemotionStatus{
			Votes:     3,
			Total:     5,
			Threshold: 3,
			Demoted:   true,
		},
	}
	svc := NewService(repo, &Cache{})

	status, err := svc.NewDistinctSuperuserDemotionVote(1, 7)

	require.NoError(t, err)
	require.NotNil(t, status)
	assert.True(t, status.Demoted)
	assert.Equal(t, []string{"superuser"}, repo.removedRoles[7])
	assert.Empty(t, repo.removedPermissions, "direct permissions must survive superuser demotion")
	assert.Equal(t, []string{"member"}, repo.users[7].Roles)
	assert.Equal(t, []string{"custom.permission"}, repo.users[7].Permissions)
}

func TestNewDistinctSuperuserDemotionVoteRecordsVoteWithoutDemotion(t *testing.T) {
	repo := &fakeUserRepo{
		users: map[int64]*models.User{
			7: {ID: 7, Roles: []string{"member", "superuser"}},
		},
		nextStatus: &SuperuserDemotionStatus{
			Votes:     1,
			Total:     5,
			Threshold: 3,
			Demoted:   false,
		},
	}
	svc := NewService(repo, &Cache{})

	status, err := svc.NewDistinctSuperuserDemotionVote(1, 7)

	require.NoError(t, err)
	require.NotNil(t, status)
	assert.False(t, status.Demoted)
	assert.Empty(t, repo.removedRoles)
	assert.Empty(t, repo.removedPermissions)
	assert.Equal(t, []string{"member", "superuser"}, repo.users[7].Roles)
}

type fakeUserRepo struct {
	users              map[int64]*models.User
	nextStatus         *SuperuserDemotionStatus
	removedRoles       map[int64][]string
	removedPermissions map[int64][]string
}

func (r *fakeUserRepo) GetByID(id int64) (*models.User, error) {
	if r.users == nil {
		return nil, errors.New("user not found")
	}
	u, ok := r.users[id]
	if !ok {
		return nil, errors.New("user not found")
	}
	return u, nil
}

func (r *fakeUserRepo) NewDistinctSuperuserDemotionVote(actorID, targetID int64) (*SuperuserDemotionStatus, error) {
	return r.GetSuperuserDemotionStatus(targetID)
}

func (r *fakeUserRepo) GetSuperuserDemotionStatus(targetID int64) (*SuperuserDemotionStatus, error) {
	if r.nextStatus == nil {
		return &SuperuserDemotionStatus{Votes: 1, Total: 3, Threshold: 2}, nil
	}
	return r.nextStatus, nil
}

func (r *fakeUserRepo) RemoveRoleByName(userID int64, roleName string) error {
	if r.removedRoles == nil {
		r.removedRoles = make(map[int64][]string)
	}
	r.removedRoles[userID] = append(r.removedRoles[userID], roleName)
	u, err := r.GetByID(userID)
	if err != nil {
		return err
	}
	filtered := u.Roles[:0]
	for _, role := range u.Roles {
		if role != roleName {
			filtered = append(filtered, role)
		}
	}
	u.Roles = filtered
	return nil
}

func (r *fakeUserRepo) RemovePermission(userID int64, permissionName string) error {
	if r.removedPermissions == nil {
		r.removedPermissions = make(map[int64][]string)
	}
	r.removedPermissions[userID] = append(r.removedPermissions[userID], permissionName)
	return nil
}

func (r *fakeUserRepo) GetByUsername(username string) (*models.User, error) { return nil, nil }
func (r *fakeUserRepo) GetByEmail(email string) (*models.User, error)       { return nil, nil }
func (r *fakeUserRepo) Create(user *models.User, passwordHash string) (*models.User, error) {
	return user, nil
}
func (r *fakeUserRepo) Update(user *models.User) (*models.User, error) { return user, nil }
func (r *fakeUserRepo) Delete(id int64) error                          { return nil }
func (r *fakeUserRepo) List(limit, offset int) ([]*models.User, error) { return nil, nil }
func (r *fakeUserRepo) Search(query string, limit, offset int) ([]*models.User, error) {
	return nil, nil
}
func (r *fakeUserRepo) AddRole(userID, roleID int64) error                { return nil }
func (r *fakeUserRepo) RemoveRole(userID, roleID int64) error             { return nil }
func (r *fakeUserRepo) AddRoleByName(userID int64, roleName string) error { return nil }
func (r *fakeUserRepo) GetAllRoles() ([]*models.Role, error)              { return nil, nil }
func (r *fakeUserRepo) HasPermission(userID int64, permission string) (bool, error) {
	return false, nil
}
func (r *fakeUserRepo) AddPermission(userID int64, permissionName string) error { return nil }
func (r *fakeUserRepo) GetAllPermissions() ([]*models.Permission, error)        { return nil, nil }
func (r *fakeUserRepo) GetUserMaxPowerLevel(userID int64) (int, error)          { return 0, nil }
func (r *fakeUserRepo) CreateRole(name, description string, powerLevel int, themeColor, glowColor *string, storageBonus int64) (*models.Role, error) {
	return nil, nil
}
func (r *fakeUserRepo) UpdateRole(id int64, name, description string, powerLevel int, themeColor, glowColor *string, storageBonus int64) (*models.Role, error) {
	return nil, nil
}
func (r *fakeUserRepo) DeleteRole(id int64) error                  { return nil }
func (r *fakeUserRepo) GetRoleByID(id int64) (*models.Role, error) { return nil, nil }
func (r *fakeUserRepo) GetRolePermissions(roleID int64) ([]*models.Permission, error) {
	return nil, nil
}
func (r *fakeUserRepo) GetUsersByRole(roleID int64) ([]*models.User, error) { return nil, nil }
func (r *fakeUserRepo) AddPermissionToRole(roleID int64, permissionName string) error {
	return nil
}
func (r *fakeUserRepo) RemovePermissionFromRole(roleID int64, permissionName string) error {
	return nil
}
func (r *fakeUserRepo) Suspend(userID int64, reason string) error { return nil }
func (r *fakeUserRepo) Unsuspend(userID int64) error              { return nil }

var _ Repository = (*fakeUserRepo)(nil)
