package datasource

import (
	"errors"
	"testing"
)

type managementPolicyStub struct {
	allowed bool
	err     error
}

func (p managementPolicyStub) HasPermission(_ int64, permission string) (bool, error) {
	if permission != "home.manage" {
		return false, errors.New("unexpected permission")
	}
	return p.allowed, p.err
}

func TestRequireManageFailsClosed(t *testing.T) {
	tests := []struct {
		name    string
		service *Service
		actorID int64
	}{
		{name: "missing service", service: nil, actorID: 1},
		{name: "missing policy", service: NewService(nil), actorID: 1},
		{name: "missing actor", service: NewService(nil, managementPolicyStub{allowed: true})},
		{name: "denied", service: NewService(nil, managementPolicyStub{}), actorID: 1},
		{name: "lookup failure", service: NewService(nil, managementPolicyStub{err: errors.New("database unavailable")}), actorID: 1},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if !errors.Is(test.service.RequireManage(test.actorID), ErrManagementForbidden) {
				t.Fatal("expected datasource management to be denied")
			}
		})
	}
}

func TestRequireManageAllowsHomeManager(t *testing.T) {
	service := NewService(nil, managementPolicyStub{allowed: true})
	if err := service.RequireManage(7); err != nil {
		t.Fatalf("RequireManage() error = %v", err)
	}
}
