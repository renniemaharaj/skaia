package cli

import "fmt"

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
  rebuilt frontend [<name>|all]              Build frontend and hot-ship dist to running backend(s)
  dev                                        Start dev environment (infra, API, and vite dev server)
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

  api start [--port <p>]                     Start the internal API server (default: 9100)
  api stop                                   Stop the internal API server
  api status                                 Check if the internal API server is running

  passcode set [<p1> <p2>]                   Set the API passcode pair (enables remote management)
  passcode verify [<p1> <p2>]                Verify a passcode pair against stored .pcode
  passcode clear                             Remove the passcode (disables remote management)
  passcode status                            Show whether a passcode is configured

Examples:
  grengo new                           # fully interactive
  grengo new skaiacraft                # name provided, rest prompted
  grengo new skaiacraft --domain skaiacraft.com --domain localhost
  grengo compose up
  grengo disable writers
  grengo compose down
  grengo rebuilt frontend all
  grengo export mysite
  grengo import grengo-client-mysite-20260319-120000.tar.gz --name mysite-copy
  grengo export-node -o full-backup.tar.gz
  grengo import-node full-backup.tar.gz`

func Usage() {
	fmt.Println(usageText)
}
