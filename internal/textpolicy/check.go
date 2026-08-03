package textpolicy

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

type Rule string

const (
	RuleBlankAfterComment Rule = "blank-after-comment"
	RuleConflictMarker    Rule = "conflict-marker"
	RuleDecorativeComment Rule = "decorative-comment"
	RuleEmoji             Rule = "emoji"
	RuleEmDash            Rule = "em-dash"
	RuleFinalNewline      Rule = "final-newline"
	RuleRightArrow        Rule = "right-arrow"
	RuleTrailingSpace     Rule = "trailing-whitespace"
	RuleUTF8              Rule = "utf8"
)

type Violation struct {
	Path    string
	Line    int
	Column  int
	Rule    Rule
	Message string
}

func (v Violation) String() string {
	return fmt.Sprintf("%s:%d:%d: %s: %s", v.Path, v.Line, v.Column, v.Rule, v.Message)
}

func CheckRepository(root string) ([]Violation, error) {
	patterns, err := loadEmojiAllowlist(root)
	if err != nil {
		return nil, err
	}
	files, err := trackedFiles(root)
	if err != nil {
		return nil, err
	}

	var violations []Violation
	for _, filePath := range files {
		data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(filePath)))
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", filePath, err)
		}
		violations = append(violations, Check(filePath, data, matchesAny(filePath, patterns))...)
	}
	sort.Slice(violations, func(i, j int) bool {
		left, right := violations[i], violations[j]
		if left.Path != right.Path {
			return left.Path < right.Path
		}
		if left.Line != right.Line {
			return left.Line < right.Line
		}
		if left.Column != right.Column {
			return left.Column < right.Column
		}
		return left.Rule < right.Rule
	})
	return violations, nil
}

func Check(filePath string, data []byte, allowEmoji bool) []Violation {
	if isBinary(filePath, data) {
		return nil
	}
	if !utf8.Valid(data) {
		return []Violation{{Path: filePath, Line: 1, Column: 1, Rule: RuleUTF8, Message: "text file is not valid UTF-8"}}
	}

	var violations []Violation
	if len(data) == 0 || data[len(data)-1] != '\n' {
		violations = append(violations, Violation{Path: filePath, Line: lineCount(data), Column: 1, Rule: RuleFinalNewline, Message: "text file must end with a newline"})
	}

	lines := strings.Split(string(data), "\n")
	style := styleFor(filePath)
	layoutStyle := style
	if isVendored(filePath) || isGenerated(data) {
		layoutStyle = commentNone
	}
	comments := commentLines(lines, layoutStyle)
	decorativeComments := decorativeCommentLines(lines, style)
	for index, line := range lines {
		lineNumber := index + 1
		content := strings.TrimSuffix(line, "\r")
		if strings.TrimRight(content, " \t") != content {
			violations = append(violations, Violation{Path: filePath, Line: lineNumber, Column: utf8.RuneCountInString(strings.TrimRight(content, " \t")) + 1, Rule: RuleTrailingSpace, Message: "remove trailing whitespace"})
		}
		if isConflictMarker(content) {
			violations = append(violations, Violation{Path: filePath, Line: lineNumber, Column: 1, Rule: RuleConflictMarker, Message: "remove merge conflict marker"})
		}
		if decorativeComments[index] && !isVendored(filePath) {
			violations = append(violations, Violation{Path: filePath, Line: lineNumber, Column: 1, Rule: RuleDecorativeComment, Message: "remove decorative comment separator"})
		}
		if isEmptyCommentBanner(lines, index, layoutStyle) {
			violations = append(violations, Violation{Path: filePath, Line: lineNumber, Column: 1, Rule: RuleDecorativeComment, Message: "remove multiline comment banner"})
		}
		for column, r := range rangeRunes(content) {
			switch {
			case r == '\u2014':
				violations = append(violations, Violation{Path: filePath, Line: lineNumber, Column: column, Rule: RuleEmDash, Message: "replace em dash with plain punctuation"})
			case r == '\u2192':
				violations = append(violations, Violation{Path: filePath, Line: lineNumber, Column: column, Rule: RuleRightArrow, Message: "replace Unicode right arrow with ASCII text"})
			case !allowEmoji && isEmoji(r):
				violations = append(violations, Violation{Path: filePath, Line: lineNumber, Column: column, Rule: RuleEmoji, Message: "emoji is not allowed for this path"})
			}
		}
	}
	for index := 1; index < len(lines)-1; index++ {
		if strings.TrimSpace(lines[index]) == "" && comments[index-1] && hasContentAfter(lines, index) {
			violations = append(violations, Violation{Path: filePath, Line: index + 1, Column: 1, Rule: RuleBlankAfterComment, Message: "remove blank line between comment and code"})
		}
	}
	return violations
}

func trackedFiles(root string) ([]string, error) {
	command := exec.Command("git", "-C", root, "ls-files", "-z")
	output, err := command.Output()
	if err != nil {
		return nil, fmt.Errorf("list tracked files: %w", err)
	}
	parts := bytes.Split(output, []byte{0})
	files := make([]string, 0, len(parts))
	for _, part := range parts {
		if len(part) > 0 {
			files = append(files, filepath.ToSlash(string(part)))
		}
	}
	return files, nil
}

func isBinary(filePath string, data []byte) bool {
	extension := strings.ToLower(filepath.Ext(filePath))
	switch extension {
	case ".7z", ".a", ".avi", ".bin", ".bmp", ".class", ".db", ".dll", ".eot", ".exe", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".mov", ".mp3", ".mp4", ".o", ".pdf", ".png", ".so", ".tar", ".tgz", ".ttf", ".wav", ".webm", ".webp", ".woff", ".woff2", ".xz", ".zip":
		return true
	}
	return bytes.IndexByte(data, 0) >= 0
}

func isVendored(filePath string) bool {
	path := "/" + filepath.ToSlash(filePath) + "/"
	return strings.Contains(path, "/vendor/")
}

func isGenerated(data []byte) bool {
	prefix := data
	if len(prefix) > 2048 {
		prefix = prefix[:2048]
	}
	return bytes.Contains(prefix, []byte("Code generated")) && bytes.Contains(prefix, []byte("DO NOT EDIT"))
}

func isConflictMarker(line string) bool {
	trimmed := strings.TrimSuffix(line, "\r")
	for _, marker := range []string{"<<<<<<<", "=======", ">>>>>>>"} {
		if trimmed == marker || strings.HasPrefix(trimmed, marker+" ") {
			return true
		}
	}
	return false
}

func lineCount(data []byte) int {
	if len(data) == 0 {
		return 1
	}
	return bytes.Count(data, []byte{'\n'}) + 1
}

func hasContentAfter(lines []string, blankIndex int) bool {
	for index := blankIndex + 1; index < len(lines); index++ {
		if strings.TrimSpace(lines[index]) != "" {
			return true
		}
	}
	return false
}

func rangeRunes(value string) map[int]rune {
	runes := make(map[int]rune)
	column := 1
	for _, r := range value {
		runes[column] = r
		column++
	}
	return runes
}
