package user

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"
)

// generateTOTPSecret creates a new TOTP secret and otpauth:// URI.
func generateTOTPSecret(accountName string) (secret, uri string, err error) {
	// Generate 20 bytes of entropy (160-bit key per RFC 4226).
	raw := make([]byte, 20)
	if _, err := rand.Read(raw); err != nil {
		return "", "", fmt.Errorf("totp: generate secret: %w", err)
	}
	secret = base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw)
	secret = strings.ToUpper(secret)

	issuer := "Skaia"
	u := url.URL{
		Scheme: "otpauth",
		Host:   "totp",
		Path:   fmt.Sprintf("/%s:%s", issuer, accountName),
	}
	q := u.Query()
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", "6")
	q.Set("period", "30")
	u.RawQuery = q.Encode()

	return secret, u.String(), nil
}

// validateTOTPCode validates a 6-digit TOTP code against the secret.
// It accepts codes within a ±1 time step window (30 seconds each).
func validateTOTPCode(secret, code string) bool {
	if len(code) != 6 {
		return false
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secret))
	if err != nil {
		return false
	}

	now := time.Now().Unix()
	period := int64(30)

	// Check current, previous, and next time steps.
	for _, offset := range []int64{-1, 0, 1} {
		counter := (now / period) + offset
		expected := generateHOTP(key, counter)
		if expected == code {
			return true
		}
	}
	return false
}

// generateHOTP generates a 6-digit HOTP code per RFC 4226.
func generateHOTP(key []byte, counter int64) string {
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(counter))

	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	sum := mac.Sum(nil)

	offset := sum[len(sum)-1] & 0x0f
	code := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	otp := int(code) % int(math.Pow10(6))

	return fmt.Sprintf("%06d", otp)
}
