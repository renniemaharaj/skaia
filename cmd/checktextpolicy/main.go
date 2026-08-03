package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/skaia/grengo/internal/textpolicy"
)

func main() {
	fix := flag.Bool("fix", false, "apply safe text formatting repairs before checking")
	flag.Parse()
	if *fix {
		changed, err := textpolicy.FixRepository(".")
		if err != nil {
			fmt.Fprintf(os.Stderr, "fix text policy: %v\n", err)
			os.Exit(2)
		}
		for _, filePath := range changed {
			fmt.Printf("fixed %s\n", filePath)
		}
	}
	violations, err := textpolicy.CheckRepository(".")
	if err != nil {
		fmt.Fprintf(os.Stderr, "check text policy: %v\n", err)
		os.Exit(2)
	}
	for _, violation := range violations {
		fmt.Fprintln(os.Stderr, violation)
	}
	if len(violations) > 0 {
		fmt.Fprintf(os.Stderr, "text policy failed with %d violation(s)\n", len(violations))
		os.Exit(1)
	}
	fmt.Println("text policy passed")
}
