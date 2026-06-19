# Build stage
FROM golang:1.24-alpine AS builder

# we need git for go modules and node/npm for building the frontend
RUN apk add --no-cache git nodejs npm

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

# copy the entire repository (including frontend) so we can build the SPA
COPY . .

# build the frontend assets
WORKDIR /app/frontend
RUN npm ci && npm run build

# compile the backend binary
WORKDIR /app
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o backend .

# install tsrunner dependencies (TypeScript compiler for data sources)
WORKDIR /app/internal/datasource/tsrunner
RUN npm ci --omit=dev

WORKDIR /app

# Runtime stage
FROM alpine:3.21

RUN apk --no-cache add ca-certificates su-exec nodejs chromium && \
    adduser -D -h /app appuser

WORKDIR /app

COPY --from=builder /app/backend /app/backend
COPY --from=builder /app/frontend/dist /app/frontend/dist
COPY --from=builder /app/internal/datasource/tsrunner /app/internal/datasource/tsrunner

# make sure the compiled binary can be executed
RUN chmod +x /app/backend

RUN mkdir -p /app/uploads /app/armed && chown -R appuser:appuser /app/uploads /app/armed

# Entrypoint runs as root to fix bind-mount ownership, then drops to appuser.
COPY <<'EOF' /app/entrypoint.sh
#!/bin/sh
set -e
# Fix ownership of the uploads and armed directories when a host bind-mount arrives
# as root-owned (common with Docker bind mounts on Linux).
chown -R appuser:appuser /app/uploads 2>/dev/null || true
chown -R appuser:appuser /app/armed 2>/dev/null || true
# execute the compiled backend binary
exec su-exec appuser /app/backend
EOF
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080

CMD ["/app/entrypoint.sh"]
