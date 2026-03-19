package auth

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

// HashPassword generates a bcrypt hash at cost 12.
func HashPassword(password string) (string, error) {
	if len(password) < 8 {
		return "", errors.New("password must be at least 8 characters")
	}
	if len(password) > 72 {
		return "", errors.New("password must be at most 72 characters")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

// HashPasswordUnchecked generates a bcrypt hash without enforcing minimum length.
// Used for admin seed passwords set via environment variables.
func HashPasswordUnchecked(password string) (string, error) {
	if len(password) > 72 {
		return "", errors.New("password must be at most 72 characters")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

// ComparePassword checks if the provided password matches the hash.
func ComparePassword(hashedPassword, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)) == nil
}
