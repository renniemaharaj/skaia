# log

A lightweight, thread-safe Go logging package with support for structured log entries, real-time subscriptions via channels, and a grouping mechanism for broadcasting logs from multiple sources. Ideal for building reactive systems and piping logs into websockets or monitoring services.

## Features

- Thread-safe subscriber management using `sync.Mutex`
- Per-subscriber channels (`chan Line`)
- Grouping of multiple loggers via `logger.Group()`
- Real-time log broadcasting
- Log chaining: `logger.New()... .Info("starting...").Debug("ready")`
- Runtime caller metadata: file, line number, and function name

---

## Installation

```bash
go get github.com/renniemaharaj/grouplogs

import "github.com/renniemaharaj/grouplogs/pkg/logger"
```

---

## Building a logger

```go
// Although, logger.New func presets these
l := logger.New().
	Prefix("Primary").
	DebugMode(true).
	JsonMode(false).
	Subscribable(true).
	MaxLines(100).
	STDOUT(true).
	Rotate()

// Only Prefix may be necessary, but prefix defaults to 'Logger'
quickLogger := logger.New().Prefix("Quick-Logger")
```

---

## Logging methods

```go
// The methods also print, filename, line and function where there are called
// Basic logging methods

// Print methods (plain, formatted, newline)
// Only print will NOT newline after. All other logFns do
l.Print("Print a message")
l.Printf("Print a formatted number: %d", 42)
l.Println("Print with newline")

// Info methods
l.Info("This is an information")
l.InfoF("Info with value: %v", 123)

// Debug methods
l.Debug("Is debugging enabled")
l.DebugF("Debug value: %v", "debugging")

// Success methods
l.Success("This is a success")
l.SuccessF("Success: %s", "operation completed")

// Warning methods
l.Warning("This is a warning")
l.WarningF("Warning: %s", "disk space low")

// Error methods
l.Error("Oh, no. This is an error")
l.ErrorF("Error: %s", "file not found")

// Fatal methods (logs and exits)
l.Fatal(errors.New("fatal error occurred"))
l.Fatalf("Fatal error: %s", "unexpected shutdown")
l.Fatalln("Fatal error with newline")

// Panic methods (logs and panics)
l.Panic(errors.New("panic error"))
l.Panicf("Panic: %s", "critical failure")
l.Panicln("Panic with newline")
```
```

---

## Grouping loggers

```go
// A group for centralizing multiple loggers. Their logs are all piped into the group's delegate
group := logger.Group()

// Setting Subscribable to false is safe to use with groups. Groups auto enable this
l1 := logger.New().Prefix("L1").Subscribable(false)

// Rotate is implied on logger.New, but can be used to manually rotate the file
l2 := logger.New().Prefix("L2").Rotate()

// Subscribable is required by the group mechanism. It is auto enabled on join
group.Join(l1)

group.Join(l2)

// Now any logs from l1 or l2 will be piped into group.Delegate
```

---

## Real-time log piping to WebSocket

```go
func logHandler(con *websocket.Conn) {
	// Create a group to pipe logs
	group := logger.Group()

	// Add one or more loggers
	l := logger.New().Prefix("WS")
	group.Join(l)

	// Example logs
	l.Info("WebSocket log stream initialized")

	for {
		select {
		case entry := <-group.Delegate:
			logArr := &[]logger.Line{entry}

			logBytes, err := json.Marshal(logArr)
			if err != nil {
				break
			}

			if err := con.WriteMessage(websocket.TextMessage, logBytes); err != nil {
				group.Remove(l)
				l.Warning("WebSocket connection closed")
				return
			}
		}
	}
}
```

---

## Use Cases

- Centralized log collection from multiple services
- Real-time debug dashboards
- WebSocket log streaming to browser clients
- Embedded monitoring in custom Go applications

---

## License

MIT
