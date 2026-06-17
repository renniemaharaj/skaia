package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/skaia/grengo/internal/repo"
)

// Docker stats, storage, and system info

type containerStats struct {
	Name     string  `json:"name"`
	CPU      float64 `json:"cpu_percent"`
	MemUsage string  `json:"mem_usage"`
	MemLimit string  `json:"mem_limit"`
	MemPct   float64 `json:"mem_percent"`
	NetIO    string  `json:"net_io"`
	BlockIO  string  `json:"block_io"`
	PIDs     int     `json:"pids"`
}

// dockerAPIClient talks to the Docker Engine API via the Unix socket.
var dockerAPIClient = &http.Client{
	Transport: &http.Transport{
		DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
			return net.Dial("unix", "/var/run/docker.sock")
		},
	},
	Timeout: 10 * time.Second,
}

// dockerStatsJSON is the raw structure returned by GET /containers/{id}/stats?stream=false.
type dockerStatsJSON struct {
	Read     string `json:"read"`
	Preread  string `json:"preread"`
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     int    `json:"online_cpus"`
	} `json:"cpu_stats"`
	PrecpuStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
		Stats struct {
			Cache uint64 `json:"cache"`
		} `json:"stats"`
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	} `json:"networks"`
	BlkioStats struct {
		IoServiceBytesRecursive []struct {
			Op    string `json:"op"`
			Value uint64 `json:"value"`
		} `json:"io_service_bytes_recursive"`
	} `json:"blkio_stats"`
	PidsStats struct {
		Current int `json:"current"`
	} `json:"pids_stats"`
}

var prevCPUStats = make(map[string]dockerStatsJSON)
var cpuStatsMu sync.Mutex

// fetchContainerStats fetches stats for one container via the Docker Engine API.
func fetchContainerStats(name string) (*containerStats, error) {
	url := fmt.Sprintf("http://localhost/containers/%s/stats?stream=false&one-shot=true", name)
	resp, err := dockerAPIClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("docker API %d for %s", resp.StatusCode, name)
	}

	var raw dockerStatsJSON
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	cpuStatsMu.Lock()
	prev, hasPrev := prevCPUStats[name]
	prevCPUStats[name] = raw
	cpuStatsMu.Unlock()

	var prevCpu float64
	var prevSystem float64

	if hasPrev {
		prevCpu = float64(prev.CPUStats.CPUUsage.TotalUsage)
		prevSystem = float64(prev.CPUStats.SystemCPUUsage)
	} else {
		prevCpu = float64(raw.PrecpuStats.CPUUsage.TotalUsage)
		prevSystem = float64(raw.PrecpuStats.SystemCPUUsage)
	}

	cpuDelta := float64(raw.CPUStats.CPUUsage.TotalUsage) - prevCpu
	systemDelta := float64(raw.CPUStats.SystemCPUUsage) - prevSystem

	onlineCPUs := float64(raw.CPUStats.OnlineCPUs)
	if onlineCPUs == 0.0 {
		onlineCPUs = 1.0 // fallback
	}

	cpuPct := 0.0
	if systemDelta > 0 && cpuDelta > 0 {
		cpuPct = (cpuDelta / systemDelta) * onlineCPUs * 100.0
	}

	// Memory
	memUsage := raw.MemoryStats.Usage - raw.MemoryStats.Stats.Cache
	memLimit := raw.MemoryStats.Limit
	memPct := 0.0
	if memLimit > 0 {
		memPct = float64(memUsage) / float64(memLimit) * 100.0
	}

	// Net I/O
	var rxBytes, txBytes uint64
	for _, iface := range raw.Networks {
		rxBytes += iface.RxBytes
		txBytes += iface.TxBytes
	}

	// Block I/O
	var blkRead, blkWrite uint64
	for _, entry := range raw.BlkioStats.IoServiceBytesRecursive {
		switch entry.Op {
		case "read", "Read":
			blkRead += entry.Value
		case "write", "Write":
			blkWrite += entry.Value
		}
	}

	return &containerStats{
		Name:     name,
		CPU:      cpuPct,
		MemUsage: humanBytes(memUsage),
		MemLimit: humanBytes(memLimit),
		MemPct:   memPct,
		NetIO:    fmt.Sprintf("%s / %s", humanBytes(rxBytes), humanBytes(txBytes)),
		BlockIO:  fmt.Sprintf("%s / %s", humanBytes(blkRead), humanBytes(blkWrite)),
		PIDs:     raw.PidsStats.Current,
	}, nil
}

// humanBytes formats bytes into a human-readable string (KiB, MiB, GiB).
func humanBytes(b uint64) string {
	const (
		kib = 1024
		mib = kib * 1024
		gib = mib * 1024
	)
	switch {
	case b >= gib:
		return fmt.Sprintf("%.2f GiB", float64(b)/float64(gib))
	case b >= mib:
		return fmt.Sprintf("%.1f MiB", float64(b)/float64(mib))
	case b >= kib:
		return fmt.Sprintf("%.1f KiB", float64(b)/float64(kib))
	default:
		return fmt.Sprintf("%d B", b)
	}
}

// gatherStats returns docker stats for all running grengo-managed containers.
func gatherStats() []containerStats {
	store := repo.New(ProjectRoot())
	entries, _ := store.BackendEntries()
	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		ef := store.SiteEnvFile(e.Name())
		if _, serr := os.Stat(ef); serr != nil {
			continue
		}
		cname := envVal(ef, "CLIENT_NAME")
		if cname != "" && clientRunning(cname) {
			names = append(names, cname+"-backend")
		}
	}

	// Also include shared infra containers (postgres, redis, nginx).
	for _, infra := range []string{"skaia-postgres", "skaia-redis", "skaia-nginx"} {
		if containerRunning(infra) {
			names = append(names, infra)
		}
	}

	if len(names) == 0 {
		return []containerStats{}
	}

	// Fetch stats concurrently via Docker Engine API (Unix socket).
	type result struct {
		stats *containerStats
		err   error
	}
	ch := make(chan result, len(names))
	for _, n := range names {
		go func(container string) {
			s, err := fetchContainerStats(container)
			ch <- result{s, err}
		}(n)
	}

	results := []containerStats{}
	for i := 0; i < len(names); i++ {
		res := <-ch
		if res.err == nil && res.stats != nil {
			results = append(results, *res.stats)
		}
	}
	return results
}

// apiStats returns docker stats for all running grengo-managed containers.
func apiStats(w http.ResponseWriter, r *http.Request) {
	apiJSON(w, http.StatusOK, gatherStats())
}

// Storage

type storageInfo struct {
	Sites      []siteStorageInfo `json:"sites"`
	TotalUsed  int64             `json:"total_used"`
	TotalLimit int64             `json:"total_limit"`
	TotalPct   float64           `json:"total_percent"`
	TotalHuman string            `json:"total_used_human"`
	LimitHuman string            `json:"total_limit_human"`
}

type siteStorageInfo struct {
	Name      string `json:"name"`
	Used      int64  `json:"used"`
	UsedHuman string `json:"used_human"`
}

func gatherStorage() *storageInfo {
	store := repo.New(ProjectRoot())
	entries, _ := store.BackendEntries()

	sites := []siteStorageInfo{}
	var grandTotal int64
	var totalLimit int64

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		ef := store.SiteEnvFile(e.Name())
		if _, serr := os.Stat(ef); serr != nil {
			continue
		}

		name := envVal(ef, "CLIENT_NAME")
		port := envVal(ef, "PORT")
		if port == "" {
			port = "1080"
		}

		var used int64
		client := &http.Client{Timeout: 3 * time.Second}
		resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%s/api/internal/storage", port))
		if err == nil && resp.StatusCode == http.StatusOK {
			var payload struct {
				Limit int64 `json:"limit"`
				Used  int64 `json:"used"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&payload); err == nil {
				totalLimit += payload.Limit
				used = payload.Used
			}
			resp.Body.Close()
		} else if resp != nil {
			resp.Body.Close()
		}

		grandTotal += used

		sites = append(sites, siteStorageInfo{
			Name:      name,
			Used:      used,
			UsedHuman: humanBytes(uint64(used)),
		})
	}

	// If no backend had a limit set, fallback to 5 GB.
	if totalLimit == 0 {
		totalLimit = 5 * 1024 * 1024 * 1024 // 5 GB
	}

	pct := 0.0
	if totalLimit > 0 {
		pct = float64(grandTotal) / float64(totalLimit) * 100.0
	}

	return &storageInfo{
		Sites:      sites,
		TotalUsed:  grandTotal,
		TotalLimit: totalLimit,
		TotalPct:   pct,
		TotalHuman: humanBytes(uint64(grandTotal)),
		LimitHuman: humanBytes(uint64(totalLimit)),
	}
}

// apiStorage returns upload storage usage for all sites.
func apiStorage(w http.ResponseWriter, r *http.Request) {
	apiJSON(w, http.StatusOK, gatherStorage())
}

// System Info

// apiSysInfo returns host CPU info, server time, and uptime.
func apiSysInfo(w http.ResponseWriter, r *http.Request) {
	info := map[string]any{
		"server_time": time.Now().UTC().Format(time.RFC3339),
	}

	// CPU model
	if data, err := os.ReadFile("/proc/cpuinfo"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "model name") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					info["cpu_model"] = strings.TrimSpace(parts[1])
					break
				}
			}
		}
	}

	// CPU count
	if data, err := os.ReadFile("/proc/cpuinfo"); err == nil {
		count := 0
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "processor") {
				count++
			}
		}
		info["cpu_cores"] = count
	}

	// System uptime
	if data, err := os.ReadFile("/proc/uptime"); err == nil {
		parts := strings.Fields(string(data))
		if len(parts) >= 1 {
			if secs, err := strconv.ParseFloat(parts[0], 64); err == nil {
				info["uptime_seconds"] = secs
				d := time.Duration(secs * float64(time.Second))
				days := int(d.Hours()) / 24
				hours := int(d.Hours()) % 24
				mins := int(d.Minutes()) % 60
				info["uptime_human"] = fmt.Sprintf("%dd %dh %dm", days, hours, mins)
			}
		}
	}

	// Total system memory
	if data, err := os.ReadFile("/proc/meminfo"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "MemTotal:") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					if kb, err := strconv.ParseUint(parts[1], 10, 64); err == nil {
						info["mem_total"] = humanBytes(kb * 1024)
					}
				}
				break
			}
		}
	}

	// Load average
	if data, err := os.ReadFile("/proc/loadavg"); err == nil {
		parts := strings.Fields(string(data))
		if len(parts) >= 3 {
			info["load_avg"] = strings.Join(parts[:3], " ")
		}
	}

	apiJSON(w, http.StatusOK, info)
}
