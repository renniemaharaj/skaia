package app

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const archiveVersion = 2

// archiveMeta is the manifest stored as meta.json in every export archive.
type archiveMeta struct {
	Version                  int      `json:"version"`
	Type                     string   `json:"type"`              // "client" or "node"
	Name                     string   `json:"name,omitempty"`    // single-client archives only
	Clients                  []string `json:"clients,omitempty"` // node archives only
	ExportedAt               string   `json:"exported_at"`
	BackupClass              string   `json:"backup_class"`
	RetainUntil              string   `json:"retain_until"`
	EncryptionRequiredAtRest bool     `json:"encryption_required_at_rest"`
}

type archiveIntegrityManifest struct {
	Version                  int    `json:"version"`
	Archive                  string `json:"archive"`
	SHA256                   string `json:"sha256"`
	SizeBytes                int64  `json:"size_bytes"`
	BackupClass              string `json:"backup_class"`
	CreatedAt                string `json:"created_at"`
	RetainUntil              string `json:"retain_until"`
	EncryptionRequiredAtRest bool   `json:"encryption_required_at_rest"`
}

// Client Export
// cmdExportClient packs a single client (env, compose, uploads, DB dump) into
// a portable tar.gz archive.
func cmdExportClient(name, outFile string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	if outFile == "" {
		outFile = fmt.Sprintf("grengo-client-%s-%s.tar.gz", name, time.Now().Format("20060102-150405"))
	}

	f, err := os.OpenFile(outFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		die("Cannot create archive: %v", err)
	}
	if err := f.Chmod(0600); err != nil {
		die("Cannot secure archive permissions: %v", err)
	}
	gw := gzip.NewWriter(f)
	tw := tar.NewWriter(gw)
	exportedAt := time.Now().UTC()

	writeMeta(tw, archiveMeta{
		Version:                  archiveVersion,
		Type:                     "client",
		Name:                     name,
		ExportedAt:               exportedAt.Format(time.RFC3339),
		BackupClass:              "tenant-portable",
		RetainUntil:              exportedAt.Add(30 * 24 * time.Hour).Format(time.RFC3339),
		EncryptionRequiredAtRest: true,
	})

	addFileToArchive(tw, clientEnvFile(name), "env", nil)
	addFileToArchive(tw, clientComposeFile(name), "compose.yml", nil)

	uploadsDir := filepath.Join(clientDir(name), "uploads")
	if _, err := os.Stat(uploadsDir); err == nil {
		addDirToArchive(tw, uploadsDir, "uploads")
	}

	if pgRunning() {
		dbName := envVal(clientEnvFile(name), "POSTGRES_DB")
		if dbName != "" {
			log("Dumping database '%s'…", dbName)
			err := addPgDumpToArchive(tw, dbName, "db.sql")
			if err != nil {
				warn("Database dump failed: %v - archive will not include DB data", err)
			}
		}
	} else {
		warn("PostgreSQL is not running - archive will not include DB data")
	}

	finalizeArchive(f, gw, tw, outFile, "tenant-portable", 30*24*time.Hour)
	log("Client '%s' exported => %s", name, outFile)
}

// Client Import
// cmdImportClient restores a single-client archive onto this node.
// newName overrides the archived client name; newPort overrides the port.
func cmdImportClient(archivePath, newName, newPort string) {
	files := readArchive(archivePath)
	meta := parseMeta(files)

	if meta.Type != "client" {
		die("Archive type is '%s' - use 'grengo import-node' for node archives", meta.Type)
	}

	name := meta.Name
	if newName != "" {
		name = newName
	}
	if name == "" {
		die("Cannot determine client name - use --name <name>")
	}
	validateName(name)
	if clientExists(name) {
		die("Client '%s' already exists - use --name to import under a different name", name)
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

// Node Export
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

	f, err := os.OpenFile(outFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		die("Cannot create archive: %v", err)
	}
	if err := f.Chmod(0600); err != nil {
		die("Cannot secure archive permissions: %v", err)
	}
	gw := gzip.NewWriter(f)
	tw := tar.NewWriter(gw)
	exportedAt := time.Now().UTC()

	writeMeta(tw, archiveMeta{
		Version:                  archiveVersion,
		Type:                     "node",
		Clients:                  names,
		ExportedAt:               exportedAt.Format(time.RFC3339),
		BackupClass:              "node-portable",
		RetainUntil:              exportedAt.Add(30 * 24 * time.Hour).Format(time.RFC3339),
		EncryptionRequiredAtRest: true,
	})

	pgUp := pgRunning()
	if !pgUp {
		warn("PostgreSQL is not running - archives will not include DB data")
	}

	for _, name := range names {
		log("Exporting client '%s'…", name)
		pfx := "clients/" + name + "/"
		addFileToArchive(tw, clientEnvFile(name), pfx+"env", nil)
		addFileToArchive(tw, clientComposeFile(name), pfx+"compose.yml", nil)

		uploadsDir := filepath.Join(clientDir(name), "uploads")
		if _, err := os.Stat(uploadsDir); err == nil {
			addDirToArchive(tw, uploadsDir, pfx+"uploads")
		}

		if pgUp {
			dbName := envVal(clientEnvFile(name), "POSTGRES_DB")
			if dbName != "" {
				err := addPgDumpToArchive(tw, dbName, pfx+"db.sql")
				if err != nil {
					warn("  DB dump failed for '%s': %v", name, err)
				}
			}
		}
	}

	finalizeArchive(f, gw, tw, outFile, "node-portable", 30*24*time.Hour)
	log("Node exported => %s  (%d client(s))", outFile, len(names))
}

func finalizeArchive(f *os.File, gw *gzip.Writer, tw *tar.Writer, path, backupClass string, retention time.Duration) {
	if err := tw.Close(); err != nil {
		die("Cannot finalize archive: %v", err)
	}
	if err := gw.Close(); err != nil {
		die("Cannot finalize archive compression: %v", err)
	}
	if err := f.Close(); err != nil {
		die("Cannot close archive: %v", err)
	}
	if err := writeIntegrityManifest(path, backupClass, retention); err != nil {
		die("Cannot write archive integrity manifest: %v", err)
	}
}

func writeIntegrityManifest(path, backupClass string, retention time.Duration) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	hash := sha256.New()
	size, err := io.Copy(hash, f)
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	now := time.Now().UTC()
	manifest := archiveIntegrityManifest{
		Version: 1, Archive: filepath.Base(path), SHA256: fmt.Sprintf("%x", hash.Sum(nil)), SizeBytes: size,
		BackupClass: backupClass, CreatedAt: now.Format(time.RFC3339), RetainUntil: now.Add(retention).Format(time.RFC3339), EncryptionRequiredAtRest: true,
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path+".manifest.json", append(data, '\n'), 0600)
}

func verifyIntegrityManifest(path string) (archiveIntegrityManifest, error) {
	var manifest archiveIntegrityManifest
	data, err := os.ReadFile(path + ".manifest.json")
	if err != nil {
		return manifest, err
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return manifest, err
	}
	f, err := os.Open(path)
	if err != nil {
		return manifest, err
	}
	defer f.Close()
	hash := sha256.New()
	size, err := io.Copy(hash, f)
	if err != nil {
		return manifest, err
	}
	if size != manifest.SizeBytes || fmt.Sprintf("%x", hash.Sum(nil)) != manifest.SHA256 || filepath.Base(path) != manifest.Archive {
		return manifest, fmt.Errorf("archive integrity mismatch")
	}
	return manifest, nil
}

// Node Import
// cmdImportNode restores all clients from a node archive onto this node.
// Clients that already exist are skipped; port conflicts are auto-resolved.
func cmdImportNode(archivePath string) {
	files := readArchive(archivePath)
	meta := parseMeta(files)

	if meta.Type != "node" {
		die("Archive type is '%s' - use 'grengo import' for single-client archives", meta.Type)
	}

	ensureWritableDir(backendsDir())

	imported := 0
	for _, name := range meta.Clients {
		pfx := "clients/" + name + "/"
		log("Importing client '%s'…", name)

		if clientExists(name) {
			warn("  Client '%s' already exists - skipping", name)
			continue
		}

		envData, ok := files[pfx+"env"]
		if !ok {
			warn("  Client '%s' missing env - skipping", name)
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

	log("Node import complete - %d/%d client(s) restored", imported, len(meta.Clients))
	generateNginxConfig()
	reloadNginxIfRunning()
}

// Shared setup helper
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

	// Preserve tenant secrets, but bind database access to this node's shared
	// PostgreSQL credentials. Source-node database users are not portable.
	envMap["CLIENT_NAME"] = name
	envMap["PORT"] = port
	if strings.TrimSpace(envMap["POSTGRES_DB"]) == "" {
		envMap["POSTGRES_DB"] = name
	}
	envMap["DATABASE_URL"] = destinationDatabaseURL(loadSharedEnv(), envMap["POSTGRES_DB"])
	writeEnvPatched(clientEnvFile(name), envData, envMap)
	syncCanonicalURLDefaults(clientEnvFile(name))

	// compose.yml - use archived copy verbatim.
	if len(composeData) > 0 {
		if err := os.WriteFile(clientComposeFile(name), composeData, 0644); err != nil {
			die("Cannot write compose.yml for '%s': %v", name, err)
		}
	}

	// Uploads - preserve directory tree.
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
				warn("  DB restore failed: %v - run 'grengo db init %s' for a fresh schema", err, name)
			} else {
				log("  Database '%s' restored", dbName)
			}
		} else {
			warn("  PostgreSQL not running - skipping DB restore")
		}
	} else {
		info("  No DB dump in archive - run 'grengo db init %s' to initialise", name)
	}
}

func destinationDatabaseURL(env SharedEnv, dbName string) string {
	u := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(env.PostgresUser, env.PostgresPassword),
		Host:   net.JoinHostPort("postgres", env.PGPort),
		Path:   "/" + dbName,
	}
	query := u.Query()
	query.Set("sslmode", "disable")
	u.RawQuery = query.Encode()
	return u.String()
}

// Port helper
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
	info("Port conflict - auto-assigning %s", next)
	return next
}

// Archive low-level helpers
// readArchive opens a .tar.gz file and returns all regular-file contents
// keyed by their path inside the archive.
func readArchive(path string) map[string][]byte {
	files, err := readArchiveSafe(path)
	if err != nil {
		die("Cannot read archive: %v", err)
	}
	return files
}

func readArchiveSafe(path string) (map[string][]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	gr, err := gzip.NewReader(f)
	if err != nil {
		return nil, err
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
			return nil, err
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		if hdr.Size < 0 || hdr.Size > 1<<30 {
			return nil, fmt.Errorf("archive entry %s exceeds the verification bound", hdr.Name)
		}
		data, err := io.ReadAll(io.LimitReader(tr, hdr.Size+1))
		if err != nil {
			return nil, fmt.Errorf("read archive entry %s: %w", hdr.Name, err)
		}
		if int64(len(data)) != hdr.Size {
			return nil, fmt.Errorf("archive entry %s has an invalid size", hdr.Name)
		}
		files[hdr.Name] = data
	}
	return files, nil
}

// parseMeta extracts and validates the meta.json entry from the file map.
func parseMeta(files map[string][]byte) archiveMeta {
	data, ok := files["meta.json"]
	if !ok {
		die("Invalid archive - meta.json not found")
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

type progressReader struct {
	io.Reader
	totalBytes     *int64
	processedBytes *int64
	lastReportTime *time.Time
	archivePrefix  string
}

func (pr *progressReader) Read(p []byte) (int, error) {
	n, err := pr.Reader.Read(p)
	if n > 0 && pr.totalBytes != nil && *pr.totalBytes > 0 {
		*pr.processedBytes += int64(n)
		now := time.Now()
		if now.Sub(*pr.lastReportTime) > 2*time.Second {
			pct := (*pr.processedBytes * 100) / *pr.totalBytes
			log("  Compressing %s... %d%% (%d MB / %d MB)", pr.archivePrefix, pct, *pr.processedBytes/1024/1024, *pr.totalBytes/1024/1024)
			*pr.lastReportTime = now
		}
	}
	return n, err
}

// addFileToArchive opens src from disk and streams it to the archive as archiveName.
func addFileToArchive(tw *tar.Writer, src, archiveName string, pr *progressReader) {
	info, err := os.Stat(src)
	if err != nil {
		warn("Skipping %s (stat failed): %v", src, err)
		return
	}

	f, err := os.Open(src)
	if err != nil {
		warn("Skipping %s (open failed): %v", src, err)
		return
	}
	defer f.Close()

	hdr := &tar.Header{
		Name:    archiveName,
		Mode:    int64(info.Mode().Perm()),
		Size:    info.Size(),
		ModTime: info.ModTime(),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		die("tar header error (%s): %v", archiveName, err)
	}

	var reader io.Reader = f
	if pr != nil {
		pr.Reader = f
		reader = pr
	}

	if _, err := io.Copy(tw, reader); err != nil {
		die("tar write error (%s): %v", archiveName, err)
	}
}

// addDirToArchive walks dir recursively and adds each file under archivePrefix/.
func addDirToArchive(tw *tar.Writer, dir, archivePrefix string) {
	archivePrefix = strings.TrimRight(archivePrefix, "/")

	var totalBytes int64
	var processedBytes int64
	filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			if info, err := d.Info(); err == nil {
				totalBytes += info.Size()
			}
		}
		return nil
	})

	now := time.Now()
	pr := &progressReader{
		totalBytes:     &totalBytes,
		processedBytes: &processedBytes,
		lastReportTime: &now,
		archivePrefix:  archivePrefix,
	}

	filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dir, path)

		addFileToArchive(tw, path, archivePrefix+"/"+rel, pr)
		return nil
	})
}

// Postgres helpers
// addPgDumpToArchive runs pg_dump inside the postgres container and streams the output to the tar archive.
func addPgDumpToArchive(tw *tar.Writer, dbName, archiveName string) error {
	env := loadSharedEnv()
	cmd := exec.Command(
		"docker", "exec", "skaia-postgres",
		"pg_dump", "-U", env.PostgresUser, dbName,
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}

	// We don't know the size of the dump beforehand. So we cannot write it as a normal tar file header easily!
	// Wait, standard tar format requires size in the header! If we don't know the size, we can't write it to the tar stream without buffering it.
	// Is there a way to write a tar header without size? No.
	// Instead, we can dump it to a temporary file, stat it, and stream it!
	tmpFile, err := os.CreateTemp("", "pgdump-*.sql")
	if err != nil {
		return err
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	var dumpedBytes int64
	lastReport := time.Now()
	dumpPr := &dumpProgressReader{
		Reader:         stdout,
		processedBytes: &dumpedBytes,
		lastReportTime: &lastReport,
		dbName:         dbName,
	}

	if _, err := io.Copy(tmpFile, dumpPr); err != nil {
		return err
	}
	if err := cmd.Wait(); err != nil {
		return err
	}

	info, err := tmpFile.Stat()
	if err != nil {
		return err
	}

	hdr := &tar.Header{
		Name:    archiveName,
		Mode:    0644,
		Size:    info.Size(),
		ModTime: info.ModTime(),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}

	if _, err := tmpFile.Seek(0, 0); err != nil {
		return err
	}

	var copiedBytes int64
	totalBytes := info.Size()
	lastReportCopy := time.Now()
	copyPr := &progressReader{
		Reader:         tmpFile,
		totalBytes:     &totalBytes,
		processedBytes: &copiedBytes,
		lastReportTime: &lastReportCopy,
		archivePrefix:  archiveName,
	}

	if _, err := io.Copy(tw, copyPr); err != nil {
		return err
	}
	return nil
}

type dumpProgressReader struct {
	io.Reader
	processedBytes *int64
	lastReportTime *time.Time
	dbName         string
}

func (pr *dumpProgressReader) Read(p []byte) (int, error) {
	n, err := pr.Reader.Read(p)
	if n > 0 {
		*pr.processedBytes += int64(n)
		now := time.Now()
		if now.Sub(*pr.lastReportTime) > 2*time.Second {
			log("  Dumping %s... %d MB", pr.dbName, *pr.processedBytes/1024/1024)
			*pr.lastReportTime = now
		}
	}
	return n, err
}

// Env helpers
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
