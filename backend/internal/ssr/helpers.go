package ssr

import (
	"html"
	"strings"
)

func stripHTML(s string) string {
	// Replace all HTML tags with a space to prevent words from mashing together
	s = htmlTagRx.ReplaceAllString(s, " ")
	// Unescape any HTML entities like &amp; back to normal text
	s = html.UnescapeString(s)
	// Collapse multiple spaces into one
	s = multiSpaceRx.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func snip(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func replacePlaceholder(doc, placeholder, replacement string) string {
	return strings.ReplaceAll(doc, placeholder, replacement)
}

func htmlEscape(s string) string {
	return html.EscapeString(s)
}
