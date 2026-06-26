# Superset Docker Deployment

This is a **custom Superset Docker deployment** for production environments.

## Overview

This deployment is built on a Python Docker base image, following Superset's official bare-bones Python installation guide. Superset and its dependencies are installed within this container.

Key features:

* **Persistent storage**: PostgreSQL data is mounted to the host for data persistence.
* **BigQuery support**: Includes GCP key mounting for BigQuery integrations.
* **Production-ready**: Uses Gunicorn with gthreads to run Superset.
* **Flexible configuration**: Can be configured via `.env` or a custom `superset_cfx.py` file.

This setup provides a lean, production-targeted Superset deployment.

## Deployment Structure

### Dockerfile Layers

The Dockerfile is structured to separate required layers from optional ones, minimizing rebuilds when enabling integrations.

#### 1. **Base Image** (REQUIRED)

```dockerfile
FROM python:3.11-slim-bookworm AS superset
```

* Provides the foundation using a slim Python 3.11 Debian-based image.
* Chosen for stability and small footprint.

#### 2. **Build-time Args & Env Vars** (REQUIRED)

```dockerfile
ARG SUPERSET_VERSION=5.0.0
ENV SUPERSET_VERSION=${SUPERSET_VERSION} \
    SUPERSET_HOME=/app/superset_home
```

* `SUPERSET_VERSION` allows pinning or overriding Superset version.
* `SUPERSET_HOME` sets Superset's runtime directory.

#### 3. **System Dependencies** (REQUIRED)

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libssl-dev libffi-dev libpq-dev libjpeg-dev \
    libsasl2-dev libldap2-dev default-libmysqlclient-dev \
    curl unzip git python3.11-dev \
    && rm -rf /var/lib/apt/lists/*
```

* Required for compiling Python packages and enabling database drivers.
* Includes PostgreSQL, MySQL, LDAP, and image support libraries.

#### 4. **Pip Tooling** (REQUIRED)

```dockerfile
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
```

* Ensures pip and packaging tools are up to date for consistent builds.

#### 5. **Core Superset Installation** (REQUIRED)

```dockerfile
RUN pip install --no-cache-dir \
    apache-superset==${SUPERSET_VERSION} \
    flask-limiter==3.5.1 \
    marshmallow==3.19.0 \
    "pandas<2.2.0" \
    "numpy<2.0.0"
```

* Installs Superset core with pinned dependencies for stability.
* Includes Flask-Limiter for rate limiting.

#### 6. **Meta Database Drivers (Postgres)** (OPTIONAL)

```dockerfile
RUN pip install --no-cache-dir apache-superset[postgres]==${SUPERSET_VERSION}
```

* Adds PostgreSQL driver support.
* Safe to omit if not using Postgres.

#### 7. **BigQuery Drivers** (OPTIONAL)

```dockerfile
RUN pip install --no-cache-dir \
    sqlalchemy-bigquery>=1.4.0 \
    google-cloud-bigquery>=3.18.0 \
    google-auth>=2.27.0
```

* Installs Google BigQuery and authentication libraries.
* Requires mounting a GCP key.

#### 8. **WSGI Server** (REQUIRED)

```dockerfile
RUN pip install --no-cache-dir gunicorn>=22.0
```

* Installs Gunicorn as the production WSGI server.
* Configured to run Superset with threads.

#### 9. **Runtime User Setup** (REQUIRED)

```dockerfile
RUN adduser --disabled-password --gecos '' superset \
    && mkdir -p ${SUPERSET_HOME} \
    && chown superset:superset ${SUPERSET_HOME}
```

* Adds a non-root `superset` user for security.
* Prepares runtime directory with proper ownership.

#### 10. **Entrypoint & Config** (REQUIRED)

```dockerfile
COPY entrypoint.sh /app/entrypoint.sh
COPY superset_cfx.py /app/superset_cfx.py
RUN chmod +x /app/entrypoint.sh
```

* Copies entrypoint script and Superset configuration.
* Entrypoint initializes DB, roles, and launches Superset.

#### 11. **Switch to Non-root User** (REQUIRED)

```dockerfile
USER superset
WORKDIR /app
```

* Ensures Superset runs as non-root.
* Improves container security.

---

## Configuration

### Environment Variables

Superset configuration can be set in the `.env` file:

Example `.env`:

```env
SUPERSET_ENV=production
FLASK_ENV=production
DEV_MODE=false
SUPERSET_PORT=8088
DATABASE_DIALECT=postgresql
DATABASE_DB=superset
DATABASE_HOST=db
DATABASE_PORT=5432
DATABASE_USER=superset
DATABASE_PASSWORD=superset
POSTGRES_DB=superset
POSTGRES_USER=superset
POSTGRES_PASSWORD=superset
REDIS_HOST=redis
REDIS_PORT=6379
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
SUPERSET_ADMIN_USERNAME=admin
SUPERSET_ADMIN_PASSWORD=admin
GOOGLE_APPLICATION_CREDENTIALS=/app/config/gcp-key.json
```

### Superset Config File

For advanced configuration, use `superset_cfx.py`. Example:

```python
SECRET_KEY = "YOUR_RANDOM_SECRET_KEY"
```

---

## Commands

Build and run the lean deployment:

```bash
docker-compose -f docker-compose.yml up -d --build
```

Build and run the extended deployment:

```bash
docker-compose -f docker-compose-extended.yml up -d --build
```

---

## Notes

* Ensure `.env` and `superset_cfx.py` are configured before starting.
* Superset data and configurations are persisted in volumes.
* GCP key for BigQuery must be placed at `/app/config/gcp-key.json`.

---

This setup offers a **scalable, production-ready Superset deployment** with a clear separation of required vs optional layers for efficiency and flexibility.
