# Skaia

Full-stack application: React frontend, Go backend, PostgreSQL, Redis.

## Stack

| Layer    | Tech                           |
| -------- | ------------------------------ |
| Frontend | React 19, TypeScript, Vite     |
| Backend  | Go 1.24, chi/v5, lib/pq        |
| Database | PostgreSQL 16                  |
| Cache    | Redis 7                        |
| Proxy    | nginx                          |
| Payments | Stripe (demo provider default) |

## Setup

```bash
cp .env.example .env   # fill in secrets
docker compose up -d
```

Backend: `http://localhost:8080`
Frontend: `http://localhost:5173`

## Environment

| File           | Purpose                              | Git     |
| -------------- | ------------------------------------ | ------- |
| `.env`         | secrets (DB creds, JWT, Stripe keys) | ignored |
| `backend/.env` | tuning params (pool sizes, timeouts) | tracked |

## API routes

### General

- `GET /health` — health check
- `GET /time` — server time
- `GET /ws` — websocket

### Auth (`/auth`)

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`

### Users (`/users`)

- `GET /users`, `GET /users/{id}`, `PUT /users/{id}`, `DELETE /users/{id}`
- `GET /users/{id}/roles`, `PUT /users/{id}/roles`

### Forum (`/forum`)

- categories: `GET /forum/categories`, CRUD `/forum/categories/{id}`
- threads: `GET /forum/threads`, CRUD `/forum/threads/{id}`
- comments: `GET /forum/threads/{id}/comments`, CRUD
- likes: `POST /forum/threads/{id}/like`, `POST /forum/comments/{id}/like`

### Store (`/store`)

- categories: `GET /store/categories`, CRUD
- products: `GET /store/products`, CRUD
- cart: `GET /store/cart`, `POST /store/cart/add`, `PUT /store/cart/update`, `DELETE /store/cart/remove`
- checkout: `POST /store/checkout`
- orders: `GET /store/orders`, `GET /store/orders/{id}`
- plans: `GET /store/plans`, CRUD (admin)
- subscriptions: `POST /store/subscribe`, `GET /store/subscriptions`, `POST /store/subscriptions/{id}/cancel`
- payments: `GET /store/payments/{ref}/status`

### Inbox (`/inbox`)

- `GET /inbox/conversations`, `POST /inbox/conversations`
- `GET /inbox/conversations/{id}/messages`, `POST /inbox/conversations/{id}/messages`

### Notifications (`/notifications`)

- `GET /notifications`, `PUT /notifications/{id}/read`, `PUT /notifications/read-all`

### Uploads (`/upload`)

- `POST /upload/avatar`, `POST /upload/banner`
