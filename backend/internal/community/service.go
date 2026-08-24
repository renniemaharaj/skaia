package community

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	ipage "github.com/skaia/backend/internal/page"
	"github.com/skaia/backend/internal/s_registry"
)

var (
	ErrDenied     = errors.New("community operation denied")
	ErrValidation = errors.New("invalid community request")
	ErrTransition = errors.New("invalid community transition")
	ErrCapacity   = errors.New("event capacity reached")
	ErrConflict   = errors.New("community publication conflicts with existing content")
)
var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type Service struct {
	repo       Repository
	permission PermissionPolicy
	documents  DocumentReader
	validator  DocumentValidator
	pageChange PageChangeNotifier
}

type DocumentReader func(pageID, actorID int64, canManage bool) (string, error)
type DocumentValidator func(string) error
type PageChangeNotifier func(actorID, pageID int64, oldSlug, newSlug, action string)
type Option func(*Service)

func WithPageDocuments(reader DocumentReader, validator DocumentValidator) Option {
	return func(service *Service) {
		service.documents = reader
		service.validator = validator
	}
}

func WithPageChangeNotifier(notifier PageChangeNotifier) Option {
	return func(service *Service) { service.pageChange = notifier }
}

func NewService(r Repository, p PermissionPolicy, options ...Option) *Service {
	service := &Service{repo: r, permission: p}
	for _, option := range options {
		option(service)
	}
	return service
}
func (s *Service) has(id int64, permission string) bool {
	if id <= 0 || s.permission == nil {
		return false
	}
	ok, err := s.permission(id, permission)
	return err == nil && ok
}
func (s *Service) manage(id int64) bool { return s.has(id, "community.manage") }
func (s *Service) canEditOthers(id int64) bool {
	return s.has(id, "community.publication-edit") || s.manage(id)
}
func (s *Service) canDeleteOthers(id int64) bool {
	return s.has(id, "community.publication-delete") || s.manage(id)
}
func (s *Service) setCapabilities(publication *Publication, actorID int64) {
	if publication == nil {
		return
	}
	isOwner := actorID > 0 && publication.AuthorID == actorID
	publication.CanManagePage = isOwner || s.has(actorID, "home.manage")
	publication.CanEditThread = isOwner || s.has(actorID, "forum.thread-edit")
	publication.CanEdit = isOwner || s.canEditOthers(actorID)
	publication.CanDelete = isOwner || s.canDeleteOthers(actorID)
	publication.CanTransition = publication.Kind == "proposal" && s.manage(actorID)
	publication.CanVote = actorID > 0 && publication.Kind == "proposal" &&
		publication.PublicationStatus == "published" && publication.Proposal != nil &&
		(publication.Proposal.State == "submitted" || publication.Proposal.State == "under_review")
	publication.CanAttend = actorID > 0 && publication.Kind == "event" &&
		publication.PublicationStatus == "published" && publication.Event != nil

}
func (s *Service) decorate(publication *Publication, actorID int64) error {
	s.setCapabilities(publication, actorID)
	if publication == nil {
		return nil
	}
	if s.documents != nil {
		body, err := s.documents(publication.PageID, actorID, publication.CanManagePage)
		if err != nil {
			return err
		}
		publication.Body = body
	}
	return nil
}
func (s *Service) Create(ctx context.Context, userID int64, v CreateRequest) (*Publication, error) {
	v.Kind = strings.ToLower(strings.TrimSpace(v.Kind))
	v.Slug = strings.ToLower(strings.TrimSpace(v.Slug))
	v.Title = strings.TrimSpace(v.Title)
	v.Summary = strings.TrimSpace(v.Summary)
	v.Visibility = strings.ToLower(strings.TrimSpace(v.Visibility))
	v.PublicationStatus = strings.ToLower(strings.TrimSpace(v.PublicationStatus))
	if userID <= 0 {
		return nil, ErrDenied
	}
	if v.Kind == "event" && !s.manage(userID) {
		return nil, ErrDenied
	}
	if !slugPattern.MatchString(v.Slug) || len(v.Slug) > 100 || len(v.Title) < 3 || len(v.Title) > 160 || len(v.Summary) > 500 || len(v.Body) > 100000 || (v.Kind != "proposal" && v.Kind != "showcase" && v.Kind != "event") || (v.Visibility != "public" && v.Visibility != "members" && v.Visibility != "private") || (v.PublicationStatus != "draft" && v.PublicationStatus != "published") {
		return nil, ErrValidation
	}
	v.Body = ipage.ClearInteractiveRecords(v.Body)
	validate := func(content string) error { return s_registry.ValidateContent(content, nil) }
	if s.validator != nil {
		validate = s.validator
	}
	if err := validate(v.Body); err != nil {
		return nil, ErrValidation
	}
	if v.Kind == "showcase" && (len(v.Media) > 20000 || !json.Valid(defaultJSON(v.Media)) || len(v.Credits) > 500) {
		return nil, ErrValidation
	}
	if v.Kind == "event" && (v.StartsAt.IsZero() || (v.EndsAt != nil && !v.EndsAt.After(v.StartsAt)) || len(v.Location) > 200 || (v.Capacity != nil && *v.Capacity < 1)) {
		return nil, ErrValidation
	}
	publication, err := s.repo.Create(ctx, userID, v)
	if err != nil && (strings.Contains(err.Error(), "23505") || strings.Contains(err.Error(), "_key")) {
		return nil, ErrConflict
	}
	if err == nil && publication != nil {
		publication.Body = v.Body
		if s.pageChange != nil {
			s.pageChange(userID, publication.PageID, "", publication.PageSlug, "create")
		}
		if decorateErr := s.decorate(publication, userID); decorateErr != nil {
			return nil, decorateErr
		}
	}
	return publication, err
}
func defaultJSON(v []byte) []byte {
	if len(v) == 0 {
		return []byte("[]")
	}
	return v
}
func (s *Service) List(ctx context.Context, userID int64, kind string, cursor int64, limit int, q string) (Page, error) {
	if limit == 0 {
		limit = 30
	}
	if limit < 1 || limit > 100 || (kind != "proposal" && kind != "showcase" && kind != "event") || len(q) > 100 {
		return Page{}, ErrValidation
	}
	lookup := userID
	if s.canEditOthers(userID) || s.canDeleteOthers(userID) {
		lookup = -userID
	}
	page, err := s.repo.List(ctx, lookup, kind, cursor, limit, strings.TrimSpace(q))
	if err == nil {
		for index := range page.Items {
			s.setCapabilities(&page.Items[index], userID)
		}
	}
	return page, err
}
func (s *Service) Get(ctx context.Context, userID int64, kind string, id int64) (*Publication, error) {
	if id <= 0 {
		return nil, ErrValidation
	}
	lookup := userID
	if s.canEditOthers(userID) || s.canDeleteOthers(userID) {
		lookup = -userID
	}
	publication, err := s.repo.Get(ctx, lookup, kind, id)
	if err == nil && publication != nil {
		err = s.decorate(publication, userID)
	}
	return publication, err
}

func (s *Service) Update(ctx context.Context, actorID, id int64, kind string, request UpdateRequest) (*Publication, error) {
	if actorID <= 0 || id <= 0 {
		return nil, ErrDenied
	}
	lookup := actorID
	if s.canEditOthers(actorID) {
		lookup = -actorID
	}
	current, err := s.repo.Get(ctx, lookup, "", id)
	if err != nil {
		return nil, err
	}
	if current.AuthorID != actorID && !s.canEditOthers(actorID) {
		return nil, ErrDenied
	}
	if current.Kind != kind {
		return nil, ErrValidation
	}
	request.Slug = strings.ToLower(strings.TrimSpace(request.Slug))
	request.Title = strings.TrimSpace(request.Title)
	request.Summary = strings.TrimSpace(request.Summary)
	request.Visibility = strings.ToLower(strings.TrimSpace(request.Visibility))
	request.PublicationStatus = strings.ToLower(strings.TrimSpace(request.PublicationStatus))
	request.Credits = strings.TrimSpace(request.Credits)
	request.Location = strings.TrimSpace(request.Location)
	if !slugPattern.MatchString(request.Slug) || len(request.Slug) > 100 || len(request.Title) < 3 || len(request.Title) > 160 || len(request.Summary) > 500 || (request.Visibility != "public" && request.Visibility != "members" && request.Visibility != "private") || (request.PublicationStatus != "draft" && request.PublicationStatus != "published" && request.PublicationStatus != "archived") {
		return nil, ErrValidation
	}
	if current.Kind == "showcase" && (len(request.Media) > 20000 || !json.Valid(defaultJSON(request.Media)) || len(request.Credits) > 500) {
		return nil, ErrValidation
	}
	if current.Kind == "event" && (request.StartsAt.IsZero() || (request.EndsAt != nil && !request.EndsAt.After(request.StartsAt)) || len(request.Location) > 200 || (request.Capacity != nil && *request.Capacity < 1)) {
		return nil, ErrValidation
	}
	publication, err := s.repo.Update(ctx, actorID, id, request)
	if err != nil && (strings.Contains(err.Error(), "23505") || strings.Contains(err.Error(), "_key")) {
		return nil, ErrConflict
	}
	if err == nil && publication == nil {
		return nil, errors.New("community repository returned an empty update")
	}
	if err == nil {
		if s.pageChange != nil {
			s.pageChange(actorID, publication.PageID, current.PageSlug, publication.PageSlug, "update")
		}
		err = s.decorate(publication, actorID)
	}
	return publication, err
}

var transitions = map[string]map[string]bool{"submitted": {"under_review": true}, "under_review": {"accepted": true, "rejected": true}, "accepted": {"completed": true, "rejected": true}}

func (s *Service) Transition(ctx context.Context, actor, id int64, next, decision string) (*Publication, error) {
	if !s.manage(actor) {
		return nil, ErrDenied
	}
	current, err := s.repo.Get(ctx, -actor, "proposal", id)
	if err != nil {
		return nil, err
	}
	if current.Proposal == nil || !transitions[current.Proposal.State][next] || len(decision) > 2000 {
		return nil, ErrTransition
	}
	publication, err := s.repo.Transition(ctx, actor, id, current.Proposal.State, next, strings.TrimSpace(decision))
	if err == nil {
		err = s.decorate(publication, actor)
	}
	return publication, err
}
func (s *Service) Vote(ctx context.Context, user, id int64, value int) (*Publication, error) {
	if user <= 0 {
		return nil, ErrDenied
	}
	if value != -1 && value != 1 {
		return nil, ErrValidation
	}
	current, err := s.repo.Get(ctx, user, "proposal", id)
	if err != nil {
		return nil, err
	}
	if current.PublicationStatus != "published" || current.Proposal == nil ||
		(current.Proposal.State != "submitted" && current.Proposal.State != "under_review") {
		return nil, ErrTransition
	}
	publication, err := s.repo.Vote(ctx, user, id, value)
	if err == nil {
		err = s.decorate(publication, user)
	}
	return publication, err
}
func (s *Service) Attend(ctx context.Context, user, id int64, status string) (*Publication, error) {
	if user <= 0 {
		return nil, ErrDenied
	}
	if status != "going" && status != "interested" {
		return nil, ErrValidation
	}
	current, err := s.repo.Get(ctx, user, "event", id)
	if err != nil {
		return nil, err
	}
	if current.PublicationStatus != "published" || current.Event == nil {
		return nil, ErrTransition
	}
	publication, err := s.repo.Attend(ctx, user, id, status)
	if err == nil {
		err = s.decorate(publication, user)
	}
	return publication, err
}
func (s *Service) Delete(ctx context.Context, user, id int64, kind string) error {
	if id <= 0 {
		return ErrValidation
	}
	lookup := user
	if s.canDeleteOthers(user) {
		lookup = -user
	}
	publication, err := s.repo.Get(ctx, lookup, "", id)
	if err != nil {
		return err
	}
	if publication.AuthorID != user && !s.canDeleteOthers(user) {
		return ErrDenied
	}
	if publication.Kind != kind {
		return ErrValidation
	}
	err = s.repo.Delete(ctx, user, id)
	if err == nil && s.pageChange != nil {
		s.pageChange(user, publication.PageID, publication.PageSlug, publication.PageSlug, "delete")
	}
	return err
}
