# Skaia

Skaia is a self-hosted, multi-tenant web platform. Each tenant gets an isolated database, independent feature toggles, and its own domain — all managed from a single codebase and the **grengo** CLI.

## Features

- **Forum** — categories, threads, comments, likes, real-time updates
- **Store** — products, cart, checkout (Stripe or demo provider), orders, subscriptions
- **Inbox** — 1-to-1 direct messaging with real-time delivery
- **Notifications** — typed, per-user, delivered via WebSocket
- **CMS** — slug-based pages with JSONB block content, homepage (landing) and generic page builder (see route_resolution_spec)
- **Real-time** — WebSocket presence, global chat, cursor sharing, admin teleport
- **RBAC** — 4 default roles, 18 granular permissions, instant permission propagation
- **SEO** — server-side meta injection, dynamic sitemap
- **Collaborative Planning** — `.todo/` directory for human-AI planning, status, and specifications

## Container Orchestration & Gateway

Container management is split between the CLI and the project root Docker Compose file:

- The CLI (`grengo` or `cli`) automates backend container scaling, per-tenant Postgres and Redis, and writes the default nginx config for multitenancy (routing by domain and tenant configuration).
- The gateway (nginx) and shared services (nginx, postgres, redis) are started and managed directly through the root `compose.yml` file. To start the gateway and shared services, simply build and run `docker compose up` from the project root.
- The CLI does not start or manage the gateway container itself; it only writes to the default nginx config and handles tenant routing logic.

**Summary:**

- Use the CLI for tenant lifecycle, backend scaling, and config generation.
- Use `docker compose up` at the project root to start the gateway and shared infrastructure.

| Layer      | Technology                                        |
| ---------- | ------------------------------------------------- |
| Frontend   | React 19, TypeScript, Vite, Jotai, TipTap, Monaco |
| Backend    | Go 1.24, chi/v5, gorilla/websocket, lib/pq        |
| Database   | PostgreSQL 16 (per-tenant)                        |
| Cache      | Redis 7 (namespaced per tenant)                   |
| Payments   | Stripe v82 (pluggable, ships with demo provider)  |
| Proxy      | nginx (auto-generated config)                     |
| Containers | Docker Compose                                    |
| CLI        | grengo (Go binary, or 'cli' for simplicity)       |

## Quickstart

```bash
# Build CLI (from project root)
go build -o grengo ./grengo
# Or, for simplicity, build as 'cli'
go build -o cli ./grengo

# Configure (set POSTGRES_PASSWORD)
cp .env.example .env

# Create first tenant
./grengo new
# Or, if built as 'cli'
./cli new

# Start everything
./grengo compose up
# Or
./cli compose up
```

Access: `http://localhost` · Admin dashboard: `Ctrl+G` in browser · Management API: `:9100`

## Key Commands

| Command                        | Description                              |
| ------------------------------ | ---------------------------------------- | -------------- |
| `grengo new [name]`            | Create tenant (interactive wizard)       |
| `grengo list`                  | List all tenants with status             |
| `grengo compose up`            | Start all infra + tenants                |
| `grengo compose down`          | Stop everything                          |
| `grengo build`                 | Rebuild the backend Docker image         |
| `grengo start/stop <name>`     | Start/stop a tenant                      |
| `grengo enable/disable <name>` | Enable/disable tenant + regenerate nginx |
| `grengo migrate <name          | all>`                                    | Run migrations |
| `grengo export/import <name>`  | Backup/restore a tenant                  |
| `grengo nginx reload`          | Regenerate + reload nginx config         |

## Development

```bash
# Frontend hot reload
cd backend/frontend && npm install && npm run dev

# Backend tests
cd backend && go test ./...

# Frontend tests
cd backend/frontend && npm test
```

## Collaborative Planning & Specs

## Collaborative Planning, Specs & Routines

All collaborative planning, status tracking, specifications, and automation routines are now kept in the `.todo/`, `.specs/`, and `.routines/` directories:

- `.todo/README.md` — Directory usage, rules, and emoji policy
- `.todo/.tip` — Current status tracker and entrypoint for beginning any real work
- `.specs/` — Human-AI specifications and design docs
- `.todo/*` — Individual todo plans (no extension)
- `.routines/` — First-class directory for routine definitions (project maintenance, automation, specialist roles)
  - `.routines/README.md` — Routine structure and usage
  - `.routines/.specs` — Specialist for specs, technology, and infrastructure
  - `.routines/.frontend_specialist`, `.routines/.backend_auditor`, etc. — Add more as needed

Specs previously in `.todo/.specs` are now in `.specs/`.

> Emoji use for status is strictly limited to `.todo/.status` as described in `.todo/README.md` and is forbidden elsewhere in the project.

---

# Human-AI Planning & Integration

This project uses a structured Human-AI planning and integration approach, with dedicated directories for incorporating artificial intelligence code, modeling acceleration, and maintaining high-quality documentation and routines. The system is designed to gatekeep and guide intelligence through:

- `.routines/` — Automation, maintenance, and specialist routines, including routines for maintaining documentation and enforcing standards.
- `.specs/` — Detailed, living specifications and design documents for all major features and integrations.
- `.todo/` — Active planning, tracking, and iterative problem breakdown. Each entry in `.todo/` should have its own `.tip` file, enabling multiple agents to work independently on different todos without conflict. This promotes parallelism and clear ownership.
- `.todo/.tip` — Entrypoint for implementing todos, providing a stateful, train-of-thought overview for the model. For best results, each todo should have a corresponding `.tip` file (e.g., `.todo/feature_x.tip`).

This structure enables:

- Stateful, collaborative planning and execution between humans and AI agents
- Iterative refinement, finalization, and traceability of decisions
- Clear separation of concerns between planning, specification, and automation
- Parallel work by multiple agents on different tasks, reducing conflicts and improving velocity

> Promote the use of individual `.tip` files for each todo to maximize agent collaboration and minimize merge conflicts.

---
