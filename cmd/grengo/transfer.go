package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const archiveVersion = 1

// archiveMeta is the manifest stored as meta.json in every export archive.
type archiveMeta struct {
	Version    int      `json:"version"`
	Type       string   `json:"type"`              // "client" or "node"
	Name       string   `json:"name,omitempty"`    // single-client archives only
	Clients    []string `json:"clients,omitempty"` // node archives only
	ExportedAt string   `json:"exported_at"`
}

// ─── Client Export ────────────────────────────────────────────────────────────

// cmdExportClient packs a single client (env, compose, uploads, DB dump) into
// a portable tar.gz archive.
func cmdExportClient(name, outFile string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	if outFile == "" {
		outFile = fmt.Sprintf("grengo-client-%s-%s.tar.gz", name, time.Now().Format("20060102-150405"))
	}

	f, err := os.Create(outFile)
	if err != nil {
		die("Cannot create archive: %v", err)
	}
	defer f.Close()

	gw := gzip.NewWriter(f)
	defer gw.Close()
	tw := tar.NewWriter(gw)
	defer tw.Close()

	writeMeta(tw, archiveMeta{
		Version:    archiveVersion,
		Type:       "client",
		Name:       name,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
	})

	addFileToArchive(tw, clientEnvFile(name), "env")
	addFileToArchive(tw, clientComposeFile(name), "compose.yml")

	uploadsDir := filepath.Join(clientDir(name), "uploads")
	if _, err := os.Stat(uploadsDir); err == nil {
		addDirToArchive(tw, uploadsDir, "uploads")
	}

	if pgRunning() {
		dbName := envVal(clientEnvFile(name), "POSTGRES_DB")
		if dbName != "" {
			log("Dumping database '%s'…", dbName)
			dump, err := pgDump(dbName)
			if err != nil {
				warn("Database dump failed: %v — archive will not include DB data", err)
			} else {
				addBytesToArchive(tw, dump, "db.sql")
			}
		}
	} else {
		warn("PostgreSQL is not running — archive will not include DB data")
	}

	log("Client '%s' exported => %s", name, outFile)
}

// ─── Client Import ────────────────────────────────────────────────────────────

// cmdImportClient restores a single-client archive onto this node.
// newName overrides the archived client name; newPort overrides the port.
func cmdImportClient(archivePath, newName, newPort string) {
	files := readArchive(archivePath)
	meta := parseMeta(files)

	if meta.Type != "client" {
		die("Archive type is '%s' — use 'grengo import-node' for node archives", meta.Type)
	}

	name := meta.Name
	if newName != "" {
		name = newName
	}
	if name == "" {
		die("Cannot determine client name — use --name <name>")
	}
	validateName(name)
	if clientExists(name) {
		die("Client '%s' already exists — use --name to import under a different name", name)
	}

	envData, ok := files["env"]
	if !ok {
		die("Archive is missing the env file")
	}
	envMap := parseEnvBytes(envData)

	port := resolvePort(envMap["PORT"], newPort)
	setupClientFromFiles(name, port, envData, envMap, files["compose.yml"], files["db.sql"], files, "")

	log("Client '%s' imported on port %s", name, port)
	generateNginxConfig()
	reloadNginxIfRunning()
}

// ─── Node Export ──────────────────────────────────────────────────────────────

// cmdExportNode packs every client on this node into a single tar.gz archive.
func cmdExportNode(outFile string) {
	entries, err := os.ReadDir(backendsDir())
	if err != nil || len(entries) == 0 {
		die("No clients found to export")
	}

	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if _, err := os.Stat(clientEnvFile(e.Name())); err == nil {
			names = append(names, e.Name())
		}
	}
	if len(names) == 0 {
		die("No valid clients to export")
	}

	if outFile == "" {
		outFile = fmt.Sprintf("grengo-node-%s.tar.gz", time.Now().Format("20060102-150405"))
	}

	f, err := os.Create(outFile)
	if err != nil {
		die("Cannot create archive: %v", err)
	}
	defer f.Close()

	gw := gzip.NewWriter(f)
	defer gw.Close()
	tw := tar.NewWriter(gw)
	defer tw.Close()

	writeMeta(tw, archiveMeta{
		Version:    archiveVersion,
		Type:       "node",
		Clients:    names,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
	})

	pgUp := pgRunning()
	if !pgUp {
		warn("PostgreSQL is not running — archives will not include DB data")
	}

	for _, name := range names {
		log("Exporting client '%s'…", name)
		pfx := "clients/" + name + "/"
		addFileToArchive(tw, clientEnvFile(name), pfx+"env")
		addFileToArchive(tw, clientComposeFile(name), pfx+"compose.yml")

		uploadsDir := filepath.Join(clientDir(name), "uploads")
		if _, err := os.Stat(uploadsDir); err == nil {
			addDirToArchive(tw, uploadsDir, pfx+"uploads")
		}

		if pgUp {
			dbName := envVal(clientEnvFile(name), "POSTGRES_DB")
			if dbName != "" {
				dump, err := pgDump(dbName)
				if err != nil {
					warn("  DB dump failed for '%s': %v", name, err)
				} else {
					addBytesToArchive(tw, dump, pfx+"db.sql")
				}
			}
		}
	}

	log("Node exported => %s  (%d client(s))", outFile, len(names))
}

// ─── Node Import ──────────────────────────────────────────────────────────────

// cmdImportNode restores all clients from a node archive onto this node.
// Clients that already exist are skipped; port conflicts are auto-resolved.
func cmdImportNode(archivePath string) {
	files := readArchive(archivePath)
	meta := parseMeta(files)

	if meta.Type != "node" {
		die("Archive type is '%s' — use 'grengo import' for single-client archives", meta.Type)
	}

	ensureWritableDir(backendsDir())

	imported := 0
	for _, name := range meta.Clients {
		pfx := "clients/" + name + "/"
		log("Importing client '%s'…", name)

		if clientExists(name) {
			warn("  Client '%s' already exists — skipping", name)
			continue
		}

		envData, ok := files[pfx+"env"]
		if !ok {
			warn("  Client '%s' missing env — skipping", name)
			continue
		}
		envMap := parseEnvBytes(envData)

		port := resolvePort(envMap["PORT"], "")
		setupClientFromFiles(
			name, port,
			envData, envMap,
			files[pfx+"compose.yml"],
			files[pfx+"db.sql"],
			files, pfx,
		)
		imported++
	}

	log("Node import complete — %d/%d client(s) restored", imported, len(meta.Clients))
	generateNginxConfig()
	reloadNginxIfRunning()
}

// ─── Shared setup helper ──────────────────────────────────────────────────────

// setupClientFromFiles creates the client directory structure, writes the patched
// env and compose files, extracts uploaded files, and restores the database dump.
//
// uploadsPrefix is the archive path prefix that maps to the client's uploads/
// directory (empty for single-client archives, "clients/<name>/" for node archives).
func setupClientFromFiles(
	name, port string,
	envData []byte, envMap map[string]string,
	composeData, dbSQL []byte,
	allFiles map[string][]byte,
	uploadsPrefix string,
) {
	cdir := clientDir(name)
	if err := os.MkdirAll(filepath.Join(cdir, "uploads"), 0755); err != nil {
		die("Cannot create directory for '%s': %v", name, err)
	}

	// Patch CLIENT_NAME and PORT; leave everything else (POSTGRES_DB,
	// DATABASE_URL, secrets, …) exactly as archived.
	envMap["CLIENT_NAME"] = name
	envMap["PORT"] = port
	writeEnvPatched(clientEnvFile(name), envData, envMap)

	// compose.yml — use archived copy verbatim.
	if len(composeData) > 0 {
		if err := os.WriteFile(clientComposeFile(name), composeData, 0644); err != nil {
			die("Cannot write compose.yml for '%s': %v", name, err)
		}
	}

	// Uploads — preserve directory tree.
	uploadsBase := uploadsPrefix + "uploads/"
	for archPath, data := range allFiles {
		if !strings.HasPrefix(archPath, uploadsBase) {
			continue
		}
		// Strip the per-client prefix so relative path starts with "uploads/".
		rel := strings.TrimPrefix(archPath, uploadsPrefix)
		dest := filepath.Join(cdir, rel)
		if err := os.MkdirAll(filepath.Dir(dest), 0755); err == nil {
			os.WriteFile(dest, data, 0644)
		}
	}

	// Database restore.
	if len(dbSQL) > 0 {
		if pgRunning() {
			env := loadSharedEnv()
			dbName := envMap["POSTGRES_DB"]
			if dbName == "" {
				dbName = name
			}
			log("  Restoring database '%s'…", dbName)
			createSQL := fmt.Sprintf(`CREATE DATABASE "%s";`, dbName)
			_ = dockerExec("skaia-postgres", "psql", "-U", env.PostgresUser, "-d", "template1", "-c", createSQL)
			if err := dockerExecInput("skaia-postgres", dbSQL, "psql", "-U", env.PostgresUser, "-d", dbName); err != nil {
				warn("  DB restore failed: %v — run 'grengo db init %s' for a fresh schema", err, name)
			} else {
				log("  Database '%s' restored", dbName)
			}
		} else {
			warn("  PostgreSQL not running — skipping DB restore")
		}
	} else {
		info("  No DB dump in archive — run 'grengo db init %s' to initialise", name)
	}
}

// ─── Port helper ─────────────────────────────────────────────────────────────

// resolvePort returns an available port. If override is given it is used
// (erroring on conflict). Otherwise the archived port is used if free, or the
// next available port is auto-assigned.
func resolvePort(archived, override string) string {
	if override != "" {
		p, err := strconv.Atoi(override)
		if err != nil {
			die("Invalid port value: %s", override)
		}
		if portInUse(p) {
			die("Port %d is already in use", p)
		}
		return override
	}
	if p, err := strconv.Atoi(archived); err == nil && p > 0 && !portInUse(p) {
		return archived
	}
	next := strconv.Itoa(nextPort())
	info("Port conflict — auto-assigning %s", next)
	return next
}

// ─── Archive low-level helpers ────────────────────────────────────────────────

// readArchive opens a .tar.gz file and returns all regular-file contents
// keyed by their path inside the archive.
func readArchive(path string) map[string][]byte {
	f, err := os.Open(path)
	if err != nil {
		die("Cannot open archive: %v", err)
	}
	defer f.Close()

	gr, err := gzip.NewReader(f)
	if err != nil {
		die("Not a valid gzip archive: %v", err)
	}
	defer gr.Close()

	files := map[string][]byte{}
	tr := tar.NewReader(gr)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			die("Corrupt archive: %v", err)
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		data, err := io.ReadAll(tr)
		if err != nil {
			die("Error reading %s from archive: %v", hdr.Name, err)
		}
		files[hdr.Name] = data
	}
	return files
}

// parseMeta extracts and validates the meta.json entry from the file map.
func parseMeta(files map[string][]byte) archiveMeta {
	data, ok := files["meta.json"]
	if !ok {
		die("Invalid archive — meta.json not found")
	}
	var m archiveMeta
	if err := json.Unmarshal(data, &m); err != nil {
		die("Invalid meta.json: %v", err)
	}
	return m
}

// writeMeta serialises m as meta.json and writes it as the first tar entry.
func writeMeta(tw *tar.Writer, m archiveMeta) {
	data, _ := json.MarshalIndent(m, "", "  ")
	addBytesToArchive(tw, data, "meta.json")
}

// addBytesToArchive writes raw bytes as a named regular-file entry.
func addBytesToArchive(tw *tar.Writer, data []byte, name string) {
	hdr := &tar.Header{
		Name:    name,
		Mode:    0644,
		Size:    int64(len(data)),
		ModTime: time.Now(),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		die("tar header error (%s): %v", name, err)
	}
	if _, err := tw.Write(data); err != nil {
		die("tar write error (%s): %v", name, err)
	}
}

// addFileToArchive reads src from disk and appends it to the archive as archiveName.
func addFileToArchive(tw *tar.Writer, src, archiveName string) {
	data, err := os.ReadFile(src)
	if err != nil {
		warn("Skipping %s: %v", src, err)
		return
	}
	addBytesToArchive(tw, data, archiveName)
}

// addDirToArchive walks dir recursively and adds each file under archivePrefix/.
func addDirToArchive(tw *tar.Writer, dir, archivePrefix string) {
	archivePrefix = strings.TrimRight(archivePrefix, "/")
	filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dir, path)
		addFileToArchive(tw, path, archivePrefix+"/"+rel)
		return nil
	})
}

// ─── Postgres helpers ─────────────────────────────────────────────────────────

// pgDump runs pg_dump inside the postgres container and returns the SQL bytes.
func pgDump(dbName string) ([]byte, error) {
	env := loadSharedEnv()
	return exec.Command(
		"docker", "exec", "skaia-postgres",
		"pg_dump", "-U", env.PostgresUser, dbName,
	).Output()
}

// ─── Env helpers ──────────────────────────────────────────────────────────────

// parseEnvBytes parses raw .env bytes into a key=>value map.
// Comments and blank lines are ignored.
func parseEnvBytes(data []byte) map[string]string {
	m := make(map[string]string)
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if idx := strings.Index(line, "="); idx > 0 {
			m[line[:idx]] = line[idx+1:]
		}
	}
	return m
}

// writeEnvPatched writes a .env file by patching specific keys from overrides
// while preserving comments, blank lines, and the original key ordering.
func writeEnvPatched(dest string, original []byte, overrides map[string]string) {
	lines := strings.Split(string(original), "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if idx := strings.Index(trimmed, "="); idx > 0 {
			key := trimmed[:idx]
			if val, ok := overrides[key]; ok {
				lines[i] = key + "=" + val
			}
		}
	}
	content := strings.Join(lines, "\n")
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	if err := os.WriteFile(dest, []byte(content), 0644); err != nil {
		die("Cannot write %s: %v", dest, err)
	}
}
