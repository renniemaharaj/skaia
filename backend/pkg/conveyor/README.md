# Conveyor - Dynamic Job Manager in Go

Conveyor is a dynamic worker pool manager for Go that efficiently processes queued jobs. It automatically scales the number of active workers based on queue load, making it ideal for fluctuating workloads.

## Features

* Automatic Scaling: Dynamically adjusts workers based on job queue size.
* Configurable Thresholds: Set minimum/maximum workers and safe queue lengths.
* Safe Shutdown: Gracefully stops workers after finishing current jobs.
* Concurrent Execution: Workers run in goroutines by default.
* Job Callbacks: Optional `OnSuccess` and `OnError` hooks for job outcomes.

## Components

### Manager

* Starts the initial worker pool.
* Monitors queue size and scales workers.
* Handles safe shutdown.

Key Parameters:

* `minWorkersAllowed` - Minimum workers.
* `maxWorkersAllowed` - Maximum workers.
* `safeQueueLength` - Threshold to scale up.
* `ticker` - Interval to check the queue.

### Worker

* Executes jobs pulled from the assigned conveyor belt.
* Runs in its own goroutine until stopped or program exits.

### Job

Represents a unit of work:

```go
Job {
    Context context.Context
    Param   any
    Consume func(params any) error
    OnSuccess func(w Worker, j *Job)
    OnError   func(w Worker, j *Job)
}
```

### Conveyor Belt

A channel-based queue for jobs:

```go
type ConveyorBelt struct {
    C chan Job
}

func NewConveyorBelt() *ConveyorBelt {
    return &ConveyorBelt{C: make(chan Job, 100)}
}

func (b *ConveyorBelt) Push(j *Job) {
    b.C <- *j
}

func (b *ConveyorBelt) Take() *Job {
    j := <-b.C
    return &j
}
```

---

## Usage

### Creating and Starting a Manager

```go
m := conveyor.CreateManager() // default manager
// or configure manually
m := conveyor.CreateManager().SetMinWorkers(1).SetMaxWorkers(100).
    SetSafeQueueLength(10).SetTimePerTicker(time.Second/4)
m.B = NewConveyorBelt()
m.quit = make(chan struct{})
m.Start()
```

### Adding Jobs

```go
// Define a jobParam struct
type JobParam struct {
    A string
}

jobParam := &JobParam{A: "Hello World"}

// Without callbacks
for range 100 {
    manager.B.Push(conveyor.CreateJob(
		context.Background(),
		jobParam,
		func(param any) error {
			time.Sleep(time.Second)
			jParam := param.(*JobParam)
			fmt.Println(jParam.A)
			return nil
			},
		// func(w conveyor.Worker, j *conveyor.Job) {},
		// func(w conveyor.Worker, j *conveyor.Job) {},
	))
}

// With OnSuccess and OnError callbacks
for range 100 {
    manager.B.Push(conveyor.CreateJob(
		context.Background(),
		jobParam,
		func(param any) error {
			time.Sleep(time.Second)
			jParam := param.(*JobParam)
			fmt.Println(jParam.A)
			return nil
			},
		func(w conveyor.Worker, j *conveyor.Job) {},
		func(w conveyor.Worker, j *conveyor.Job) {},
	))
}
```

### Stopping the Manager

```go
m.Stop() // stops ticker and shuts down workers gracefully
```

---

## When to Use

* Tasks with fluctuating workloads.
* Systems requiring efficient resource usage.
* Scenarios where idle workers should be reduced automatically.

This design balances responsiveness and resource efficiency by running only the number of workers needed for current workload.