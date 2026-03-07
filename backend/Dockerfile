# Build stage
FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o backend .

# Runtime stage
FROM alpine:3.21

RUN apk --no-cache add ca-certificates su-exec && \
    adduser -D -h /app appuser

WORKDIR /app

COPY --from=builder /app/backend .

RUN mkdir -p /app/uploads && chown -R appuser:appuser /app

# Entrypoint runs as root to fix bind-mount ownership, then drops to appuser.
COPY <<'EOF' /app/entrypoint.sh
#!/bin/sh
set -e
# Fix ownership of the uploads directory when a host bind-mount arrives
# as root-owned (common with Docker bind mounts on Linux).
chown -R appuser:appuser /app/uploads 2>/dev/null || true
exec su-exec appuser ./backend
EOF
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080

CMD ["/app/entrypoint.sh"]
