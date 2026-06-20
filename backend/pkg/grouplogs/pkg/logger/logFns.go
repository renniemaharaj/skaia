package logger

import (
	"fmt"
	"os"
)

// Print logs a message.
func (l *Logger) Print(a ...interface{}) *Logger {
	l.log("print", fmt.Sprint(a...))
	return l
}

// Printf logs a formatted message.
func (l *Logger) Printf(format string, a ...interface{}) *Logger {
	l.log("info", fmt.Sprintf(format, a...))
	return l
}

// Println logs a message with a newline.
func (l *Logger) Println(a ...interface{}) *Logger {
	l.log("info", fmt.Sprintln(a...))
	return l
}

// Info logs an informational message.
func (l *Logger) Info(msg string) *Logger {
	l.log("info", msg)
	return l
}

// InfoF logs a formatted informational message.
func (l *Logger) InfoF(format string, a ...interface{}) *Logger {
	l.log("info", fmt.Sprintf(format, a...))
	return l
}

// Debug logs a debug message if debugging is enabled.
func (l *Logger) Debug(msg string) *Logger {
	if l.debugging {
		l.log("debug", msg)
	}
	return l
}

// DebugF logs a formatted debug message if debugging is enabled.
func (l *Logger) DebugF(format string, a ...interface{}) *Logger {
	if l.debugging {
		l.log("debug", fmt.Sprintf(format, a...))
	}
	return l
}

// Success logs a success message.
func (l *Logger) Success(msg string) *Logger {
	l.log("success", msg)
	return l
}

// SuccessF logs a formatted success message.
func (l *Logger) SuccessF(format string, a ...interface{}) *Logger {
	l.log("success", fmt.Sprintf(format, a...))
	return l
}

// Warning logs a warning message.
func (l *Logger) Warning(msg string) *Logger {
	l.log("warning", msg)
	return l
}

// WarningF logs a formatted warning message.
func (l *Logger) WarningF(format string, a ...interface{}) *Logger {
	l.log("warning", fmt.Sprintf(format, a...))
	return l
}

// Error logs an error message.
func (l *Logger) Error(msg string) *Logger {
	l.log("error", msg)
	return l
}

// ErrorF logs a formatted error message.
func (l *Logger) ErrorF(format string, a ...interface{}) *Logger {
	l.log("error", fmt.Sprintf(format, a...))
	return l
}

// Fatal logs an error message and exits the application.
func (l *Logger) Fatal(e error) *Logger {
	l.log("fatal", e.Error())
	os.Exit(1)
	return l
}

// Fatalf logs a formatted fatal error message and exits the application.
func (l *Logger) Fatalf(format string, a ...interface{}) *Logger {
	l.log("fatal", fmt.Sprintf(format, a...))
	os.Exit(1)
	return l
}

// Fatalln logs a fatal error message with a newline.
func (l *Logger) Fatalln(a ...interface{}) *Logger {
	l.log("fatal", fmt.Sprintln(a...))
	// os.Exit(1) can be called here if desired
	return l
}

// Panic logs a panic message and panics.
func (l *Logger) Panic(e error) *Logger {
	l.log("panic", e.Error())
	panic(e)
}

// Panicf logs a formatted panic message and panics.
func (l *Logger) Panicf(format string, a ...interface{}) *Logger {
	msg := fmt.Sprintf(format, a...)
	l.log("panic", msg)
	panic(msg)
}

// Panicln logs a panic message with a newline and panics.
func (l *Logger) Panicln(a ...interface{}) *Logger {
	msg := fmt.Sprintln(a...)
	l.log("panic", msg)
	panic(msg)
}
