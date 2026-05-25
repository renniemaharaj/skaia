package auth

import (
	"crypto/rand"
	"errors"
	"math/big"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

// ── Token helpers ─────────────────────────────────────────────────────────

const tokenChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// func generateSecureToken(length int) string {
// 	b := make([]byte, length)
// 	for i := range b {
// 		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(tokenChars))))
// 		b[i] = tokenChars[n.Int64()]
// 	}
// 	return string(b)
// }

func generateBackupCode() string {
	const digits = "0123456789"
	b := make([]byte, 8)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
		b[i] = digits[n.Int64()]
	}
	return string(b[:4]) + "-" + string(b[4:])
}

// BcryptPassword generates a bcrypt hash at cost 12.
func BcryptPassword(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

// ValidatePassword checks if the password meets the defined criteria.
func ValidatePassword(password string) error {
	v := newValidator(password)
	v.minLength(8).maxLength(72).hasUppercase().enforceCharacters().
		hasLowercase().hasDigit().hasFourDigitsInRow()
	if len(v.errors) > 0 {
		return errors.New("invalid password: " + v.errors[0])
	}
	return nil
}

// ComparePassword checks if the provided password matches the hash.
func ComparePassword(hashedPassword, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)) == nil
}
