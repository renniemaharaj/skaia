package auth

// CtxKey is an unexported type for context keys.
type CtxKey string

const (
	CtxKeyClaims    CtxKey = "claims"
	CtxKeyUserID    CtxKey = "user_id"
	CtxKeyUserRoles CtxKey = "user_roles"
)
