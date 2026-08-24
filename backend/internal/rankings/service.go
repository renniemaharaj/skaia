package rankings

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"
)

var (
	ErrDenied     = errors.New("ranking operation denied")
	ErrValidation = errors.New("invalid ranking request")
	ErrConflict   = errors.New("ranking replay conflict")
	ErrClosed     = errors.New("ranking season closed")
)
var keyPattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{1,63}$`)

type Service struct {
	repo       Repository
	permission PermissionPolicy
}

func NewService(repo Repository, p PermissionPolicy) *Service {
	return &Service{repo: repo, permission: p}
}
func (s *Service) allowed(id int64, permission string) bool {
	if s.permission == nil {
		return false
	}
	ok, err := s.permission(id, permission)
	if err == nil && ok {
		return true
	}
	ok, err = s.permission(id, "home.manage")
	return err == nil && ok
}
func (s *Service) CreateDataset(ctx context.Context, id int64, v CreateDatasetRequest) (*Dataset, error) {
	v.Key = strings.ToLower(strings.TrimSpace(v.Key))
	v.Name = strings.TrimSpace(v.Name)
	v.MetricLabel = strings.TrimSpace(v.MetricLabel)
	if !s.allowed(id, "rankings.manage") {
		return nil, ErrDenied
	}
	if !keyPattern.MatchString(v.Key) || len(v.Name) < 2 || len(v.Name) > 100 || len(v.Description) > 500 || len(v.MetricLabel) < 1 || len(v.MetricLabel) > 60 || (v.Direction != "asc" && v.Direction != "desc") || (v.TieRule != "competition" && v.TieRule != "dense" && v.TieRule != "ordinal") || (v.Visibility != "public" && v.Visibility != "members" && v.Visibility != "private") {
		return nil, ErrValidation
	}
	return s.repo.CreateDataset(ctx, id, v)
}
func (s *Service) CreateSeason(ctx context.Context, id int64, dataset string, v CreateSeasonRequest) (*Season, error) {
	dataset = strings.ToLower(strings.TrimSpace(dataset))
	v.Key = strings.ToLower(strings.TrimSpace(v.Key))
	v.Name = strings.TrimSpace(v.Name)
	if !s.allowed(id, "rankings.manage") {
		return nil, ErrDenied
	}
	if !keyPattern.MatchString(dataset) || !keyPattern.MatchString(v.Key) || len(v.Name) < 2 || v.StartsAt.IsZero() || (v.EndsAt != nil && !v.EndsAt.After(v.StartsAt)) {
		return nil, ErrValidation
	}
	return s.repo.CreateSeason(ctx, id, dataset, v)
}
func (s *Service) CloseSeason(ctx context.Context, id int64, dataset, season string) (*Season, error) {
	if !s.allowed(id, "rankings.manage") {
		return nil, ErrDenied
	}
	return s.repo.CloseSeason(ctx, dataset, season)
}
func (s *Service) Datasets(ctx context.Context, userID int64) ([]Dataset, error) {
	return s.repo.ListDatasets(ctx, userID > 0)
}
func (s *Service) Seasons(ctx context.Context, userID int64, dataset string) ([]Season, error) {
	if !keyPattern.MatchString(dataset) {
		return nil, ErrValidation
	}
	return s.repo.ListSeasons(ctx, dataset, userID > 0)
}
func (s *Service) Standings(ctx context.Context, userID int64, dataset, season, cursor string, limit int) (Standings, error) {
	if limit == 0 {
		limit = 50
	}
	if limit < 1 || limit > 100 || !keyPattern.MatchString(dataset) || !keyPattern.MatchString(season) {
		return Standings{}, ErrValidation
	}
	return s.repo.Standings(ctx, dataset, season, cursor, limit, userID > 0)
}
func (s *Service) Ingest(ctx context.Context, id int64, dataset string, v IngestRequest) (*Entry, bool, error) {
	if !s.allowed(id, "rankings.produce") {
		return nil, false, ErrDenied
	}
	v.EventID = strings.TrimSpace(v.EventID)
	v.SeasonKey = strings.ToLower(strings.TrimSpace(v.SeasonKey))
	v.SubjectType = strings.ToLower(strings.TrimSpace(v.SubjectType))
	v.SubjectKey = strings.TrimSpace(v.SubjectKey)
	v.DisplayName = strings.TrimSpace(v.DisplayName)
	if !keyPattern.MatchString(dataset) || len(v.EventID) < 1 || len(v.EventID) > 255 || !keyPattern.MatchString(v.SeasonKey) || (v.SubjectType != "user" && v.SubjectType != "external" && v.SubjectType != "team") || len(v.SubjectKey) < 1 || len(v.SubjectKey) > 255 || len(v.DisplayName) < 1 || len(v.DisplayName) > 120 || (v.Mode != "snapshot" && v.Mode != "delta") {
		return nil, false, ErrValidation
	}
	if _, err := strconv.ParseFloat(v.Value, 64); err != nil {
		return nil, false, ErrValidation
	}
	raw, _ := json.Marshal(v)
	identity := sha256.Sum256([]byte(v.EventID))
	payload := sha256.Sum256(raw)
	return s.repo.Ingest(ctx, id, dataset, identity[:], payload[:], v)
}
