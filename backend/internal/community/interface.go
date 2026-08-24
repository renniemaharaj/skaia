package community

import "context"

type Repository interface {
	Create(context.Context, int64, CreateRequest) (*Publication, error)
	List(context.Context, int64, string, int64, int, string) (Page, error)
	Get(context.Context, int64, string, int64) (*Publication, error)
	Update(context.Context, int64, int64, UpdateRequest) (*Publication, error)
	Transition(context.Context, int64, int64, string, string, string) (*Publication, error)
	Vote(context.Context, int64, int64, int) (*Publication, error)
	Attend(context.Context, int64, int64, string) (*Publication, error)
	Delete(context.Context, int64, int64) error
}
type PermissionPolicy func(int64, string) (bool, error)
