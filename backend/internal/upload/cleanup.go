// Package upload – cleanup helpers for orphaned upload files.
//
// ExtractUploadURLs scans HTML/Markdown content for /uploads/… paths so
// callers (forum, config, user handlers) can remove the corresponding files
// when the owning entity (thread, comment, landing item, avatar) is deleted.
package upload

import (
	"log"
	"os"
	"regexp"
	"strings"
)

// uploadRe matches paths like /uploads/users/123/images/foo.jpg in both
// src="…" attributes and bare markdown image references.
var uploadRe = regexp.MustCompile(`/uploads/users/\d+/[a-zA-Z]+/[^\s"')<>\]]+`)

// ExtractUploadURLs returns every unique /uploads/… path found in content.
func ExtractUploadURLs(content string) []string {
	matches := uploadRe.FindAllString(content, -1)
	seen := map[string]bool{}
	var unique []string
	for _, m := range matches {
		// Strip any trailing punctuation that crept in.
		m = strings.TrimRight(m, ".,;:!?")
		if !seen[m] {
			seen[m] = true
			unique = append(unique, m)
		}
	}
	return unique
}

// DeleteUploadFile removes a single upload from disk given its URL path
// (e.g. "/uploads/users/42/images/16…jpg"). It silently ignores missing files.
func DeleteUploadFile(urlPath string) {
	if urlPath == "" || !strings.HasPrefix(urlPath, "/uploads/") {
		return
	}
	// Guard against directory traversal.
	if strings.Contains(urlPath, "..") {
		return
	}
	fsPath := "." + urlPath // ./uploads/users/…
	if err := os.Remove(fsPath); err != nil && !os.IsNotExist(err) {
		log.Printf("upload.DeleteUploadFile: %s: %v", fsPath, err)
	}
}

// CleanupContentUploads extracts all upload URLs from the given content
// (thread body, comment body, …) and deletes the corresponding files.
func CleanupContentUploads(content string) {
	for _, url := range ExtractUploadURLs(content) {
		DeleteUploadFile(url)
	}
}
