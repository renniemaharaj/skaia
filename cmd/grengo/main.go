package main

import (
	"fmt"
	"os"
)

const usageText = `grengo — Multi-tenant management CLI for Skaia

Commands:
  new [<name>] [--domain <d>]… [--port <p>] Create a new client (interactive)
  list                                       List all clients
  enable <name>                              Enable a client
  disable <name>                             Disable a client
  start <name>                               Start a client backend
  stop <name>                                Stop a client backend
  remove <name>                              Remove a client (with confirmation)
  build                                      Build / rebuild the backend Docker image
  compose up                                 Start everything (infra + all clients + nginx)
  compose down                               Stop everything
  nginx reload                               Regenerate nginx config & hot-reload
  db init <name>                             Create database & run migrations
  logs <name> [-f]                           View / tail client logs

Examples:
  grengo new                           # fully interactive
  grengo new skaiacraft                # name provided, rest prompted
  grengo new skaiacraft --domain skaiacraft.com --domain localhost
  grengo compose up
  grengo disable writers
  grengo compose down`

func usage() {
	fmt.Println(usageText)
}

func requireArg(args []string, usage string) string {
	if len(args) == 0 {
		die("Usage: grengo %s", usage)
	}
	return args[0]
}

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		usage()
		return
	}

	cmd := args[0]
	rest := args[1:]

	switch cmd {
	case "new":
		cmdNew(rest)

	case "list", "ls":
		cmdList()

	case "enable":
		name := requireArg(rest, "enable <name>")
		cmdEnable(name)

	case "disable":
		name := requireArg(rest, "disable <name>")
		cmdDisable(name)

	case "start":
		name := requireArg(rest, "start <name>")
		cmdStart(name)

	case "stop":
		name := requireArg(rest, "stop <name>")
		cmdStop(name)

	case "remove", "rm":
		name := requireArg(rest, "remove <name>")
		cmdRemove(name)

	case "build":
		cmdBuild()

	case "compose":
		sub := requireArg(rest, "compose <up|down>")
		switch sub {
		case "up":
			cmdComposeUp()
		case "down":
			cmdComposeDown()
		default:
			die("Unknown compose subcommand: %s", sub)
		}

	case "nginx":
		sub := requireArg(rest, "nginx <reload>")
		switch sub {
		case "reload":
			cmdNginxReload()
		default:
			die("Unknown nginx subcommand: %s", sub)
		}

	case "db":
		sub := requireArg(rest, "db <init>")
		switch sub {
		case "init":
			name := requireArg(rest[1:], "db init <name>")
			cmdDBInit(name)
		default:
			die("Unknown db subcommand: %s", sub)
		}

	case "logs":
		name := requireArg(rest, "logs <name> [-f]")
		cmdLogs(name, rest[1:])

	case "help", "--help", "-h":
		usage()

	default:
		die("Unknown command: %s (try: grengo help)", cmd)
	}
}
