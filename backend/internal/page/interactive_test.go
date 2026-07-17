package page

import (
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	isecurity "github.com/skaia/backend/internal/security"
	"github.com/skaia/backend/models"
)

func interactiveContent(config string) string {
	return interactiveContentOfType("poll", config)
}

func interactiveContentOfType(sectionType, config string) string {
	sections := []map[string]interface{}{{
		"id": 7, "display_order": 1, "section_type": sectionType, "heading": "Interactive", "config": config,
	}}
	raw, _ := json.Marshal(sections)
	return string(raw)
}

func TestMergeInteractiveRecordsPreservesConcurrentResponses(t *testing.T) {
	current := interactiveContent(`{"fields":[{"key":"choice","type":"radio"}],"records":[{"id":"r1","user_id":2,"answers":{"choice":"a"}}]}`)
	incoming := interactiveContent(`{"fields":[{"key":"choice","type":"radio","label":"Updated"}],"records":[],"result_summary":{"total":0}}`)
	merged, err := mergeInteractiveRecords(current, incoming)
	if err != nil {
		t.Fatal(err)
	}
	config, err := extractInteractiveConfig(merged, 7)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(config, `"id":"r1"`) {
		t.Fatalf("response was lost during builder merge: %s", config)
	}
	if strings.Contains(config, "result_summary") {
		t.Fatalf("derived result summary must not be persisted: %s", config)
	}
}

func TestSanitizeInteractiveContentDoesNotAggregateFreeText(t *testing.T) {
	content := interactiveContent(`{"result_visibility":"always","fields":[{"key":"secret","type":"textarea"},{"key":"choice","type":"radio"}],"records":[{"id":"r1","user_id":2,"answers":{"secret":"private answer","choice":"a"}}]}`)
	sanitized := SanitizeInteractiveContent(content, 3, false)
	if strings.Contains(sanitized, "private answer") {
		t.Fatalf("free-text answer leaked in sanitized page content: %s", sanitized)
	}
	if !strings.Contains(sanitized, `\"a\":1`) {
		t.Fatalf("structured aggregate missing from sanitized content: %s", sanitized)
	}
}

func TestClearInteractiveRecordsForDuplicate(t *testing.T) {
	content := interactiveContent(`{"fields":[],"records":[{"id":"r1"}]}`)
	cleared := ClearInteractiveRecords(content)
	if strings.Contains(cleared, `"r1"`) {
		t.Fatalf("duplicated page retained submitted data: %s", cleared)
	}
}

func TestSanitizeInteractiveContentFailsClosedAndRemovesIdempotencyKeys(t *testing.T) {
	content := interactiveContent(`{"fields":[{"key":"choice","type":"radio","options":[{"key":"a","label":"A"}]}],"records":[{"id":"r1","user_id":2,"idempotency_key":"secret-key","answers":{"choice":"a"}}]}`)
	for _, sanitized := range []string{
		SanitizeInteractiveContent(content, 2, false),
		SanitizeInteractiveContent(content, 2, true),
	} {
		if strings.Contains(sanitized, "secret-key") {
			t.Fatalf("idempotency key leaked from sanitized content: %s", sanitized)
		}
	}
	viewer := SanitizeInteractiveContent(content, 2, false)
	if strings.Contains(viewer, "result_summary") {
		t.Fatalf("missing result visibility exposed aggregates: %s", viewer)
	}
}

func TestValidateAnswersEnforcesStoredFieldContracts(t *testing.T) {
	var cfg map[string]interface{}
	if err := json.Unmarshal([]byte(`{
		"fields":[
			{"key":"choice","type":"radio","options":[{"key":"a","label":"A"}]},
			{"key":"tags","type":"multi_select","options":[{"key":"x","label":"X"}]},
			{"key":"score","type":"rating","min":1,"max":5},
			{"key":"agreed","type":"consent","required":true}
		]
	}`), &cfg); err != nil {
		t.Fatal(err)
	}
	tests := []map[string]interface{}{
		{"choice": "forged", "tags": []interface{}{"x"}, "score": float64(3), "agreed": true},
		{"choice": "a", "tags": "x", "score": float64(3), "agreed": true},
		{"choice": "a", "tags": []interface{}{"x"}, "score": float64(9), "agreed": true},
		{"choice": "a", "tags": []interface{}{"x"}, "score": float64(3), "agreed": "yes"},
	}
	for _, answers := range tests {
		if err := validateAnswers(cfg, answers); err == nil {
			t.Fatalf("expected invalid answers to be rejected: %#v", answers)
		}
	}
	valid := map[string]interface{}{
		"choice": "a", "tags": []interface{}{"x"}, "score": float64(3), "agreed": true,
	}
	if err := validateAnswers(cfg, valid); err != nil {
		t.Fatalf("valid answers rejected: %v", err)
	}
}

type memoryInteractiveRepository struct {
	Repository
	mu      sync.Mutex
	page    models.Page
	editors map[int64]bool
}

type fakePermissionChecker struct {
	allowed bool
	err     error
}

func (c fakePermissionChecker) HasPermission(_ int64, _ string) (bool, error) {
	return c.allowed, c.err
}

func (r *memoryInteractiveRepository) GetByID(id int64) (*models.Page, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.page.ID != id {
		return nil, errors.New("not found")
	}
	copyPage := r.page
	return &copyPage, nil
}

func (r *memoryInteractiveRepository) MutateContent(_ int64, mutate func(string) (string, error)) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	next, err := mutate(r.page.Content)
	if err == nil {
		r.page.Content = next
	}
	return err
}

func (r *memoryInteractiveRepository) IsEditor(_ int64, userID int64) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.editors[userID], nil
}

func (r *memoryInteractiveRepository) Create(page *models.Page) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.page = *page
	if r.page.ID == 0 {
		r.page.ID = 1
		page.ID = r.page.ID
	}
	return nil
}

func (r *memoryInteractiveRepository) UpdatePreservingInteractive(page *models.Page) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	merged, err := mergeInteractiveRecords(r.page.Content, page.Content)
	if err != nil {
		return err
	}
	page.Content = merged
	r.page = *page
	return nil
}

func TestSubmitInteractiveScopesIdempotencyToParticipant(t *testing.T) {
	repo := &memoryInteractiveRepository{page: models.Page{ID: 1, Content: interactiveContent(`{
		"status":"open","result_visibility":"after_participation","response_limit":1,
		"fields":[{"key":"choice","type":"radio","options":[{"key":"a","label":"A"}]}],
		"records":[{"id":"other-record","user_id":2,"idempotency_key":"shared-key","answers":{"choice":"a"},"status":"submitted"}]
	}`)}}
	svc := NewService(repo, nil)
	created, err := svc.SubmitInteractive(1, 7, 3, "Third user", "shared-key", map[string]interface{}{"choice": "a"})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == "other-record" || created.UserID != 3 {
		t.Fatalf("cross-participant replay returned another record: %#v", created)
	}
	replayed, err := svc.SubmitInteractive(1, 7, 3, "Third user", "shared-key", map[string]interface{}{"choice": "a"})
	if err != nil || replayed.ID != created.ID {
		t.Fatalf("same-participant replay was not idempotent: %#v, %v", replayed, err)
	}
}

func TestInteractiveManagerPolicyFailsClosed(t *testing.T) {
	ownerID := int64(10)
	repo := &memoryInteractiveRepository{
		page: models.Page{ID: 1, OwnerID: &ownerID, Content: interactiveContentOfType("qa", `{
			"status":"open","result_visibility":"never","response_limit":0,
			"fields":[{"key":"question","type":"textarea"}],
			"records":[{"id":"question-1","user_id":2,"answers":{"question":"Private"},"status":"pending"}]
		}`)},
		editors: map[int64]bool{12: true},
	}
	svc := NewService(repo, nil, WithInteractivePolicy(isecurity.NewPagePolicy(repo, fakePermissionChecker{})))
	status := "published"
	if err := svc.DeleteInteractiveRecord(1, 7, "question-1", 11); !errors.Is(err, ErrInteractiveForbidden) {
		t.Fatalf("non-manager deletion did not fail closed: %v", err)
	}
	if err := svc.PatchInteractiveRecord(1, 7, "question-1", InteractiveRecordPatch{Status: &status}, 11); !errors.Is(err, ErrInteractiveForbidden) {
		t.Fatalf("non-manager mutation did not fail closed: %v", err)
	}
	if err := svc.PatchInteractiveRecord(1, 7, "question-1", InteractiveRecordPatch{Status: &status}, 12); err != nil {
		t.Fatalf("editor mutation was rejected: %v", err)
	}
	repo.editors = map[int64]bool{}
	svc = NewService(repo, nil, WithInteractivePolicy(isecurity.NewPagePolicy(repo, fakePermissionChecker{err: errors.New("permission store unavailable")})))
	if err := svc.PatchInteractiveRecord(1, 7, "question-1", InteractiveRecordPatch{Status: &status}, 13); !errors.Is(err, ErrInteractiveForbidden) {
		t.Fatalf("permission lookup failure did not fail closed: %v", err)
	}
	svc = NewService(repo, nil, WithInteractivePolicy(isecurity.NewPagePolicy(repo, fakePermissionChecker{allowed: true})))
	if err := svc.PatchInteractiveRecord(1, 7, "question-1", InteractiveRecordPatch{Status: &status}, 13); err != nil {
		t.Fatalf("authorized administrator mutation was rejected: %v", err)
	}
	if err := svc.DeleteInteractiveRecord(1, 7, "question-1", ownerID); err != nil {
		t.Fatalf("owner deletion was rejected: %v", err)
	}
}

func TestCreateStripsClientSuppliedInteractiveRecords(t *testing.T) {
	repo := &memoryInteractiveRepository{}
	svc := NewService(repo, nil)
	p := &models.Page{Content: interactiveContent(`{
		"status":"open","result_visibility":"never","response_limit":1,
		"fields":[{"key":"choice","type":"radio","options":[{"key":"a","label":"A"}]}],
		"records":[{"id":"imported","user_id":9,"answers":{"choice":"a"}}]
	}`)}
	if err := svc.Create(p); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(repo.page.Content, "imported") || strings.Contains(repo.page.Content, `"user_id":9`) {
		t.Fatalf("client-supplied records reached persistence: %s", repo.page.Content)
	}
}

func TestUpdateDoesNotImportRecordsIntoRekeyedSection(t *testing.T) {
	repo := &memoryInteractiveRepository{page: models.Page{ID: 1, Content: interactiveContent(`{
		"status":"open","result_visibility":"never","response_limit":1,
		"fields":[{"key":"choice","type":"radio","options":[{"key":"a","label":"A"}]}],
		"records":[{"id":"stored","user_id":2,"answers":{"choice":"a"}}]
	}`)}}
	svc := NewService(repo, nil)
	incoming := []map[string]interface{}{{
		"id": 9, "display_order": 1, "section_type": "poll", "heading": "Re-keyed",
		"config": `{"status":"open","result_visibility":"never","response_limit":1,"fields":[{"key":"choice","type":"radio","options":[{"key":"a","label":"A"}]}],"records":[{"id":"imported","user_id":9,"answers":{"choice":"a"}}]}`,
	}}
	raw, _ := json.Marshal(incoming)
	p := &models.Page{ID: 1, Slug: "page", Content: string(raw), Visibility: "public"}
	if err := svc.Update(p); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(repo.page.Content, "stored") || strings.Contains(repo.page.Content, "imported") {
		t.Fatalf("re-keyed section imported records: %s", repo.page.Content)
	}
}

func TestPageInvalidationPayloadContainsNoPageContent(t *testing.T) {
	p := &models.Page{ID: 1, Slug: "page", Content: `[{"config":"secret answer"}]`}
	raw, err := json.Marshal(pageInvalidation(p))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "secret") || strings.Contains(string(raw), "content") {
		t.Fatalf("page invalidation leaked page content: %s", raw)
	}
}

func TestConcurrentSubmissionsHonorResponseLimit(t *testing.T) {
	repo := &memoryInteractiveRepository{page: models.Page{ID: 1, Content: interactiveContentOfType("form", `{
		"status":"open","result_visibility":"never","response_limit":1,
		"fields":[{"key":"name","type":"text"}],"records":[]
	}`)}}
	svc := NewService(repo, nil)
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() {
			_, err := svc.SubmitInteractive(1, 7, 5, "User", "", map[string]interface{}{"name": "A"})
			errs <- err
		}()
	}
	var successes, limited int
	for i := 0; i < 2; i++ {
		err := <-errs
		if err == nil {
			successes++
		} else if errors.Is(err, ErrInteractiveDuplicate) {
			limited++
		}
	}
	if successes != 1 || limited != 1 {
		t.Fatalf("expected one success and one limit rejection, got %d and %d", successes, limited)
	}
}

func TestDatabaseConcurrentBuilderSavePreservesSubmission(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	repo := NewRepository(db)
	content := interactiveContentOfType("form", `{
		"status":"open","result_visibility":"never","response_limit":1,
		"fields":[{"key":"name","type":"text","label":"Name"}],"records":[]
	}`)
	p := &models.Page{Slug: "interactive-concurrency-" + uuid.NewString(), Title: "Concurrency", Content: content, Visibility: "private"}
	if err := repo.Create(p); err != nil {
		t.Fatal(err)
	}
	defer repo.Delete(p.ID)

	updated := interactiveContentOfType("form", `{
		"status":"open","result_visibility":"never","response_limit":1,
		"fields":[{"key":"name","type":"text","label":"Updated name"}],"records":[]
	}`)
	svc := NewService(repo, nil)
	start := make(chan struct{})
	errs := make(chan error, 2)
	go func() {
		<-start
		_, err := svc.SubmitInteractive(p.ID, 7, 5, "User", uuid.NewString(), map[string]interface{}{"name": "A"})
		errs <- err
	}()
	go func() {
		<-start
		errs <- svc.Update(&models.Page{ID: p.ID, Slug: p.Slug, Title: p.Title, Content: updated, Visibility: p.Visibility})
	}()
	close(start)
	for i := 0; i < 2; i++ {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	stored, err := repo.GetByID(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	storedConfig, err := extractInteractiveConfig(stored.Content, 7)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(storedConfig, "Updated name") || !strings.Contains(storedConfig, `"user_id":5`) {
		t.Fatalf("concurrent builder save lost design or response: %s", stored.Content)
	}
}
