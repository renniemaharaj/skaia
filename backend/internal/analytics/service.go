package analytics

import "github.com/skaia/backend/models"

// Service provides analytics operations on resource views.
type Service struct {
	repo *Repository
}

// NewService creates a Service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// RecordView logs a single view event.
func (s *Service) RecordView(resource string, resourceID int64, userID *int64, ip string) error {
	return s.repo.RecordView(resource, resourceID, userID, ip)
}

// Stats returns daily aggregated view statistics for the last N days.
func (s *Service) Stats(resource string, resourceID int64, days int) ([]*models.ViewStat, error) {
	if days < 1 {
		days = 30
	}
	if days > 365 {
		days = 365
	}
	return s.repo.DailyStats(resource, resourceID, days)
}

// Summary returns lifetime totals for a resource.
func (s *Service) Summary(resource string, resourceID int64) (totalViews, uniqueViewers, uniqueIPs int64, err error) {
	totalViews, err = s.repo.TotalViews(resource, resourceID)
	if err != nil {
		return
	}
	uniqueViewers, err = s.repo.UniqueViewers(resource, resourceID)
	if err != nil {
		return
	}
	uniqueIPs, err = s.repo.UniqueIPs(resource, resourceID)
	return
}

// RecentVisitors returns paginated individual visit entries.
// If identifiedOnly is true, only rows with a known user are returned.
func (s *Service) RecentVisitors(resource string, resourceID int64, limit, offset int, identifiedOnly bool) ([]*models.VisitorEntry, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	return s.repo.RecentVisitors(resource, resourceID, limit, offset, identifiedOnly)
}

// ViewCount returns the total number of views for a resource from the resource_views table.
func (s *Service) ViewCount(resource string, resourceID int64) (int64, error) {
	return s.repo.TotalViews(resource, resourceID)
}
