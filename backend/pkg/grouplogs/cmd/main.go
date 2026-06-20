package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/renniemaharaj/grouplogs/pkg/logger"
)

func main() {

	group := logger.CreateGroup()
	sub := group.Delegate.Subscribe()

	l1 := logger.New().
		Prefix("Primary").
		DebugMode(true).
		JsonMode(false).MaxLines(100).STDOUT(false).Subscribable(false)

	// Group join function auto sets subscribable to true
	group.Join(l1)

	// Logger.New function returns a standard, prebuilt logger, but customizable
	l2 := logger.New().Prefix("Secondary")

	group.Join(l2)

	l1.Info("This is an information").
		Success("This is a success").
		Warning("This is a warning").
		Debug("Is debugging enabled").
		Error("Oh, no. This is an error")

	l2.Info("This is an information").
		Success("This is a success").
		Warning("This is a warning").
		Debug("Is debugging enabled").
		Error("Oh, no. This is an error")

	idleLimit := 500 * time.Millisecond
	timer := time.NewTimer(idleLimit)

	for {
		select {
		case l := <-sub.C:
			lBytes, _ := json.Marshal(l)
			fmt.Println(string(lBytes))
			if !timer.Stop() {
				<-timer.C
			}
			timer.Reset(idleLimit)
		case <-timer.C:
			l1.STDOUT(true)
			l1.Success("Removing logger 1 from group")
			group.Remove(l1)

			l2.STDOUT(true)
			l2.Success("Removed logger 2 from group")
			group.Remove(l2)

			return
		}
	}

}
