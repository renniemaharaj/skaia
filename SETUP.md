# DEFCON Adaptive Rate Limiter — Setup Guide

## 1. Cloudflare API token (5 minutes)

You need a token with **Firewall: Edit** permission scoped to your account.

1. Go to **dash.cloudflare.com => My Profile => API Tokens**
2. Click **Create Token**
3. Click **Get started** next to *Create custom token*
4. Fill in:
   - Token name: `defcon-ratelimiter` (or anything)
   - Permissions:
     - Resource: **Account**
     - Service: **Account Firewall Access Rules**
     - Permission: **Edit**
   - Account Resources: **Include => [your account]**
   - *(Optional but recommended)* Client IP Address Filtering: lock it to your
     server's outbound IP so the token is useless if it leaks
5. Click **Continue to summary => Create token**
6. **Copy the token now** — Cloudflare only shows it once.

Your Account ID is in the URL of your Cloudflare dashboard:
`https://dash.cloudflare.com/<YOUR_ACCOUNT_ID>/...`

Set both as environment variables on your server:

```bash
export CF_ACCOUNT_ID="abc123..."
export CF_API_TOKEN="your-token-here"
```

For production, store these in your secrets manager (AWS Secrets Manager,
Vault, Doppler, etc.) — never commit them to source control.

---

## 2. Go dependencies

```bash
go get github.com/redis/go-redis/v9
```

That's the only new dependency. The standard library handles everything else.

---

## 3. Replace the module path

Search every file for `yourmodule` and replace with your actual Go module name
(the value in your `go.mod` `module` line).

---

## 4. Wire it into your server

```go
package main

import (
    "context"
    "log/slog"
    "net/http"
    "os"

    "github.com/redis/go-redis/v9"

    "yourmodule/middleware"
    "yourmodule/ratelimit"
)

func main() {
    //  Redis client 
    // Assumes skaia-redis is reachable at REDIS_URL (e.g. "redis://localhost:6379")
    // or falls back to localhost.
    redisURL := os.Getenv("REDIS_URL")
    if redisURL == "" {
        redisURL = "redis://localhost:6379"
    }

    opt, err := redis.ParseURL(redisURL)
    if err != nil {
        slog.Error("invalid REDIS_URL", "err", err)
        os.Exit(1)
    }

    rdb := redis.NewClient(opt)
    if err := rdb.Ping(context.Background()).Err(); err != nil {
        slog.Error("redis unreachable", "err", err)
        os.Exit(1)
    }
    slog.Info("Redis connected", "url", redisURL)

    //  Cloudflare (optional but recommended) 
    ratelimit.InitCloudflare() // reads CF_ACCOUNT_ID and CF_API_TOKEN from env

    //  Routes 
    mux := http.NewServeMux()
    mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("OK"))
    })

    //  Apply the DEFCON middleware to your entire router 
    handler := middleware.DEFCONRateLimit(rdb)(mux)

    slog.Info("Server listening", "addr", ":8080")
    if err := http.ListenAndServe(":8080", handler); err != nil {
        slog.Error("server error", "err", err)
        os.Exit(1)
    }
}
```

---

## 5. Expected Redis key layout

| Key pattern          | Type   | TTL           | Purpose                            |
|----------------------|--------|---------------|------------------------------------|
| `ip:jailed:{IP}`     | String | 15 min        | Blocked IP                         |
| `ip:trusted:{IP}`    | String | 24h (sliding) | Graduated citizen                  |
| `ip:history:{IP}`    | String | 10 min        | Clean-request graduation counter   |
| `ip:counter:{IP}`    | String | 1 min         | Sliding-window rate counter        |

All keys garbage-collect themselves via TTL — no background cleanup job needed.

---

## 6. Tuning the knobs

All constants live in `config/ratelimit.go`. The most impactful ones:

| Constant             | Default | Effect                                                  |
|----------------------|---------|---------------------------------------------------------|
| `PenaltyFactor`      | 0.05    | Higher = harsher throttle per jailed IP                 |
| `MinFloorPerMin`     | 20      | Lower = stricter during attacks; never set to 0         |
| `GraduationRequests` | 50      | Higher = harder for bots to fake trust                  |
| `JailTTL`            | 15 min  | Longer = slower recovery for IPs that mis-fire once     |
| `TrustedTTL`         | 24h     | Longer = better UX; shorter = stale trust expires faster|

---

## 7. Monitoring recommendations

Log the `jailed_total` field from the jail log line — a sudden spike means
a botnet attack is in progress. Alert if it crosses, say, 100 jailed IPs
in a 5-minute window.

The `X-RateLimit-Reason: adaptive-defcon` response header on 429s lets you
easily filter rate-limit traffic in your access logs.
