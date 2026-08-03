package main

import (
	"os"

	"github.com/skaia/grengo/internal/app"
	"github.com/skaia/grengo/internal/cli"
)

func main() {
	cli.Run(os.Args[1:], app.CLICommands())
}
