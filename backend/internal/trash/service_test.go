package trash

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeAuthorizer struct {
	allowed map[string]bool
	err     error
}

func (f fakeAuthorizer) HasPermission(_ int64, permission string) (bool, error) {
	return f.allowed[permission], f.err
}

type fakeProvider struct {
	resource      string
	permission    string
	includeSeen   bool
	restoreSeen   bool
	list          []Item
	restoreResult error
}

func (f *fakeProvider) Resource() string         { return f.resource }
func (f *fakeProvider) Label() string            { return f.resource }
func (f *fakeProvider) ManagePermission() string { return f.permission }
func (f *fakeProvider) ListDeleted(_ context.Context, _ int64, includeManaged bool, _, _ int) ([]Item, error) {
	f.includeSeen = includeManaged
	return f.list, nil
}
func (f *fakeProvider) Restore(_ context.Context, _ int64, includeManaged bool, _ string) error {
	f.restoreSeen = includeManaged
	return f.restoreResult
}

func TestServiceFailsClosedWhenManagePermissionLookupFails(t *testing.T) {
	provider := &fakeProvider{resource: "pages", permission: "home.manage"}
	svc := NewService(fakeAuthorizer{err: errors.New("db unavailable")}, provider)
	if _, err := svc.List(context.Background(), 7, 25, 0); err != nil {
		t.Fatal(err)
	}
	if provider.includeSeen {
		t.Fatal("permission lookup failure granted managed trash scope")
	}
}

func TestServiceUsesBoundedPerProviderPagination(t *testing.T) {
	items := make([]Item, 101)
	for i := range items {
		items[i] = Item{ID: "x", DeletedAt: time.Now()}
	}
	provider := &fakeProvider{resource: "pages", list: items}
	svc := NewService(fakeAuthorizer{}, provider)
	groups, err := svc.List(context.Background(), 7, 1000, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || len(groups[0].Items) != MaxLimit || !groups[0].HasMore {
		t.Fatalf("unexpected bounded group: %#v", groups)
	}
}

func TestServiceDoesNotExposeUnknownResource(t *testing.T) {
	svc := NewService(fakeAuthorizer{})
	if _, err := svc.ListResource(context.Background(), 7, "caller-selected-table", 25, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected list not found, got %v", err)
	}
	if err := svc.Restore(context.Background(), 7, "caller-selected-table", "1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}
