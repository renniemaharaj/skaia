package ratelimit

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	latestStats *TelemetryStats
	statsMu     sync.RWMutex
)

type TelemetryStats struct {
	Jailed       int64 `json:"ips_jailed"`
	Tracked      int   `json:"distinct_ips_tracked"`
	Citizens     int   `json:"citizens"`
	LimiterState int   `json:"limiter_state"`
}

// WatchTelemetry starts a background worker that updates telemetry and notifies via a callback.
func WatchTelemetry(ctx context.Context, rdb *redis.Client, onChange func(stats TelemetryStats)) {
	// We only scan at most once per second
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	var pending bool = true

	update := func() {
		stats, err := fetchStats(ctx, rdb)
		if err != nil {
			return
		}

		statsMu.Lock()
		changed := latestStats == nil || *latestStats != stats
		latestStats = &stats
		statsMu.Unlock()

		if changed && onChange != nil {
			onChange(stats)
		}
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-TelemetryTrigger:
			pending = true
		case <-ticker.C:
			if pending {
				update()
				pending = false
			}
		}
	}
}

func fetchStats(ctx context.Context, rdb *redis.Client) (TelemetryStats, error) {
	jailed, _ := JailedCount(ctx, rdb)
	allowance, _ := AdaptiveAllowance(ctx, rdb)

	var cursor uint64
	distinctIPs := make(map[string]bool)
	var citizens int
	for {
		keys, nextCursor, err := rdb.Scan(ctx, cursor, "ip:*", 500).Result()
		if err != nil {
			break
		}
		for _, key := range keys {
			parts := strings.Split(key, ":")
			if len(parts) >= 3 {
				ip := parts[len(parts)-1]
				distinctIPs[ip] = true
				if parts[1] == "trusted" {
					citizens++
				}
			}
		}
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	return TelemetryStats{
		Jailed:       jailed,
		Tracked:      len(distinctIPs),
		Citizens:     citizens,
		LimiterState: allowance,
	}, nil
}

func GetLatestStats() *TelemetryStats {
	statsMu.RLock()
	defer statsMu.RUnlock()
	return latestStats
}
