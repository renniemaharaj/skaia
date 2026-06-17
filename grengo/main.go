package main

import (
	"net/http"
	"os"

	"github.com/skaia/grengo/internal/app"
	"github.com/skaia/grengo/internal/cli"
)

func main() {
	app.ConfigureAPIHandler(func() http.Handler {
		return apiPasscodeMiddleware(newAPIRouter(app.Handlers()))
	})
	cli.Run(os.Args[1:], app.CLICommands())
}
