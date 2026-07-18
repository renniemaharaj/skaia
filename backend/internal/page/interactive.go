package page

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/skaia/backend/internal/s_registry"
)

var (
	ErrInteractiveSectionNotFound = errors.New("interactive section not found")
	ErrInteractiveClosed          = errors.New("interactive section is closed")
	ErrInteractiveDuplicate       = errors.New("response limit reached")
	ErrInteractiveRecordNotFound  = errors.New("interactive record not found")
	ErrInteractiveForbidden       = errors.New("interactive response management forbidden")
)

type InteractiveRecord struct {
	ID                 string                 `json:"id"`
	UserID             int64                  `json:"user_id,omitempty"`
	RespondentName     string                 `json:"respondent_name,omitempty"`
	Answers            map[string]interface{} `json:"answers"`
	Status             string                 `json:"status"`
	Answer             string                 `json:"answer,omitempty"`
	Pinned             bool                   `json:"pinned,omitempty"`
	IdempotencyKey     string                 `json:"idempotency_key,omitempty"`
	IdempotencyKeyHash string                 `json:"-"`
	SubmittedAt        time.Time              `json:"submitted_at"`
	UpdatedAt          time.Time              `json:"updated_at,omitempty"`
}

type InteractiveRecordPatch struct {
	Status *string `json:"status,omitempty"`
	Answer *string `json:"answer,omitempty"`
	Pinned *bool   `json:"pinned,omitempty"`
}

func decodePageSections(content string) ([]map[string]interface{}, error) {
	var sections []map[string]interface{}
	if err := json.Unmarshal([]byte(content), &sections); err != nil {
		return nil, err
	}
	return sections, nil
}

func sectionID(section map[string]interface{}) int64 {
	switch value := section["id"].(type) {
	case float64:
		return int64(value)
	case int64:
		return value
	case json.Number:
		id, _ := value.Int64()
		return id
	}
	return 0
}

func sectionConfig(section map[string]interface{}) (map[string]interface{}, error) {
	switch raw := section["config"].(type) {
	case nil:
		return map[string]interface{}{}, nil
	case string:
		if strings.TrimSpace(raw) == "" {
			return map[string]interface{}{}, nil
		}
		var cfg map[string]interface{}
		if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
			return nil, err
		}
		return cfg, nil
	case map[string]interface{}:
		return raw, nil
	default:
		return nil, fmt.Errorf("section config must be an object")
	}
}

func setSectionConfig(section map[string]interface{}, cfg map[string]interface{}) error {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	section["config"] = string(raw)
	return nil
}

func recordsFromConfig(cfg map[string]interface{}) []interface{} {
	records, _ := cfg["records"].([]interface{})
	if records == nil {
		return []interface{}{}
	}
	return records
}

// mergeInteractiveRecords keeps participant-owned data from the locked current
// document while applying an ordinary builder save to the rest of each section.
func mergeInteractiveRecords(currentContent, incomingContent string) (string, error) {
	current, err := decodePageSections(currentContent)
	if err != nil {
		return "", err
	}
	incoming, err := decodePageSections(incomingContent)
	if err != nil {
		return "", err
	}
	byID := make(map[int64]map[string]interface{}, len(current))
	for _, section := range current {
		byID[sectionID(section)] = section
	}
	for _, section := range incoming {
		typ, _ := section["section_type"].(string)
		if !s_registry.IsInteractive(typ) {
			continue
		}
		prior := byID[sectionID(section)]
		if prior == nil {
			continue
		}
		priorCfg, err := sectionConfig(prior)
		if err != nil {
			return "", err
		}
		nextCfg, err := sectionConfig(section)
		if err != nil {
			return "", err
		}
		nextCfg["records"] = recordsFromConfig(priorCfg)
		delete(nextCfg, "result_summary")
		if err := setSectionConfig(section, nextCfg); err != nil {
			return "", err
		}
	}
	raw, err := json.Marshal(incoming)
	return string(raw), err
}

func findInteractiveSection(sections []map[string]interface{}, id int64) (map[string]interface{}, string, error) {
	for _, section := range sections {
		if sectionID(section) != id {
			continue
		}
		typ, _ := section["section_type"].(string)
		if !s_registry.IsInteractive(typ) {
			break
		}
		return section, typ, nil
	}
	return nil, "", ErrInteractiveSectionNotFound
}

func answerPresent(value interface{}) bool {
	if value == nil {
		return false
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed) != ""
	case []interface{}:
		return len(typed) > 0
	case bool:
		return typed
	}
	return true
}

func validateAnswers(cfg map[string]interface{}, answers map[string]interface{}) error {
	if len(answers) > 50 {
		return fmt.Errorf("too many answers")
	}
	fields, _ := cfg["fields"].([]interface{})
	allowed := map[string]map[string]interface{}{}
	for _, raw := range fields {
		field, _ := raw.(map[string]interface{})
		key, _ := field["key"].(string)
		allowed[key] = field
		if required, _ := field["required"].(bool); required && !answerPresent(answers[key]) {
			return fmt.Errorf("%s is required", key)
		}
	}
	for key, value := range answers {
		field, ok := allowed[key]
		if !ok {
			return fmt.Errorf("unknown answer %q", key)
		}
		fieldType, _ := field["type"].(string)
		switch fieldType {
		case "text", "textarea", "email", "phone", "url", "date", "time":
			text, ok := value.(string)
			if !ok {
				return fmt.Errorf("answer %q must be a string", key)
			}
			if len(text) > 10000 {
				return fmt.Errorf("answer %q is too long", key)
			}
			trimmed := strings.TrimSpace(text)
			if fieldType == "email" && trimmed != "" {
				address, err := mail.ParseAddress(trimmed)
				if err != nil || address.Address != trimmed || !strings.Contains(trimmed, "@") {
					return fmt.Errorf("answer %q must be a valid email address", key)
				}
			}
			if fieldType == "url" && trimmed != "" {
				parsed, err := url.ParseRequestURI(trimmed)
				if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
					return fmt.Errorf("answer %q must be an http or https URL", key)
				}
			}
			if fieldType == "date" && trimmed != "" {
				if _, err := time.Parse("2006-01-02", trimmed); err != nil {
					return fmt.Errorf("answer %q must be a valid date", key)
				}
			}
			if fieldType == "time" && trimmed != "" {
				if _, err := time.Parse("15:04", trimmed); err != nil {
					return fmt.Errorf("answer %q must be a valid time", key)
				}
			}
		case "select", "radio":
			choice, ok := value.(string)
			if !ok || !configuredOption(field, choice) {
				return fmt.Errorf("answer %q must be a configured option", key)
			}
		case "multi_select":
			choices, ok := value.([]interface{})
			if !ok {
				return fmt.Errorf("answer %q must be an array", key)
			}
			seen := map[string]bool{}
			for _, rawChoice := range choices {
				choice, ok := rawChoice.(string)
				if !ok || seen[choice] || !configuredOption(field, choice) {
					return fmt.Errorf("answer %q contains an invalid option", key)
				}
				seen[choice] = true
			}
		case "checkbox", "consent":
			checked, ok := value.(bool)
			if !ok {
				return fmt.Errorf("answer %q must be boolean", key)
			}
			if required, _ := field["required"].(bool); required && !checked {
				return fmt.Errorf("%s must be accepted", key)
			}
		case "number", "rating", "scale", "nps":
			number, ok := value.(float64)
			if !ok || math.IsNaN(number) || math.IsInf(number, 0) {
				return fmt.Errorf("answer %q must be numeric", key)
			}
			min, max := numericBounds(fieldType, field)
			if (min != nil && number < *min) || (max != nil && number > *max) {
				return fmt.Errorf("answer %q is outside the configured bounds", key)
			}
			if (fieldType == "rating" || fieldType == "scale" || fieldType == "nps") && number != math.Trunc(number) {
				return fmt.Errorf("answer %q must be a whole number", key)
			}
		default:
			return fmt.Errorf("answer %q has an unsupported field type", key)
		}
	}
	return nil
}

func configuredOption(field map[string]interface{}, value string) bool {
	options, _ := field["options"].([]interface{})
	for _, raw := range options {
		option, _ := raw.(map[string]interface{})
		if key, _ := option["key"].(string); key == value {
			return true
		}
	}
	return false
}

func numericBounds(fieldType string, field map[string]interface{}) (*float64, *float64) {
	var min, max *float64
	if value, ok := field["min"].(float64); ok {
		min = &value
	}
	if value, ok := field["max"].(float64); ok {
		max = &value
	}
	if min == nil {
		value := 1.0
		if fieldType == "nps" {
			value = 0
		}
		if fieldType == "rating" || fieldType == "scale" || fieldType == "nps" {
			min = &value
		}
	}
	if max == nil && (fieldType == "rating" || fieldType == "scale" || fieldType == "nps") {
		value := 5.0
		if fieldType == "nps" {
			value = 10
		}
		max = &value
	}
	return min, max
}

func numberSetting(cfg map[string]interface{}, key string, fallback int) int {
	if value, ok := cfg[key].(float64); ok && value >= 0 {
		return int(value)
	}
	return fallback
}

// SubmitInteractive appends a response to an existing PageSection config.
func (s *Service) SubmitInteractive(pageID, targetSectionID, userID int64, respondentName, idempotencyKey string, answers map[string]interface{}) (*InteractiveRecord, error) {
	if userID <= 0 {
		return nil, ErrInteractiveForbidden
	}
	if len(idempotencyKey) > 200 {
		return nil, fmt.Errorf("idempotency key is too long")
	}
	page, err := s.repo.GetByID(pageID)
	if err != nil {
		return nil, err
	}
	useNormalized, err := s.normalizedInteractiveForPage(pageID)
	if err != nil {
		return nil, err
	}
	if useNormalized {
		return s.submitNormalizedInteractive(page, targetSectionID, userID, respondentName, idempotencyKey, answers)
	}
	var created *InteractiveRecord
	err = s.repo.MutateContent(pageID, func(content string) (string, error) {
		sections, err := decodePageSections(content)
		if err != nil {
			return "", err
		}
		section, typ, err := findInteractiveSection(sections, targetSectionID)
		if err != nil {
			return "", err
		}
		cfg, err := sectionConfig(section)
		if err != nil {
			return "", err
		}
		if err := s_registry.ValidateInteractiveConfig(typ, cfg); err != nil {
			return "", fmt.Errorf("interactive config is invalid: %w", err)
		}
		if status, _ := cfg["status"].(string); status == "closed" {
			return "", ErrInteractiveClosed
		}
		if err := validateAnswers(cfg, answers); err != nil {
			return "", err
		}
		records := recordsFromConfig(cfg)
		limit := numberSetting(cfg, "response_limit", 0)
		if typ == "poll" || typ == "vote" {
			limit = 1
		}
		count := 0
		for _, raw := range records {
			record, _ := raw.(map[string]interface{})
			recordUserID, _ := record["user_id"].(float64)
			key, _ := record["idempotency_key"].(string)
			storedHash, _ := record["idempotency_key_hash"].(string)
			if idempotencyKey != "" && int64(recordUserID) == userID && (key == idempotencyKey || storedHash == interactiveIdempotencyHash(idempotencyKey)) {
				blob, _ := json.Marshal(record)
				var existing InteractiveRecord
				_ = json.Unmarshal(blob, &existing)
				created = &existing
				return content, nil
			}
			if int64(recordUserID) == userID {
				count++
			}
		}
		if limit > 0 && count >= limit {
			return "", ErrInteractiveDuplicate
		}
		if len(records) >= 1000 {
			return "", fmt.Errorf("section response capacity reached")
		}
		now := time.Now().UTC()
		status := "submitted"
		if typ == "qa" {
			status = "pending"
			if moderate, ok := cfg["moderation"].(bool); ok && !moderate {
				status = "published"
			}
		}
		created = &InteractiveRecord{
			ID: uuid.NewString(), UserID: userID, RespondentName: respondentName,
			Answers: answers, Status: status, IdempotencyKey: idempotencyKey, SubmittedAt: now,
		}
		records = append(records, created)
		cfg["records"] = records
		if err := setSectionConfig(section, cfg); err != nil {
			return "", err
		}
		next, err := json.Marshal(sections)
		return string(next), err
	})
	if err == nil {
		s.invalidateSEOByID(pageID)
	}
	return created, err
}

func (s *Service) DeleteInteractiveRecord(pageID, targetSectionID int64, recordID string, actorID int64) error {
	if err := s.requireInteractiveManager(pageID, actorID); err != nil {
		return err
	}
	useNormalized, err := s.normalizedInteractiveForPage(pageID)
	if err != nil {
		return err
	}
	if useNormalized {
		return s.deleteNormalizedInteractiveRecord(pageID, targetSectionID, recordID)
	}
	err = s.repo.MutateContent(pageID, func(content string) (string, error) {
		sections, err := decodePageSections(content)
		if err != nil {
			return "", err
		}
		section, _, err := findInteractiveSection(sections, targetSectionID)
		if err != nil {
			return "", err
		}
		cfg, err := sectionConfig(section)
		if err != nil {
			return "", err
		}
		nextRecords := make([]interface{}, 0, len(recordsFromConfig(cfg)))
		found := false
		for _, raw := range recordsFromConfig(cfg) {
			record, _ := raw.(map[string]interface{})
			if id, _ := record["id"].(string); id == recordID {
				found = true
				continue
			}
			nextRecords = append(nextRecords, raw)
		}
		if !found {
			return "", ErrInteractiveRecordNotFound
		}
		cfg["records"] = nextRecords
		if err := setSectionConfig(section, cfg); err != nil {
			return "", err
		}
		next, err := json.Marshal(sections)
		return string(next), err
	})
	if err == nil {
		s.invalidateSEOByID(pageID)
	}
	return err
}

func (s *Service) PatchInteractiveRecord(pageID, targetSectionID int64, recordID string, patch InteractiveRecordPatch, actorID int64) error {
	if err := s.requireInteractiveManager(pageID, actorID); err != nil {
		return err
	}
	useNormalized, err := s.normalizedInteractiveForPage(pageID)
	if err != nil {
		return err
	}
	if useNormalized {
		return s.patchNormalizedInteractiveRecord(pageID, targetSectionID, recordID, patch)
	}
	err = s.repo.MutateContent(pageID, func(content string) (string, error) {
		sections, err := decodePageSections(content)
		if err != nil {
			return "", err
		}
		section, typ, err := findInteractiveSection(sections, targetSectionID)
		if err != nil {
			return "", err
		}
		if typ != "qa" {
			return "", fmt.Errorf("moderation is only supported for Q&A")
		}
		cfg, err := sectionConfig(section)
		if err != nil {
			return "", err
		}
		found := false
		for _, raw := range recordsFromConfig(cfg) {
			record, _ := raw.(map[string]interface{})
			if id, _ := record["id"].(string); id != recordID {
				continue
			}
			found = true
			if patch.Status != nil {
				if *patch.Status != "pending" && *patch.Status != "published" && *patch.Status != "answered" && *patch.Status != "archived" {
					return "", fmt.Errorf("invalid moderation status")
				}
				record["status"] = *patch.Status
			}
			if patch.Answer != nil {
				if len(*patch.Answer) > 10000 {
					return "", fmt.Errorf("answer is too long")
				}
				record["answer"] = strings.TrimSpace(*patch.Answer)
				if strings.TrimSpace(*patch.Answer) != "" {
					record["status"] = "answered"
				}
			}
			if patch.Pinned != nil {
				record["pinned"] = *patch.Pinned
			}
			record["updated_at"] = time.Now().UTC()
		}
		if !found {
			return "", ErrInteractiveRecordNotFound
		}
		if err := setSectionConfig(section, cfg); err != nil {
			return "", err
		}
		next, err := json.Marshal(sections)
		return string(next), err
	})
	if err == nil {
		s.invalidateSEOByID(pageID)
	}
	return err
}

func (s *Service) requireInteractiveManager(pageID, actorID int64) error {
	if s.interactivePolicy == nil {
		return ErrInteractiveForbidden
	}
	if err := s.interactivePolicy.RequireInteractiveResponseManager(pageID, actorID); err != nil {
		return ErrInteractiveForbidden
	}
	return nil
}

func interactiveResultSummary(cfg map[string]interface{}) map[string]interface{} {
	counts := map[string]map[string]int{}
	aggregateFields := map[string]bool{}
	fields, _ := cfg["fields"].([]interface{})
	for _, raw := range fields {
		field, _ := raw.(map[string]interface{})
		key, _ := field["key"].(string)
		fieldType, _ := field["type"].(string)
		switch fieldType {
		case "radio", "select", "multi_select", "checkbox", "consent", "rating", "scale", "nps":
			aggregateFields[key] = true
		}
	}
	records := recordsFromConfig(cfg)
	for _, raw := range records {
		record, _ := raw.(map[string]interface{})
		answers, _ := record["answers"].(map[string]interface{})
		for key, value := range answers {
			if !aggregateFields[key] {
				continue
			}
			values := []interface{}{value}
			if list, ok := value.([]interface{}); ok {
				values = list
			}
			if counts[key] == nil {
				counts[key] = map[string]int{}
			}
			for _, item := range values {
				label := fmt.Sprint(item)
				counts[key][label]++
			}
		}
	}
	return map[string]interface{}{"total": len(records), "counts": counts}
}

// ClearInteractiveRecords creates a clean builder document for page
// duplication. Section definitions remain identical; submitted user data does not.
func ClearInteractiveRecords(content string) string {
	sections, err := decodePageSections(content)
	if err != nil {
		return content
	}
	for _, section := range sections {
		typ, _ := section["section_type"].(string)
		if !s_registry.IsInteractive(typ) {
			continue
		}
		cfg, err := sectionConfig(section)
		if err != nil {
			continue
		}
		cfg["records"] = []interface{}{}
		delete(cfg, "result_summary")
		_ = setSectionConfig(section, cfg)
	}
	raw, err := json.Marshal(sections)
	if err != nil {
		return content
	}
	return string(raw)
}

// SanitizeInteractiveContent removes records a page viewer is not authorized
// to read while leaving the ordinary PageSection document shape intact.
func SanitizeInteractiveContent(content string, userID int64, canManage bool) string {
	sections, err := decodePageSections(content)
	if err != nil {
		return "[]"
	}
	for _, section := range sections {
		typ, _ := section["section_type"].(string)
		if !s_registry.IsInteractive(typ) {
			continue
		}
		cfg, err := sectionConfig(section)
		if err != nil {
			return "[]"
		}
		allRecords := recordsFromConfig(cfg)
		cfg["result_summary"] = interactiveResultSummary(cfg)
		visible := make([]interface{}, 0, len(allRecords))
		if canManage {
			for _, raw := range allRecords {
				record, _ := raw.(map[string]interface{})
				copyRecord := make(map[string]interface{}, len(record))
				for key, value := range record {
					copyRecord[key] = value
				}
				delete(copyRecord, "idempotency_key")
				delete(copyRecord, "idempotency_key_hash")
				visible = append(visible, copyRecord)
			}
			cfg["records"] = visible
		} else {
			participated := false
			for _, raw := range allRecords {
				record, _ := raw.(map[string]interface{})
				recordUserID, _ := record["user_id"].(float64)
				own := userID > 0 && int64(recordUserID) == userID
				status, _ := record["status"].(string)
				publicQA := typ == "qa" && (status == "published" || status == "answered")
				if !own && !publicQA {
					continue
				}
				copyRecord := make(map[string]interface{}, len(record))
				for key, value := range record {
					copyRecord[key] = value
				}
				delete(copyRecord, "idempotency_key")
				delete(copyRecord, "idempotency_key_hash")
				if !own {
					delete(copyRecord, "user_id")
				}
				visible = append(visible, copyRecord)
				participated = participated || own
			}
			cfg["records"] = visible
			visibility, _ := cfg["result_visibility"].(string)
			if visibility != "always" && !(visibility == "after_participation" && participated) {
				delete(cfg, "result_summary")
			}
		}
		if err := setSectionConfig(section, cfg); err != nil {
			return "[]"
		}
	}
	raw, err := json.Marshal(sections)
	if err != nil {
		return "[]"
	}
	return string(raw)
}

func extractInteractiveConfig(content string, targetSectionID int64) (string, error) {
	sections, err := decodePageSections(content)
	if err != nil {
		return "", err
	}
	section, _, err := findInteractiveSection(sections, targetSectionID)
	if err != nil {
		return "", err
	}
	cfg, err := sectionConfig(section)
	if err != nil {
		return "", err
	}
	raw, err := json.Marshal(cfg)
	return string(raw), err
}

func (s *Service) InteractiveConfig(pageID, targetSectionID, userID int64, canManage bool) (string, error) {
	p, err := s.repo.GetByID(pageID)
	if err != nil {
		return "", err
	}
	content, err := s.sanitizedInteractiveContent(pageID, p.Content, userID, canManage)
	if err != nil {
		return "", err
	}
	return extractInteractiveConfig(content, targetSectionID)
}

func (s *Service) invalidateSEOByID(pageID int64) {
	if p, err := s.repo.GetByID(pageID); err == nil {
		s.invalidateSEO(p.Slug)
	}
}
