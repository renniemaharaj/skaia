package logger

import (
	"os"
	"path/filepath"
	"time"
)

var twcLogsDir = "./twcLogs"

// Deprecated: CreateGroup is deprecated and will be removed in future versions.
// Use NewGroup instead.
func CreateGroup() *Group {
	return NewGroup()
}

func createLogger() *Logger {
	return &Logger{}
}

// Deprecated: New is deprecated and will be removed in future versions.
// Use NewLogger instead.
func New() *Logger {
	return createLogger().Subscribable(false).
		JsonMode(false).Prefix("Logger").DebugMode(false).
		STDOUT(true).MaxLines(100).Rotate()
}

// NewLogger creates and returns a new Logger instance with default settings.
func NewLogger() *Logger {
	return createLogger().Subscribable(false).
		JsonMode(false).Prefix("Logger").DebugMode(false).
		STDOUT(true).MaxLines(100).Rotate()
}

func (l *Logger) Rotate() *Logger {
	if l.writer != nil {
		l.writer.Close()
	}

	if err := os.MkdirAll(twcLogsDir, 0755); err != nil {
		panic("Failed to create log directory: " + err.Error())
	}

	filename := filepath.Join(twcLogsDir, "log-"+time.Now().Format("2006-01-02-15-04-05")+".log")

	f, err := os.Create(filename)
	if err != nil {
		panic("Failed to create log file: " + err.Error())
	}

	l.writer = f
	l.currentLine = 0

	return l
}
