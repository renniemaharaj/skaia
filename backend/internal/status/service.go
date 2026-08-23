package status

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"
)

var (
	ErrDenied     = errors.New("status operation denied")
	ErrValidation = errors.New("invalid incident")
)

type Service struct {
	repo       Repository
	checker    *Checker
	policy     OperatorPolicy
	now        Clock
	mu         sync.RWMutex
	lastPublic *PublicSnapshot
}

func NewService(repo Repository, checker *Checker, policy OperatorPolicy) *Service {
	return &Service{repo: repo, checker: checker, policy: policy, now: time.Now}
}

func (s *Service) Public(ctx context.Context) (PublicSnapshot, error) {
	readiness := s.checker.Readiness(ctx)
	incidents, err := s.repo.ListPublic(ctx, 20)
	if err != nil {
		s.mu.RLock()
		last := s.lastPublic
		s.mu.RUnlock()
		if last != nil {
			stale := *last
			stale.Components = readiness.Components
			stale.State = readiness.State
			if stale.State == StateOperational {
				stale.State = StateStale
			}
			stale.Delayed = true
			return stale, nil
		}
		return PublicSnapshot{}, err
	}
	snapshot := PublicSnapshot{State: publicIncidentState(readiness.State, incidents), Components: readiness.Components, Incidents: incidents, UpdatedAt: readiness.UpdatedAt, Delayed: s.now().Sub(readiness.UpdatedAt) > defaultMaxAge}
	s.mu.Lock()
	s.lastPublic = &snapshot
	s.mu.Unlock()
	return snapshot, nil
}

func publicIncidentState(readiness State, incidents []Incident) State {
	if readiness == StateUnavailable {
		return readiness
	}
	state := readiness
	for _, incident := range incidents {
		if incident.State == "draft" || incident.State == "resolved" {
			continue
		}
		if incident.Severity == "critical" {
			return StateUnavailable
		}
		state = StateDegraded
	}
	return state
}

func (s *Service) Diagnostics(ctx context.Context, actorID int64) (Diagnostics, error) {
	if s.policy == nil || s.policy.RequireStatusOperator(actorID) != nil {
		return Diagnostics{}, ErrDenied
	}
	return s.checker.Diagnostics(ctx), nil
}

func (s *Service) Create(ctx context.Context, actorID int64, incident Incident) (*Incident, error) {
	if s.policy == nil || s.policy.RequireStatusOperator(actorID) != nil {
		return nil, ErrDenied
	}
	if err := normalizeIncident(&incident, s.now()); err != nil {
		return nil, err
	}
	return s.repo.Create(ctx, actorID, incident)
}

func (s *Service) Update(ctx context.Context, actorID, incidentID int64, incident Incident) (*Incident, error) {
	if s.policy == nil || s.policy.RequireStatusOperator(actorID) != nil || incidentID <= 0 {
		return nil, ErrDenied
	}
	if err := normalizeIncident(&incident, s.now()); err != nil {
		return nil, err
	}
	return s.repo.Update(ctx, actorID, incidentID, incident)
}

func normalizeIncident(incident *Incident, now time.Time) error {
	incident.Title = strings.TrimSpace(incident.Title)
	incident.Summary = strings.TrimSpace(incident.Summary)
	incident.Component = strings.TrimSpace(strings.ToLower(incident.Component))
	if len(incident.Title) < 3 || len(incident.Title) > 120 || len(incident.Summary) > 1000 {
		return ErrValidation
	}
	if incident.State != "investigating" && incident.State != "monitoring" && incident.State != "resolved" && incident.State != "maintenance" && incident.State != "draft" {
		return ErrValidation
	}
	if incident.Severity != "minor" && incident.Severity != "major" && incident.Severity != "critical" && incident.Severity != "maintenance" {
		return ErrValidation
	}
	if incident.Component != "database" && incident.Component != "cache" && incident.Component != "web" && incident.Component != "platform" {
		return ErrValidation
	}
	if incident.StartedAt.IsZero() {
		incident.StartedAt = now.UTC()
	}
	if incident.State == "resolved" && incident.ResolvedAt == nil {
		resolved := now.UTC()
		incident.ResolvedAt = &resolved
	}
	if incident.State != "resolved" {
		incident.ResolvedAt = nil
	}
	return nil
}
