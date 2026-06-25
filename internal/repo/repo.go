package repo

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const PIDFileName = ".grengo-api.pid"
const PCodeFileName = ".pcode"

type Repository struct {
	root string
}

func New(root string) Repository {
	if root == "" {
		root = ProjectRoot()
	}
	return Repository{root: root}
}

func ProjectRoot() string {
	if root := strings.TrimSpace(os.Getenv("GRENGO_ROOT")); root != "" {
		return root
	}

	exe, err := os.Executable()
	if err == nil {
		if resolved, resolveErr := filepath.EvalSymlinks(exe); resolveErr == nil {
			exe = resolved
		}
		dir := filepath.Dir(exe)
		for {
			if _, statErr := os.Stat(filepath.Join(dir, "compose.yml")); statErr == nil {
				return dir
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	cwd, _ := os.Getwd()
	return cwd
}

func (r Repository) Root() string {
	return r.root
}

func (r Repository) BackendsDir() string {
	return filepath.Join(r.root, "backends")
}

func (r Repository) NginxDir() string {
	return filepath.Join(r.root, "nginx")
}

func (r Repository) BackendSrc() string {
	return filepath.Join(r.root, "backend")
}

func (r Repository) ComposeFile() string {
	return filepath.Join(r.root, "compose.yml")
}

func (r Repository) RootEnvFile() string {
	return filepath.Join(r.root, ".env")
}

func (r Repository) PIDFile() string {
	return filepath.Join(r.root, PIDFileName)
}

func (r Repository) PCodeFile() string {
	return filepath.Join(r.root, PCodeFileName)
}

func (r Repository) SiteDir(name string) string {
	return filepath.Join(r.BackendsDir(), name)
}

func (r Repository) SiteEnvFile(name string) string {
	return filepath.Join(r.SiteDir(name), ".env")
}

func (r Repository) SiteExists(name string) bool {
	info, err := os.Stat(r.SiteDir(name))
	return err == nil && info.IsDir()
}

func (r Repository) SiteEnvExists(name string) bool {
	_, err := os.Stat(r.SiteEnvFile(name))
	return err == nil
}

func (r Repository) BackendEntries() ([]os.DirEntry, error) {
	return os.ReadDir(r.BackendsDir())
}

func (r Repository) ReadSiteEnv(name string) ([]byte, error) {
	return os.ReadFile(r.SiteEnvFile(name))
}

func (r Repository) WriteSiteEnv(name, content string) error {
	return os.WriteFile(r.SiteEnvFile(name), []byte(content), 0644)
}

func (r Repository) IsSiteDisabled(name string) bool {
	_, err := os.Stat(filepath.Join(r.SiteDir(name), ".disabled"))
	return err == nil
}

func (r Repository) IsSiteArmed(name string) bool {
	entries, err := os.ReadDir(filepath.Join(r.SiteDir(name), "armed"))
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			return true
		}
	}
	return false
}

func (r Repository) ArmSite(name string, at time.Time) error {
	armedDir := filepath.Join(r.SiteDir(name), "armed")
	if err := os.MkdirAll(armedDir, 0755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(armedDir, name+".armed"), []byte(at.UTC().Format(time.RFC3339)), 0644)
}

func (r Repository) DisarmSite(name string) error {
	err := os.Remove(filepath.Join(r.SiteDir(name), "armed", name+".armed"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func EnvValue(file, key string) string {
	f, err := os.Open(file)
	if err != nil {
		return ""
	}
	defer f.Close()

	prefix := key + "="
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, prefix) {
			return strings.TrimPrefix(line, prefix)
		}
	}
	return ""
}
