package security

// StatusPolicy is the centralized fail-closed permission boundary for service
// diagnostics and incident lifecycle mutations.
type StatusPolicy struct{ permissions PermissionChecker }

func NewStatusPolicy(permissions PermissionChecker) *StatusPolicy {
	return &StatusPolicy{permissions: permissions}
}

func (p *StatusPolicy) RequireStatusOperator(actorID int64) error {
	if p == nil || p.permissions == nil || actorID <= 0 {
		return ErrPolicyDenied
	}
	allowed, err := p.permissions.HasPermission(actorID, "admin.general")
	if err != nil || !allowed {
		return ErrPolicyDenied
	}
	return nil
}
