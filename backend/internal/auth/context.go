package auth

// CtxKey is an unexported type used for context keys to prevent collisions
// with keys from other packages.
type CtxKey string

const (
	// CtxKeyClaims is the context key for the parsed *Claims value.
	CtxKeyClaims CtxKey = "claims"
	// CtxKeyUserID is the context key for the authenticated user's int64 ID.
	CtxKeyUserID CtxKey = "user_id"
	// CtxKeyUserRoles is the context key for the authenticated user's roles slice.
	CtxKeyUserRoles CtxKey = "user_roles"
)
