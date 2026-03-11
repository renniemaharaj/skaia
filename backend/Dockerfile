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

# Runtime stage
FROM alpine:3.21

RUN apk --no-cache add ca-certificates su-exec && \
    adduser -D -h /app appuser

WORKDIR /app

COPY --from=builder /app .

# make sure the compiled binary can be executed
RUN chmod +x /app/backend

# Copy the built frontend output so the server can serve it with patched head.
COPY --from=builder /app/frontend/dist /app/frontend/dist

RUN mkdir -p /app/uploads && chown -R appuser:appuser /app

# Entrypoint runs as root to fix bind-mount ownership, then drops to appuser.
COPY <<'EOF' /app/entrypoint.sh
#!/bin/sh
set -e
# Fix ownership of the uploads directory when a host bind-mount arrives
# as root-owned (common with Docker bind mounts on Linux).
chown -R appuser:appuser /app 2>/dev/null || true
chown -R appuser:appuser /app/uploads 2>/dev/null || true
# execute the compiled backend binary
exec su-exec appuser /app/backend
EOF
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080

CMD ["/app/entrypoint.sh"]
