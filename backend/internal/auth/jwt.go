package auth

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims represents JWT claims for an authenticated user.
type Claims struct {
	UserID      int64    `json:"user_id"`
	Username    string   `json:"username"`
	Email       string   `json:"email"`
	DisplayName string   `json:"display_name"`
	Roles       []string `json:"roles"`
	Permissions []string `json:"permissions"`
	jwt.RegisteredClaims
}

var jwtSecret []byte

func init() {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		log.Fatal("JWT_SECRET is required")
	}
	jwtSecret = []byte(secret)
}

// GenerateToken creates a JWT access token (15-minute expiration).
func GenerateToken(userID int64, username, email, displayName string, roles []string) (string, error) {
	return GenerateTokenWithExpiration(userID, username, email, displayName, roles, []string{}, 15*time.Minute)
}

// GenerateTokenWithPermissions creates a JWT token including permissions.
func GenerateTokenWithPermissions(userID int64, username, email, displayName string, roles, permissions []string) (string, error) {
	return GenerateTokenWithExpiration(userID, username, email, displayName, roles, permissions, 15*time.Minute)
}

// GenerateRefreshToken creates a JWT refresh token (7-day expiration).
func GenerateRefreshToken(userID int64) (string, error) {
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "skaia-api",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}
	return tokenString, nil
}

// GenerateTokenWithExpiration creates a JWT with custom expiration.
func GenerateTokenWithExpiration(userID int64, username, email, displayName string, roles, permissions []string, expiresIn time.Duration) (string, error) {
	if roles == nil {
		roles = []string{}
	}
	if permissions == nil {
		permissions = []string{}
	}
	claims := Claims{
		UserID:      userID,
		Username:    username,
		Email:       email,
		DisplayName: displayName,
		Roles:       roles,
		Permissions: permissions,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiresIn)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "skaia-api",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}
	return tokenString, nil
}

// ValidateToken parses and validates a JWT token.
func ValidateToken(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("token parsing error: %w", err)
	}
	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}

// RefreshToken generates a new access token from a refresh token.
func RefreshToken(userID int64, username, email, displayName string, roles []string) (string, error) {
	return GenerateToken(userID, username, email, displayName, roles)
}
