# Skaia

Full-stack tenant-based app: React frontend + Go backend + PostgreSQL + Redis + nginx.

## Stack

- Frontend: React 19.2, TypeScript, Vite
- Backend: Go 1.24, chi/v5, lib/pq
- Database: PostgreSQL 16
- Cache: Redis 7
- Proxy: nginx
- Payments: Stripe (demo provider default)

## Repo layout

- `compose.yml` (shared infrastructure: nginx/postgres/redis)
- `backends/<tenant>/compose.yml` (tenant-specific backend service)
- `backend/` (Go server + app source)
- `backend/frontend/` (React app source)
- `internal/` (app internal modules, routes, services, tests)

## Quickstart

1. copy shared env and configure:
   ```bash
   cp .env.example .env
   # set POSTGRES_PASSWORD at minimum
   ```
2. start shared infra:
   ```bash
   docker compose up -d
   ```
3. build and start backend tenant (example `home`):
   ```bash
   cd backends/home
   docker compose up -d
   ```

> Optional: use `grengo` CLI for tenant scaffolding and compose commands from project root:
>
> - `grengo compose up`
> - `grengo compose down`
> - `grengo new <name> --domain <host>`

## Services

- Backend (tenant): `http://localhost:<PORT>` (varies by tenant config)
- Frontend dev: `http://localhost:5173` (from `backend/frontend` via `npm run dev`)

## Environment files

- `.env` (shared secrets, DB creds, required, not tracked)
- `backend/.env` (backend tuning values, tracked)
- `backends/<tenant>/.env` (tenant runtime config via env file in compose)

## API endpoints

### General

- `GET /health` — health check
- `GET /time` — server time
- `GET /ws` — websocket

### Auth (`/auth`)

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Users (`/users`)

- `GET /users`
- `GET /users/{id}`
- `PUT /users/{id}`
- `DELETE /users/{id}`
- `GET /users/{id}/roles`
- `PUT /users/{id}/roles`

### Forum (`/forum`)

- `GET /forum/categories`, `POST /forum/categories`, `PUT /forum/categories/{id}`, `DELETE /forum/categories/{id}`
- `GET /forum/threads`, `POST /forum/threads`, `GET /forum/threads/{id}`, `PUT /forum/threads/{id}`, `DELETE /forum/threads/{id}`
- `GET /forum/threads/{id}/comments`, plus CRUD for comments
- `POST /forum/threads/{id}/like`, `POST /forum/comments/{id}/like`

### Store (`/store`)

- categories, products, cart, checkout, orders, plans, subscriptions, payments as in code

### Inbox (`/inbox`)

- `GET /inbox/conversations`
- `POST /inbox/conversations`
- `GET /inbox/conversations/{id}/messages`
- `POST /inbox/conversations/{id}/messages`

### Notifications (`/notifications`)

- `GET /notifications`
- `PUT /notifications/{id}/read`
- `PUT /notifications/read-all`

### Uploads (`/upload`)

- `POST /upload/avatar`
- `POST /upload/banner`

## Testing

- Backend tests: `go test ./...`
- Frontend tests: `cd backend/frontend && npm test`

## Notes

- API route list is current as of 2026-03-20 from internal modules `internal/auth`, `internal/user`, `internal/forum`, `internal/store`, `internal/inbox`, `internal/notification`, `internal/upload`.
- Ensure `nginx`, `postgres`, and `redis` are up before starting tenant backends.
