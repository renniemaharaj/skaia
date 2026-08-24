package community

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeRepo struct {
	publication        *Publication
	updatedPublication *Publication
	err                error
	transitioned       string
	created            CreateRequest
	updated            UpdateRequest
	getUser            int64
	voted              bool
	attended           bool
}

func (f *fakeRepo) Create(_ context.Context, _ int64, request CreateRequest) (*Publication, error) {
	f.created = request
	return f.publication, f.err
}
func (f *fakeRepo) List(context.Context, int64, string, int64, int, string) (Page, error) {
	return Page{}, f.err
}
func (f *fakeRepo) Get(_ context.Context, userID int64, _ string, _ int64) (*Publication, error) {
	f.getUser = userID
	return f.publication, f.err
}
func (f *fakeRepo) Update(_ context.Context, _ int64, _ int64, request UpdateRequest) (*Publication, error) {
	f.updated = request
	if f.updatedPublication != nil {
		return f.updatedPublication, f.err
	}
	return f.publication, f.err
}
func (f *fakeRepo) Transition(_ context.Context, _ int64, _ int64, _, next, _ string) (*Publication, error) {
	f.transitioned = next
	return f.publication, f.err
}
func (f *fakeRepo) Vote(context.Context, int64, int64, int) (*Publication, error) {
	f.voted = true
	return f.publication, f.err
}
func (f *fakeRepo) Attend(context.Context, int64, int64, string) (*Publication, error) {
	f.attended = true
	return f.publication, f.err
}
func (f *fakeRepo) Delete(context.Context, int64, int64) error { return f.err }
func allow(_ int64, _ string) (bool, error)                    { return true, nil }

func TestProposalTransitionStateMachine(t *testing.T) {
	repo := &fakeRepo{publication: &Publication{Proposal: &Proposal{State: "submitted"}}}
	svc := NewService(repo, allow)
	_, err := svc.Transition(context.Background(), 1, 2, "accepted", "")
	assert.ErrorIs(t, err, ErrTransition)
	_, err = svc.Transition(context.Background(), 1, 2, "under_review", "")
	require.NoError(t, err)
	assert.Equal(t, "under_review", repo.transitioned)
}
func TestEventRequiresManagerAndValidSchedule(t *testing.T) {
	svc := NewService(&fakeRepo{}, nil)
	_, err := svc.Create(context.Background(), 1, CreateRequest{Kind: "event"})
	assert.ErrorIs(t, err, ErrDenied)
	svc = NewService(&fakeRepo{publication: &Publication{}}, allow)
	start := time.Now()
	end := start.Add(-time.Minute)
	_, err = svc.Create(context.Background(), 1, CreateRequest{Kind: "event", Slug: "launch", Title: "Launch", Visibility: "public", PublicationStatus: "draft", StartsAt: start, EndsAt: &end})
	assert.ErrorIs(t, err, ErrValidation)
}
func TestVoteAndAttendanceAreValidated(t *testing.T) {
	svc := NewService(&fakeRepo{publication: &Publication{}}, allow)
	_, err := svc.Vote(context.Background(), 1, 2, 0)
	assert.ErrorIs(t, err, ErrValidation)
	_, err = svc.Attend(context.Background(), 1, 2, "maybe")
	assert.ErrorIs(t, err, ErrValidation)
}

func TestVoteClosesWithProposalWorkflow(t *testing.T) {
	repo := &fakeRepo{publication: &Publication{
		ID: 2, Kind: "proposal", PublicationStatus: "published",
		Proposal: &Proposal{State: "accepted"},
	}}
	service := NewService(repo, nil)

	publication, err := service.Get(context.Background(), 7, "proposal", 2)
	require.NoError(t, err)
	assert.False(t, publication.CanVote)
	_, err = service.Vote(context.Background(), 7, 2, 1)
	assert.ErrorIs(t, err, ErrTransition)
	assert.False(t, repo.voted)

	repo.publication.Proposal.State = "submitted"
	_, err = service.Vote(context.Background(), 7, 2, 1)
	require.NoError(t, err)
	assert.True(t, repo.voted)
}

func TestAttendanceRequiresVisiblePublishedEvent(t *testing.T) {
	repo := &fakeRepo{publication: &Publication{
		ID: 3, Kind: "event", PublicationStatus: "draft", Event: &Event{},
	}}
	service := NewService(repo, nil)

	publication, err := service.Get(context.Background(), 7, "event", 3)
	require.NoError(t, err)
	assert.False(t, publication.CanAttend)
	_, err = service.Attend(context.Background(), 7, 3, "going")
	assert.ErrorIs(t, err, ErrTransition)
	assert.False(t, repo.attended)

	repo.publication.PublicationStatus = "published"
	_, err = service.Attend(context.Background(), 7, 3, "going")
	require.NoError(t, err)
	assert.True(t, repo.attended)
}

func TestCreateClearsInteractiveRecordsBeforePagePersistence(t *testing.T) {
	repo := &fakeRepo{publication: &Publication{PageID: 8}}
	service := NewService(repo, allow)
	body := `[{"id":1,"display_order":1,"section_type":"form","config":"{\"status\":\"open\",\"result_visibility\":\"never\",\"response_limit\":1,\"fields\":[{\"key\":\"choice\",\"type\":\"radio\",\"options\":[{\"key\":\"a\",\"label\":\"A\"}]}],\"records\":[{\"id\":\"private\",\"user_id\":9,\"answers\":{\"choice\":\"a\"}}]}"}]`
	publication, err := service.Create(context.Background(), 7, CreateRequest{
		Kind: "proposal", Slug: "safe-page", Title: "Safe page", Body: body,
		Visibility: "private", PublicationStatus: "draft",
	})
	require.NoError(t, err)
	assert.NotContains(t, repo.created.Body, "private")
	assert.Equal(t, repo.created.Body, publication.Body)
	assert.True(t, publication.CanManagePage)
}

func TestGetHydratesThroughAuthorizedPageProjection(t *testing.T) {
	repo := &fakeRepo{publication: &Publication{PageID: 12, AuthorID: 7}}
	var gotPageID, gotActor int64
	var gotManage bool
	service := NewService(repo, nil, WithPageDocuments(
		func(pageID, actorID int64, canManage bool) (string, error) {
			gotPageID, gotActor, gotManage = pageID, actorID, canManage
			return `[{"id":1,"section_type":"rich_text","config":"{}"}]`, nil
		},
		nil,
	))
	publication, err := service.Get(context.Background(), 7, "proposal", 1)
	require.NoError(t, err)
	assert.Equal(t, int64(12), gotPageID)
	assert.Equal(t, int64(7), gotActor)
	assert.True(t, gotManage)
	assert.Contains(t, publication.Body, "rich_text")
}

func TestOwnerAndGranularPermissionsControlPublicationMutations(t *testing.T) {
	request := UpdateRequest{Slug: "updated", Title: "Updated title", Visibility: "private", PublicationStatus: "draft"}
	repo := &fakeRepo{publication: &Publication{ID: 1, Kind: "showcase", AuthorID: 7}}
	service := NewService(repo, func(userID int64, permission string) (bool, error) {
		return userID == 9 && permission == "community.publication-edit", nil
	})

	publication, err := service.Get(context.Background(), 9, "showcase", 1)
	require.NoError(t, err)
	assert.True(t, publication.CanEdit)
	assert.False(t, publication.CanDelete)
	assert.False(t, publication.CanManagePage)
	assert.Equal(t, int64(-9), repo.getUser)

	_, err = service.Update(context.Background(), 9, 1, "showcase", request)
	require.NoError(t, err)
	assert.Equal(t, "updated", repo.updated.Slug)

	assert.ErrorIs(t, service.Delete(context.Background(), 9, 1, "showcase"), ErrDenied)
	assert.ErrorIs(t, service.Delete(context.Background(), 7, 1, "proposal"), ErrValidation)
}

func TestHomeManageDoesNotGrantCommunityModeration(t *testing.T) {
	repo := &fakeRepo{publication: &Publication{ID: 1, Kind: "proposal", AuthorID: 7, Proposal: &Proposal{State: "submitted"}}}
	service := NewService(repo, func(_ int64, permission string) (bool, error) {
		return permission == "home.manage", nil
	})
	publication, err := service.Get(context.Background(), 9, "proposal", 1)
	require.NoError(t, err)
	assert.True(t, publication.CanManagePage)
	assert.False(t, publication.CanEdit)
	assert.False(t, publication.CanTransition)
	_, err = service.Transition(context.Background(), 9, 1, "under_review", "")
	assert.ErrorIs(t, err, ErrDenied)
}

func TestThreadEditCapabilityFollowsThreadOwnershipOrForumPermission(t *testing.T) {
	repo := &fakeRepo{publication: &Publication{ID: 1, Kind: "showcase", AuthorID: 7, CanonicalThreadID: 18}}
	service := NewService(repo, func(userID int64, permission string) (bool, error) {
		return userID == 9 && permission == "forum.thread-edit", nil
	})

	owner, err := service.Get(context.Background(), 7, "showcase", 1)
	require.NoError(t, err)
	assert.True(t, owner.CanEditThread)

	editor, err := service.Get(context.Background(), 9, "showcase", 1)
	require.NoError(t, err)
	assert.True(t, editor.CanEditThread)

	viewer, err := service.Get(context.Background(), 10, "showcase", 1)
	require.NoError(t, err)
	assert.False(t, viewer.CanEditThread)
}

func TestPublicationMutationsNotifyLinkedPageChanges(t *testing.T) {
	repo := &fakeRepo{publication: &Publication{
		ID: 1, Kind: "showcase", AuthorID: 7, PageID: 12,
		PageSlug: "community-showcase-original",
	}, updatedPublication: &Publication{
		ID: 1, Kind: "showcase", AuthorID: 7, PageID: 12,
		PageSlug: "community-showcase-updated",
	}}
	type notification struct {
		pageID           int64
		oldSlug, newSlug string
		action           string
	}
	var notifications []notification
	service := NewService(repo, nil, WithPageChangeNotifier(func(_ int64, pageID int64, oldSlug, newSlug, action string) {
		notifications = append(notifications, notification{pageID, oldSlug, newSlug, action})
	}))

	_, err := service.Update(context.Background(), 7, 1, "showcase", UpdateRequest{
		Slug: "updated", Title: "Updated title", Visibility: "private", PublicationStatus: "draft",
	})
	require.NoError(t, err)
	require.Len(t, notifications, 1)
	assert.Equal(t, notification{12, "community-showcase-original", "community-showcase-updated", "update"}, notifications[0])

	require.NoError(t, service.Delete(context.Background(), 7, 1, "showcase"))
	require.Len(t, notifications, 2)
	assert.Equal(t, notification{12, "community-showcase-original", "community-showcase-original", "delete"}, notifications[1])
}

func TestPublicationCreateNotifiesLinkedPageWithoutContent(t *testing.T) {
	repo := &fakeRepo{publication: &Publication{
		ID: 1, Kind: "proposal", AuthorID: 7, PageID: 12,
		PageSlug: "community-proposal-created",
	}}
	var oldSlug, newSlug, action string
	service := NewService(repo, nil, WithPageChangeNotifier(func(_ int64, _ int64, oldValue, newValue, actionValue string) {
		oldSlug, newSlug, action = oldValue, newValue, actionValue
	}))

	_, err := service.Create(context.Background(), 7, CreateRequest{
		Kind: "proposal", Slug: "created", Title: "Created proposal",
		Visibility: "private", PublicationStatus: "draft",
	})
	require.NoError(t, err)
	assert.Empty(t, oldSlug)
	assert.Equal(t, "community-proposal-created", newSlug)
	assert.Equal(t, "create", action)
}
