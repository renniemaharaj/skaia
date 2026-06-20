package conveyor

// The worker's consumtion function
func (w *Worker) Consume(j *Job) {
	err := j.Consume(j.Param)
	switch err {
	case nil:
		if j.OnSuccess != nil {
			j.OnSuccess(*w, j)
		}
	default:
		if j.OnError != nil {
			j.OnError(*w, j)
		}
	}
}
