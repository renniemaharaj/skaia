package auth

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

type validator struct {
	password string
	errors   []string
}

func (v *validator) minLength(l int) *validator {
	if len(v.password) < l {
		v.errors = append(v.errors, "password must be at least 8 characters")
	}
	return v
}

func (v *validator) maxLength(l int) *validator {
	if len(v.password) > l {
		v.errors = append(v.errors, "password must be at most 72 characters")
	}
	return v
}

func (v *validator) hasUppercase() *validator {
	hasUpper := false
	for _, c := range v.password {
		if c >= 'A' && c <= 'Z' {
			hasUpper = true
			break
		}
	}
	if !hasUpper {
		v.errors = append(v.errors, "password must contain at least one uppercase letter")
	}
	return v
}

func (v *validator) hasLowercase() *validator {
	hasLower := false
	for _, c := range v.password {
		if c >= 'a' && c <= 'z' {
			hasLower = true
			break
		}
	}
	if !hasLower {
		v.errors = append(v.errors, "password must contain at least one lowercase letter")
	}
	return v
}

func (v *validator) hasDigit() *validator {
	hasDigit := false
	for _, c := range v.password {
		if c >= '0' && c <= '9' {
			hasDigit = true
			break
		}
	}
	if !hasDigit {
		v.errors = append(v.errors, "password must contain at least one digit")
	}
	return v
}

// check if contains four digits in a row
func (v *validator) hasFourDigitsInRow() *validator {
	count := 0
	for _, c := range v.password {
		if c >= '0' && c <= '9' {
			count++
			if count >= 4 {
				v.errors = append(v.errors, "password must not contain four digits in a row")
				break
			}
		} else {
			count = 0
		}
	}
	return v
}

// enforce password must contain at least one special character
func (v *validator) enforceCharacters() *validator {
	specialCount := 0
	for _, c := range v.password {
		if (c >= '!' && c <= '/') || (c >= ':' && c <= '@') || (c >= '[' && c <= '`') || (c >= '{' && c <= '~') {
			specialCount++
		}
	}
	if specialCount < 1 {
		v.errors = append(v.errors, "password must contain at least one special character")
	}
	return v
}

// HashPassword generates a bcrypt hash at cost 12.
func HashPassword(password string) (string, error) {
	v := &validator{password: password}
	v.minLength(8).maxLength(72).hasUppercase().enforceCharacters().
		hasLowercase().hasDigit().hasFourDigitsInRow()
	if len(v.errors) > 0 {
		return "", errors.New("invalid password: " + v.errors[0])
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
	v := &validator{password: password}
	v.maxLength(72)
	if len(v.errors) > 0 {
		return "", errors.New("invalid password: " + v.errors[0])
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
