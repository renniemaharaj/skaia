package auth

import (
	"golang.org/x/crypto/bcrypt"
)

const (
	DefaultBcryptCost = bcrypt.DefaultCost
)

// HashPassword generates a bcrypt hash of the password
func HashPassword(password string) (string, error) {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), DefaultBcryptCost)
	if err != nil {
		return "", err
	}
	return string(hashedPassword), nil
}

// ComparePassword checks if the provided password matches the hash
func ComparePassword(hashedPassword, password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	return err == nil
}
