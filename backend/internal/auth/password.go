package auth

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

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
