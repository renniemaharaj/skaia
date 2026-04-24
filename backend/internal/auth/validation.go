package auth

type validator struct {
	password string
	errors   []string
}

func newValidator(password string) *validator {
	return &validator{password: password}
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
