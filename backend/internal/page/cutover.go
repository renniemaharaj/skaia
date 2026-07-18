package page

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

const (
	DefaultCutoverMatchedRuns  = 3
	DefaultCutoverMatchWindow  = 24 * time.Hour
	DefaultLegacyReleaseWindow = 7 * 24 * time.Hour
)

// NormalizedPageReadRepository is separate from Repository so compatibility
// adapters remain usable while normalized reads are opt-in.
type NormalizedPageReadRepository interface {
	NormalizedPageReadReady(pageID int64, minimumMatchedRuns int, minimumWindow time.Duration) (bool, error)
	LoadNormalizedPageContent(pageID int64) (string, error)
}

type PageSectionCutoverPage struct {
	PageID          int64    `json:"page_id"`
	Status          string   `json:"status"`
	Ready           bool     `json:"ready"`
	MismatchCodes   []string `json:"mismatch_codes"`
	ConsecutiveRuns int64    `json:"consecutive_matched_runs"`
}

type PageSectionCutoverResult struct {
	AfterID     int64                    `json:"after_id"`
	NextAfterID int64                    `json:"next_after_id"`
	Scanned     int                      `json:"scanned"`
	Ready       int                      `json:"ready"`
	Mismatched  int                      `json:"mismatched"`
	Done        bool                     `json:"done"`
	Pages       []PageSectionCutoverPage `json:"pages"`
}

type LegacyRetirementPreflight struct {
	CanRetireLegacyWrites bool     `json:"can_retire_legacy_writes"`
	TotalPages            int      `json:"total_pages"`
	ReadyPages            int      `json:"ready_pages"`
	RecentLegacyWrites    int      `json:"recent_legacy_writes"`
	LegacyTableRows       int      `json:"legacy_table_rows"`
	BlockerCodes          []string `json:"blocker_codes"`
}

func (r *sqlRepository) NormalizedPageReadReady(pageID int64, minimumMatchedRuns int, minimumWindow time.Duration) (bool, error) {
	minimumMatchedRuns, minimumWindow = normalizeCutoverThresholds(minimumMatchedRuns, minimumWindow)
	var ready bool
	err := r.db.QueryRow(
		`SELECT EXISTS (
		   SELECT 1
		   FROM page_section_shadow_runs sr
		   JOIN page_section_response_migrations rm ON rm.page_id=sr.page_id
		   WHERE sr.page_id=$1
		     AND sr.status='matched' AND sr.source_hash=sr.projection_hash
		     AND sr.quarantine_count=0
		     AND sr.consecutive_matched_runs >= $2
		     AND sr.matched_since <= $3
		     AND sr.rollback_status='matched' AND sr.rollback_drilled_at IS NOT NULL
		     AND sr.cutover_ready_at IS NOT NULL
		     AND rm.status='matched'
		 )`, pageID, minimumMatchedRuns, time.Now().UTC().Add(-minimumWindow),
	).Scan(&ready)
	return ready, err
}

// LoadNormalizedPageContent projects only normalized definition and response
// rows. It never reads pages.content, making successful cutover reads independent
// of the compatibility document.
func (r *sqlRepository) LoadNormalizedPageContent(pageID int64) (string, error) {
	document, err := loadPageSectionShadow(r.db, pageID)
	if err != nil {
		return "", err
	}
	content, err := ProjectNormalizedPageContent(document)
	if err != nil {
		return "", err
	}
	records, err := loadInteractiveResponses(r.db, pageID, nil)
	if err != nil {
		return "", err
	}
	return setInteractiveRecords(content, records)
}

func normalizeCutoverThresholds(runs int, window time.Duration) (int, time.Duration) {
	if runs < 1 {
		runs = DefaultCutoverMatchedRuns
	}
	if window <= 0 {
		window = DefaultCutoverMatchWindow
	}
	return runs, window
}

// AuditPageSectionCutover records another definition parity observation and
// exercises normalized -> compatibility -> normalized projection, including
// response parity. It stores only counts/status/codes.
func AuditPageSectionCutover(ctx context.Context, exec database.Executor, afterID int64, limit, minimumMatchedRuns int, minimumWindow time.Duration) (PageSectionCutoverResult, error) {
	if limit < 1 || limit > 500 {
		return PageSectionCutoverResult{}, fmt.Errorf("cutover audit limit must be between 1 and 500")
	}
	minimumMatchedRuns, minimumWindow = normalizeCutoverThresholds(minimumMatchedRuns, minimumWindow)
	result := PageSectionCutoverResult{AfterID: afterID, NextAfterID: afterID}
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
		pageResult := PageSectionCutoverPage{PageID: id, Status: "mismatch"}
		err := database.TransactionalExecutor(ctx, exec, func(tx database.Executor) error {
			page := &models.Page{ID: id}
			if err := tx.QueryRowContext(ctx,
				`SELECT content::text,created_at,updated_at FROM pages WHERE id=$1 FOR UPDATE`, id,
			).Scan(&page.Content, &page.CreatedAt, &page.UpdatedAt); err != nil {
				return err
			}
			report, err := observePageSectionParity(tx, page)
			if err != nil {
				return err
			}
			pageResult.Status = report.Status
			pageResult.MismatchCodes = append(pageResult.MismatchCodes, report.MismatchCodes...)
			if report.Status == "matched" {
				pageResult.MismatchCodes = append(pageResult.MismatchCodes, rollbackProjectionMismatchCodes(tx, page)...)
			} else if len(pageResult.MismatchCodes) == 0 {
				pageResult.MismatchCodes = append(pageResult.MismatchCodes, "definition_not_matched")
			}
			if len(pageResult.MismatchCodes) > 0 || report.Status != "matched" {
				pageResult.Status = "mismatch"
			}
			_, err = tx.Exec(
				`UPDATE page_section_shadow_runs
				 SET rollback_status=$2, rollback_drilled_at=CURRENT_TIMESTAMP,
				     cutover_ready_at=CASE
				       WHEN $2::varchar='matched' AND consecutive_matched_runs >= $3
				       THEN COALESCE(cutover_ready_at,CURRENT_TIMESTAMP)
				       ELSE NULL END
				 WHERE page_id=$1`, id, pageResult.Status, minimumMatchedRuns,
			)
			return err
		})
		if err != nil {
			return result, fmt.Errorf("audit page %d cutover: %w", id, err)
		}
		if err := exec.QueryRow(
			`SELECT consecutive_matched_runs FROM page_section_shadow_runs WHERE page_id=$1`, id,
		).Scan(&pageResult.ConsecutiveRuns); err != nil {
			return result, err
		}
		var ready bool
		if err := exec.QueryRow(
			`SELECT EXISTS (
			 SELECT 1 FROM page_section_shadow_runs sr
			 JOIN page_section_response_migrations rm ON rm.page_id=sr.page_id
			 WHERE sr.page_id=$1 AND sr.status='matched' AND sr.source_hash=sr.projection_hash
			 AND sr.quarantine_count=0 AND sr.consecutive_matched_runs >= $2
			 AND sr.matched_since <= $3 AND sr.rollback_status='matched'
			 AND sr.cutover_ready_at IS NOT NULL
			 AND rm.status='matched')`, id, minimumMatchedRuns, time.Now().UTC().Add(-minimumWindow),
		).Scan(&ready); err != nil {
			return result, err
		}
		pageResult.Ready = ready
		result.Pages = append(result.Pages, pageResult)
		result.Scanned++
		result.NextAfterID = id
		if ready {
			result.Ready++
		} else if pageResult.Status == "mismatch" {
			result.Mismatched++
		}
	}
	result.Done = len(ids) < limit
	return result, nil
}

func observePageSectionParity(exec database.Executor, page *models.Page) (ShadowSyncReport, error) {
	source, err := NormalizeLegacyPageContent(page.Content)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	normalized, err := loadPageSectionShadow(exec, page.ID)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	projected, err := ProjectNormalizedPageContent(normalized)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	projectedDocument, err := NormalizeLegacyPageContent(projected)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	sourceHash, err := shadowDocumentHash(source)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	projectionHash, err := shadowDocumentHash(projectedDocument)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	var quarantineCount int
	if err := exec.QueryRow(
		`SELECT quarantine_count FROM page_section_shadow_runs WHERE page_id=$1 FOR UPDATE`, page.ID,
	).Scan(&quarantineCount); err != nil {
		return ShadowSyncReport{}, err
	}
	status := "matched"
	codes := []string{}
	if quarantineCount > 0 {
		status = "quarantined"
		codes = append(codes, "definition_quarantined")
	}
	if sourceHash != projectionHash {
		status = "mismatch"
		codes = append(codes, "definition_projection_diff")
	}
	encodedCodes, _ := json.Marshal(codes)
	if _, err := exec.Exec(
		`UPDATE page_section_shadow_runs
		 SET source_hash=$2,projection_hash=$3,status=$4,mismatch_codes=$5::jsonb,
		     consecutive_matched_runs=CASE
		       WHEN $4::varchar='matched' THEN consecutive_matched_runs+1 ELSE 0 END,
		     matched_since=CASE
		       WHEN $4::varchar<>'matched' THEN NULL
		       WHEN status='matched' AND matched_since IS NOT NULL THEN matched_since
		       ELSE CURRENT_TIMESTAMP END,
		     last_run_at=CURRENT_TIMESTAMP,run_count=run_count+1
		 WHERE page_id=$1`, page.ID, sourceHash, projectionHash, status, encodedCodes,
	); err != nil {
		return ShadowSyncReport{}, err
	}
	return ShadowSyncReport{
		PageID: page.ID, Status: status, SourceHash: sourceHash, ProjectionHash: projectionHash,
		SectionCount: len(source.Sections), QuarantineCount: quarantineCount, MismatchCodes: codes,
	}, nil
}

func rollbackProjectionMismatchCodes(exec database.Executor, page *models.Page) []string {
	codes := []string{}
	document, err := loadPageSectionShadow(exec, page.ID)
	if err != nil {
		return []string{"normalized_projection_unavailable"}
	}
	projected, err := ProjectNormalizedPageContent(document)
	if err != nil {
		return []string{"normalized_projection_invalid"}
	}
	roundTrip, err := NormalizeLegacyPageContent(projected)
	if err != nil {
		return []string{"rollback_projection_invalid"}
	}
	sourceHash, sourceErr := shadowDocumentHash(document)
	roundTripHash, roundTripErr := shadowDocumentHash(roundTrip)
	if sourceErr != nil || roundTripErr != nil || sourceHash != roundTripHash {
		codes = append(codes, "rollback_definition_diff")
	}

	var responseStatus string
	if err := exec.QueryRow(
		`SELECT status FROM page_section_response_migrations WHERE page_id=$1`, page.ID,
	).Scan(&responseStatus); err != nil || responseStatus != "matched" {
		codes = append(codes, "response_migration_incomplete")
		return codes
	}
	sourceRecords, _, sourceErr := interactiveRecordsFromContent(page.Content)
	normalizedRecords, normalizedErr := loadInteractiveResponses(exec, page.ID, nil)
	if sourceErr != nil || normalizedErr != nil {
		codes = append(codes, "rollback_response_projection_invalid")
		return codes
	}
	sourceResponseHash, sourceCount, sourceErr := responseParityHash(sourceRecords)
	normalizedResponseHash, normalizedCount, normalizedErr := responseParityHash(normalizedRecords)
	if sourceErr != nil || normalizedErr != nil || sourceCount != normalizedCount || sourceResponseHash != normalizedResponseHash {
		codes = append(codes, "rollback_response_diff")
	}
	sort.Strings(codes)
	return codes
}

// CheckLegacyPageWriteRetirement is deliberately a preflight, not a destructive
// migration. External dependency confirmation must come from the operator who
// owns scheduled jobs; application telemetry alone cannot prove their absence.
func CheckLegacyPageWriteRetirement(ctx context.Context, exec database.Executor, minimumMatchedRuns int, minimumWindow, releaseWindow time.Duration, externalDependenciesReviewed bool) (LegacyRetirementPreflight, error) {
	minimumMatchedRuns, minimumWindow = normalizeCutoverThresholds(minimumMatchedRuns, minimumWindow)
	if releaseWindow <= 0 {
		releaseWindow = DefaultLegacyReleaseWindow
	}
	now := time.Now().UTC()
	result := LegacyRetirementPreflight{}
	if err := exec.QueryRowContext(ctx, `SELECT COUNT(*) FROM pages`).Scan(&result.TotalPages); err != nil {
		return result, err
	}
	if err := exec.QueryRowContext(ctx,
		`SELECT COUNT(*)
		 FROM page_section_shadow_runs sr
		 JOIN page_section_response_migrations rm ON rm.page_id=sr.page_id
		 WHERE sr.status='matched' AND sr.source_hash=sr.projection_hash AND sr.quarantine_count=0
		   AND sr.consecutive_matched_runs >= $1 AND sr.matched_since <= $2
		   AND sr.rollback_status='matched' AND sr.rollback_drilled_at IS NOT NULL
		   AND sr.cutover_ready_at <= $3
		   AND rm.status='matched'`, minimumMatchedRuns, now.Add(-minimumWindow), now.Add(-releaseWindow),
	).Scan(&result.ReadyPages); err != nil {
		return result, err
	}
	if err := exec.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM page_section_shadow_runs
		 WHERE last_legacy_write_at > $1`, now.Add(-releaseWindow),
	).Scan(&result.RecentLegacyWrites); err != nil {
		return result, err
	}
	if err := exec.QueryRowContext(ctx,
		`SELECT (SELECT COUNT(*) FROM page_sections) + (SELECT COUNT(*) FROM page_items)`,
	).Scan(&result.LegacyTableRows); err != nil {
		return result, err
	}
	if result.ReadyPages != result.TotalPages {
		result.BlockerCodes = append(result.BlockerCodes, "pages_not_cutover_ready")
	}
	if result.RecentLegacyWrites > 0 {
		result.BlockerCodes = append(result.BlockerCodes, "legacy_clients_active")
	}
	if result.LegacyTableRows > 0 {
		result.BlockerCodes = append(result.BlockerCodes, "legacy_tables_not_empty")
	}
	if !externalDependenciesReviewed {
		result.BlockerCodes = append(result.BlockerCodes, "external_dependency_review_required")
	}
	result.CanRetireLegacyWrites = len(result.BlockerCodes) == 0
	return result, nil
}
