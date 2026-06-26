# Frappe Docker Compose Setup

## Overview

This Docker Compose project sets up a full **Frappe development environment** with automatic app management. You can choose between two implementations:

* **Go-based implementation** (recommended): Provides a foundation for remote control, microservices, extensions, and automations. It powers site/app management, integrates with system services, and applies changes from `instance.json` to the instance. Currently, it does **not** update `instance.json` itself.
* **Shell script implementation**: Lightweight alternative for direct shell usage. Supports the same rich development workflow and full handling of `instance.json`, but is limited in scope — it will never support advanced features beyond site/app management, as those are reserved for the Go implementation.

### Services Included

* **Frappe Framework** (branch configurable, default `develop`)
* **ERPNext** and other site-specific apps
* **MariaDB**
* **Redis** (cache, queue, socketio)
* **Site auto-creation and management** based on `instance.json` in the repository root
* **App alignment**: site apps are automatically installed and synced based on each site's requirements.
* **Production and default multi-tenancy enabled** out of the box

## Features

* **Zero manual steps** after first run — sites and apps are provisioned automatically.
* **App management logic**:

  * Apps required by each site are installed automatically.
  * Any apps not required are uninstalled (except `frappe`).
  * Ensures environments are consistent across containers.
* **App auto-updates**:

  * Each app directory is visited and updated via `git pull`.
  * If a branch is **unclean** (cannot be fast-forwarded), the update is skipped until manual intervention or a merge occurs upstream.
* **Optimized entrypoint**:

  * Waits for MariaDB and Redis to be healthy before starting services.
  * Uses Docker environment variables for MariaDB credentials.
  * Parses `common_site_config.json` for Redis URLs using `jq`.
* **Dual implementation**:

  * **Go binary** (`goftw`): applies `instance.json` to the environment, supports automation, and lays a foundation for future remote control.
  * **Shell script**: supports development workflows and `instance.json` management, but will never extend beyond this scope.

## Site Auto-Management

The entrypoint (Go or shell) handles site management automatically:

1. Reads `instance.json` to get the list of sites and their required apps.
2. Optionally drops abandoned sites if `drop_abandoned_sites` is `true`.
3. Creates missing sites using Docker-provided root credentials to avoid interactive prompts.
4. Installs required apps for each site.
5. Uninstalls apps that are not required for the site (except `frappe`).
6. Migrates each site after app alignment.

> Sites are automatically kept in sync with `instance.json` on container start. Restart the container to apply changes.

## Configuration

### Files

* `instance.json` (repo root) — controls deployment mode, sites, apps, and branch.
* `common_site_config.json` (repo root) — Frappe-specific site settings (redis urls, socketio port, etc.). Copied into `sites/common_site_config.json` inside the bench.

### Example `instance.json` (repo root)

```json
{
    "deployment": "production",
    "instance_sites": [
        {
            "site_name": "frontend",
            "apps": ["frappe", "erpnext", "hrms"]
        },
        {
            "site_name": "frontend1",
            "apps": ["frappe", "erpnext"]
        }
    ],
    "drop_abandoned_sites": true,
    "frappe_branch": "develop"
}
```

* `deployment`: `production` or `development` (controls supervisor/nginx vs `bench start`).
* `instance_sites`: array of site objects; each object defines a `site_name` and required `apps`.
* `drop_abandoned_sites`: if `true`, sites not listed will be dropped automatically.
* `frappe_branch`: branch used by `bench init` and `bench get-app`.

### Example `common_site_config.json` (repo root)

```json
{
  "db_name": "frappe",
  "db_password": "frappe",
  "db_host": "mariadb",
  "db_user": "frappe",
  "db_port": 3306,
  "redis_cache": "redis://redis-cache:6379",
  "redis_queue": "redis://redis-queue:6379",
  "redis_socketio": "redis://redis-socketio:6379",
  "redis_socketio_channel": "redis_socketio",
  "restart_supervisor_on_update": false,
  "restart_systemd_on_update": false,
  "dns_multitenant": true,
  "socketio_port": 9000
}

```

## Docker Compose Environment Variables (MariaDB)

```yaml
mariadb:
  image: mariadb:11
  environment:
    MARIADB_ROOT_PASSWORD: root
    MARIADB_USER: frappe
    MARIADB_PASSWORD: frappe
    MARIADB_DATABASE: frappe

frappe:
  environment:
    MARIADB_ROOT_PASSWORD: root
    MARIADB_ROOT_USERNAME: root
    MARIADB_USER: frappe
    MARIADB_PASSWORD: frappe
    MARIADB_DATABASE: frappe
```

## Running the Project

1. **Build and start containers:**

```bash
docker compose up -d --build
```

2. **Check logs:**

```bash
docker compose logs -f frappe
```

3. **Access services:**

* Development: `http://localhost:8000`
* Production: `http://<sitename>` (e.g., `http://frontend`) — edit hosts file as needed.

4. **Stop the environment:**

```bash
docker compose down
```

## Onboarding Guide

### Prerequisites

* Docker & Docker Compose installed.
* Ports `8000`, `9000`, and `3306` available.

### Quick start (first time)

1. Clone the repo:

```bash
git clone https://github.com/renniemaharaj/hrtm-frappe
cd hrtm-frappe
```

2. Edit `instance.json` in the repo root for custom sites, apps, or branch.
3. Start the environment:

```bash
docker compose up -d --build
```

4. Verify services are running and inspect logs:

```bash
docker ps
docker compose logs -f frappe
```

5. Enter the container for manual bench commands (if required):

```bash
docker compose exec frappe bash
cd frappe-bench
bench --site frontend migrate
```

### Development workflow

* Edit code in `./mount` to modify apps or other files mounted into the container.
* Restart the container after changing `instance.json` to trigger site/app re-sync.
* Choose between **Go** or **Shell** entrypoint depending on workflow needs.

### Troubleshooting

* Database issues: remove `./mysqldata` to reset MariaDB (deletes data).
* Redis issues: remove Redis volumes and restart containers.
* Incorrect apps: check `instance.json` — the entrypoint enforces required apps per site.
* If `bench new-site` prompts for a password, ensure `MARIADB_ROOT_PASSWORD` is set and visible to the `frappe` service.

## Volumes

* `mysqldata`: MariaDB persistent storage
* `redis-cache`, `redis-queue`, `redis-socketio`: Redis persistent storage
* `mount`: Frappe workspace mount for local edits
