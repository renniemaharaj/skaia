package page

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/skaia/backend/internal/s_registry"
	"github.com/skaia/backend/models"
)

func (s *Service) normalizedInteractiveForPage(pageID int64) (bool, error) {
	if !s.normalizedInteractiveResponses {
		return false, nil
	}
	if s.interactiveRepo == nil {
		return false, ErrInteractiveForbidden
	}
	ready, err := s.interactiveRepo.InteractiveResponsesReady(pageID)
	if err != nil {
		return false, ErrInteractiveForbidden
	}
	return ready, nil
}

func interactiveDefinition(content string, sectionID int64) (map[string]interface{}, string, error) {
	sections, err := decodePageSections(content)
	if err != nil {
		return nil, "", err
	}
	section, typ, err := findInteractiveSection(sections, sectionID)
	if err != nil {
		return nil, "", err
	}
	cfg, err := sectionConfig(section)
	return cfg, typ, err
}

func (s *Service) submitNormalizedInteractive(page *models.Page, targetSectionID, userID int64, respondentName, idempotencyKey string, answers map[string]interface{}) (*InteractiveRecord, error) {
	cfg, typ, err := interactiveDefinition(page.Content, targetSectionID)
	if err != nil {
		return nil, err
	}
	if err := s_registry.ValidateInteractiveConfig(typ, cfg); err != nil {
		return nil, fmt.Errorf("interactive config is invalid: %w", err)
	}
	if status, _ := cfg["status"].(string); status == "closed" {
		return nil, ErrInteractiveClosed
	}
	if err := validateAnswers(cfg, answers); err != nil {
		return nil, err
	}
	limit := numberSetting(cfg, "response_limit", 0)
	if typ == "poll" || typ == "vote" {
		limit = 1
	}
	hash := interactiveIdempotencyHash(idempotencyKey)
	var created *InteractiveRecord
	err = s.interactiveRepo.MutateInteractiveResponses(page.ID, targetSectionID, typ, func(records []InteractiveRecord) ([]InteractiveRecord, error) {
		count := 0
		for index := range records {
			if hash != "" && records[index].UserID == userID && records[index].IdempotencyKeyHash == hash {
				existing := records[index]
				created = &existing
				return records, nil
			}
			if records[index].UserID == userID {
				count++
			}
		}
		if limit > 0 && count >= limit {
			return nil, ErrInteractiveDuplicate
		}
		if len(records) >= 1000 {
			return nil, fmt.Errorf("section response capacity reached")
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
			Answers: answers, Status: status, IdempotencyKeyHash: hash,
			SubmittedAt: now, UpdatedAt: now,
		}
		return append(records, *created), nil
	})
	if err == nil {
		s.invalidateSEOByID(page.ID)
	}
	return created, err
}

func (s *Service) deleteNormalizedInteractiveRecord(pageID, targetSectionID int64, recordID string) error {
	err := s.interactiveRepo.MutateInteractiveResponses(pageID, targetSectionID, "", func(records []InteractiveRecord) ([]InteractiveRecord, error) {
		next := make([]InteractiveRecord, 0, len(records))
		found := false
		for _, record := range records {
			if record.ID == recordID {
				found = true
				continue
			}
			next = append(next, record)
		}
		if !found {
			return nil, ErrInteractiveRecordNotFound
		}
		return next, nil
	})
	if err == nil {
		s.invalidateSEOByID(pageID)
	}
	return err
}

func (s *Service) patchNormalizedInteractiveRecord(pageID, targetSectionID int64, recordID string, patch InteractiveRecordPatch) error {
	page, err := s.repo.GetByID(pageID)
	if err != nil {
		return err
	}
	_, typ, err := interactiveDefinition(page.Content, targetSectionID)
	if err != nil {
		return err
	}
	if typ != "qa" {
		return fmt.Errorf("moderation is only supported for Q&A")
	}
	err = s.interactiveRepo.MutateInteractiveResponses(pageID, targetSectionID, "qa", func(records []InteractiveRecord) ([]InteractiveRecord, error) {
		found := false
		for index := range records {
			if records[index].ID != recordID {
				continue
			}
			found = true
			if patch.Status != nil {
				if *patch.Status != "pending" && *patch.Status != "published" && *patch.Status != "answered" && *patch.Status != "archived" {
					return nil, fmt.Errorf("invalid moderation status")
				}
				records[index].Status = *patch.Status
			}
			if patch.Answer != nil {
				if len(*patch.Answer) > 10000 {
					return nil, fmt.Errorf("answer is too long")
				}
				records[index].Answer = strings.TrimSpace(*patch.Answer)
				if records[index].Answer != "" {
					records[index].Status = "answered"
				}
			}
			if patch.Pinned != nil {
				records[index].Pinned = *patch.Pinned
			}
			records[index].UpdatedAt = time.Now().UTC()
		}
		if !found {
			return nil, ErrInteractiveRecordNotFound
		}
		return records, nil
	})
	if err == nil {
		s.invalidateSEOByID(pageID)
	}
	return err
}

func clearInteractiveRuntime(content string) string {
	sections, err := decodePageSections(content)
	if err != nil {
		return "[]"
	}
	for _, section := range sections {
		typ, _ := section["section_type"].(string)
		if !isInteractiveType(typ) {
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
		return "[]"
	}
	return string(raw)
}

func (s *Service) sanitizedInteractiveContent(pageID int64, content string, userID int64, canManage bool) (string, error) {
	useNormalized, err := s.normalizedInteractiveForPage(pageID)
	if err != nil {
		// A configured normalized authority must fail closed on lookup errors.
		return SanitizeInteractiveContent(clearInteractiveRuntime(content), userID, canManage), err
	}
	if !useNormalized {
		return SanitizeInteractiveContent(content, userID, canManage), nil
	}
	records, err := s.interactiveRepo.LoadInteractiveResponses(pageID)
	if err != nil {
		return SanitizeInteractiveContent(clearInteractiveRuntime(content), userID, canManage), ErrInteractiveForbidden
	}
	projected, err := setInteractiveRecords(clearInteractiveRuntime(content), records)
	if err != nil {
		return SanitizeInteractiveContent(clearInteractiveRuntime(content), userID, canManage), ErrInteractiveForbidden
	}
	return SanitizeInteractiveContent(projected, userID, canManage), nil
}

func (s *Service) SanitizeInteractivePage(page *models.Page, userID int64, canManage bool) {
	if page == nil {
		return
	}
	content, err := s.sanitizedInteractiveContent(page.ID, page.Content, userID, canManage)
	if err != nil {
		page.Content = SanitizeInteractiveContent(clearInteractiveRuntime(page.Content), userID, canManage)
		return
	}
	page.Content = content
}
