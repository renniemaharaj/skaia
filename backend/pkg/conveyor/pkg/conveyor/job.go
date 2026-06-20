package conveyor

import (
	"context"

	"github.com/renniemaharaj/conveyor/internal/idgen"
)

// Job represents a job on the conveyor belt
type Job struct {
	ID      int             `json:"id"`
	Context context.Context `json:"context"`
	Param   any             `json:"params"` // Paramter for consumption

	// Consume function for the worker
	Consume func(param any) error `json:"consume"`
	// On success callback function
	OnSuccess func(w Worker, j *Job) `json:"onSuccess"`
	// On error callback function
	OnError func(w Worker, j *Job) `json:"onError"`
}

var (
	idGenJob = idgen.IDGenerator{}
)

// CreateJob function creates a job from context, custom param,
// consume function, onSuccess and onError callback hooks
func CreateJob(context context.Context, param any,
	consume func(param any) error,
	onSuccess func(w Worker, j *Job),
	onError func(w Worker, j *Job)) *Job {
	return &Job{
		ID:        idGenJob.NewUniqueID(),
		Context:   context,
		Param:     param,
		Consume:   consume,
		OnSuccess: onSuccess,
		OnError:   onError,
	}
}
