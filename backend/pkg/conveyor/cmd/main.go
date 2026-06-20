package main

import (
	"context"
	"fmt"
	"time"

	"github.com/renniemaharaj/conveyor/pkg/conveyor"
)

// Define a jobParam struct
// This can be anything, (any)
type JobParam struct {
	A string
}

func main() {
	manager := conveyor.CreateManager().Start() // Use the default manager or build a custom

	// manager := conveyor.CreateManager().SetMinWorkers(1).SetMaxWorkers(100).
	// 	SetSafeQueueLength(10).SetTimePerTicker(time.Second / 4).SetDebugging(false).Start()

	// unopinionated job param
	jobParam := &JobParam{
		A: "Hello World",
	}

	// adding workers scenario
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

	select {}
}
