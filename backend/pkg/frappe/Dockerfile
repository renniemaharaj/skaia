ARG PYTHON_IMAGE=python:3.14.2-trixie
ARG GO_IMAGE=golang:1.25-alpine
ARG NODE_IMAGE=node:24-trixie

# Stage 1: Go builder
FROM ${GO_IMAGE} AS go-builder

WORKDIR /app
COPY goftw /app/goftw
WORKDIR /app/goftw/cmd
RUN go build -mod=vendor -o /goftw-entry

# Stage 2: Node runtime source
FROM ${NODE_IMAGE} AS node-runtime

# Stage 3: Runtime
FROM ${PYTHON_IMAGE}

ENV DEBIAN_FRONTEND=noninteractive
ARG FRAPPE_BRANCH=develop
ARG BENCH_VERSION=5.31.0
ARG GUNICORN_VERSION=23.0.0
ARG SUPERVISOR_VERSION=4.2.5
ARG PNPM_VERSION=10.24.0
ENV FRAPPE_BRANCH=${FRAPPE_BRANCH}

# System deps (stable, cache-friendly)
# COST OPTIMIZATION: Minimal deps for demo micro instance
RUN apt-get update && apt-get install -y \
    git mariadb-server mariadb-client libmariadb-dev redis-server \
    build-essential pkg-config curl wget gnupg sudo cron jq nginx \
    openssh-server openssh-client \
    libssl-dev zlib1g-dev libbz2-dev libreadline-dev \
    libsqlite3-dev libffi-dev liblzma-dev uuid-dev \
    && rm -rf /var/lib/apt/lists/*

# MariaDB utf8mb4
RUN echo "[mysqld]\ncharacter-set-client-handshake = FALSE\ncharacter-set-server = utf8mb4\ncollation-server = utf8mb4_unicode_ci\n\n[mysql]\ndefault-character-set = utf8mb4\n" > /etc/mysql/my.cnf

# Node + corepack copied from the version-selected Node image
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && ln -sf /usr/local/lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
    && corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate

# Chromium and dependencies for pdf generation
# COST OPTIMIZATION: Disabled for demo (can be enabled if needed)
# RUN apt-get update && apt-get install -y chromium fonts-liberation ...

# Python tooling
RUN pip install --upgrade pip setuptools wheel \
    && pip install "frappe-bench==${BENCH_VERSION}" "gunicorn==${GUNICORN_VERSION}" "supervisor==${SUPERVISOR_VERSION}"

# Setup SSH server for key-based authentication
RUN mkdir -p /run/sshd \
    && sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config \
    && echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config

# Frappe user
RUN useradd -ms /bin/bash frappe \
    && echo "frappe ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && chmod 755 /home/frappe

# Go binary + configs
COPY --from=go-builder /goftw-entry /usr/local/bin/goftw-entry
COPY instance.json /instance.json
COPY common_site_config.json /common_site_config.json
COPY entrypoint.sh /entrypoint.sh
COPY scripts /scripts
COPY patches /patches

RUN chown -R frappe:frappe \
    /instance.json /common_site_config.json \
    /entrypoint.sh /scripts /patches \
    && chmod +x /entrypoint.sh /scripts/*.sh \
    && chmod +x /usr/local/bin/goftw-entry

USER frappe
WORKDIR /home/frappe

ENTRYPOINT ["/usr/local/bin/goftw-entry"]
