package ratelimit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/skaia/backend/config" // replace with your actual Go module path
)

// cfClient is a minimal Cloudflare Access Rules client.
// It pushes IP blocks to Cloudflare's edge so your Go server stops
// seeing the traffic entirely — the block happens before the TCP handshake.
type cfClient struct {
	accountID string
	apiToken  string
	base      string
	http      *http.Client
}

var cf *cfClient

// InitCloudflare initialises the singleton CF client from environment variables.
// Call this once in main() after loading your env.
//
//	CF_ACCOUNT_ID   — your Cloudflare account ID (from dashboard URL)
//	CF_API_TOKEN    — an API token with Firewall:Edit permission (see setup guide)
func InitCloudflare() {
	accountID := os.Getenv("CF_ACCOUNT_ID")
	apiToken := os.Getenv("CF_API_TOKEN")

	if accountID == "" || apiToken == "" {
		slog.Warn("Cloudflare push disabled — CF_ACCOUNT_ID or CF_API_TOKEN not set")
		return
	}

	cf = &cfClient{
		accountID: accountID,
		apiToken:  apiToken,
		base:      config.RateLimit.CloudflareAPIBase,
		http: &http.Client{
			Timeout: config.RateLimit.CloudflarePushTimeout,
		},
	}
	slog.Info("Cloudflare edge blocking enabled", "account", accountID)
}

// PushBlockAsync fires the Cloudflare IP block in a background goroutine.
// It NEVER blocks the request path — the caller returns a 429 immediately
// while this runs behind the scenes.
//
// Usage:
//
//	jailedCount, _ := ratelimit.JailIP(ctx, rdb, ip)
//	ratelimit.PushBlockAsync(ip, jailedCount)
func PushBlockAsync(ip string, jailedCount int64) {
	if cf == nil {
		return // CF push not configured — skip silently
	}

	go func() {
		ctx, cancel := context.WithTimeout(
			context.Background(),
			config.RateLimit.CloudflarePushTimeout,
		)
		defer cancel()

		if err := cf.blockIP(ctx, ip); err != nil {
			slog.Error("CF push failed",
				"ip", ip,
				"jailed_total", jailedCount,
				"err", err,
			)
			return
		}
		slog.Info("CF edge block pushed",
			"ip", ip,
			"jailed_total", jailedCount,
		)
	}()
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Access Rules API
// ─────────────────────────────────────────────────────────────────────────────

type cfAccessRuleRequest struct {
	Mode          string            `json:"mode"`
	Configuration cfIPConfiguration `json:"configuration"`
	Notes         string            `json:"notes"`
}

type cfIPConfiguration struct {
	Target string `json:"target"`
	Value  string `json:"value"`
}

type cfResponse struct {
	Success bool              `json:"success"`
	Errors  []cfResponseError `json:"errors"`
}

type cfResponseError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// blockIP calls the Cloudflare Account-level Firewall Access Rules API to
// block a single IP at the edge. The block applies to ALL zones in your
// account — matching how Cloudflare recommends handling botnet IPs.
//
// API reference:
// https://developers.cloudflare.com/api/operations/account-level-firewall-access-rule-new-rule
func (c *cfClient) blockIP(ctx context.Context, ip string) error {
	body := cfAccessRuleRequest{
		Mode: "block",
		Configuration: cfIPConfiguration{
			Target: "ip",
			Value:  ip,
		},
		Notes: fmt.Sprintf(
			"Auto-blocked by DEFCON rate limiter at %s",
			time.Now().UTC().Format(time.RFC3339),
		),
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	url := fmt.Sprintf(
		"%s/accounts/%s/firewall/access_rules/rules",
		c.base,
		c.accountID,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("http do: %w", err)
	}
	defer resp.Body.Close()

	var cfResp cfResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}

	if !cfResp.Success {
		if len(cfResp.Errors) > 0 {
			e := cfResp.Errors[0]
			// Code 10009 = "The rule already exists" — not an error for us.
			if e.Code == 10009 {
				return nil
			}
			return fmt.Errorf("CF API error %d: %s", e.Code, e.Message)
		}
		return fmt.Errorf("CF API returned success=false with no error detail")
	}

	return nil
}
