package app

import (
	"fmt"
	"os"
)

// ANSI color codes
const (
	colorRed    = "\033[0;31m"
	colorGreen  = "\033[0;32m"
	colorYellow = "\033[0;33m"
	colorBlue   = "\033[0;34m"
	colorBold   = "\033[1m"
	colorReset  = "\033[0m"
)

// log prints a success-style message.
func log(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s[+]%s %s\n", colorGreen, colorReset, msg)
}

// info prints an informational message.
func info(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s[i]%s %s\n", colorBlue, colorReset, msg)
}

// warn prints a warning message.
func warn(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s[!]%s %s\n", colorYellow, colorReset, msg)
}

// errMsg prints an error message to stderr.
func errMsg(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintf(os.Stderr, "%s[x]%s %s\n", colorRed, colorReset, msg)
}

// die prints an error message and exits with code 1.
func die(format string, args ...any) {
	errMsg(format, args...)
	os.Exit(1)
}

// bold wraps text in ANSI bold.
func bold(s string) string {
	return colorBold + s + colorReset
}
