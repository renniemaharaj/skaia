package syslog

import (
	"fmt"
	
	"github.com/renniemaharaj/grouplogs/pkg/logger"
)

var (
	// GlobalGroup is the central log stream manager. All sub-loggers join this group.
	// You can read from GlobalGroup.Delegate to stream all logs.
	GlobalGroup *logger.Group

	// defaultLogger is the package-level default logger.
	defaultLogger *logger.Logger
)

func init() {
	GlobalGroup = logger.NewGroup()
	
	defaultLogger = logger.New().
		Prefix("System").
		DebugMode(true).
		STDOUT(true)
		
	GlobalGroup.Join(defaultLogger)
}

// New creates a new logger with the given prefix and automatically joins it to the GlobalGroup.
func New(prefix string) *logger.Logger {
	l := logger.New().
		Prefix(prefix).
		DebugMode(true).
		STDOUT(true)
	
	GlobalGroup.Join(l)
	return l
}

// --- Standard 'log' package drop-in replacements ---
// These allow replacing 'import "log"' with 'import log "github.com/skaia/backend/internal/syslog"'

func Print(v ...interface{}) {
	defaultLogger.Print(v...)
}

func Printf(format string, v ...interface{}) {
	defaultLogger.Printf(format, v...)
}

func Println(v ...interface{}) {
	defaultLogger.Println(v...)
}

func Fatal(v ...interface{}) {
	defaultLogger.Fatal(fmt.Errorf("%v", fmt.Sprint(v...)))
}

func Fatalf(format string, v ...interface{}) {
	defaultLogger.Fatalf(format, v...)
}

func Fatalln(v ...interface{}) {
	defaultLogger.Fatalln(v...)
}

func Panic(v ...interface{}) {
	defaultLogger.Panic(fmt.Errorf("%v", fmt.Sprint(v...)))
}

func Panicf(format string, v ...interface{}) {
	defaultLogger.Panicf(format, v...)
}

func Panicln(v ...interface{}) {
	defaultLogger.Panicln(v...)
}

// --- Extended logging functions ---

func Info(v ...interface{}) {
	defaultLogger.Info(fmt.Sprint(v...))
}

func InfoF(format string, v ...interface{}) {
	defaultLogger.InfoF(format, v...)
}

func Error(v ...interface{}) {
	defaultLogger.Error(fmt.Sprint(v...))
}

func ErrorF(format string, v ...interface{}) {
	defaultLogger.ErrorF(format, v...)
}

func Warning(v ...interface{}) {
	defaultLogger.Warning(fmt.Sprint(v...))
}

func WarningF(format string, v ...interface{}) {
	defaultLogger.WarningF(format, v...)
}

func Debug(v ...interface{}) {
	defaultLogger.Debug(fmt.Sprint(v...))
}

func DebugF(format string, v ...interface{}) {
	defaultLogger.DebugF(format, v...)
}

func Success(v ...interface{}) {
	defaultLogger.Success(fmt.Sprint(v...))
}

func SuccessF(format string, v ...interface{}) {
	defaultLogger.SuccessF(format, v...)
}
