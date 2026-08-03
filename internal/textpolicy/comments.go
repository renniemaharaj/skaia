package textpolicy

import (
	"path/filepath"
	"strings"
)

type commentStyle int

const (
	commentNone commentStyle = iota
	commentSlash
	commentHash
)

func styleFor(filePath string) commentStyle {
	base := strings.ToLower(filepath.Base(filePath))
	if base == "dockerfile" || strings.HasPrefix(base, "dockerfile.") {
		return commentHash
	}
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".go", ".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".proto":
		return commentSlash
	case ".sh", ".bash", ".zsh", ".yaml", ".yml":
		return commentHash
	default:
		return commentNone
	}
}

func commentLines(lines []string, style commentStyle) []bool {
	result := make([]bool, len(lines))
	inBlock := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch style {
		case commentSlash:
			if inBlock {
				result[i] = true
				if strings.Contains(trimmed, "*/") {
					inBlock = false
				}
				continue
			}
			if strings.HasPrefix(trimmed, "//") {
				result[i] = true
				continue
			}
			if strings.HasPrefix(trimmed, "/*") {
				result[i] = true
				inBlock = !strings.Contains(trimmed[2:], "*/")
			}
		case commentHash:
			result[i] = strings.HasPrefix(trimmed, "#")
		}
	}
	return result
}

func commentPayload(line string, style commentStyle) (string, bool) {
	trimmed := strings.TrimSpace(line)
	switch style {
	case commentSlash:
		for _, prefix := range []string{"//", "/*", "*"} {
			if strings.HasPrefix(trimmed, prefix) {
				payload := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(trimmed, prefix), "*/"))
				return payload, true
			}
		}
	case commentHash:
		if strings.HasPrefix(trimmed, "#") {
			return strings.TrimSpace(strings.TrimPrefix(trimmed, "#")), true
		}
	}
	return "", false
}

func isDecorativeSeparator(payload string) bool {
	previous := rune(0)
	runLength := 0
	for _, r := range payload {
		if r == previous {
			runLength++
		} else {
			previous = r
			runLength = 1
		}
		if strings.ContainsRune("\u2500\u2501\u2550", r) && runLength >= 2 {
			return true
		}
		if strings.ContainsRune("=-_*", r) && runLength >= 5 {
			return true
		}
	}
	return false
}

func decorativeCommentLines(lines []string, style commentStyle) []bool {
	result := make([]bool, len(lines))
	if style == commentHash {
		for index, line := range lines {
			if payload, ok := commentPayload(line, style); ok {
				result[index] = isDecorativeSeparator(payload)
			}
		}
		return result
	}
	if style != commentSlash {
		return result
	}

	var inBlock bool
	var quote byte
	for index, line := range lines {
		for offset := 0; offset < len(line); {
			if inBlock {
				end := strings.Index(line[offset:], "*/")
				if end < 0 {
					result[index] = result[index] || isDecorativeSeparator(line[offset:])
					break
				}
				result[index] = result[index] || isDecorativeSeparator(line[offset:offset+end])
				offset += end + 2
				inBlock = false
				continue
			}
			if quote != 0 {
				if quote == '`' && line[offset] == '#' {
					result[index] = result[index] || isDecorativeSeparator(line[offset+1:])
				}
				if line[offset] == '\\' && quote != '`' {
					offset += 2
					continue
				}
				if line[offset] == quote {
					quote = 0
				}
				offset++
				continue
			}
			switch line[offset] {
			case '\'', '"', '`':
				quote = line[offset]
				offset++
			case '/':
				if offset+1 >= len(line) {
					offset++
					continue
				}
				switch line[offset+1] {
				case '/':
					result[index] = isDecorativeSeparator(line[offset+2:])
					offset = len(line)
				case '*':
					offset += 2
					inBlock = true
				default:
					offset++
				}
			default:
				offset++
			}
		}
	}
	return result
}

func isEmptyCommentBanner(lines []string, index int, style commentStyle) bool {
	payload, comment := commentPayload(lines[index], style)
	if !comment || payload != "" {
		return false
	}
	if index+2 < len(lines) {
		_, middle := commentPayload(lines[index+1], style)
		nextPayload, next := commentPayload(lines[index+2], style)
		if middle && next && nextPayload == "" {
			return true
		}
	}
	if index >= 2 {
		previousPayload, previous := commentPayload(lines[index-2], style)
		_, middle := commentPayload(lines[index-1], style)
		return previous && middle && previousPayload == ""
	}
	return false
}
