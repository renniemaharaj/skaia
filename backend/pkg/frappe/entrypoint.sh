#!/bin/bash
set -Eeuo pipefail

# ==========================================
# Frappe Entrypoint
# - Reads instance.json for deployment, branch, apps, sites
# - Reads common_site_config.json for Redis and other knobs
# - Initializes bench, ensures apps, aligns site apps to config
# - Switches between development (bench start) and production (supervisor+nginx)
# ==========================================

echo "[ENTRYPOINT] $(date '+%Y-%m-%d %H:%M:%S.%3N') PID: $$ (PPID: $PPID)"

# ---------------------------
# Paths
# ---------------------------
FRAPPE_HOME=${FRAPPE_HOME:-/home/frappe}
INSTANCE_JSON_SOURCE=${INSTANCE_JSON_SOURCE:-/instance.json}
COMMON_CONFIG_SOURCE=${COMMON_CONFIG_SOURCE:-/common_site_config.json}
BENCH_NAME_DEFAULT=${frappe_bench:-frappe-bench}
MERGED_SUPERVISOR_CONF="/supervisor-merged.conf"
HEAD_PATCH_CONF="/patches/head.patch.conf"

cd "$FRAPPE_HOME"

# ---------------------------
# Helpers
# ---------------------------
source /scripts/helpers.sh

# ---------------------------
# Requirements
# ---------------------------
require jq
require bench
require mysqladmin
require redis-cli
require sudo

# ---------------------------
# Load configuration (instance.json)
# ---------------------------
source /scripts/cfx.sh

# ---------------------------
# Load service knobs (common_site_config.json) for Redis only
# ---------------------------
source /scripts/redis.sh

# ---------------------------
# MariaDB credentials from environment
# ---------------------------
DB_ROOT_USERNAME=${MARIADB_ROOT_USERNAME:-root}
DB_ROOT_PASSWORD=${MARIADB_ROOT_PASSWORD:-root}
DB_USER=${MARIADB_USER:-frappe}
DB_PASSWORD=${MARIADB_PASSWORD:-frappe}
DB_NAME=${MARIADB_DATABASE:-frappe}
DB_HOST=${MARIADB_HOST:-mariadb}
DB_PORT=${MARIADB_PORT:-3306}

# Debug toggles
WAIT_FOR_DB=${WAIT_FOR_DB:-1}
WAIT_FOR_REDIS=${WAIT_FOR_REDIS:-1}
DB_DEBUG=${DB_DEBUG:-0}
REDIS_DEBUG=${REDIS_DEBUG:-0}

# ---------------------------
# Ownership
# ---------------------------
sudo chown -R frappe:frappe "$FRAPPE_HOME"

# ---------------------------
# Service waits
# ---------------------------
source /scripts/waits.sh

# ---------------------------
# Initialize bench
# ---------------------------
source /scripts/bench.sh

# ---------------------------
# Sites management
# ---------------------------
source /scripts/sites.sh

# ---------------------------
# Start services
# ---------------------------
source /scripts/service.sh