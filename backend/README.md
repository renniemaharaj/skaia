# Backend

Go API server. Uses chi/v5, lib/pq, go-redis/v9, golang-jwt/v5.

## Run

```bash
go run main.go
```

Requires `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CORS_ORIGINS` in the environment (see root `.env`).

## Frontend build

The repository now includes a Vite-based React frontend under `backend/frontend`.
The Docker build process takes care of compiling it:

1. The builder image installs Node.js and npm.
2. `npm ci` and `npm run build` are executed in `backend/frontend`, producing `dist/`.
3. The resulting `dist` folder is copied into the runtime image at `/app/frontend/dist`.

At runtime the backend serves the built SPA under `/index`, injecting SEO tags
into `frontend/dist/index.html`. Override the location with
`INDEX_FILE_PATH` if needed.

## Structure

```
main.go              entrypoint, router wiring
database/db.go       postgres + redis init
models/models.go     all domain structs
internal/
  auth/              jwt, password hashing, context helpers
  middleware/         jwt auth middleware
  user/              user CRUD, roles, permissions, cache
  forum/             categories, threads, comments, likes, cache
  store/             categories, products, orders, payments, subscriptions
  cart/              shopping cart API
  inbox/             conversations, messages
  notification/      notifications
  config/            site config (branding, SEO, footer, features)
  page/              CMS pages (slug-based, JSONB blocks)
  customsection/     user-defined custom sections
  datasource/        data source definitions, compiler, TS runner
  events/            event dispatcher and activity logging
  upload/            avatar/banner uploads
  ws/                websocket hub, chat, presence
  ssr/               index.html rewriting with SEO tags
  utils/             http helpers
  grengo/            admin dashboard API proxy
migrations/          SQL schema and seed data
```

## Payments

Set `PAYMENT_PROVIDER=stripe` and `STRIPE_SECRET_KEY` to use Stripe. Default is `demo` which simulates all operations locally.

## Tuning

`backend/.env` contains pool sizes and timeouts. These are not secrets and are tracked in git.

The API will be available at `http://localhost:8080`
