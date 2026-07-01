package livekit

import (
	"encoding/base64"
	"errors"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Config struct {
	APIKey    string
	APISecret string
	URL       string
}

type VideoGrant struct {
	RoomJoin     bool   `json:"roomJoin"`
	Room         string `json:"room"`
	CanPublish   bool   `json:"canPublish"`
	CanSubscribe bool   `json:"canSubscribe"`
}

type AccessTokenClaims struct {
	Name  string      `json:"name,omitempty"`
	Video *VideoGrant `json:"video,omitempty"`
	jwt.RegisteredClaims
}

func LoadConfig() Config {
	return Config{
		APIKey:    strings.TrimSpace(os.Getenv("LIVEKIT_API_KEY")),
		APISecret: strings.TrimSpace(os.Getenv("LIVEKIT_API_SECRET")),
		URL:       strings.TrimRight(strings.TrimSpace(os.Getenv("LIVEKIT_URL")), "/"),
	}
}

func (c Config) Enabled() bool {
	return c.APIKey != "" && c.APISecret != "" && c.URL != ""
}

func RoomNameForRoute(route string) string {
	normalized := strings.TrimSpace(route)
	if normalized == "" {
		normalized = "/"
	}
	return "route_" + base64.RawURLEncoding.EncodeToString([]byte(normalized))
}

func MintRoomToken(cfg Config, route string, identity string, name string, ttl time.Duration) (string, error) {
	if !cfg.Enabled() {
		return "", errors.New("livekit is not configured")
	}
	if strings.TrimSpace(identity) == "" {
		return "", errors.New("identity is required")
	}
	if ttl <= 0 {
		ttl = time.Hour
	}

	now := time.Now()
	claims := AccessTokenClaims{
		Name: name,
		Video: &VideoGrant{
			RoomJoin:     true,
			Room:         RoomNameForRoute(route),
			CanPublish:   true,
			CanSubscribe: true,
		},
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    cfg.APIKey,
			Subject:   identity,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now.Add(-5 * time.Second)),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.APISecret))
}
