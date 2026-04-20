# Skaia

Skaia is a self-hosted, multi-tenant web platform. Each tenant gets an isolated database, independent feature toggles, and its own domain — all managed from a single codebase and the **grengo** CLI.

## Features

- **Forum** — categories, threads, comments, likes, real-time updates
- **Store** — products, cart, checkout (Stripe or demo provider), orders, subscriptions
- **Inbox** — 1-to-1 direct messaging with real-time delivery
- **Notifications** — typed, per-user, delivered via WebSocket
- **CMS** — slug-based pages with JSONB block content, landing page builder
- **Real-time** — WebSocket presence, global chat, cursor sharing, admin teleport
- **RBAC** — 4 default roles, 18 granular permissions, instant permission propagation
- **SEO** — server-side meta injection, dynamic sitemap
- **Collaborative Planning** — `.todo/` directory for human-AI planning, status, and specifications

## Stack

| Layer      | Technology                                        |
| ---------- | ------------------------------------------------- |
| Frontend   | React 19, TypeScript, Vite, Jotai, TipTap, Monaco |
| Backend    | Go 1.24, chi/v5, gorilla/websocket, lib/pq        |
| Database   | PostgreSQL 16 (per-tenant)                        |
| Cache      | Redis 7 (namespaced per tenant)                   |
| Payments   | Stripe v82 (pluggable, ships with demo provider)  |
| Proxy      | nginx (auto-generated config)                     |
| Containers | Docker Compose                                    |
| CLI        | grengo (Go binary)                                |

## Quickstart

```bash
# Build CLI
cd cmd/grengo && go build -o ../../grengo .

# Configure (set POSTGRES_PASSWORD)
cp .env.example .env

# Create first tenant
./grengo new

# Start everything
./grengo compose up
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

All collaborative planning, status tracking, and specifications are now kept in the `.todo/` directory:

- `.todo/README.md` — Directory usage, rules, and emoji policy
- `.todo/.tip` — Current status tracker and entrypoint for beginning any real work
- `.todo/.specs` — Human-AI specifications and design docs
- `.todo/*` — Individual todo plans (no extension)

Specs previously in `.specs/` are now in `.todo/.specs`:

- **`ui_spec`** — Design system tokens, shared CSS classes, component rules
- **`backend_spec`** — Architecture, handler/service/repository pattern, API routes, security
- **`infrastructure_spec`** — Docker setup, nginx, grengo CLI, environment variables, tenant isolation
- **`realtime_wss_spec`** — WebSocket protocol, message types, subscription lifecycle, atom ownership
- **`migrations_spec`** — In-place schema update policy, idempotent SQL conventions

> Emoji use for status is strictly limited to `.todo/.status` as described in `.todo/README.md` and is forbidden elsewhere in the project.

---
