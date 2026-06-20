package conveyor

import "github.com/renniemaharaj/conveyor/internal/idgen"

// Struct type for a worker
type Worker struct {
	id      int // The worker's id
	canWork bool
	B       ConveyorBelt // the worker's assigned channel
}

var (
	idGenWorker = idgen.IDGenerator{}
)

// Creates and returns a worker with an assigned channel
func CreateWorker(b *ConveyorBelt) *Worker {
	return &Worker{canWork: false, B: *b, id: idGenWorker.NewUniqueID()}
}

// Start function of a worker
func (w *Worker) Start() {
	w.canWork = true
	for {
		if !w.canWork {
			break
		}
		j, ok := <-w.B.C
		if !ok {
			break
		}
		w.Consume(&j)
	}
}

// Safe stop function of a worker
func (w *Worker) Stop() {
	w.canWork = false
}
