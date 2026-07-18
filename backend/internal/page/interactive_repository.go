package page

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/skaia/backend/database"
)

// InteractiveResponseRepository is kept separate from the legacy page
// repository so non-SQL adapters continue to use the compatibility document.
type InteractiveResponseRepository interface {
	InteractiveResponsesReady(pageID int64) (bool, error)
	MutateInteractiveResponses(pageID, legacySectionID int64, expectedType string, mutate func([]InteractiveRecord) ([]InteractiveRecord, error)) error
	LoadInteractiveResponses(pageID int64) (map[ShadowLegacyKey][]InteractiveRecord, error)
}

type InteractiveResponseMigrationReport struct {
	PageID              int64    `json:"page_id"`
	Status              string   `json:"status"`
	ResponseCount       int      `json:"response_count"`
	InteractiveSections int      `json:"interactive_sections"`
	MismatchCodes       []string `json:"mismatch_codes"`
}

type InteractiveResponseBackfillResult struct {
	AfterID     int64 `json:"after_id"`
	NextAfterID int64 `json:"next_after_id"`
	Scanned     int   `json:"scanned"`
	Matched     int   `json:"matched"`
	Mismatched  int   `json:"mismatched"`
	Done        bool  `json:"done"`
}

func interactiveIdempotencyHash(value string) string {
	if value == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (r *sqlRepository) InteractiveResponsesReady(pageID int64) (bool, error) {
	var ready bool
	err := r.db.QueryRow(
		`SELECT EXISTS (
		   SELECT 1 FROM page_section_response_migrations rm
		   JOIN page_section_shadow_runs sr ON sr.page_id=rm.page_id
		   WHERE rm.page_id=$1 AND rm.status='matched' AND sr.status='matched'
		 )`, pageID,
	).Scan(&ready)
	return ready, err
}

func (r *sqlRepository) LoadInteractiveResponses(pageID int64) (map[ShadowLegacyKey][]InteractiveRecord, error) {
	return loadInteractiveResponses(r.db, pageID, nil)
}

func (r *sqlRepository) MutateInteractiveResponses(pageID, legacySectionID int64, expectedType string, mutate func([]InteractiveRecord) ([]InteractiveRecord, error)) error {
	return database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var content string
		if err := exec.QueryRow(`SELECT content::text FROM pages WHERE id=$1 FOR UPDATE`, pageID).Scan(&content); err != nil {
			return err
		}
		key := ShadowLegacyKey{Kind: "number", Value: strconv.FormatInt(legacySectionID, 10)}
		sectionID, err := lockInteractiveSection(exec, pageID, key, expectedType)
		if err != nil {
			return err
		}
		bySection, err := loadInteractiveResponses(exec, pageID, &sectionID)
		if err != nil {
			return err
		}
		next, err := mutate(append([]InteractiveRecord(nil), bySection[key]...))
		if err != nil {
			return err
		}
		if len(next) > 1000 {
			return fmt.Errorf("section response capacity reached")
		}
		if err := replaceInteractiveResponseRows(exec, sectionID, next); err != nil {
			return err
		}
		persisted, err := loadInteractiveResponses(exec, pageID, &sectionID)
		if err != nil {
			return err
		}
		projected, err := setInteractiveRecords(content, map[ShadowLegacyKey][]InteractiveRecord{key: persisted[key]})
		if err != nil {
			return err
		}
		if _, err := exec.Exec(
			`UPDATE pages SET content=$2::jsonb, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, pageID, projected,
		); err != nil {
			return err
		}
		_, err = exec.Exec(
			`UPDATE page_section_shadow_runs
			 SET last_source_updated=(SELECT updated_at FROM pages WHERE id=$1) WHERE page_id=$1`, pageID,
		)
		return err
	})
}

func lockInteractiveSection(exec database.Executor, pageID int64, key ShadowLegacyKey, expectedType string) (int64, error) {
	var sectionID int64
	query :=
		`SELECT id FROM page_section_instances
		 WHERE page_id=$1 AND legacy_key_kind=$2 AND legacy_key=$3
		   AND section_type IN ('form','qa','survey','poll','vote')`
	args := []any{pageID, key.Kind, key.Value}
	if expectedType != "" {
		query += ` AND section_type=$4`
		args = append(args, expectedType)
	}
	query += ` FOR UPDATE`
	err := exec.QueryRow(query, args...).Scan(&sectionID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrInteractiveSectionNotFound
	}
	return sectionID, err
}

func loadInteractiveResponses(exec database.Executor, pageID int64, onlySectionID *int64) (map[ShadowLegacyKey][]InteractiveRecord, error) {
	query := `SELECT s.id,s.legacy_key_kind,s.legacy_key,r.response_key,r.respondent_user_key,
	                 r.respondent_name,r.answers,r.status,r.moderator_answer,r.pinned,
	                 r.idempotency_key_hash,r.created_at,r.updated_at
	          FROM page_section_instances s
	          LEFT JOIN page_section_responses r ON r.section_id=s.id
	          WHERE s.page_id=$1 AND s.section_type IN ('form','qa','survey','poll','vote')`
	args := []any{pageID}
	if onlySectionID != nil {
		query += ` AND s.id=$2`
		args = append(args, *onlySectionID)
	}
	query += ` ORDER BY s.source_index,r.created_at,r.id`
	rows, err := exec.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[ShadowLegacyKey][]InteractiveRecord{}
	for rows.Next() {
		var sectionID int64
		var key ShadowLegacyKey
		var responseKey, respondentName, status, moderatorAnswer sql.NullString
		var respondentID sql.NullInt64
		var answers, hash []byte
		var pinned sql.NullBool
		var createdAt, updatedAt sql.NullTime
		if err := rows.Scan(
			&sectionID, &key.Kind, &key.Value, &responseKey, &respondentID,
			&respondentName, &answers, &status, &moderatorAnswer, &pinned,
			&hash, &createdAt, &updatedAt,
		); err != nil {
			return nil, err
		}
		if _, ok := result[key]; !ok {
			result[key] = []InteractiveRecord{}
		}
		if !responseKey.Valid {
			continue
		}
		record := InteractiveRecord{
			ID: responseKey.String, RespondentName: respondentName.String,
			Status: status.String, Answer: moderatorAnswer.String, Pinned: pinned.Bool,
			SubmittedAt: createdAt.Time, UpdatedAt: updatedAt.Time,
			IdempotencyKeyHash: hex.EncodeToString(hash),
		}
		if respondentID.Valid {
			record.UserID = respondentID.Int64
		}
		if err := json.Unmarshal(answers, &record.Answers); err != nil {
			return nil, fmt.Errorf("decode normalized response answers: %w", err)
		}
		result[key] = append(result[key], record)
	}
	return result, rows.Err()
}

func replaceInteractiveResponseRows(exec database.Executor, sectionID int64, records []InteractiveRecord) error {
	wanted := make(map[string]struct{}, len(records))
	for _, record := range records {
		if record.ID == "" || len(record.ID) > 160 || record.UserID <= 0 || len(record.RespondentName) > 500 || len(record.Answer) > 10000 {
			return ErrTypedSectionInvalid
		}
		if _, duplicate := wanted[record.ID]; duplicate {
			return ErrTypedSectionInvalid
		}
		wanted[record.ID] = struct{}{}
		answers, err := json.Marshal(record.Answers)
		if err != nil {
			return err
		}
		var hash any
		if record.IdempotencyKeyHash != "" {
			decoded, err := hex.DecodeString(record.IdempotencyKeyHash)
			if err != nil || len(decoded) != sha256.Size {
				return ErrTypedSectionInvalid
			}
			hash = decoded
		}
		createdAt := record.SubmittedAt
		if createdAt.IsZero() {
			createdAt = time.Now().UTC()
		}
		updatedAt := record.UpdatedAt
		if updatedAt.IsZero() {
			updatedAt = createdAt
		}
		if _, err := exec.Exec(
			`INSERT INTO page_section_responses (
			 section_id,response_key,respondent_user_id,respondent_user_key,idempotency_key_hash,answers,
			 respondent_name,status,moderator_answer,pinned,created_at,updated_at
			 ) VALUES ($1,$2,(SELECT id FROM users WHERE id=$3),$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)
			 ON CONFLICT (section_id,response_key) DO UPDATE SET
			 respondent_user_id=EXCLUDED.respondent_user_id,
			 respondent_user_key=EXCLUDED.respondent_user_key,
			 idempotency_key_hash=EXCLUDED.idempotency_key_hash,
			 answers=EXCLUDED.answers,respondent_name=EXCLUDED.respondent_name,
			 status=EXCLUDED.status,moderator_answer=EXCLUDED.moderator_answer,pinned=EXCLUDED.pinned,
			 revision=CASE WHEN
			   (page_section_responses.respondent_user_key,page_section_responses.idempotency_key_hash,
			    page_section_responses.answers,page_section_responses.respondent_name,page_section_responses.status,
			    page_section_responses.moderator_answer,page_section_responses.pinned)
			   IS DISTINCT FROM
			   (EXCLUDED.respondent_user_key,EXCLUDED.idempotency_key_hash,EXCLUDED.answers,
			    EXCLUDED.respondent_name,EXCLUDED.status,EXCLUDED.moderator_answer,EXCLUDED.pinned)
			   THEN page_section_responses.revision+1 ELSE page_section_responses.revision END,
			 updated_at=EXCLUDED.updated_at`,
			sectionID, record.ID, record.UserID, hash, answers, record.RespondentName,
			record.Status, record.Answer, record.Pinned, createdAt, updatedAt,
		); err != nil {
			return err
		}
	}
	rows, err := exec.Query(`SELECT response_key FROM page_section_responses WHERE section_id=$1`, sectionID)
	if err != nil {
		return err
	}
	stale := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			_ = rows.Close()
			return err
		}
		if _, ok := wanted[key]; !ok {
			stale = append(stale, key)
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, key := range stale {
		if _, err := exec.Exec(`DELETE FROM page_section_responses WHERE section_id=$1 AND response_key=$2`, sectionID, key); err != nil {
			return err
		}
	}
	return nil
}

func recordProjection(record InteractiveRecord) map[string]any {
	result := map[string]any{
		"id": record.ID, "user_id": record.UserID, "respondent_name": record.RespondentName,
		"answers": record.Answers, "status": record.Status, "submitted_at": record.SubmittedAt,
	}
	if record.Answer != "" {
		result["answer"] = record.Answer
	}
	if record.Pinned {
		result["pinned"] = true
	}
	if !record.UpdatedAt.IsZero() {
		result["updated_at"] = record.UpdatedAt
	}
	if record.IdempotencyKeyHash != "" {
		result["idempotency_key_hash"] = record.IdempotencyKeyHash
	}
	return result
}

func setInteractiveRecords(content string, records map[ShadowLegacyKey][]InteractiveRecord) (string, error) {
	sections, err := decodePageSections(content)
	if err != nil {
		return "", err
	}
	for _, section := range sections {
		key, ok := parseShadowLegacyKey(section["id"])
		if !ok {
			continue
		}
		sectionRecords, exists := records[key]
		if !exists {
			continue
		}
		cfg, err := sectionConfig(section)
		if err != nil {
			return "", err
		}
		projected := make([]any, 0, len(sectionRecords))
		for _, record := range sectionRecords {
			projected = append(projected, recordProjection(record))
		}
		cfg["records"] = projected
		delete(cfg, "result_summary")
		if err := setSectionConfig(section, cfg); err != nil {
			return "", err
		}
	}
	raw, err := json.Marshal(sections)
	return string(raw), err
}

func interactiveRecordsFromContent(content string) (map[ShadowLegacyKey][]InteractiveRecord, int, error) {
	sections, err := decodePageSections(content)
	if err != nil {
		return nil, 0, err
	}
	result := map[ShadowLegacyKey][]InteractiveRecord{}
	interactiveSections := 0
	for _, section := range sections {
		typ, _ := section["section_type"].(string)
		if !isInteractiveType(typ) {
			continue
		}
		key, ok := parseShadowLegacyKey(section["id"])
		if !ok {
			return nil, 0, ErrInteractiveSectionNotFound
		}
		interactiveSections++
		cfg, err := sectionConfig(section)
		if err != nil {
			return nil, 0, err
		}
		for _, raw := range recordsFromConfig(cfg) {
			blob, err := json.Marshal(raw)
			if err != nil {
				return nil, 0, err
			}
			var record InteractiveRecord
			if err := json.Unmarshal(blob, &record); err != nil {
				return nil, 0, err
			}
			var source map[string]any
			_ = json.Unmarshal(blob, &source)
			if hash, _ := source["idempotency_key_hash"].(string); hash != "" {
				record.IdempotencyKeyHash = hash
			} else {
				record.IdempotencyKeyHash = interactiveIdempotencyHash(record.IdempotencyKey)
			}
			record.IdempotencyKey = ""
			if record.ID == "" || record.UserID <= 0 || record.Answers == nil {
				return nil, 0, ErrTypedSectionInvalid
			}
			if record.SubmittedAt.IsZero() {
				return nil, 0, ErrTypedSectionInvalid
			}
			if record.UpdatedAt.IsZero() {
				record.UpdatedAt = record.SubmittedAt
			}
			record.SubmittedAt = record.SubmittedAt.UTC().Truncate(time.Microsecond)
			record.UpdatedAt = record.UpdatedAt.UTC().Truncate(time.Microsecond)
			result[key] = append(result[key], record)
		}
		if result[key] == nil {
			result[key] = []InteractiveRecord{}
		}
	}
	return result, interactiveSections, nil
}

func isInteractiveType(value string) bool {
	switch value {
	case "form", "qa", "survey", "poll", "vote":
		return true
	default:
		return false
	}
}

func responseParityHash(records map[ShadowLegacyKey][]InteractiveRecord) (string, int, error) {
	type entry struct {
		Section            ShadowLegacyKey   `json:"section"`
		Record             InteractiveRecord `json:"record"`
		IdempotencyKeyHash string            `json:"idempotency_key_hash"`
	}
	entries := []entry{}
	for section, sectionRecords := range records {
		for _, record := range sectionRecords {
			record.IdempotencyKey = ""
			record.SubmittedAt = record.SubmittedAt.UTC().Truncate(time.Microsecond)
			record.UpdatedAt = record.UpdatedAt.UTC().Truncate(time.Microsecond)
			entries = append(entries, entry{
				Section: section, Record: record, IdempotencyKeyHash: record.IdempotencyKeyHash,
			})
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		left := entries[i].Section.Kind + "\x00" + entries[i].Section.Value + "\x00" + entries[i].Record.ID
		right := entries[j].Section.Kind + "\x00" + entries[j].Section.Value + "\x00" + entries[j].Record.ID
		return left < right
	})
	raw, err := json.Marshal(entries)
	if err != nil {
		return "", 0, err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), len(entries), nil
}

func syncInteractiveResponses(exec database.Executor, pageID int64, content string) (InteractiveResponseMigrationReport, string, error) {
	source, sectionCount, err := interactiveRecordsFromContent(content)
	if err != nil {
		return InteractiveResponseMigrationReport{}, content, err
	}
	for key, records := range source {
		sectionID, err := lockInteractiveSection(exec, pageID, key, "")
		if err != nil {
			return InteractiveResponseMigrationReport{}, content, err
		}
		if err := replaceInteractiveResponseRows(exec, sectionID, records); err != nil {
			return InteractiveResponseMigrationReport{}, content, err
		}
	}
	loaded, err := loadInteractiveResponses(exec, pageID, nil)
	if err != nil {
		return InteractiveResponseMigrationReport{}, content, err
	}
	sourceHash, count, err := responseParityHash(source)
	if err != nil {
		return InteractiveResponseMigrationReport{}, content, err
	}
	normalizedHash, normalizedCount, err := responseParityHash(loaded)
	if err != nil {
		return InteractiveResponseMigrationReport{}, content, err
	}
	status := "matched"
	mismatches := []string{}
	if sourceHash != normalizedHash || count != normalizedCount {
		status = "mismatch"
		mismatches = append(mismatches, "response_projection_diff")
	}
	mismatchJSON, _ := json.Marshal(mismatches)
	if _, err := exec.Exec(
		`INSERT INTO page_section_response_migrations
		 (page_id,source_hash,normalized_hash,status,response_count,interactive_sections,mismatch_codes)
		 VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
		 ON CONFLICT (page_id) DO UPDATE SET source_hash=EXCLUDED.source_hash,
		 normalized_hash=EXCLUDED.normalized_hash,status=EXCLUDED.status,
		 response_count=EXCLUDED.response_count,interactive_sections=EXCLUDED.interactive_sections,
		 mismatch_codes=EXCLUDED.mismatch_codes,run_count=page_section_response_migrations.run_count+1,
		 last_run_at=CURRENT_TIMESTAMP`,
		pageID, sourceHash, normalizedHash, status, count, sectionCount, mismatchJSON,
	); err != nil {
		return InteractiveResponseMigrationReport{}, content, err
	}
	projected, err := setInteractiveRecords(content, loaded)
	if err != nil {
		return InteractiveResponseMigrationReport{}, content, err
	}
	return InteractiveResponseMigrationReport{
		PageID: pageID, Status: status, ResponseCount: count,
		InteractiveSections: sectionCount, MismatchCodes: mismatches,
	}, projected, nil
}

// BackfillInteractiveResponses copies a bounded page batch, verifies a
// response-only parity hash, and replaces raw idempotency keys in the rollback
// document with one-way hashes. Output contains counts and codes only.
func BackfillInteractiveResponses(ctx context.Context, exec database.Executor, afterID int64, limit int) (InteractiveResponseBackfillResult, error) {
	if limit < 1 || limit > 500 {
		return InteractiveResponseBackfillResult{}, fmt.Errorf("interactive response backfill limit must be between 1 and 500")
	}
	result := InteractiveResponseBackfillResult{AfterID: afterID, NextAfterID: afterID}
	rows, err := exec.QueryContext(ctx, `SELECT id FROM pages WHERE id>$1 ORDER BY id LIMIT $2`, afterID, limit)
	if err != nil {
		return result, err
	}
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			_ = rows.Close()
			return result, err
		}
		ids = append(ids, id)
	}
	if err := rows.Close(); err != nil {
		return result, err
	}
	for _, id := range ids {
		var report InteractiveResponseMigrationReport
		err := database.TransactionalExecutor(ctx, exec, func(tx database.Executor) error {
			var content string
			if err := tx.QueryRowContext(ctx,
				`SELECT content::text FROM pages WHERE id=$1 FOR UPDATE`, id,
			).Scan(&content); err != nil {
				return err
			}
			var projected string
			var err error
			report, projected, err = syncInteractiveResponses(tx, id, content)
			if err != nil {
				return err
			}
			if projected != content {
				_, err = tx.Exec(`UPDATE pages SET content=$2::jsonb WHERE id=$1`, id, projected)
			}
			return err
		})
		if err != nil {
			return result, fmt.Errorf("backfill page %d interactive responses: %w", id, err)
		}
		result.Scanned++
		result.NextAfterID = id
		if report.Status == "matched" {
			result.Matched++
		} else {
			result.Mismatched++
		}
	}
	result.Done = len(ids) < limit
	return result, nil
}
