package logger

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/fatih/color"
)

// The shape a line/log
type Line struct {
	Time   string `json:"time"`
	Level  string `json:"level"`
	Prefix string `json:"prefix"`
	Msg    string `json:"msg"`
	File   string `json:"file"`
	Line   int    `json:"line"`
	Func   string `json:"func"`
}

// The logger shape
type Logger struct {
	mu sync.Mutex // Mutex for syncing concurrent operations

	writer *os.File // File to write to

	prefix    string // Prefix for the logger eg: AppLogger
	maxLines  int    // Max lines allowed before rotating files
	toStdout  bool   // Should print to std out?
	jsonMode  bool   // Is the logger in json out mode?
	debugging bool   // Should log debug logs to stdout?

	currentLine int // Current line tracker

	subscribable bool         // Is the logger subscribable?
	Subscribers  *Subscribers // Subscribers to the logger
}

func (l *Logger) log(level string, msg string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	timestamp := time.Now().Format("2006-01-02 15:04:05.000")

	pc, file, fileLine, ok := runtime.Caller(2)

	var funcName, shortFile string
	if ok {
		funcName = runtime.FuncForPC(pc).Name()
		shortFile = file
		if lastSlash := strings.LastIndex(file, "/"); lastSlash != -1 {
			shortFile = file[lastSlash+1:]
		}
	}

	line := &Line{
		Time:   timestamp,
		Level:  strings.ToUpper(level),
		Prefix: l.prefix,
		Msg:    msg,
		File:   shortFile,
		Line:   fileLine,
		Func:   funcName,
	}

	lineString := fmt.Sprintf("%s: %s [%s] %s (%s:%d in %s)",
		timestamp, line.Level, l.prefix, msg, shortFile, fileLine, funcName)

	if l.jsonMode {
		jsonBytes, _ := json.Marshal(line)
		lineString = string(jsonBytes)
	}

	// Broadcast to all local subscribers
	if l.subscribable && l.Subscribers != nil { // Ensure the logger is subscribable
		l.Subscribers.Broadcast(*line)
	}

	debugFunc := func() {
		if l.debugging {
			fmt.Println(lineString)
		}
	}
	// Write to log file and stdout if enabled
	fmt.Fprintln(l.writer, lineString)
	if l.toStdout {
		switch line.Level {
		case "PRINT":
			fmt.Print(lineString)
		case "INFO":
			fmt.Println(lineString)
		case "SUCCESS":
			color.Green(lineString)
		case "WARNING":
			color.Yellow(lineString)
		case "ERROR":
			color.Red(lineString)
		case "FATAL":
			color.Red(lineString)
		case "PANIC":
			color.Red(lineString)
		case "DEBUG":
			debugFunc()
		default:
			fmt.Println(lineString)
		}
	}

	// Rotate if line limit is reached
	l.currentLine++
	if l.currentLine >= l.maxLines {
		l.Rotate()
	}
}
