package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const (
	batchLimit    = 500
	minimumRuns   = 3
	minimumWindow = "24 hours"
)

var errWaiting = errors.New("cutover observation window is not complete")

type client struct {
	name        string
	container   string
	composeFile string
	database    string
}

type backfillResult struct {
	NextAfterID int64 `json:"next_after_id"`
	Scanned     int   `json:"scanned"`
	Matched     int   `json:"matched"`
	Quarantined int   `json:"quarantined"`
	Mismatched  int   `json:"mismatched"`
	Done        bool  `json:"done"`
}

type cutoverPage struct {
	PageID int64 `json:"page_id"`
	Ready  bool  `json:"ready"`
}

type cutoverBatch struct {
	NextAfterID int64         `json:"next_after_id"`
	Scanned     int           `json:"scanned"`
	Ready       int           `json:"ready"`
	Mismatched  int           `json:"mismatched"`
	Done        bool          `json:"done"`
	Pages       []cutoverPage `json:"pages"`
}

type cutoverResult struct {
	Audit *cutoverBatch `json:"audit"`
}

type auditSummary struct {
	Scanned    int
	Ready      int
	Mismatched int
	AllReady   bool
}

func main() {
	if err := run(); err != nil {
		if errors.Is(err, errWaiting) {
			os.Exit(2)
		}
		fmt.Fprintln(os.Stderr, "page-section migration:", err)
		os.Exit(1)
	}
}

func run() error {
	root, err := os.Getwd()
	if err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(root, "backend", "go.mod")); err != nil {
		return errors.New("run from the Skaia repository root")
	}

	clients, err := discoverClients(root)
	if err != nil {
		return err
	}
	fmt.Printf("Running backends: %s\n", clientNames(clients))

	if err := buildTools(root); err != nil {
		return err
	}

	rootEnv := filepath.Join(root, ".env")
	env, err := readEnv(rootEnv)
	if err != nil {
		return err
	}
	postgresUser := env["POSTGRES_USER"]
	if postgresUser == "" {
		return errors.New("POSTGRES_USER is missing from root .env")
	}

	if env["PAGE_NORMALIZED_SECTION_READS"] == "1" {
		return verifyReadyClients(clients, postgresUser)
	}

	for _, c := range clients {
		fmt.Printf("\n[%s] backfilling normalized definitions\n", c.name)
		if err := copyTool(c, "/tmp/page-section-shadow-backfill"); err != nil {
			return err
		}
		if err := copyTool(c, "/tmp/page-interactive-response-backfill"); err != nil {
			return err
		}
		if err := runBackfill(c, "/tmp/page-section-shadow-backfill", true, postgresUser); err != nil {
			return err
		}
		if err := runBackfill(c, "/tmp/page-interactive-response-backfill", false, postgresUser); err != nil {
			return err
		}
	}

	writes := map[string]string{
		"PAGE_TYPED_SECTION_MUTATIONS":          "1",
		"PAGE_NORMALIZED_INTERACTIVE_RESPONSES": "1",
		"PAGE_NORMALIZED_SECTION_READS":         "0",
	}
	if _, err := updateEnvFile(rootEnv, writes); err != nil {
		return err
	}
	fmt.Println("\nEnabling normalized writes and recreating backends")
	if err := recreateClients(clients); err != nil {
		return err
	}

	allReady := true
	for _, c := range clients {
		fmt.Printf("\n[%s] recording cutover observation\n", c.name)
		if err := copyTool(c, "/tmp/page-section-cutover"); err != nil {
			return err
		}
		audit, err := runCutoverAudit(c)
		if err != nil {
			return err
		}
		total, ready, err := sqlReadiness(c, postgresUser)
		if err != nil {
			return err
		}
		fmt.Printf("[%s] audit ready=%d/%d; SQL ready=%d/%d\n", c.name, audit.Ready, audit.Scanned, ready, total)
		if audit.Mismatched != 0 || audit.Scanned != total || audit.Ready != total || !audit.AllReady || ready != total {
			allReady = false
		}
	}

	if !allReady {
		fmt.Println("\nNormalized writes remain enabled; reads remain disabled.")
		fmt.Println("Rerun this command after the three observations have been sustained for at least 24 hours.")
		return errWaiting
	}

	readFlags := map[string]string{
		"PAGE_TYPED_SECTION_MUTATIONS":          "1",
		"PAGE_NORMALIZED_INTERACTIVE_RESPONSES": "1",
		"PAGE_NORMALIZED_SECTION_READS":         "1",
	}
	if _, err := updateEnvFile(rootEnv, readFlags); err != nil {
		return err
	}
	fmt.Println("\nAll pages are ready; enabling normalized reads and recreating backends")
	if err := recreateClients(clients); err != nil {
		return err
	}
	fmt.Println("Page-section migration complete")
	return nil
}

func discoverClients(root string) ([]client, error) {
	entries, err := os.ReadDir(filepath.Join(root, "backends"))
	if err != nil {
		return nil, fmt.Errorf("read backends: %w", err)
	}
	clients := make([]client, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(root, "backends", entry.Name())
		env, err := readEnv(filepath.Join(dir, ".env"))
		if err != nil {
			continue
		}
		name := env["CLIENT_NAME"]
		if name == "" {
			name = entry.Name()
		}
		container := name + "-backend"
		output, err := commandOutput("docker", "inspect", "-f", "{{.State.Running}}", container)
		if err != nil || strings.TrimSpace(output) != "true" {
			continue
		}
		if env["POSTGRES_DB"] == "" {
			return nil, fmt.Errorf("%s: POSTGRES_DB is missing", name)
		}
		composeFile := filepath.Join(dir, "compose.yml")
		if _, err := os.Stat(composeFile); err != nil {
			return nil, fmt.Errorf("%s: compose.yml is missing", name)
		}
		clients = append(clients, client{name: name, container: container, composeFile: composeFile, database: env["POSTGRES_DB"]})
	}
	sort.Slice(clients, func(i, j int) bool { return clients[i].name < clients[j].name })
	if len(clients) == 0 {
		return nil, errors.New("no running backend clients found")
	}
	return clients, nil
}

func buildTools(root string) error {
	targets := []struct {
		output, pkg string
	}{
		{"/tmp/page-section-shadow-backfill", "./cmd/page-section-shadow-backfill"},
		{"/tmp/page-interactive-response-backfill", "./cmd/page-interactive-response-backfill"},
		{"/tmp/page-section-cutover", "./cmd/page-section-cutover"},
	}
	for _, target := range targets {
		fmt.Printf("Building %s\n", filepath.Base(target.output))
		cmd := exec.Command("go", "-C", filepath.Join(root, "backend"), "build", "-o", target.output, target.pkg)
		cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("build %s: %w", target.pkg, err)
		}
	}
	return nil
}

func runBackfill(c client, remotePath string, shadow bool, postgresUser string) error {
	cursor := int64(0)
	for {
		output, err := commandOutput("docker", "exec", c.container, remotePath,
			"--after-id", strconv.FormatInt(cursor, 10), "--limit", strconv.Itoa(batchLimit))
		if err != nil {
			return fmt.Errorf("%s: run %s: %w", c.name, filepath.Base(remotePath), err)
		}
		var result backfillResult
		if err := json.Unmarshal([]byte(output), &result); err != nil {
			return fmt.Errorf("%s: decode %s output: %w", c.name, filepath.Base(remotePath), err)
		}
		fmt.Printf("[%s] %s scanned=%d matched=%d quarantined=%d mismatched=%d done=%t\n",
			c.name, filepath.Base(remotePath), result.Scanned, result.Matched, result.Quarantined, result.Mismatched, result.Done)
		if result.Mismatched != 0 || (shadow && result.Quarantined != 0) {
			if shadow && result.Quarantined != 0 {
				printActiveQuarantine(c, postgresUser)
			}
			return fmt.Errorf("%s: %s reported quarantined or mismatched pages", c.name, filepath.Base(remotePath))
		}
		if result.Done {
			return nil
		}
		if result.NextAfterID <= cursor {
			return fmt.Errorf("%s: %s did not advance its cursor", c.name, filepath.Base(remotePath))
		}
		cursor = result.NextAfterID
	}
}

func printActiveQuarantine(c client, postgresUser string) {
	query := `SELECT p.id, p.slug, q.source_index,
COALESCE(s.section->>'section_type',''), q.reason_code, q.safe_payload::text
FROM page_section_quarantine q
JOIN pages p ON p.id=q.page_id
LEFT JOIN LATERAL jsonb_array_elements(p.content) WITH ORDINALITY AS s(section,ordinal)
 ON s.ordinal=q.source_index+1
WHERE q.resolved_at IS NULL
ORDER BY p.id,q.source_index,q.id`
	output, err := commandOutput("docker", "exec", "skaia-postgres", "psql", "-U", postgresUser,
		"-d", c.database, "-At", "-F", "\t", "-c", query)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[%s] could not query active quarantine: %v\n", c.name, err)
		return
	}
	if output == "" {
		fmt.Printf("[%s] no unresolved quarantine records found\n", c.name)
		return
	}
	fmt.Printf("[%s] unresolved quarantine (page_id, slug, source_index, section_type, reason, safe_payload):\n%s\n", c.name, output)
}

func runCutoverAudit(c client) (auditSummary, error) {
	summary := auditSummary{AllReady: true}
	cursor := int64(0)
	for {
		output, err := commandOutput("docker", "exec", c.container, "/tmp/page-section-cutover",
			"--after-id", strconv.FormatInt(cursor, 10), "--limit", strconv.Itoa(batchLimit))
		if err != nil {
			return summary, fmt.Errorf("%s: run cutover audit: %w", c.name, err)
		}
		var result cutoverResult
		if err := json.Unmarshal([]byte(output), &result); err != nil || result.Audit == nil {
			return summary, fmt.Errorf("%s: decode cutover audit output", c.name)
		}
		batch := result.Audit
		summary.Scanned += batch.Scanned
		summary.Ready += batch.Ready
		summary.Mismatched += batch.Mismatched
		for _, page := range batch.Pages {
			if !page.Ready {
				summary.AllReady = false
			}
		}
		if batch.Mismatched != 0 {
			return summary, fmt.Errorf("%s: cutover audit reported %d mismatched pages", c.name, batch.Mismatched)
		}
		if batch.Done {
			return summary, nil
		}
		if batch.NextAfterID <= cursor {
			return summary, fmt.Errorf("%s: cutover audit did not advance its cursor", c.name)
		}
		cursor = batch.NextAfterID
	}
}

func sqlReadiness(c client, postgresUser string) (int, int, error) {
	query := fmt.Sprintf(`SELECT COUNT(*), COUNT(*) FILTER (WHERE ready) FROM (
SELECT p.id, EXISTS (
 SELECT 1 FROM page_section_shadow_runs sr
 JOIN page_section_response_migrations rm ON rm.page_id=sr.page_id
 WHERE sr.page_id=p.id AND sr.status='matched' AND sr.source_hash=sr.projection_hash
 AND sr.quarantine_count=0 AND sr.consecutive_matched_runs >= %d
 AND sr.matched_since <= CURRENT_TIMESTAMP - INTERVAL '%s'
 AND sr.rollback_status='matched' AND sr.rollback_drilled_at IS NOT NULL
 AND sr.cutover_ready_at IS NOT NULL AND rm.status='matched'
) AS ready FROM pages p
) readiness`, minimumRuns, minimumWindow)
	output, err := commandOutput("docker", "exec", "skaia-postgres", "psql", "-U", postgresUser,
		"-d", c.database, "-tAc", query)
	if err != nil {
		return 0, 0, fmt.Errorf("%s: query SQL readiness: %w", c.name, err)
	}
	parts := strings.Split(strings.TrimSpace(output), "|")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("%s: unexpected SQL readiness output", c.name)
	}
	total, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil {
		return 0, 0, fmt.Errorf("%s: parse total pages", c.name)
	}
	ready, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil {
		return 0, 0, fmt.Errorf("%s: parse ready pages", c.name)
	}
	return total, ready, nil
}

func verifyReadyClients(clients []client, postgresUser string) error {
	for _, c := range clients {
		total, ready, err := sqlReadiness(c, postgresUser)
		if err != nil {
			return err
		}
		fmt.Printf("[%s] normalized reads already enabled; SQL ready=%d/%d\n", c.name, ready, total)
		if ready != total {
			return fmt.Errorf("%s: normalized reads are enabled but SQL readiness is incomplete", c.name)
		}
	}
	return nil
}

func recreateClients(clients []client) error {
	for _, c := range clients {
		fmt.Printf("[%s] recreating backend\n", c.name)
		cmd := exec.Command("docker", "compose", "-f", c.composeFile, "up", "-d", "--force-recreate")
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("%s: recreate backend: %w", c.name, err)
		}
	}
	return nil
}

func copyTool(c client, localPath string) error {
	remotePath := "/tmp/" + filepath.Base(localPath)
	if _, err := commandOutput("docker", "cp", localPath, c.container+":"+remotePath); err != nil {
		return fmt.Errorf("%s: copy %s: %w", c.name, filepath.Base(localPath), err)
	}
	return nil
}

func updateEnvFile(path string, values map[string]string) (bool, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	updated, changed := updateEnvText(string(raw), values)
	if !changed {
		return false, nil
	}
	info, err := os.Stat(path)
	if err != nil {
		return false, err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".page-section-env-*")
	if err != nil {
		return false, err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(info.Mode().Perm()); err != nil {
		tmp.Close()
		return false, err
	}
	if _, err := tmp.WriteString(updated); err != nil {
		tmp.Close()
		return false, err
	}
	if err := tmp.Close(); err != nil {
		return false, err
	}
	if err := os.Rename(tmpName, path); err != nil {
		return false, err
	}
	return true, nil
}

func updateEnvText(input string, values map[string]string) (string, bool) {
	lines := strings.Split(input, "\n")
	found := make(map[string]bool, len(values))
	changed := false
	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		key, _, ok := strings.Cut(trimmed, "=")
		value, wanted := values[key]
		if !ok || !wanted || found[key] {
			continue
		}
		found[key] = true
		replacement := key + "=" + value
		if line != replacement {
			lines[index] = replacement
			changed = true
		}
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if found[key] {
			continue
		}
		if len(lines) > 0 && lines[len(lines)-1] != "" {
			lines = append(lines, "")
		}
		lines = append(lines, key+"="+values[key])
		changed = true
	}
	return strings.Join(lines, "\n"), changed
}

func readEnv(path string) (map[string]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	result := map[string]string{}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if ok {
			result[key] = value
		}
	}
	return result, nil
}

func commandOutput(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return "", errors.New(message)
	}
	return strings.TrimSpace(stdout.String()), nil
}

func clientNames(clients []client) string {
	names := make([]string, len(clients))
	for index, c := range clients {
		names[index] = c.name
	}
	return strings.Join(names, ", ")
}
