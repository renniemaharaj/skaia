# Welcome to TheWriterCo, Skaia!

Skaia is a highly performant, multi-tenant, container-orchestrated platform powered by Go, built around a real-time, atomic state architecture using Jotai. The frontend is a React-powered full-stack application featuring server-injected SEO, delivering both speed and search engine optimization without compromising the real-time experience.

A key innovation in Skaia is our **WebSocket Rerouter** for REST endpoints. This completely bypasses traditional REST setup costs, enabling efficient, high-performance state updates. The result is an application that loads routes and synchronizes state at the raw speed of Go concurrency.

The platform includes a powerful suite of integrated modules, including a customizable page builder, forums, a complete e-commerce solution with secure carting, checkout, payment handling, delivery management, order tracking, and a wallet system built around debit and credit transactions.

Beyond commerce, Skaia offers real-time inbox messaging, push notifications, room-based chat, voice chat, video calls, screen sharing, live presence tracking across routes, shared cursor interaction, and a DEFCON rate limiter with a live widget overlay. Organizations can also build rich interfaces using the integrated UI page builder and extend the platform through Frappe Framework deployments and Apache Superset integration for enterprise business intelligence and reporting.

We're excited to make this project open source as **skaia-repo**.

Thank you for taking the time to explore the platform and browse our current store offerings 🙏

As a self-hosted platform, each tenant gets an isolated database, independent feature toggles, and its own domain — all managed from a single codebase and the **grengo** CLI.

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
go build -o grengo .
# Or, for simplicity, build as 'cli'
go build -o cli .

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

# CLI tests
go test . ./internal/...

# Frontend tests
cd backend/frontend && npm test
```

## Collaborative Planning, Specs & Routines

All collaborative planning, status tracking, specifications, and automation routines are now kept in the `.todo/`, `.specs/`, and `.routines/` directories:

- `.todo/README.md` — Directory usage, rules, and emoji policy
- `.todo/<name>.tip` — Per-plan status tracker and entrypoint for beginning todo-backed work
- `.specs/` — Human-AI specifications and design docs
- `.todo/*` — Individual todo plans (no extension)
- `.routines/` — First-class directory for routine definitions (project maintenance, automation, specialist roles)
  - `.routines/README.md` — Routine structure and usage
  - `.routines/planner` — Planning, todo lifecycle, specs, technology, and infrastructure context upkeep
  - `.routines/auditor`, `.routines/worker`, and `.routines/correctness` — Core project routines

Specs previously in `.todo/.specs` are now in `.specs/`.

> Emoji use for status is strictly limited to `.todo/*.tip` as described in `.todo/README.md` and is forbidden elsewhere in the project.

---

# Human-AI Planning & Integration

This project uses a structured Human-AI planning and integration approach, with dedicated directories for incorporating artificial intelligence code, modeling acceleration, and maintaining high-quality documentation and routines. The system is designed to gatekeep and guide intelligence through:

- `.routines/` — Automation, maintenance, and specialist routines, including routines for maintaining documentation and enforcing standards.
- `.specs/` — Detailed, living specifications and design documents for all major features and integrations.
- `.todo/` — Active planning, tracking, and iterative problem breakdown. Each entry in `.todo/` should have its own `.tip` file, enabling multiple agents to work independently on different todos without conflict. This promotes parallelism and clear ownership.
- `.todo/<name>.tip` — Per-todo implementation entrypoint with phase status, next steps, and verification notes.

This structure enables:

- Stateful, collaborative planning and execution between humans and AI agents
- Iterative refinement, finalization, and traceability of decisions
- Clear separation of concerns between planning, specification, and automation
- Parallel work by multiple agents on different tasks, reducing conflicts and improving velocity

> Promote the use of individual `.tip` files for each todo to maximize agent collaboration and minimize merge conflicts.

---
