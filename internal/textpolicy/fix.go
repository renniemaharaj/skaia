package textpolicy

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

func FixRepository(root string) ([]string, error) {
	files, err := trackedFiles(root)
	if err != nil {
		return nil, err
	}
	var changed []string
	for _, filePath := range files {
		fullPath := filepath.Join(root, filepath.FromSlash(filePath))
		data, err := os.ReadFile(fullPath)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", filePath, err)
		}
		fixed := Fix(filePath, data)
		if bytes.Equal(data, fixed) {
			continue
		}
		info, err := os.Stat(fullPath)
		if err != nil {
			return nil, fmt.Errorf("stat %s: %w", filePath, err)
		}
		if err := os.WriteFile(fullPath, fixed, info.Mode().Perm()); err != nil {
			return nil, fmt.Errorf("write %s: %w", filePath, err)
		}
		changed = append(changed, filePath)
	}
	return changed, nil
}

func Fix(filePath string, data []byte) []byte {
	if isBinary(filePath, data) || isVendored(filePath) || !utf8.Valid(data) {
		return data
	}
	value := strings.NewReplacer("\u2014", "-", "\u2192", "->").Replace(string(data))
	lines := strings.Split(value, "\n")
	for index := range lines {
		lines[index] = strings.TrimRight(strings.TrimSuffix(lines[index], "\r"), " \t")
	}

	style := styleFor(filePath)
	layoutStyle := style
	if isVendored(filePath) || isGenerated(data) {
		layoutStyle = commentNone
	}
	if style != commentNone {
		decorativeComments := decorativeCommentLines(lines, style)
		filtered := lines[:0]
		for index, line := range lines {
			if (decorativeComments[index] && isSingleLineComment(line, style)) || isEmptyCommentBanner(lines, index, style) {
				continue
			}
			filtered = append(filtered, line)
		}
		lines = filtered
		for {
			comments := commentLines(lines, layoutStyle)
			removed := false
			filtered = make([]string, 0, len(lines))
			for index, line := range lines {
				if index > 0 && index < len(lines)-1 && strings.TrimSpace(line) == "" && comments[index-1] && hasContentAfter(lines, index) {
					removed = true
					continue
				}
				filtered = append(filtered, line)
			}
			lines = filtered
			if !removed {
				break
			}
		}
	}

	value = strings.Join(lines, "\n")
	if value == "" {
		return []byte("\n")
	}
	if !strings.HasSuffix(value, "\n") {
		value += "\n"
	}
	return []byte(value)
}

func isSingleLineComment(line string, style commentStyle) bool {
	trimmed := strings.TrimSpace(line)
	if style == commentHash {
		return strings.HasPrefix(trimmed, "#")
	}
	if strings.HasPrefix(trimmed, "//") {
		return true
	}
	start := strings.Index(trimmed, "/*")
	return start >= 0 && strings.Contains(trimmed[start+2:], "*/")
}
