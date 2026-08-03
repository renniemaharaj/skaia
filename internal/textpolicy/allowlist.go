package textpolicy

import (
	"bufio"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const emojiAllowlistFile = ".emojiallow"

func loadEmojiAllowlist(root string) ([]string, error) {
	file, err := os.Open(filepath.Join(root, emojiAllowlistFile))
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", emojiAllowlistFile, err)
	}
	defer file.Close()

	var patterns []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		pattern := strings.TrimSpace(scanner.Text())
		if pattern == "" || strings.HasPrefix(pattern, "#") {
			continue
		}
		patterns = append(patterns, filepath.ToSlash(pattern))
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read %s: %w", emojiAllowlistFile, err)
	}
	return patterns, nil
}

func matchesAny(filePath string, patterns []string) bool {
	filePath = filepath.ToSlash(filePath)
	for _, pattern := range patterns {
		if strings.HasSuffix(pattern, "/**") {
			prefix := strings.TrimSuffix(pattern, "**")
			if strings.HasPrefix(filePath, prefix) {
				return true
			}
			continue
		}
		matched, err := path.Match(pattern, filePath)
		if err == nil && matched {
			return true
		}
	}
	return false
}
