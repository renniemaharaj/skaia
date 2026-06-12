package middleware

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"log/slog"

	"github.com/redis/go-redis/v9"

	"github.com/skaia/backend/internal/auth"
	"github.com/skaia/backend/internal/jwt"
	"github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/ratelimit"
)

// DEFCONRateLimit returns an http.Handler middleware that enforces adaptive
// three-tier rate limiting using Redis.
//
// Drop it into any standard net/http chain:
//
//	mux := http.NewServeMux()
//	mux.Handle("/", middleware.DEFCONRateLimit(rdb, userSvc, authSvc)(yourHandler))
func DEFCONRateLimit(rdb *redis.Client, userSvc *user.Service, authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			ip := realIP(r)

			//  Step 1: Jail check
			jailed, err := ratelimit.IsJailed(ctx, rdb, ip)
			if err != nil {
				slog.Error("jail check failed", "ip", ip, "err", err)
			}
			if jailed {
				if userSvc != nil && authSvc != nil {
					eligible, promoted := tryTOTPPromotion(r, userSvc, authSvc, rdb, ip)
					if promoted {
						slog.Info("IP broke out of jail via TOTP", "ip", ip)
						next.ServeHTTP(w, r)
						return
					}
					if eligible {
						writeTooManyRequests(w, ratelimit.WindowRemaining(ctx, rdb, ip), true)
						return
					}
				}
				writeTooManyRequests(w, ratelimit.WindowRemaining(ctx, rdb, ip), false)
				return
			}

			//  Step 2: Trusted citizen check
			trusted, err := ratelimit.IsTrusted(ctx, rdb, ip)
			if err != nil {
				slog.Error("trusted check failed", "ip", ip, "err", err)
			}
			if trusted {
				over, err := ratelimit.CheckTrustedLimit(ctx, rdb, ip)
				if err != nil {
					slog.Error("trusted limit check failed", "ip", ip, "err", err)
				}
				if over {
					if userSvc != nil && authSvc != nil {
						eligible, promoted := tryTOTPPromotion(r, userSvc, authSvc, rdb, ip)
						if promoted {
							slog.Info("Trusted IP re-promoted via TOTP", "ip", ip)
							next.ServeHTTP(w, r)
							return
						}
						if eligible {
							writeTooManyRequests(w, time.Minute, true)
							return
						}
					}
					count, jailErr := ratelimit.JailIP(ctx, rdb, ip)
					if jailErr != nil {
						slog.Error("jail write failed", "ip", ip, "err", jailErr)
					}
					ratelimit.PushBlockAsync(ip, count)
					writeTooManyRequests(w, time.Minute, false)
					return
				}
				next.ServeHTTP(w, r)
				return
			}

			//  Step 3: Purgatory — adaptive allowance
			allowance, err := ratelimit.AdaptiveAllowance(ctx, rdb)
			if err != nil {
				slog.Error("allowance compute failed", "ip", ip, "err", err)
			}

			count, over, err := ratelimit.CheckAndCount(ctx, rdb, ip, allowance)
			if err != nil {
				slog.Error("counter failed", "ip", ip, "err", err)
			}

			if over {
				if userSvc != nil && authSvc != nil {
					eligible, promoted := tryTOTPPromotion(r, userSvc, authSvc, rdb, ip)
					if promoted {
						slog.Info("Purgatory IP promoted via TOTP", "ip", ip)
						next.ServeHTTP(w, r)
						return
					}
					if eligible {
						writeTooManyRequests(w, ratelimit.WindowRemaining(ctx, rdb, ip), true)
						return
					}
				}
				jailedCount, jailErr := ratelimit.JailIP(ctx, rdb, ip)
				if jailErr != nil {
					slog.Error("jail write failed", "ip", ip, "err", jailErr)
				}
				ratelimit.PushBlockAsync(ip, jailedCount)

				slog.Warn("IP jailed",
					"ip", ip,
					"requests_this_window", count,
					"adaptive_allowance", allowance,
					"total_jailed", jailedCount,
				)
				writeTooManyRequests(w, ratelimit.WindowRemaining(ctx, rdb, ip), false)
				return
			}

			//  Step 4: Graduation check
			graduated, err := ratelimit.RecordCleanRequest(ctx, rdb, ip)
			if err != nil {
				slog.Error("graduation record failed", "ip", ip, "err", err)
			}
			if graduated {
				if promoteErr := ratelimit.PromoteToTrusted(ctx, rdb, ip); promoteErr != nil {
					slog.Error("promotion failed", "ip", ip, "err", promoteErr)
				} else {
					slog.Info("IP graduated to trusted", "ip", ip)
				}
			}

			//  All checks passed — forward the request
			next.ServeHTTP(w, r)
		})
	}
}

// tryTOTPPromotion handles the logic for a 2FA challenge when rate-limited
func tryTOTPPromotion(r *http.Request, userSvc *user.Service, authSvc *auth.Service, rdb *redis.Client, ip string) (bool, bool) {
	tokenStr := ""
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && parts[0] == "Bearer" {
			tokenStr = parts[1]
		}
	}
	if tokenStr == "" {
		tokenStr = r.URL.Query().Get("token")
	}
	if tokenStr == "" {
		return false, false
	}

	claims, err := jwt.ValidateToken(tokenStr)
	if err != nil {
		return false, false
	}

	powerLevel, err := userSvc.GetUserMaxPowerLevel(claims.UserID)
	if err != nil || powerLevel <= 10 {
		return false, false
	}

	_, enabled, err := authSvc.GetTOTPEnabled(r.Context(), claims.UserID)
	if err != nil || !enabled {
		return false, false
	}

	totpCode := r.Header.Get("X-TOTP-Code")
	if totpCode != "" {
		valid, _ := authSvc.VerifyTOTP(r.Context(), claims.UserID, totpCode)
		if valid {
			_ = ratelimit.PromoteToTrusted(r.Context(), rdb, ip)
			_ = rdb.Del(r.Context(), "ip:jailed:"+ip).Err()
			return true, true
		}
	}

	return true, false
}

// realIP extracts the true client IP from the request.
func realIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		for i := 0; i < len(ip); i++ {
			if ip[i] == ',' {
				return ip[:i]
			}
		}
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// writeTooManyRequests writes a 429 response with standard rate-limit headers.
func writeTooManyRequests(w http.ResponseWriter, retryAfter time.Duration, challenge bool) {
	seconds := int(retryAfter.Seconds())
	if seconds < 1 {
		seconds = 60
	}
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	w.Header().Set("X-RateLimit-Reason", "adaptive-defcon")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	
	if challenge {
		_, _ = w.Write([]byte(`{"error":"rate limit exceeded","challenge":"totp","retry_after":` + strconv.Itoa(seconds) + `}`))
	} else {
		_, _ = w.Write([]byte(`{"error":"rate limit exceeded","retry_after":` + strconv.Itoa(seconds) + `}`))
	}
}
