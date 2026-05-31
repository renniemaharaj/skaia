package utils

import (
	"regexp"
)

var spanRegex = regexp.MustCompile(`(?i)<span([^>]+)>`)
var typeMentionRegex = regexp.MustCompile(`(?i)data-type=['"]?mention['"]?`)
var idRegex = regexp.MustCompile(`(?i)(?:data-)?id=['"]([^'"]+)['"]`)

// ExtractMentions extracts all mentioned IDs (users, roles, "here", "everyone") from an HTML string.
func ExtractMentions(htmlContent string) []string {
	var ids []string
	matches := spanRegex.FindAllStringSubmatch(htmlContent, -1)
	for _, m := range matches {
		if len(m) > 1 {
			attrs := m[1]
			if typeMentionRegex.MatchString(attrs) {
				idMatch := idRegex.FindStringSubmatch(attrs)
				if len(idMatch) > 1 {
					ids = append(ids, idMatch[1])
				}
			}
		}
	}
	return ids
}

// DiffMentions returns the mentions that are in newMentions but not in oldMentions
func DiffMentions(oldMentions, newMentions []string) []string {
	oldSet := make(map[string]bool)
	for _, id := range oldMentions {
		oldSet[id] = true
	}
	
	var added []string
	for _, id := range newMentions {
		if !oldSet[id] {
			added = append(added, id)
		}
	}
	return added
}
