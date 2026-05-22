package ctx

import (
	"context"

	"github.com/skaia/backend/internal/jwt"
)

type contextKey string

const (
	CtxKeyClaims    contextKey = "claims"
	CtxKeyUserID    contextKey = "userID"
	CtxKeyUserRoles contextKey = "userRoles"
)

func WithClaims(ctx context.Context, claims *jwt.Claims) context.Context {
	return context.WithValue(ctx, CtxKeyClaims, claims)
}

func GetClaims(ctx context.Context) (*jwt.Claims, bool) {
	claims, ok := ctx.Value(CtxKeyClaims).(*jwt.Claims)
	return claims, ok
}
