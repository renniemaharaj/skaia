package conveyor

// The conveyor belt struct containing a single channel of jobs
type ConveyorBelt struct {
	C chan Job
}

// Creates and returns a new ConveyorBelt with initialized channel
func NewConveyorBelt() *ConveyorBelt {
	return &ConveyorBelt{C: make(chan Job, 100)}
}

// Pushes a job to the conveyor belt
func (b *ConveyorBelt) Push(j *Job) {
	b.C <- *j
}

// Takes a job from the conveyor belt
func (b *ConveyorBelt) Take() *Job {
	j := <-b.C
	return &j
}
