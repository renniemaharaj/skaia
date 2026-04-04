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
  update <name|all>                          Update FEATURES_ENABLED in client(s) .env with selected features
  build                                      Build / rebuild the backend Docker image
  compose up [--follow|--no-detach]        Start everything (infra + all clients + nginx); optionally follow logs
  compose down                               Stop everything
  nginx reload                               Regenerate nginx config & hot-reload
  db init <name>                             Create database & run migrations
  migrate <name|all> [--rebuild]             Re-run migrations on existing database
  logs <name> [-f]                           View / tail client logs
  wipe all                                   Remove all clients and shared data (postgres/redis)

  export <name> [-o <file.tar.gz>]           Export a single client to a portable archive
  import <file.tar.gz> [--name <n>] [--port <p>]  Import a client archive onto this node
  export-node [-o <file.tar.gz>]             Export ALL clients as a single node archive
  import-node <file.tar.gz>                  Restore a full node archive onto this node

Examples:
  grengo new                           # fully interactive
  grengo new skaiacraft                # name provided, rest prompted
  grengo new skaiacraft --domain skaiacraft.com --domain localhost
  grengo compose up
  grengo disable writers
  grengo compose down
  grengo export mysite
  grengo import grengo-client-mysite-20260319-120000.tar.gz --name mysite-copy
  grengo export-node -o full-backup.tar.gz
  grengo import-node full-backup.tar.gz`

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
			follow := false
			build := false
			for i := 1; i < len(rest); i++ {
				switch rest[i] {
				case "--follow", "--no-detach":
					follow = true
				case "--build":
					build = true
				default:
					die("Unknown compose up option: %s", rest[i])
				}
			}
			cmdComposeUp(follow, build)
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

	case "migrate":
		target := requireArg(rest, "migrate <name|all> [--rebuild]")
		rebuild := false
		for _, arg := range rest[1:] {
			if arg == "--rebuild" {
				rebuild = true
			}
		}
		if target == "all" {
			cmdMigrateAll(rebuild)
		} else {
			cmdMigrate(target, rebuild)
		}

	case "logs":
		name := requireArg(rest, "logs <name> [-f]")
		cmdLogs(name, rest[1:])

	case "update":
		sub := requireArg(rest, "update <name|all>")
		switch sub {
		case "all":
			cmdUpdateAll()
		default:
			cmdUpdateClient(sub)
		}

	case "export":
		name := requireArg(rest, "export <name> [-o <file.tar.gz>]")
		var outFile string
		for i := 1; i < len(rest); i++ {
			if (rest[i] == "-o" || rest[i] == "--output") && i+1 < len(rest) {
				i++
				outFile = rest[i]
			}
		}
		cmdExportClient(name, outFile)

	case "import":
		archivePath := requireArg(rest, "import <file.tar.gz> [--name <n>] [--port <p>]")
		var newName, newPort string
		for i := 1; i < len(rest); i++ {
			switch rest[i] {
			case "--name":
				if i+1 < len(rest) {
					i++
					newName = rest[i]
				}
			case "--port":
				if i+1 < len(rest) {
					i++
					newPort = rest[i]
				}
			}
		}
		cmdImportClient(archivePath, newName, newPort)

	case "export-node":
		var outFile string
		for i := 0; i < len(rest); i++ {
			if (rest[i] == "-o" || rest[i] == "--output") && i+1 < len(rest) {
				i++
				outFile = rest[i]
			}
		}
		cmdExportNode(outFile)
		archivePath := requireArg(rest, "import-node <file.tar.gz>")
		cmdImportNode(archivePath)

	case "wipe":
		sub := requireArg(rest, "wipe <all>")
		switch sub {
		case "all":
			cmdWipeAll()
		default:
			die("Unknown wipe subcommand: %s", sub)
		}

	case "import-node":
		archivePath := requireArg(rest, "import-node <file.tar.gz>")
		cmdImportNode(archivePath)

	case "help", "--help", "-h":
		usage()

	default:
		die("Unknown command: %s (try: grengo help)", cmd)
	}
}
