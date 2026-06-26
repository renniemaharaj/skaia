package bench

import (
	"fmt"
	"goftw/internal/entity"
	"goftw/internal/fns"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ListApps returns all directories in benchDir/apps that are valid git repositories.
func (b *Bench) ListApps() ([]string, error) {
	var apps []string
	appDirs, err := filepath.Glob(filepath.Join(b.Path, "apps", "*"))
	if err != nil {
		fmt.Printf("[ERROR] Failed to glob app directories: %v\n", err)
		return nil, err
	}

	for _, d := range appDirs {
		info, err := os.Stat(d)
		if err != nil || !info.IsDir() {
			continue
		}

		// Check if directory is a git repository
		if err := fns.ExecRunPrintIO("git", "-C", d, "status"); err != nil {
			fmt.Printf("[WARN] Skipping %s: git status failed\n", d)
			continue
		}
		apps = append(apps, filepath.Base(d))
	}
	return apps, nil
}

// ListApps runs `bench --site <site> list-apps` and parses the result into []AppInfo.
func (b *Bench) ListAppsOnSite(siteName string) ([]entity.App, error) {
	out, err := b.ExecRunInBenchSwallowIO("bench", "--site", siteName, "list-apps")
	if err != nil {
		fmt.Printf("[ERROR] bench list-apps failed: %v, output: %s\n", err, out)
		return nil, err
	}

	lines := strings.Split(string(out), "\n")
	apps := make([]entity.App, 0)

	// Regex for full format: name <version> (<commit>) [branch]
	reFull := regexp.MustCompile(`^(\w+)\s+([\w\.\-]+)?\s*(?:\(([\da-f]+)\))?\s*(?:\[(.+)\])?$`)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		match := reFull.FindStringSubmatch(line)
		if match != nil {
			apps = append(apps, entity.App{
				Name:    match[1],
				Version: match[2],
				Commit:  match[3],
				Branch:  match[4],
				Raw:     line,
			})
			continue
		}

		// Fallback: just the name
		apps = append(apps, entity.App{
			Name: strings.Fields(line)[0],
			Raw:  line,
		})
	}

	return apps, nil
}
