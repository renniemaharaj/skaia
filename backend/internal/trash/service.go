package trash

import (
	"context"
	"fmt"
)

const (
	DefaultLimit = 25
	MaxLimit     = 100
)

type Service struct {
	authz     Authorizer
	providers []Provider
	byName    map[string]Provider
}

func NewService(authz Authorizer, providers ...Provider) *Service {
	byName := make(map[string]Provider, len(providers))
	for _, provider := range providers {
		if provider != nil {
			byName[provider.Resource()] = provider
		}
	}
	return &Service{authz: authz, providers: providers, byName: byName}
}

func boundedLimit(limit int) int {
	if limit <= 0 {
		return DefaultLimit
	}
	if limit > MaxLimit {
		return MaxLimit
	}
	return limit
}

func (s *Service) canManage(actorID int64, provider Provider) bool {
	permission := provider.ManagePermission()
	if permission == "" || s.authz == nil {
		return false
	}
	allowed, err := s.authz.HasPermission(actorID, permission)
	return err == nil && allowed
}

func (s *Service) List(ctx context.Context, actorID int64, limit, offset int) ([]Group, error) {
	limit = boundedLimit(limit)
	if offset < 0 {
		offset = 0
	}

	groups := make([]Group, 0, len(s.providers))
	for _, provider := range s.providers {
		if provider == nil {
			continue
		}
		items, err := provider.ListDeleted(
			ctx,
			actorID,
			s.canManage(actorID, provider),
			limit+1,
			offset,
		)
		if err != nil {
			return nil, fmt.Errorf("list %s trash: %w", provider.Resource(), err)
		}
		hasMore := len(items) > limit
		if hasMore {
			items = items[:limit]
		}
		if items == nil {
			items = []Item{}
		}
		groups = append(groups, Group{
			Resource: provider.Resource(),
			Label:    provider.Label(),
			Items:    items,
			HasMore:  hasMore,
		})
	}
	return groups, nil
}

func (s *Service) ListResource(ctx context.Context, actorID int64, resource string, limit, offset int) (Group, error) {
	provider, ok := s.byName[resource]
	if !ok {
		return Group{}, ErrNotFound
	}
	limit = boundedLimit(limit)
	if offset < 0 {
		offset = 0
	}
	items, err := provider.ListDeleted(
		ctx,
		actorID,
		s.canManage(actorID, provider),
		limit+1,
		offset,
	)
	if err != nil {
		return Group{}, fmt.Errorf("list %s trash: %w", provider.Resource(), err)
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	if items == nil {
		items = []Item{}
	}
	return Group{
		Resource: provider.Resource(),
		Label:    provider.Label(),
		Items:    items,
		HasMore:  hasMore,
	}, nil
}

func (s *Service) Restore(ctx context.Context, actorID int64, resource, id string) error {
	provider, ok := s.byName[resource]
	if !ok {
		return ErrNotFound
	}
	return provider.Restore(ctx, actorID, s.canManage(actorID, provider), id)
}
