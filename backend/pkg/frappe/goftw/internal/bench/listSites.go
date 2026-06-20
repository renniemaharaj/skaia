package bench

import (
	"fmt"
	"os"
	"path/filepath"
)

var (
	// Directories to skip when listing sites
	skipSiteDirs = map[string]struct{}{
		"assets": {},
	}
)

// ListSites returns all valid site directories in benchDir/sites,
// skipping entries from skipSiteDirs.
func (b *Bench) ListSites() ([]string, error) {
	var currentSites []string
	siteDirs, err := filepath.Glob(filepath.Join(b.Path, "sites", "*"))
	if err != nil {
		fmt.Printf("[ERROR] Failed to glob site directories: %v\n", err)
		return nil, err
	}

	for _, d := range siteDirs {
		info, err := os.Stat(d)
		if err != nil || !info.IsDir() {
			continue
		}
		dirName := filepath.Base(d)
		if _, ok := skipSiteDirs[dirName]; ok {
			continue
		}
		// Check for site_config.json to confirm it's a valid site
		if _, err := os.Stat(filepath.Join(d, "site_config.json")); err == nil {
			currentSites = append(currentSites, dirName)
		}
	}

	return currentSites, nil
}
