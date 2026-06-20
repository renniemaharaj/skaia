package redis

import (
	"fmt"
	"regexp"
	"time"

	"goftw/internal/whoiam"
)

type Config struct {
	URL   string
	Debug bool
	Wait  bool
}

// parse host/port from redis://host:port
func parseHostPort(url string) (string, string) {
	re := regexp.MustCompile(`redis://([^:]+):?([0-9]*)`)
	if matches := re.FindStringSubmatch(url); len(matches) == 3 {
		port := matches[2]
		if port == "" {
			port = "6379"
		}
		return matches[1], port
	}
	return "", ""
}

// WaitForRedis waits for one Redis instance
func WaitForRedis(cfg Config) error {
	if !cfg.Wait {
		return nil
	}
	host, port := parseHostPort(cfg.URL)
	if host == "" || port == "" {
		return fmt.Errorf("invalid redis url: %s", cfg.URL)
	}

	fmt.Printf("[REDIS] waiting for Redis at %s:%s...\n", host, port)
	for {
		if _, err := whoiam.ExecRunSwallowIO("redis-cli", "-h", host, "-p", port, "ping"); err == nil {
			fmt.Printf("[REDIS] Redis %s:%s reachable.\n", host, port)
			return nil
		}
		if cfg.Debug {
			fmt.Printf("[REDIS] [%s:%s] waiting...\n", host, port)
		}
		time.Sleep(2 * time.Second)
	}
}
