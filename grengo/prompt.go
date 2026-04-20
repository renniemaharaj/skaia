package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

var scanner *bufio.Scanner

func initScanner() {
	if scanner == nil {
		scanner = bufio.NewScanner(os.Stdin)
	}
}

// nonInteractive returns true when GRENGO_NONINTERACTIVE is set, which causes
// prompts to return their default value and confirmations to auto-accept.
func nonInteractive() bool {
	return os.Getenv("GRENGO_NONINTERACTIVE") != ""
}

// prompt asks the user for input with an optional default. If secret is true,
// the input is still read from stdin (Go stdlib doesn't easily suppress echo
// without cgo/term, so we keep it simple).
func prompt(label, defaultVal string, secret bool) string {
	if nonInteractive() {
		if defaultVal != "" {
			return defaultVal
		}
		// No default and non-interactive — can't proceed.
		die("Cannot prompt for %q in non-interactive mode (no default)", label)
	}
	initScanner()
	for {
		if defaultVal != "" {
			if secret {
				fmt.Printf("  %s [*****]: ", label)
			} else {
				fmt.Printf("  %s [%s]: ", label, defaultVal)
			}
		} else {
			fmt.Printf("  %s: ", label)
		}

		scanner.Scan()
		input := strings.TrimSpace(scanner.Text())

		if input == "" && defaultVal != "" {
			return defaultVal
		}
		if input != "" {
			return input
		}
		warn("This field is required")
	}
}

// promptChoice asks the user to choose from a set of options.
func promptChoice(label, defaultVal string, options []string) string {
	if nonInteractive() {
		return defaultVal
	}
	initScanner()
	optsStr := strings.Join(options, "/")
	for {
		fmt.Printf("  %s (%s) [%s]: ", label, optsStr, defaultVal)
		scanner.Scan()
		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			return defaultVal
		}
		for _, opt := range options {
			if input == opt {
				return input
			}
		}
		warn("Choose one of: %s", optsStr)
	}
}

// confirmPrompt asks the user to type a specific string to confirm.
func confirmPrompt(expected string) bool {
	if nonInteractive() {
		return true
	}
	initScanner()
	fmt.Print("Type the client name to confirm: ")
	scanner.Scan()
	return strings.TrimSpace(scanner.Text()) == expected
}
