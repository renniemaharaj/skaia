package security

import (
	"errors"
	"testing"
)

type statusPermissionChecker struct {
	allowed bool
	err     error
}

func (c statusPermissionChecker) HasPermission(int64, string) (bool, error) {
	return c.allowed, c.err
}

func TestStatusPolicyFailsClosed(t *testing.T) {
	for _, test := range []struct {
		name    string
		policy  *StatusPolicy
		actorID int64
	}{
		{name: "nil", policy: nil, actorID: 1},
		{name: "missing actor", policy: NewStatusPolicy(statusPermissionChecker{allowed: true})},
		{name: "denied", policy: NewStatusPolicy(statusPermissionChecker{}), actorID: 1},
		{name: "lookup error", policy: NewStatusPolicy(statusPermissionChecker{allowed: true, err: errors.New("db down")}), actorID: 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			if test.policy.RequireStatusOperator(test.actorID) == nil {
				t.Fatal("policy unexpectedly allowed")
			}
		})
	}
	if err := NewStatusPolicy(statusPermissionChecker{allowed: true}).RequireStatusOperator(1); err != nil {
		t.Fatalf("allowed operator denied: %v", err)
	}
}
