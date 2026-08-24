package rankings

import "context"

type Repository interface {
	CreateDataset(context.Context, int64, CreateDatasetRequest) (*Dataset, error)
	CreateSeason(context.Context, int64, string, CreateSeasonRequest) (*Season, error)
	CloseSeason(context.Context, string, string) (*Season, error)
	ListDatasets(context.Context, bool) ([]Dataset, error)
	ListSeasons(context.Context, string, bool) ([]Season, error)
	Standings(context.Context, string, string, string, int, bool) (Standings, error)
	Ingest(context.Context, int64, string, []byte, []byte, IngestRequest) (*Entry, bool, error)
}
type PermissionPolicy func(int64, string) (bool, error)
