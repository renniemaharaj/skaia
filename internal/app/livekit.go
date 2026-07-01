package app

import (
	"os"
	"strings"
)

const liveKitProxyPath = "/livekit"

type liveKitRepairOptions struct {
	URL         string
	Rotate      bool
	Recreate    bool
	ShipDistDir string
	SkipNginx   bool
}

func cmdLiveKit(args []string) {
	distDir := buildFrontend()
	repairLiveKit(liveKitRepairOptions{
		URL:         liveKitURLArg(args),
		Rotate:      true,
		Recreate:    true,
		ShipDistDir: distDir,
	})
}

func repairLiveKit(opts liveKitRepairOptions) []string {
	ensureRootEnv()
	url := strings.TrimRight(strings.TrimSpace(opts.URL), "/")
	if url == "" {
		url = inferLiveKitURL()
	}

	apiKey := strings.TrimSpace(envVal(rootEnvFile(), "LIVEKIT_API_KEY"))
	apiSecret := strings.TrimSpace(envVal(rootEnvFile(), "LIVEKIT_API_SECRET"))
	if opts.Rotate || apiKey == "" {
		apiKey = generateLiveKitAPIKey()
		if err := setEnvVal(rootEnvFile(), "LIVEKIT_API_KEY", apiKey); err != nil {
			die("Cannot write LIVEKIT_API_KEY to %s: %v", rootEnvFile(), err)
		}
	}
	if opts.Rotate || apiSecret == "" {
		apiSecret = generateLiveKitAPISecret()
		if err := setEnvVal(rootEnvFile(), "LIVEKIT_API_SECRET", apiSecret); err != nil {
			die("Cannot write LIVEKIT_API_SECRET to %s: %v", rootEnvFile(), err)
		}
	}
	if opts.Rotate || strings.TrimSpace(envVal(rootEnvFile(), "LIVEKIT_URL")) == "" {
		if err := setEnvVal(rootEnvFile(), "LIVEKIT_URL", url); err != nil {
			die("Cannot write LIVEKIT_URL to %s: %v", rootEnvFile(), err)
		}
	}
	log("LiveKit root env ready => %s", rootEnvFile())
	info("  LIVEKIT_API_KEY=%s", apiKey)
	info("  LIVEKIT_URL=%s", strings.TrimSpace(envVal(rootEnvFile(), "LIVEKIT_URL")))

	if changed := syncRootComposeLiveKitEnv(); changed > 0 {
		log("LiveKit root compose env_file repaired => %s", composeFile())
	}

	clientNames := clientNamesWithEnv()
	clientCount := 0
	envRemoved := 0
	composePatched := 0
	for _, name := range clientNames {
		clientCount++
		n, err := removeEnvVals(clientEnvFile(name), "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_URL")
		if err != nil {
			warn("Cannot remove stale LiveKit values from %s: %v", clientEnvFile(name), err)
		}
		envRemoved += n
		composePatched += syncClientComposeRootEnv(name)
	}
	log("Client LiveKit cleanup complete (%d client(s), %d stale env line(s) removed, %d compose file(s) patched)", clientCount, envRemoved, composePatched)

	if !opts.SkipNginx {
		generateNginxConfig()
	}

	if opts.Recreate {
		ensureNetwork()
		recreateLiveKitAndClients(clientNames, opts.ShipDistDir)
	}
	return clientNames
}

func liveKitURLArg(args []string) string {
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--url":
			if i+1 >= len(args) {
				die("--url requires a value")
			}
			i++
			return strings.TrimRight(strings.TrimSpace(args[i]), "/")
		default:
			die("Unknown livekit option: %s", args[i])
		}
	}
	return ""
}

func inferLiveKitURL() string {
	var firstIP string
	for _, client := range enabledClients() {
		for _, domain := range client.Domains {
			domain = strings.TrimSpace(domain)
			if domain == "" || domain == "localhost" || strings.HasPrefix(domain, "www.") {
				continue
			}
			if isIPAddress(domain) {
				if firstIP == "" {
					firstIP = domain
				}
				continue
			}
			return "wss://" + domain + liveKitProxyPath
		}
	}
	if firstIP != "" {
		return "ws://" + firstIP + ":7880"
	}
	if existing := strings.TrimRight(strings.TrimSpace(envVal(rootEnvFile(), "LIVEKIT_URL")), "/"); existing != "" {
		return existing
	}
	return "ws://localhost:7880"
}

func clientNamesWithEnv() []string {
	var names []string
	entries, err := os.ReadDir(backendsDir())
	if err != nil {
		return names
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if _, err := os.Stat(clientEnvFile(entry.Name())); err == nil {
			names = append(names, entry.Name())
		}
	}
	return names
}

func syncRootComposeLiveKitEnv() int {
	raw, err := os.ReadFile(composeFile())
	if err != nil {
		warn("Cannot read %s: %v", composeFile(), err)
		return 0
	}
	content := string(raw)
	original := content

	content = strings.Replace(content, "    env_file:\n      - \"\"\n    depends_on:\n", "    env_file:\n      - .env\n    depends_on:\n", 1)
	if !strings.Contains(content, "    env_file:\n      - .env\n    depends_on:\n") {
		content = strings.Replace(content, "    restart: unless-stopped\n    depends_on:\n", "    restart: unless-stopped\n    env_file:\n      - .env\n    depends_on:\n", 1)
	}

	if content == original {
		return 0
	}
	if err := os.WriteFile(composeFile(), []byte(content), 0644); err != nil {
		warn("Cannot write %s: %v", composeFile(), err)
		return 0
	}
	return 1
}

func recreateLiveKitAndClients(clientNames []string, distDir string) {
	log("Recreating LiveKit…")
	if err := dockerCompose(composeFile(), "up", "-d", "--force-recreate", "livekit"); err != nil {
		die("Failed to recreate LiveKit: %v", err)
	}
	waitForHealthy("skaia-livekit", 60)

	var recreated []string
	for _, name := range clientNames {
		if !clientEnabled(name) {
			continue
		}
		log("Recreating %s…", name)
		if err := dockerCompose(clientComposeFile(name), "up", "-d", "--force-recreate"); err != nil {
			warn("Failed to recreate %s: %v", name, err)
			continue
		}
		recreated = append(recreated, name)
	}

	if distDir != "" {
		for _, name := range recreated {
			shipFrontendDist(name, distDir)
		}
		log("Frontend shipped to %d recreated backend(s)", len(recreated))
	}

	log("Recreating nginx…")
	if err := dockerCompose(composeFile(), "up", "-d", "--force-recreate", "nginx"); err != nil {
		die("Failed to recreate nginx: %v", err)
	}
	log("LiveKit repair complete")
	info("Verify with:")
	info("  docker inspect skaia-livekit --format '{{range .Config.Env}}{{println .}}{{end}}' | grep LIVEKIT")
	info("  docker ps --format '{{.Names}}' | grep backend | xargs -I{} sh -c 'echo \"== {} ==\"; docker inspect {} --format \"{{range .Config.Env}}{{println .}}{{end}}\" | grep LIVEKIT'")
}

func liveKitNginxLocation() string {
	return `    # ── LiveKit ────────────────────────────────────────────────────────────
    location ^~ /livekit/ {
        proxy_pass         http://127.0.0.1:7880/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        $connection_upgrade;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

`
}
