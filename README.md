# Skaia

Skaia is a self-hosted, multi-tenant web platform built from scratch. Each tenant ("client") gets an isolated database, independent feature toggles, and its own domain — all managed from a single codebase and a purpose-built CLI called **grengo**. The platform ships a full community stack: forum, e-commerce store with Stripe payments, real-time WebSocket presence and chat, a CMS page builder, direct messaging, and a granular roles-and-permissions system.

---

## Goals

- **Multi-tenant by design** — spin up isolated sites from one image, each with its own DB, domain, and configuration.
- **Zero-dependency deployment** — one `grengo compose up` command provisions shared infrastructure and all tenant backends.
- **Real-time everything** — WebSockets drive live presence, chat, cursor sharing, instant notifications, permission propagation, and data sync across the UI.
- **Configurable feature set** — enable or disable forum, store, inbox, presence, and landing page per tenant via environment flags.
- **Admin-from-anywhere** — a passcode-gated admin dashboard accessible via `Ctrl+G` inside the running site, or the grengo internal API for headless management.
- **Portable tenants** — export any client (or the entire node) to a single archive and import it onto another host.
- **SEO-ready SPA** — server-side injection of title, meta description, OG image, and favicon into the SPA shell before delivery.

---

## Technology Stack

| Layer         | Technology                                                                            |
| ------------- | ------------------------------------------------------------------------------------- |
| Frontend      | React 19, TypeScript 5.9, Vite 8, Jotai, React Router 7, TipTap editor, Monaco editor |
| Backend       | Go 1.24, chi/v5, gorilla/websocket, golang-jwt/v5, bcrypt, lib/pq                     |
| Database      | PostgreSQL 16 (per-tenant databases, shared instance)                                 |
| Cache         | Redis 7 (namespaced per tenant)                                                       |
| Payments      | Stripe v82 (pluggable — ships with a demo provider)                                   |
| Reverse Proxy | nginx (auto-generated config, upload caching, WebSocket upgrade)                      |
| Containers    | Docker Compose (shared infra + per-tenant compose files)                              |
| CLI           | grengo (Go binary — tenant CRUD, migrations, backup/restore, internal API)            |
| Linting       | Biome (frontend), go vet (backend)                                                    |
| Testing       | Vitest + Testing Library (frontend), Go test + custom integration suite (backend)     |

---

## Repository Layout

```
skaia/
├── compose.yml                  # shared infra: nginx, postgres, redis
├── nginx/default.conf           # auto-generated reverse proxy config
├── grengo                       # compiled CLI binary (git-ignored)
├── backend/                     # Go server + embedded SPA
│   ├── main.go                  # entry point, router, middleware wiring
│   ├── Dockerfile               # multi-stage: builds frontend + Go binary
│   ├── database/db.go           # PostgreSQL + Redis client init
│   ├── models/                  # shared data models + site config types
│   ├── internal/
│   │   ├── auth/                # JWT (HS256), bcrypt passwords, context helpers
│   │   ├── middleware/          # JWT auth, optional auth, RBAC, rate limiting, armed guard
│   │   ├── user/                # user CRUD, roles, permissions, suspension, Redis cache
│   │   ├── forum/               # categories, threads, comments, likes, Redis cache
│   │   ├── store/               # products, cart, orders, subscriptions, Stripe, Redis cache
│   │   ├── inbox/               # 1-to-1 conversations + messages
│   │   ├── notification/        # per-user notifications (comment, like, DM, suspension)
│   │   ├── config/              # site_config CRUD (branding, SEO, footer, features)
│   │   ├── page/                # CMS pages (slug-based, JSONB block content)
│   │   ├── upload/              # image, video, file, banner uploads (user-isolated dirs)
│   │   ├── ws/                  # WebSocket hub, presence, chat ring, cursor broadcast
│   │   ├── ssr/                 # index.html rewriting with SEO head tags
│   │   ├── grengo/              # in-app admin dashboard API proxy
│   │   ├── migrations/          # SQL schema, seed data, CMS schema
│   │   ├── integration/         # integration test suite
│   │   └── testutil/            # test helpers
│   └── frontend/                # React SPA
│       ├── src/
│       │   ├── atoms/           # Jotai atoms (auth, config, forum, store, chat, inbox, etc.)
│       │   ├── components/      # UI components grouped by domain
│       │   ├── hooks/           # custom hooks (auth, WebSocket sync, presence, uploads)
│       │   ├── pages/           # route-level page components
│       │   ├── context/         # React context providers (cart, theme)
│       │   ├── utils/           # API client, server time sync, helpers
│       │   └── styles/          # component CSS files
│       ├── vite.config.ts
│       └── package.json
├── backends/                    # per-tenant runtime directories
│   └── <tenant>/
│       ├── compose.yml          # auto-generated; references skaia-backend image
│       ├── .env                 # tenant-specific config (DB, port, domains, features)
│       ├── uploads/             # bind-mounted user uploads
│       └── armed/               # sentinel files for maintenance mode
└── cmd/grengo/                  # CLI source code
    ├── main.go                  # command dispatch
    ├── commands.go              # new, list, enable, disable, start, stop, remove, update
    ├── docker.go                # compose up/down, build, logs
    ├── nginx.go                 # config generation + hot-reload
    ├── db.go                    # init, migrate, backup/restore
    ├── api.go                   # internal HTTP management API
    ├── transfer.go              # export/import clients + node archives
    ├── passcode.go              # SHA-256 passcode for remote management
    ├── env.go                   # feature definitions + .env generation
    └── config.go                # client config struct + persistence
```

---

## Architecture

### Multi-Tenant Model

Every tenant runs as a separate Docker container from the same `skaia-backend` image. Isolation is achieved at three levels:

1. **Database** — each tenant gets a dedicated PostgreSQL database on the shared Postgres instance.
2. **Cache** — Redis keys are prefixed with the tenant name (e.g. `home:user:42`, `writer:forum:thread:7`).
3. **File storage** — uploads are bind-mounted from `backends/<tenant>/uploads/` into the container at `/app/uploads`.

Nginx sits in front of all tenants and routes requests by `Host` header to the correct upstream backend.

### Request Flow

```
Client ──► nginx (:80/:443)
              │
              ├─ Host header lookup ==> upstream backend
              │
              ▼
         Go backend (:PORT)
              │
              ├─ /api/*       ==> REST API (JWT-protected routes)
              ├─ /ws, /api/ws ==> WebSocket hub
              ├─ /uploads/*   ==> static file server
              ├─ /health      ==> health probe
              ├─ /sitemap.xml ==> dynamic sitemap
              └─ /*           ==> SSR index.html (SPA fallback)
```

### Backend Architecture

The Go server follows a **handler ==> service ==> repository** pattern with constructor-based dependency injection:

- **Handlers** receive HTTP requests, validate input, call services, write JSON responses.
- **Services** contain business logic, orchestrate repository calls, manage caching, and dispatch WebSocket events.
- **Repositories** execute raw SQL against PostgreSQL. No ORM.
- **Cache layer** — Redis-backed caches (user, thread, product) with 5-minute TTL and automatic invalidation on writes.

All routes are mounted on a single `chi` router with composable middleware:

| Middleware     | Purpose                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------- |
| CORS           | Domain-aware origin allowlist derived from `DOMAINS` env                                 |
| JWT Auth       | Validates `Authorization: Bearer <token>` and injects claims into context                |
| Optional JWT   | Enriches context when a token is present but doesn't block anonymous requests            |
| Permission     | Checks for a specific permission or admin role on protected endpoints                    |
| Rate Limit     | 100 req/min per IP (general), 10 req/min per IP (auth endpoints)                         |
| Armed Guard    | Blocks all API traffic (except allowlisted paths) when the tenant is in maintenance mode |
| Request Logger | Logs method, host, path, status, bytes, and duration with token redaction                |
| X-Backend      | Identifies which tenant backend handled the request                                      |
| Cache-Control  | Sets `no-store` on all API responses to prevent CDN/browser caching                      |

### Frontend Architecture

The React SPA uses **Jotai** for atomic state management with 10 atom modules covering auth, config, forum, store, chat, inbox, notifications, presence, theme, and users. Key architectural decisions:

- **Single WebSocket connection** — `useWebSocketSync` (≈900 lines) manages subscriptions, presence, global chat, cursor sharing, real-time data sync, instant permission updates, and admin teleport. All incoming WS messages dispatch to the appropriate Jotai atoms.
- **Feature flags** — the backend exposes `GET /api/config/features` and the frontend conditionally renders routes and UI elements based on which features the tenant has enabled.
- **Token refresh** — the API utility layer intercepts 401 responses, attempts a silent refresh via `/api/auth/refresh`, and retries the original request.
- **Server time sync** — the client measures offset against the backend clock at startup to display accurate relative timestamps regardless of client clock drift.
- **CSS custom properties** — theming uses vanilla CSS variables with a `data-theme` attribute toggle (light/dark). No utility-class framework.

### WebSocket Hub

The hub runs a single event loop dispatching work to a bounded worker pool (default 256 goroutines). Capabilities:

| Feature                | Description                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Resource subscriptions | Key-based pub/sub (e.g. `thread:42`) — clients subscribe to specific resources and receive targeted updates |
| Presence               | Debounced broadcasts of who is online and what route they are viewing                                       |
| Global chat            | Per-session ring buffer (80 messages) with history replay on connect                                        |
| Cursor sharing         | Real-time relay of mouse positions to other users on the same route                                         |
| Teleport               | Admins can navigate other users to a specific route in real time                                            |
| Permission push        | When roles/permissions change, a new JWT is pushed to the affected user's connections instantly             |
| Targeted delivery      | `SendToUser(userID, msg)` reaches all of a user's concurrent connections                                    |

Configurable via environment: max connections (default 100K), worker pool size, chat ring size, presence broadcast interval.

---

## Feature Set

### Authentication & Authorization

- **JWT access tokens** (HS256) with configurable session timeout + 7-day refresh tokens.
- **bcrypt** password hashing at cost 12 with enforced 8–72 character length.
- **Role-based access control** — 4 default roles (admin, member, moderator, banned) with 18 granular permissions across forum, store, user management, presence, and CMS.
- Permissions resolve from both role assignments and direct per-user grants.
- Admin role implicitly holds all permissions.
- **User suspension** with reason tracking and notification.

### Forum

- Categories with display ordering and admin CRUD.
- Threads with rich content (TipTap WYSIWYG editor), pinning, locking, view/reply counters.
- Nested comments with like/unlike on both threads and comments.
- Real-time updates — new threads, edits, deletions, and comments are pushed to subscribed clients via WebSocket.
- Paginated feed with infinite scroll.

### Store & Payments

- Product catalog with categories, stock tracking (`stock_unlimited` flag), original price (for sale display), and image URLs.
- Shopping cart (per-user, persisted in DB).
- **Checkout with payment processing** — pluggable provider interface:
  - **DemoPaymentProvider** — simulates transactions locally (default, configurable failure rate).
  - **StripePaymentProvider** — creates PaymentIntents, Checkout Sessions, Customers, Subscriptions via Stripe API v82.
- Order lifecycle (pending ==> paid ==> shipped ==> delivered / cancelled / refunded).
- **Subscription plans** — recurring billing (monthly/yearly) with trial days, Stripe price ID mapping, subscribe/cancel flows.
- Product cache with 5-minute Redis TTL.

### Inbox (Direct Messages)

- 1-to-1 conversations between users (unique pair constraint).
- Message history per conversation with pagination.
- Mark-as-read tracking and unread count badge.
- Real-time delivery via WebSocket.

### Notifications

- Types: comment on thread, thread/comment liked, thread edited/deleted, comment deleted, profile viewed, suspension, ban, direct message.
- Per-user unread count, mark-read (single/all), delete (single/all).
- Delivered in real time via WebSocket push.

### CMS & Page Builder

- **Dynamic pages** — slug-based CMS pages with JSONB block content, editable from the admin UI.
- **Landing page builder** — ordered sections with 10 block types (hero, card group, stat cards, social links, image gallery, feature grid, CTA, event highlights, profile card, rich text).
- **Site configuration** — branding (site name, logo, favicon, tagline, colors), SEO (title, description, OG image), footer (quick links, social links, community items).
- All config is stored in `site_config` (key ==> JSONB) and injected server-side into the SPA shell for SEO.

### File Uploads

- Per-user isolated directories: `uploads/users/{userID}/{type}/`.
- Support for images (JPEG, PNG, WebP, GIF ≤ 10 MB), videos (MP4, WebM, OGG, MOV ≤ 50 MB), banners, and general files.
- Image dimension validation.
- Directory-traversal protection.
- nginx upload cache (30-day TTL) for static serving.

### Real-Time Presence & Cursors

- See who is online and what page they are viewing.
- Live cursor overlay showing other users' mouse positions on the same route.
- Admin teleport — navigate any connected user to a specific route.

### Global Chat

- Session-scoped global chat visible to all connected users.
- Ring buffer (80 messages) with history replay on new connections.

---

## Security

| Area               | Implementation                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Password storage   | bcrypt cost 12, 8–72 character enforcement                                                                                                                                           |
| Token signing      | HS256 JWT with `JWT_SECRET` env, configurable expiry                                                                                                                                 |
| Token refresh      | Separate 7-day refresh tokens; access tokens use session timeout                                                                                                                     |
| CORS               | Explicit origin allowlist from `DOMAINS` / `CORS_ORIGINS` — no wildcards                                                                                                             |
| Rate limiting      | 100 req/min general, 10 req/min auth endpoints (per IP via `httprate`)                                                                                                               |
| RBAC               | Permission middleware checks claims embedded in JWT; admin bypass                                                                                                                    |
| Input validation   | Request body decoding with explicit field checks in every handler                                                                                                                    |
| File uploads       | MIME type allowlist, size limits, directory-traversal guards (`..` rejection)                                                                                                        |
| Log redaction      | WebSocket token query params are redacted (`[REDACTED]`) in request logs                                                                                                             |
| Nginx headers      | `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| API caching        | `Cache-Control: no-store` on all `/api` responses to prevent CDN/browser caching of sensitive data                                                                                   |
| Armed mode         | File-based maintenance gate blocks all traffic except allowlisted paths                                                                                                              |
| Passcode auth      | SHA-256 hashed passcode pair for grengo remote management API                                                                                                                        |
| Container security | Non-root runtime user (`appuser`) via `su-exec` in Docker; bind-mount ownership fixup at startup                                                                                     |
| DB connections     | Configurable pool limits (max open, max idle, connection lifetime)                                                                                                                   |
| Path traversal     | Explicit `..` rejection on upload serving and SPA fallback                                                                                                                           |

---

## Grengo CLI

`grengo` is the management CLI for the platform. Build it from `cmd/grengo/`:

```bash
cd cmd/grengo && go build -o ../../grengo .
```

### Commands

| Command                        | Description                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `grengo new [name]`            | Interactive wizard — creates tenant DB, `.env`, compose file, uploads dir                              |
| `grengo list`                  | Table of all tenants: name, port, enabled/disabled, running/stopped, domains                           |
| `grengo start <name>`          | Start a tenant's Docker container                                                                      |
| `grengo stop <name>`           | Stop a tenant's Docker container                                                                       |
| `grengo enable <name>`         | Re-enable a disabled tenant + regenerate nginx                                                         |
| `grengo disable <name>`        | Disable tenant, stop container, regenerate nginx                                                       |
| `grengo remove <name>`         | Permanently delete a tenant (with confirmation)                                                        |
| `grengo update <name\|all>`    | Update feature toggles for one or all tenants                                                          |
| `grengo build`                 | Build / rebuild the `skaia-backend` Docker image                                                       |
| `grengo compose up`            | Start all infra + init DBs + start all tenants + generate nginx                                        |
| `grengo compose down`          | Stop all tenant backends + shared infrastructure                                                       |
| `grengo nginx reload`          | Regenerate nginx config from tenant state and hot-reload                                               |
| `grengo db init <name>`        | Create database + run migrations for a tenant                                                          |
| `grengo migrate <name\|all>`   | Re-run migrations (idempotent). `--rebuild` does a full export ==> drop ==> recreate ==> restore cycle |
| `grengo logs <name> [-f]`      | View / tail container logs                                                                             |
| `grengo export <name>`         | Pack tenant (env, compose, uploads, DB dump) into `.tar.gz`                                            |
| `grengo import <archive>`      | Restore tenant from archive (`--name`, `--port` overrides)                                             |
| `grengo export-node`           | Export all tenants into a single node archive                                                          |
| `grengo import-node <archive>` | Restore a full node archive                                                                            |
| `grengo api start [--port N]`  | Start internal management API (default `:9100`)                                                        |
| `grengo api stop`              | Stop the management API                                                                                |
| `grengo passcode set`          | Set SHA-256 hashed passcode pair for remote access                                                     |
| `grengo wipe all`              | Remove all tenants and shared data (postgres/redis)                                                    |

### Internal API (port 9100)

When running, the grengo API exposes endpoints for headless management:

- `GET /health` — API health check
- `GET /sites` — list all tenants with status
- `GET /stats` — live Docker container resource stats (CPU, memory, network, block I/O)
- `GET/PUT /env/{name}` — read/write tenant environment
- `POST /exec` — run grengo subcommands remotely
- `GET /export/{name}` — download tenant archive
- `POST /import` — upload and restore a tenant archive
- `POST /sites/{name}/arm` — put tenant in maintenance mode
- `POST /sites/{name}/disarm` — restore tenant from maintenance mode
- `POST /verify-passcode` — authenticate with passcode

---

## Database Schema

All tables are created via idempotent SQL migrations in `backend/internal/migrations/`. Prices are stored as `BIGINT` cents.

### Core Tables

| Table              | Purpose                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `users`            | Accounts (username, email, password_hash, avatar, banner, bio, suspension fields) |
| `user_sessions`    | JWT session tracking (jti, device, IP, expiry)                                    |
| `roles`            | Named roles (admin, member, moderator, banned)                                    |
| `permissions`      | Named permissions with category grouping (18 seeded)                              |
| `role_permissions` | Role ==> permission mapping                                                       |
| `user_roles`       | User ==> role assignments with `assigned_by` tracking                             |
| `user_permissions` | Direct per-user permission grants with `granted_by` tracking                      |

### Forum Tables

| Table                  | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `forum_categories`     | Categories with display ordering                            |
| `forum_threads`        | Threads (title, content, pinned, locked, view/reply counts) |
| `thread_comments`      | Replies on threads                                          |
| `thread_likes`         | Thread likes (unique per user+thread)                       |
| `thread_comment_likes` | Comment likes (unique per user+comment)                     |

### Store Tables

| Table                | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `store_categories`   | Product categories                                                  |
| `products`           | Products (price, stock, stock_unlimited, original_price, image_url) |
| `cart_items`         | Per-user cart (unique per user+product)                             |
| `orders`             | Order header (user, status, total)                                  |
| `order_items`        | Order line items                                                    |
| `payments`           | Payment records (provider, provider_ref, status, failure_reason)    |
| `subscription_plans` | Recurring plans (price, interval, trial_days, stripe_price_id)      |
| `subscriptions`      | User subscriptions (status, period, cancellation)                   |

### Messaging & Notifications

| Table                 | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `inbox_conversations` | 1-to-1 conversations (unique user pair)                    |
| `inbox_messages`      | Messages within conversations                              |
| `notifications`       | Per-user notifications (type, message, route, read status) |

### CMS & Config

| Table              | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `site_config`      | Key ==> JSONB config store (branding, SEO, footer, features)     |
| `landing_sections` | Ordered landing page blocks (hero, card_group, stat_cards, etc.) |
| `landing_items`    | Items within landing sections                                    |
| `pages`            | CMS pages (slug, title, description, JSONB block content)        |

---

## API Reference

All routes are under `/api/`. JWT-protected routes require `Authorization: Bearer <token>`.

### General

| Method | Path                | Auth          | Description                    |
| ------ | ------------------- | ------------- | ------------------------------ |
| GET    | `/api/health`       | No            | Health check                   |
| GET    | `/api/time`         | No            | Server UTC time                |
| GET    | `/api/armed-status` | No            | Maintenance mode status        |
| POST   | `/api/arm`          | Header        | Arm backend (maintenance mode) |
| POST   | `/api/disarm`       | Header        | Disarm backend                 |
| GET    | `/api/ws`           | Token (query) | WebSocket connection           |

### Auth (`/api/auth`)

| Method | Path             | Auth | Description                             |
| ------ | ---------------- | ---- | --------------------------------------- |
| POST   | `/auth/register` | No   | Register new user                       |
| POST   | `/auth/login`    | No   | Login (returns access + refresh tokens) |
| POST   | `/auth/refresh`  | No   | Refresh access token                    |
| POST   | `/auth/logout`   | JWT  | Logout (invalidate session)             |

### Users (`/api/users`)

| Method | Path                       | Auth     | Description          |
| ------ | -------------------------- | -------- | -------------------- |
| GET    | `/profile`                 | JWT      | Current user profile |
| GET    | `/search`                  | Optional | Search users         |
| GET    | `/{id}`                    | Optional | Get user by ID       |
| POST   | `/`                        | JWT      | Create user          |
| PUT    | `/{id}`                    | JWT      | Update user          |
| POST   | `/{id}/permissions`        | JWT      | Grant permission     |
| DELETE | `/{id}/permissions/{perm}` | JWT      | Revoke permission    |
| POST   | `/{id}/roles`              | JWT      | Assign role          |
| DELETE | `/{id}/roles/{role}`       | JWT      | Remove role          |
| POST   | `/{id}/suspend`            | JWT      | Suspend user         |
| DELETE | `/{id}/suspend`            | JWT      | Unsuspend user       |

### Forum (`/api/forum`)

| Method | Path                     | Auth     | Description              |
| ------ | ------------------------ | -------- | ------------------------ |
| GET    | `/categories`            | Optional | List categories          |
| POST   | `/categories`            | JWT      | Create category          |
| DELETE | `/categories/{id}`       | JWT      | Delete category          |
| GET    | `/threads`               | Optional | List threads (paginated) |
| POST   | `/threads`               | JWT      | Create thread            |
| GET    | `/threads/{id}`          | Optional | Get thread               |
| PUT    | `/threads/{id}`          | JWT      | Update thread            |
| DELETE | `/threads/{id}`          | JWT      | Delete thread            |
| POST   | `/threads/{id}/like`     | JWT      | Like thread              |
| DELETE | `/threads/{id}/like`     | JWT      | Unlike thread            |
| GET    | `/threads/{id}/comments` | Optional | List comments            |
| POST   | `/threads/{id}/comments` | JWT      | Create comment           |
| PUT    | `/comments/{id}`         | JWT      | Update comment           |
| DELETE | `/comments/{id}`         | JWT      | Delete comment           |

### Store (`/api/store`)

| Method | Path                         | Auth     | Description               |
| ------ | ---------------------------- | -------- | ------------------------- |
| GET    | `/categories`                | Optional | List store categories     |
| POST   | `/categories`                | JWT      | Create category           |
| PUT    | `/categories/{id}`           | JWT      | Update category           |
| DELETE | `/categories/{id}`           | JWT      | Delete category           |
| GET    | `/products`                  | Optional | List products (paginated) |
| GET    | `/products/{id}`             | Optional | Get product               |
| POST   | `/products`                  | JWT      | Create product            |
| PUT    | `/products/{id}`             | JWT      | Update product            |
| DELETE | `/products/{id}`             | JWT      | Delete product            |
| GET    | `/cart`                      | JWT      | Get cart                  |
| POST   | `/cart/add`                  | JWT      | Add to cart               |
| PUT    | `/cart/update`               | JWT      | Update cart item          |
| DELETE | `/cart/remove`               | JWT      | Remove from cart          |
| DELETE | `/cart`                      | JWT      | Clear cart                |
| POST   | `/checkout`                  | JWT      | Process checkout          |
| GET    | `/orders`                    | JWT      | List orders               |
| GET    | `/orders/{id}`               | JWT      | Get order                 |
| PUT    | `/orders/{id}/status`        | JWT      | Update order status       |
| GET    | `/plans`                     | Optional | List subscription plans   |
| POST   | `/subscribe`                 | JWT      | Subscribe to plan         |
| GET    | `/subscriptions/current`     | JWT      | Current subscription      |
| POST   | `/subscriptions/{id}/cancel` | JWT      | Cancel subscription       |

### Inbox (`/api/inbox`)

| Method | Path                           | Auth | Description            |
| ------ | ------------------------------ | ---- | ---------------------- |
| GET    | `/conversations`               | JWT  | List conversations     |
| POST   | `/conversations`               | JWT  | Start conversation     |
| GET    | `/conversations/{id}/messages` | JWT  | List messages          |
| POST   | `/conversations/{id}/messages` | JWT  | Send message           |
| PUT    | `/conversations/{id}/read`     | JWT  | Mark conversation read |
| GET    | `/unread`                      | JWT  | Unread message count   |

### Notifications (`/api/notifications`)

| Method | Path            | Auth | Description         |
| ------ | --------------- | ---- | ------------------- |
| GET    | `/`             | JWT  | List notifications  |
| GET    | `/unread-count` | JWT  | Unread count        |
| PUT    | `/read-all`     | JWT  | Mark all read       |
| PUT    | `/{id}/read`    | JWT  | Mark one read       |
| DELETE | `/{id}`         | JWT  | Delete notification |
| DELETE | `/`             | JWT  | Delete all          |

### Config (`/api/config`)

| Method | Path        | Auth | Description       |
| ------ | ----------- | ---- | ----------------- |
| GET    | `/branding` | No   | Site branding     |
| GET    | `/seo`      | No   | SEO metadata      |
| GET    | `/footer`   | No   | Footer config     |
| GET    | `/features` | No   | Feature flags     |
| GET    | `/landing`  | No   | Landing page data |
| PUT    | `/branding` | JWT  | Update branding   |
| PUT    | `/seo`      | JWT  | Update SEO        |
| PUT    | `/footer`   | JWT  | Update footer     |

### Pages (`/api/config/pages`)

| Method | Path      | Auth | Description  |
| ------ | --------- | ---- | ------------ |
| GET    | `/index`  | No   | Index page   |
| GET    | `/list`   | No   | All pages    |
| GET    | `/{slug}` | No   | Page by slug |
| POST   | `/`       | JWT  | Create page  |
| PUT    | `/{id}`   | JWT  | Update page  |
| DELETE | `/{id}`   | JWT  | Delete page  |

### Uploads (`/api/upload`)

| Method | Path      | Auth | Description            |
| ------ | --------- | ---- | ---------------------- |
| POST   | `/image`  | JWT  | Upload image (≤ 10 MB) |
| POST   | `/video`  | JWT  | Upload video (≤ 50 MB) |
| POST   | `/file`   | JWT  | Upload file            |
| POST   | `/banner` | JWT  | Upload banner          |

---

## Environment Variables

### Shared (`.env` at project root)

| Variable            | Required | Description                        |
| ------------------- | -------- | ---------------------------------- |
| `POSTGRES_USER`     | No       | PostgreSQL user (default: `skaia`) |
| `POSTGRES_PASSWORD` | **Yes**  | PostgreSQL password                |
| `PGPORT`            | No       | PostgreSQL port (default: `5432`)  |

### Per-Tenant (`backends/<name>/.env`)

| Variable              | Required | Description                                                                    |
| --------------------- | -------- | ------------------------------------------------------------------------------ |
| `CLIENT_NAME`         | Yes      | Tenant identifier                                                              |
| `CLIENT_ID`           | Yes      | Unique client ID for arm/disarm auth                                           |
| `PORT`                | Yes      | Backend listen port                                                            |
| `DOMAINS`             | Yes      | Space-separated domain list                                                    |
| `DATABASE_URL`        | Yes      | PostgreSQL connection string                                                   |
| `REDIS_URL`           | Yes      | Redis connection string                                                        |
| `JWT_SECRET`          | Yes      | JWT signing secret                                                             |
| `ADMIN_PASSWORD`      | Yes      | Admin account seed password                                                    |
| `ADMIN_EMAIL`         | No       | Admin account email                                                            |
| `CORS_ORIGINS`        | No       | Additional CORS origins (comma-separated)                                      |
| `SESSION_TIMEOUT_MIN` | No       | JWT access token TTL in minutes (default: `30`)                                |
| `PAYMENT_PROVIDER`    | No       | `stripe` or `demo` (default: `demo`)                                           |
| `STRIPE_SECRET_KEY`   | No       | Stripe secret key (when provider is `stripe`)                                  |
| `FEATURES_ENABLED`    | No       | Comma-separated feature flags: `landing,store,forum,cart,users,inbox,presence` |
| `ENVIRONMENT`         | No       | `production` or `development`                                                  |
| `SITEMAP_BASE_URL`    | No       | Base URL for sitemap generation                                                |

### Tuning Variables

| Variable                    | Default | Description                          |
| --------------------------- | ------- | ------------------------------------ |
| `DB_MAX_OPEN_CONNS`         | 100     | Max open DB connections              |
| `DB_MAX_IDLE_CONNS`         | 50      | Max idle DB connections              |
| `DB_CONN_MAX_LIFETIME_MIN`  | 30      | Connection max lifetime (minutes)    |
| `HTTP_READ_TIMEOUT_SEC`     | 15      | HTTP read timeout                    |
| `HTTP_WRITE_TIMEOUT_SEC`    | 15      | HTTP write timeout                   |
| `HTTP_IDLE_TIMEOUT_SEC`     | 60      | HTTP idle timeout                    |
| `HTTP_SHUTDOWN_TIMEOUT_SEC` | 30      | Graceful shutdown timeout            |
| `WS_MAX_CONNECTIONS`        | 100,000 | Max concurrent WebSocket connections |
| `WS_MAX_WORKERS`            | 256     | WebSocket hub worker pool size       |
| `WS_CHAT_RING_SIZE`         | 80      | Global chat history buffer size      |
| `WS_PRESENCE_INTERVAL_MS`   | 1,000   | Presence broadcast debounce interval |

---

## Quickstart

### Prerequisites

- Docker + Docker Compose
- Go 1.24+ (to build the CLI)
- Node.js 20+ (for frontend dev mode)

### 1. Build the CLI

```bash
cd cmd/grengo && go build -o ../../grengo .
```

### 2. Configure shared infrastructure

```bash
cp .env.example .env
# set POSTGRES_PASSWORD at minimum
```

### 3. Create your first tenant

```bash
./grengo new
# follow the interactive prompts
```

### 4. Start everything

```bash
./grengo compose up
```

This starts PostgreSQL, Redis, initializes tenant databases, runs migrations, starts all enabled tenant backends, generates the nginx config, and starts nginx.

### 5. Access

- **Site**: `http://localhost` (or your configured domain)
- **Admin dashboard**: Press `Ctrl+G` in the browser, or use the grengo internal API on port 9100

### Development

For frontend development with hot reload:

```bash
cd backend/frontend
npm install
npm run dev    # Vite dev server on :5173
```

---

## Deployment

### Single-command deploy

```bash
./grengo compose up --build
```

### Adding a new tenant

```bash
./grengo new mysite --domain mysite.com
./grengo nginx reload
```

### Maintenance mode

```bash
# via CLI API
curl -X POST http://localhost:9100/sites/mysite/arm

# via grengo dashboard (Ctrl+G in browser)
```

### Backup and restore

```bash
# export a single tenant
./grengo export mysite -o mysite-backup.tar.gz

# export the entire node
./grengo export-node -o full-backup.tar.gz

# restore on another host
./grengo import mysite-backup.tar.gz --name mysite --port 1082
./grengo import-node full-backup.tar.gz
```

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
