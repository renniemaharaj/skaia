# grengo CLI

`grengo` is the official command-line interface, Docker container orchestrator, site factory, backup tool, and node controller for Skaia. It manages multi-tenant deployments, infrastructure, and site operations. The CLI can also be built and used as `.cli` for simplicity.

## Features

- Create, enable, disable, start, stop, and remove tenants (clients)
- Build and orchestrate Docker containers for backend, frontend, and infrastructure
- Manage per-tenant databases and Redis namespaces
- Export/import single clients or full node backups
- Regenerate and reload nginx configuration
- Internal API server for management and UI dashboard integration
- Passcode-based remote management
- First-class integration with the Skaia UI dashboard (dynamic routes, security, expiration, API)

## Build

```bash
cd grengo
# Build as 'grengo'
go build -o ../grengo .
# Or build as '.cli' for simplicity
go build -o ../.cli .
```

## Usage

Run `./grengo` (or `./.cli`) for a full list of commands and options.

## Examples

- `./grengo new` — Interactive tenant creation
- `./grengo compose up` — Start all infrastructure and tenants
- `./grengo export-node -o backup.tar.gz` — Export all tenants for backup

See the CLI help output for more details on available commands.
