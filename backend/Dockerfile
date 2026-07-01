# Build stage
FROM golang:1.25-bookworm AS builder

ARG NODE_VERSION=20.0.0
ARG TARGETARCH=amd64
ENV NODE_HOME=/opt/node

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    xz-utils && \
    rm -rf /var/lib/apt/lists/*

RUN case "${TARGETARCH}" in \
        amd64) node_arch=x64 ;; \
        arm64) node_arch=arm64 ;; \
        *) echo "Unsupported Node.js architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    mkdir -p "${NODE_HOME}" && \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
    | tar -xJ --strip-components=1 -C "${NODE_HOME}" && \
    ln -s "${NODE_HOME}/bin/node" /usr/local/bin/node && \
    ln -s "${NODE_HOME}/bin/npm" /usr/local/bin/npm && \
    ln -s "${NODE_HOME}/bin/npx" /usr/local/bin/npx && \
    node -v && \
    npm -v

WORKDIR /app

COPY go.mod go.sum* ./
COPY pkg/conveyor/ ./pkg/conveyor/
COPY pkg/grouplogs/ ./pkg/grouplogs/
COPY pkg/grpc/ ./pkg/grpc/

RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -o backend .

WORKDIR /app/internal/datasource/tsrunner
RUN npm ci --omit=dev

WORKDIR /app/internal/videorenderer
RUN npm ci --omit=dev

WORKDIR /app

# Runtime stage
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_HOME=/opt/node
ENV PATH="${NODE_HOME}/bin:${PATH}"

RUN printf '%s\n' \
    'Acquire::Retries "5";' \
    'Acquire::http::Timeout "30";' \
    'Acquire::https::Timeout "30";' \
    > /etc/apt/apt.conf.d/99skaia-retries && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    docker.io \
    docker-compose \
    fonts-freefont-ttf \
    gosu && \
    apt-get purge -y --auto-remove && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --create-home --home-dir /app --shell /usr/sbin/nologin appuser

COPY --from=builder /opt/node /opt/node

WORKDIR /app

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV TMPDIR=/tmp/skaia-render
ENV TEMP=/tmp/skaia-render
ENV TMP=/tmp/skaia-render

COPY --from=builder /app/backend /app/backend
COPY --from=builder /app/internal/datasource/tsrunner /app/internal/datasource/tsrunner
COPY --from=builder /app/internal/videorenderer /app/internal/videorenderer

RUN mkdir -p \
    /app/uploads \
    /app/armed \
    /tmp/skaia-render && \
    chmod +x /app/backend && \
    chown -R appuser:appuser \
    /app \
    /tmp/skaia-render

COPY <<'EOF' /app/entrypoint.sh
#!/bin/sh
set -e

mkdir -p \
    /app/uploads \
    /app/armed \
    /tmp/skaia-render

chown -R appuser:appuser /app/uploads 2>/dev/null || true
chown -R appuser:appuser /app/armed 2>/dev/null || true
chown -R appuser:appuser /tmp/skaia-render 2>/dev/null || true
chown -R appuser:appuser /app/internal/datasource 2>/dev/null || true
chown -R appuser:appuser /app/internal/videorenderer 2>/dev/null || true

if [ -S /var/run/docker.sock ]; then
    chgrp appuser /var/run/docker.sock 2>/dev/null || true
    chmod g+rw /var/run/docker.sock 2>/dev/null || true
fi

exec gosu appuser /app/backend
EOF

RUN chmod +x /app/entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
