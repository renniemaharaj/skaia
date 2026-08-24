package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const currentClientFileName = ".grengo-current"

func currentClientPath() string {
	return filepath.Join(ProjectRoot(), currentClientFileName)
}

func readCurrentClient() string {
	data, err := os.ReadFile(currentClientPath())
	if err != nil {
		if !os.IsNotExist(err) {
			warn("Cannot read current client: %v", err)
		}
		return ""
	}
	return strings.TrimSpace(string(data))
}

func writeCurrentClient(name string) error {
	root := ProjectRoot()
	tmp, err := os.CreateTemp(root, ".grengo-current-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := fmt.Fprintln(tmp, name); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, currentClientPath())
}

// routeLocalhostToCurrent makes localhost exclusive to the selected client
// without changing any tenant's persisted production domains.
func routeLocalhostToCurrent(clients []clientInfo, current string) ([]clientInfo, bool) {
	if current == "" {
		return clients, true
	}

	target := -1
	for i := range clients {
		if clients[i].Name == current {
			target = i
			break
		}
	}
	if target == -1 {
		return clients, false
	}

	for i := range clients {
		domains := clients[i].Domains[:0]
		for _, domain := range clients[i].Domains {
			if domain != "localhost" {
				domains = append(domains, domain)
			}
		}
		clients[i].Domains = domains
	}
	clients[target].Domains = append(clients[target].Domains, "localhost")
	return clients, true
}

func cmdSetCurrent(name string) {
	validateName(name)
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	if !clientEnabled(name) {
		die("Client '%s' is disabled - enable it first", name)
	}
	if err := writeCurrentClient(name); err != nil {
		die("Cannot set current client: %v", err)
	}

	generateNginxConfig()
	reloadNginxIfRunning()
	log("Client '%s' is now active at http://localhost", name)
}
