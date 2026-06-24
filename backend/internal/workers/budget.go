package workers

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
)

// Domain definitions
const (
	DomainWS           = "ws"
	DomainEvents       = "events"
	DomainDSCompile    = "ds_compile"
	DomainDSExecute    = "ds_execute"
	DomainMediaScraper = "media_scraper"
	DomainProvisioning = "provisioning"
)

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func getSystemMemoryMB() int {
	// Try env override first
	if v := getEnvInt("SYSTEM_MEMORY_MB", 0); v > 0 {
		return v
	}

	// Try to read /proc/meminfo on Linux
	file, err := os.Open("/proc/meminfo")
	if err == nil {
		defer file.Close()
		scanner := bufio.NewScanner(file)
		if scanner.Err() != nil {
			return 2048
		}
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "MemTotal:") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					if kb, err := strconv.Atoi(parts[1]); err == nil {
						return kb / 1024
					}
				}
			}
		}
	}

	// Fallback to a safe minimum guess if not on Linux / can't read
	return 2048
}

// Budget returns the calculated safe amount of workers for a specific domain
// based on CPU cores, DB limits, and Memory.
func Budget(domain string) int {
	cores := runtime.NumCPU()
	if cores < 2 {
		cores = 2
	}

	maxDBConns := getEnvInt("DB_MAX_OPEN_CONNS", 100)
	memoryMB := getSystemMemoryMB()

	switch domain {
	case DomainWS:
		return min(cores*128, 4096)

	case DomainEvents:
		return min(cores*8, max(2, maxDBConns/4))

	case DomainDSCompile:
		return max(2, cores)

	case DomainDSExecute:
		return max(2, cores)

	case DomainMediaScraper:
		return max(2, min(cores*4, memoryMB/512))

	case DomainProvisioning:
		return max(2, cores)

	default:
		return max(2, cores/2)
	}
}
