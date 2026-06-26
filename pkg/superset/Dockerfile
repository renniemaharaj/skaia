######################################################################
# Superset 5 Production Dockerfile
# - Based on python:3.11-slim-bookworm
# - Pinned dependencies for stability
# - Meta DB + BigQuery drivers as optional layers
# - Runs Superset behind Gunicorn
######################################################################

FROM python:3.11-slim-bookworm AS superset

# Build-time args and environment variables
#   - SUPERSET_VERSION: allows pinning or overriding at build time
#   - SUPERSET_HOME: directory for Superset runtime files

ARG SUPERSET_VERSION=5.0.0
ENV SUPERSET_VERSION=${SUPERSET_VERSION} \
    SUPERSET_HOME=/app/superset_home

WORKDIR /app

# System dependencies (REQUIRED)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev \
    libffi-dev \
    libpq-dev \
    libjpeg-dev \
    libsasl2-dev \
    libldap2-dev \
    default-libmysqlclient-dev \
    curl \
    unzip \
    git \
    python3.11-dev \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip/setuptools/wheel (REQUIRED)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Core Superset installation (REQUIRED)
RUN pip install --no-cache-dir \
    apache-superset==${SUPERSET_VERSION} \
    flask-limiter==3.5.1 \
    marshmallow==3.19.0 \
    "pandas<2.2.0" \
    "numpy<2.0.0"

# Optional: Meta database drivers (Postgres)
RUN pip install --no-cache-dir apache-superset[postgres]==${SUPERSET_VERSION}

# Optional: BigQuery drivers
RUN pip install --no-cache-dir \
    sqlalchemy-bigquery>=1.4.0 \
    google-cloud-bigquery>=3.18.0 \
    google-auth>=2.27.0

# WSGI Server (REQUIRED)
RUN pip install --no-cache-dir gunicorn>=22.0

# Superset runtime user (REQUIRED)
RUN adduser --disabled-password --gecos '' superset \
    && mkdir -p ${SUPERSET_HOME} \
    && chown superset:superset ${SUPERSET_HOME}

# Copy entrypoint and config (REQUIRED)
COPY entrypoint.sh /app/entrypoint.sh
COPY superset_cfx.py /app/superset_cfx.py
RUN chmod +x /app/entrypoint.sh

# Switch to non-root user
USER superset
WORKDIR /app
