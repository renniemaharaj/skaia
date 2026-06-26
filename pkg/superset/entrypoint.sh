#!/usr/bin/env bash
set -eo pipefail

# ==========================
# Defaults
# ==========================
PORT=${SUPERSET_PORT:-8088}
WORKERS=${WORKERS:-4}

# export SUPERSET_CONFIG_PATH=/app/superset_config.py
# export FLASK_ENV=production
# export SUPERSET_ENV=production

# ==========================
# Bootstrap Superset
# ==========================
bootstrap() {
  echo "++++++----- Begin Running DB migrations -----++++++"
  superset db upgrade
  echo "++++++----- End Running DB migrations -----++++++"

  echo "++++++----- Begin Initializing roles & permissions -----++++++"
  superset init
  echo "++++++----- End Initializing roles & permissions -----++++++"

  echo "++++++----- Creating default admin user if not exists -----++++++"
  superset fab create-admin \
    --username "${SUPERSET_ADMIN_USERNAME:-admin}" \
    --firstname "${SUPERSET_ADMIN_FIRSTNAME:-Admin}" \
    --lastname "${SUPERSET_ADMIN_LASTNAME:-User}" \
    --email "${SUPERSET_ADMIN_EMAIL:-admin@example.com}" \
    --password "${SUPERSET_ADMIN_PASSWORD:-admin}" || true
}

# # ==========================
# # Install drivers if needed
# # ==========================
# install_postgres_drivers() {
#   if [[ "$DATABASE_DIALECT" == postgres* ]] && [ "$(whoami)" = "root" ]; then
#     echo "++++++----- Installing Postgres requirements -----++++++"
#     if command -v uv > /dev/null 2>&1; then
#       uv pip install -e .[postgres]
#     else
#       pip install -e .[postgres]
#     fi
#     echo "++++++----- Postgres requirements installed -----++++++"
#   fi
# }

# ==========================
# Entrypoint command switch
# ==========================
case "$1" in
  app)
    # install_postgres_drivers
    bootstrap
    echo "++++++----- Starting Superset with Gunicorn -----++++++"
    exec gunicorn \
      -w ${WORKERS} \
      -k gthread \
      --threads 4 \
      --timeout 120 \
      -b 0.0.0.0:${PORT} \
      --limit-request-line 0 \
      --limit-request-field_size 0 \
      "superset.app:create_app()"
    ;;
  worker)
    # install_postgres_drivers
    bootstrap
    echo "++++++----- Starting Celery worker -----++++++"
    exec celery --app=superset.tasks.celery_app:app worker -O fair -l INFO --concurrency=${CELERYD_CONCURRENCY:-2}
    ;;
  beat)
    # install_postgres_drivers
    bootstrap
    echo "++++++----- Starting Celery beat -----++++++"
    rm -f /tmp/celerybeat.pid
    exec celery --app=superset.tasks.celery_app:app beat --pidfile /tmp/celerybeat.pid -l INFO -s "${SUPERSET_HOME}"/celerybeat-schedule
    ;;
  *)
    echo "Usage: $0 {app|worker|beat}"
    exit 1
    ;;
esac
