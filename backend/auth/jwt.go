package auth

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Claims represents JWT claims for an authenticated user
type Claims struct {
	UserID      uuid.UUID `json:"user_id"`
	Username    string    `json:"username"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Roles       []string  `json:"roles"`
	Permissions []string  `json:"permissions"`
	jwt.RegisteredClaims
}

var jwtSecret = []byte(getJWTSecret())

func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "your-secret-key-change-in-production"
	}
	log.Printf("DEBUG AUTH: JWT_SECRET is set to: %s", secret)
	return secret
}

// GenerateToken creates a new JWT access token for a user (24-hour expiration)
func GenerateToken(userID uuid.UUID, username, email, displayName string, roles []string) (string, error) {
	return GenerateTokenWithExpiration(userID, username, email, displayName, roles, []string{}, 24*time.Hour)
}

// GenerateTokenWithPermissions creates a JWT token with permissions
func GenerateTokenWithPermissions(userID uuid.UUID, username, email, displayName string, roles, permissions []string) (string, error) {
	return GenerateTokenWithExpiration(userID, username, email, displayName, roles, permissions, 24*time.Hour)
}

// GenerateRefreshToken creates a new JWT refresh token (7-day expiration)
func GenerateRefreshToken(userID uuid.UUID) (string, error) {
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

// GenerateTokenWithExpiration creates a JWT token with custom expiration
func GenerateTokenWithExpiration(userID uuid.UUID, username, email, displayName string, roles, permissions []string, expiresIn time.Duration) (string, error) {
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

// ValidateToken parses and validates a JWT token
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

// RefreshToken generates a new access token from a refresh token
func RefreshToken(userID uuid.UUID, username, email, displayName string, roles []string) (string, error) {
	return GenerateToken(userID, username, email, displayName, roles)
}
