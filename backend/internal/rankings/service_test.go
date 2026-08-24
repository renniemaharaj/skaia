package rankings

import (
	"context"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

type fakeRepo struct {
	entry                  *Entry
	replay                 bool
	err                    error
	lastEvent, lastPayload []byte
}

func (f *fakeRepo) CreateDataset(context.Context, int64, CreateDatasetRequest) (*Dataset, error) {
	return &Dataset{}, f.err
}
func (f *fakeRepo) CreateSeason(context.Context, int64, string, CreateSeasonRequest) (*Season, error) {
	return &Season{}, f.err
}
func (f *fakeRepo) CloseSeason(context.Context, string, string) (*Season, error) {
	return &Season{}, f.err
}
func (f *fakeRepo) ListDatasets(context.Context, bool) ([]Dataset, error) { return []Dataset{}, f.err }
func (f *fakeRepo) ListSeasons(context.Context, string, bool) ([]Season, error) {
	return []Season{}, f.err
}
func (f *fakeRepo) Standings(context.Context, string, string, string, int, bool) (Standings, error) {
	return Standings{}, f.err
}
func (f *fakeRepo) Ingest(_ context.Context, _ int64, _ string, event, payload []byte, _ IngestRequest) (*Entry, bool, error) {
	f.lastEvent = event
	f.lastPayload = payload
	return f.entry, f.replay, f.err
}
func allow(_ int64, _ string) (bool, error) { return true, nil }
func TestIngestHashesIdentityAndValidatesMode(t *testing.T) {
	repo := &fakeRepo{entry: &Entry{ID: 1}}
	svc := NewService(repo, allow)
	v := IngestRequest{EventID: "event-1", SeasonKey: "season-1", SubjectType: "team", SubjectKey: "blue", DisplayName: "Blue", Public: true, Mode: "delta", Value: "2.5"}
	entry, replay, err := svc.Ingest(context.Background(), 4, "wins", v)
	require.NoError(t, err)
	assert.False(t, replay)
	assert.Equal(t, int64(1), entry.ID)
	assert.Len(t, repo.lastEvent, 32)
	assert.Len(t, repo.lastPayload, 32)
	v.Mode = "replace"
	_, _, err = svc.Ingest(context.Background(), 4, "wins", v)
	assert.ErrorIs(t, err, ErrValidation)
}
func TestManagementFailsClosedWithoutPolicy(t *testing.T) {
	svc := NewService(&fakeRepo{}, nil)
	_, err := svc.CreateDataset(context.Background(), 1, CreateDatasetRequest{})
	assert.ErrorIs(t, err, ErrDenied)
}
func TestSeasonRejectsInvalidWindow(t *testing.T) {
	svc := NewService(&fakeRepo{}, allow)
	start := time.Now()
	end := start.Add(-time.Hour)
	_, err := svc.CreateSeason(context.Background(), 1, "wins", CreateSeasonRequest{Key: "s1", Name: "Season", StartsAt: start, EndsAt: &end})
	assert.ErrorIs(t, err, ErrValidation)
}
