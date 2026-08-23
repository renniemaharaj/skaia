package status

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

type fakeRepository struct {
	incidents []Incident
	created   *Incident
	updated   *Incident
	listErr   error
}

func (r *fakeRepository) ListPublic(context.Context, int) ([]Incident, error) {
	return r.incidents, r.listErr
}

func TestPublicSnapshotFallsBackToExplicitStaleData(t *testing.T) {
	repo := &fakeRepository{}
	checker := &Checker{now: time.Now, timeout: time.Millisecond, checks: []dependencyCheck{{name: "web", required: true, check: func(context.Context) error { return nil }}}}
	svc := NewService(repo, checker, fakePolicy{})
	fresh, err := svc.Public(context.Background())
	if err != nil || fresh.Delayed {
		t.Fatalf("fresh snapshot = %+v, %v", fresh, err)
	}
	repo.listErr = errors.New("database unavailable")
	stale, err := svc.Public(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if stale.State != StateStale || !stale.Delayed || !stale.UpdatedAt.Equal(fresh.UpdatedAt) {
		t.Fatalf("stale snapshot not identified: %+v", stale)
	}
}

func TestPublicSnapshotReflectsActiveIncidentSeverity(t *testing.T) {
	checker := &Checker{now: time.Now, timeout: time.Millisecond, checks: []dependencyCheck{{name: "web", required: true, check: func(context.Context) error { return nil }}}}
	repo := &fakeRepository{incidents: []Incident{{State: "investigating", Severity: "major"}}}
	svc := NewService(repo, checker, fakePolicy{})
	snapshot, err := svc.Public(context.Background())
	if err != nil || snapshot.State != StateDegraded {
		t.Fatalf("major incident snapshot = %+v, %v", snapshot, err)
	}
	repo.incidents[0].Severity = "critical"
	snapshot, err = svc.Public(context.Background())
	if err != nil || snapshot.State != StateUnavailable {
		t.Fatalf("critical incident snapshot = %+v, %v", snapshot, err)
	}
}
func (r *fakeRepository) Create(_ context.Context, _ int64, incident Incident) (*Incident, error) {
	r.created = &incident
	return r.created, nil
}
func (r *fakeRepository) Update(_ context.Context, _ int64, _ int64, incident Incident) (*Incident, error) {
	r.updated = &incident
	return r.updated, nil
}

type fakePolicy struct{ err error }

func (p fakePolicy) RequireStatusOperator(int64) error { return p.err }

func TestServiceMutationPolicyFailsClosed(t *testing.T) {
	svc := NewService(&fakeRepository{}, &Checker{}, nil)
	_, err := svc.Create(context.Background(), 42, Incident{Title: "Outage"})
	if !errors.Is(err, ErrDenied) {
		t.Fatalf("Create error = %v, want denied", err)
	}

	svc = NewService(&fakeRepository{}, &Checker{}, fakePolicy{err: errors.New("lookup failed")})
	_, err = svc.Diagnostics(context.Background(), 42)
	if !errors.Is(err, ErrDenied) {
		t.Fatalf("Diagnostics error = %v, want denied", err)
	}
}

func TestServiceNormalizesResolvedIncident(t *testing.T) {
	repo := &fakeRepository{}
	svc := NewService(repo, &Checker{}, fakePolicy{})
	now := time.Date(2026, 8, 23, 12, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	incident, err := svc.Create(context.Background(), 42, Incident{
		Title:     " Database recovery ",
		Summary:   "Restored from replica.",
		State:     "resolved",
		Severity:  "major",
		Component: "DATABASE",
	})
	if err != nil {
		t.Fatal(err)
	}
	if incident.Title != "Database recovery" || incident.Component != "database" {
		t.Fatalf("incident was not normalized: %+v", incident)
	}
	if incident.ResolvedAt == nil || !incident.ResolvedAt.Equal(now) || !incident.StartedAt.Equal(now) {
		t.Fatalf("server timestamps not applied: %+v", incident)
	}
}

func TestCheckerBoundsFanoutAndSanitizesReasons(t *testing.T) {
	checker := &Checker{
		timeout: 10 * time.Millisecond,
		maxAge:  defaultMaxAge,
		now:     time.Now,
		checks: []dependencyCheck{
			{name: "required", required: true, check: func(ctx context.Context) error {
				<-ctx.Done()
				return ctx.Err()
			}},
			{name: "optional", required: false, check: func(context.Context) error { return errors.New("secret host:5432") }},
		},
	}
	started := time.Now()
	diagnostics := checker.Diagnostics(context.Background())
	if time.Since(started) > 100*time.Millisecond {
		t.Fatalf("checks were not bounded: %s", time.Since(started))
	}
	if diagnostics.State != StateUnavailable {
		t.Fatalf("state = %s, want unavailable", diagnostics.State)
	}
	for _, component := range diagnostics.Components {
		if component.ReasonCode != "dependency_timeout" && component.ReasonCode != "dependency_unavailable" {
			t.Fatalf("unexpected reason disclosure: %q", component.ReasonCode)
		}
	}
}

func TestNewCheckerFailsRequiredDependenciesClosed(t *testing.T) {
	checker := NewChecker(nil, nil, "/definitely/missing/index.html")
	diagnostics := checker.Diagnostics(context.Background())
	if diagnostics.State != StateUnavailable || len(diagnostics.Components) != 4 {
		t.Fatalf("unexpected diagnostics: %+v", diagnostics)
	}
	for _, component := range diagnostics.Components {
		if component.State != StateUnavailable || !component.Required {
			t.Fatalf("dependency did not fail closed: %+v", component)
		}
	}
}

func TestPublicComponentJSONDoesNotExposeDiagnostics(t *testing.T) {
	payload, err := json.Marshal(Component{Name: "database", State: StateUnavailable, Required: true, Latency: time.Second, ReasonCode: "secret topology"})
	if err != nil {
		t.Fatal(err)
	}
	text := string(payload)
	if strings.Contains(text, "secret") || strings.Contains(text, "latency") || strings.Contains(text, "reason") {
		t.Fatalf("public component disclosed diagnostics: %s", text)
	}
}
