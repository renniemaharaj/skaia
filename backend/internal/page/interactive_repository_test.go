package page

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	isecurity "github.com/skaia/backend/internal/security"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/models"
)

func TestInteractiveResponseBackfillAndNormalizedAuthority(t *testing.T) {
	db := testutil.OpenTestDB(t)
	userIDs := seededUserIDs(t, db, 2)
	ownerID, viewerID := userIDs[0], userIDs[1]
	content := interactiveContentOfType("qa", `{
		"status":"open","result_visibility":"never","response_limit":0,"moderation":true,
		"fields":[{"key":"question","type":"textarea"}],
		"records":[{
			"id":"question-1","user_id":`+strconv.FormatInt(ownerID, 10)+`,"respondent_name":"Owner",
			"answers":{"question":"Private question"},"status":"pending","pinned":true,
			"answer":"Moderator answer","idempotency_key":"raw-secret-key",
			"submitted_at":"2026-01-02T03:04:05Z","updated_at":"2026-01-02T03:05:05Z"
		}]
	}`)
	repository := NewRepository(db)
	page := &models.Page{
		Slug: "interactive-normalized-" + uuid.NewString(), Title: "Responses",
		Visibility: "public", OwnerID: &ownerID, Content: content,
	}
	if err := repository.Create(page); err != nil {
		t.Fatal(err)
	}

	result, err := BackfillInteractiveResponses(context.Background(), db, page.ID-1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if result.Matched != 1 || result.Mismatched != 0 || result.NextAfterID != page.ID {
		t.Fatalf("unexpected backfill result: %+v", result)
	}
	stored, err := repository.GetByID(page.ID)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored.Content, "raw-secret-key") || !strings.Contains(stored.Content, "idempotency_key_hash") {
		t.Fatalf("rollback projection retained a raw idempotency key: %s", stored.Content)
	}

	var responseID, revision int64
	var name, answer string
	var pinned bool
	if err := db.QueryRow(
		`SELECT r.id,r.revision,r.respondent_name,r.moderator_answer,r.pinned
		 FROM page_section_responses r JOIN page_section_instances s ON s.id=r.section_id
		 WHERE s.page_id=$1 AND r.response_key='question-1'`, page.ID,
	).Scan(&responseID, &revision, &name, &answer, &pinned); err != nil {
		t.Fatal(err)
	}
	if name != "Owner" || answer != "Moderator answer" || !pinned {
		t.Fatalf("response fields were not preserved: %q %q %t", name, answer, pinned)
	}
	if _, err := BackfillInteractiveResponses(context.Background(), db, page.ID-1, 1); err != nil {
		t.Fatal(err)
	}
	var responseIDAfter, revisionAfter int64
	if err := db.QueryRow(
		`SELECT r.id,r.revision FROM page_section_responses r
		 JOIN page_section_instances s ON s.id=r.section_id
		 WHERE s.page_id=$1 AND r.response_key='question-1'`, page.ID,
	).Scan(&responseIDAfter, &revisionAfter); err != nil {
		t.Fatal(err)
	}
	if responseIDAfter != responseID || revisionAfter != revision {
		t.Fatalf("backfill rerun was not idempotent: (%d,%d) -> (%d,%d)", responseID, revision, responseIDAfter, revisionAfter)
	}

	policy := isecurity.NewPagePolicy(repository, fakePermissionChecker{})
	service := NewService(repository, nil,
		WithInteractivePolicy(policy), WithPageMutationPolicy(policy),
		WithNormalizedInteractiveResponses(true),
	)
	created, err := service.SubmitInteractive(page.ID, 7, viewerID, "Viewer", "retry-key", map[string]interface{}{"question": "Another private question"})
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := service.SubmitInteractive(page.ID, 7, viewerID, "Viewer", "retry-key", map[string]interface{}{"question": "Another private question"})
	if err != nil || replayed.ID != created.ID {
		t.Fatalf("normalized idempotent retry failed: %#v %v", replayed, err)
	}
	var count int
	if err := db.QueryRow(
		`SELECT COUNT(*) FROM page_section_responses r
		 JOIN page_section_instances s ON s.id=r.section_id WHERE s.page_id=$1`, page.ID,
	).Scan(&count); err != nil || count != 2 {
		t.Fatalf("normalized response count = %d, err=%v", count, err)
	}

	viewerPage, _ := repository.GetByID(page.ID)
	service.SanitizeInteractivePage(viewerPage, viewerID, false)
	if strings.Contains(viewerPage.Content, "Private question") || strings.Contains(viewerPage.Content, "raw-secret-key") {
		t.Fatalf("viewer projection disclosed another response: %s", viewerPage.Content)
	}
	managerPage, _ := repository.GetByID(page.ID)
	service.SanitizeInteractivePage(managerPage, ownerID, true)
	if !strings.Contains(managerPage.Content, "Private question") || strings.Contains(managerPage.Content, "idempotency_key_hash") {
		t.Fatalf("manager projection lost answers or exposed idempotency metadata: %s", managerPage.Content)
	}

	status := "published"
	if err := service.PatchInteractiveRecord(page.ID, 7, "question-1", InteractiveRecordPatch{Status: &status}, ownerID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(
		`SELECT status FROM page_section_responses r JOIN page_section_instances s ON s.id=r.section_id
		 WHERE s.page_id=$1 AND r.response_key='question-1'`, page.ID,
	).Scan(&status); err != nil || status != "published" {
		t.Fatalf("normalized moderation status = %q, err=%v", status, err)
	}
	store := repository.(InteractiveResponseRepository)
	if err := store.MutateInteractiveResponses(page.ID, 7, "form", func(records []InteractiveRecord) ([]InteractiveRecord, error) {
		return records, nil
	}); !errors.Is(err, ErrInteractiveSectionNotFound) {
		t.Fatalf("section-type race guard did not fail closed: %v", err)
	}

	limitPage := &models.Page{
		Slug: "interactive-limit-" + uuid.NewString(), Title: "Limit", Visibility: "public",
		Content: interactiveContentOfType("form", `{
			"status":"open","result_visibility":"never","response_limit":1,
			"fields":[{"key":"name","type":"text"}],"records":[]
		}`),
	}
	if err := repository.Create(limitPage); err != nil {
		t.Fatal(err)
	}
	if _, err := BackfillInteractiveResponses(context.Background(), db, limitPage.ID-1, 1); err != nil {
		t.Fatal(err)
	}
	limitService := NewService(repository, nil, WithNormalizedInteractiveResponses(true))
	errs := make(chan error, 2)
	for index := 0; index < 2; index++ {
		go func(key string) {
			_, err := limitService.SubmitInteractive(limitPage.ID, 7, viewerID, "Viewer", key, map[string]interface{}{"name": "A"})
			errs <- err
		}(uuid.NewString())
	}
	var successes, limited int
	for index := 0; index < 2; index++ {
		err := <-errs
		if err == nil {
			successes++
		} else if errors.Is(err, ErrInteractiveDuplicate) {
			limited++
		}
	}
	if successes != 1 || limited != 1 {
		t.Fatalf("normalized response limit race: successes=%d limited=%d", successes, limited)
	}
}

func TestNormalizedReadCutoverAndRollbackProjectionDrill(t *testing.T) {
	db := testutil.OpenTestDB(t)
	userID := seededUserIDs(t, db, 1)[0]
	content := interactiveContentOfType("poll", `{
		"status":"open","submit_label":"Submit vote","success_text":"Recorded",
		"result_visibility":"never","response_limit":1,
		"fields":[{"key":"choice","type":"radio","label":"Choose one","required":true,
		"options":[{"key":"a","label":"A"}]}],
		"records":[{"id":"vote-1","user_id":`+strconv.FormatInt(userID, 10)+`,"respondent_name":"User",
		"answers":{"choice":"a"},"status":"submitted","submitted_at":"2026-01-02T03:04:05Z",
		"updated_at":"2026-01-02T03:04:05Z"}]
	}`)
	repository := NewRepository(db)
	p := &models.Page{Slug: "cutover-" + uuid.NewString(), Title: "Cutover", Visibility: "private", Content: content}
	if err := repository.Create(p); err != nil {
		t.Fatal(err)
	}
	if _, err := BackfillInteractiveResponses(context.Background(), db, p.ID-1, 1); err != nil {
		t.Fatal(err)
	}
	first, err := AuditPageSectionCutover(context.Background(), db, p.ID-1, 1, 2, time.Nanosecond)
	if err != nil {
		t.Fatal(err)
	}
	if first.Ready != 0 || first.Pages[0].Status != "matched" {
		t.Fatalf("cutover became ready before sustained observations: %+v", first)
	}
	second, err := AuditPageSectionCutover(context.Background(), db, p.ID-1, 1, 2, time.Nanosecond)
	if err != nil {
		t.Fatal(err)
	}
	if second.Ready != 1 || second.Pages[0].ConsecutiveRuns < 2 {
		t.Fatalf("cutover did not become ready after rollback drill: %+v", second)
	}

	// Damage the compatibility document after the gate to prove the enabled read
	// is projected solely from normalized definitions and responses.
	if _, err := db.Exec(`UPDATE pages SET content='[]'::jsonb WHERE id=$1`, p.ID); err != nil {
		t.Fatal(err)
	}
	cutoverService := NewService(repository, nil, WithNormalizedSectionReads(true, 2, time.Nanosecond))
	read, err := cutoverService.GetByID(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(read.Content, "vote-1") || !strings.Contains(read.Content, `"section_type":"poll"`) {
		t.Fatalf("normalized read lost its definition or response: %s", read.Content)
	}
	mismatch, err := AuditPageSectionCutover(context.Background(), db, p.ID-1, 1, 2, time.Nanosecond)
	if err != nil {
		t.Fatal(err)
	}
	if mismatch.Pages[0].Status != "mismatch" || !containsString(mismatch.Pages[0].MismatchCodes, "definition_projection_diff") {
		t.Fatalf("damaged rollback projection was not detected: %+v", mismatch)
	}
	normalizedContent, err := repository.(NormalizedPageReadRepository).LoadNormalizedPageContent(p.ID)
	if err != nil || !strings.Contains(normalizedContent, "vote-1") {
		t.Fatalf("read-only audit overwrote normalized authority: %s, %v", normalizedContent, err)
	}
	preflight, err := CheckLegacyPageWriteRetirement(context.Background(), db, 2, time.Nanosecond, time.Nanosecond, false)
	if err != nil {
		t.Fatal(err)
	}
	if preflight.CanRetireLegacyWrites || !containsString(preflight.BlockerCodes, "external_dependency_review_required") {
		t.Fatalf("retirement preflight did not require operator dependency review: %+v", preflight)
	}
	legacyRead, err := NewService(repository, nil, WithNormalizedSectionReads(false, 2, time.Hour)).GetByID(p.ID)
	if err != nil || legacyRead.Content != "[]" {
		t.Fatalf("disabling the cutover flag did not roll back reads: %s, %v", legacyRead.Content, err)
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func TestInteractiveResponseBackfillRejectsUnboundedBatch(t *testing.T) {
	if _, err := BackfillInteractiveResponses(context.Background(), nil, 0, 0); err == nil {
		t.Fatal("expected zero batch size to fail")
	}
	if _, err := BackfillInteractiveResponses(context.Background(), nil, 0, 501); err == nil {
		t.Fatal("expected oversized batch to fail")
	}
}

func seededUserIDs(t *testing.T, db interface {
	Query(query string, args ...any) (*sql.Rows, error)
}, count int) []int64 {
	t.Helper()
	rows, err := db.Query(`SELECT id FROM users ORDER BY id LIMIT $1`, count)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	if len(ids) < count {
		t.Fatalf("need %d seeded users, found %d", count, len(ids))
	}
	return ids
}
