#!/bin/bash
set -Eeuo pipefail

cd "$BENCH_DIR"

if [ "$DEPLOYMENT" = "production" ]; then
  echo "[MODE] PRODUCTION"
  sudo mkdir -p /var/log
  sudo chown -R frappe:frappe /var/log

  # Remove old configs to force regeneration
  sudo rm -f config/supervisor.conf
  sudo rm -f config/nginx.conf
  sudo rm -f /etc/nginx/conf.d/frappe-bench.conf

  echo "[SETUP] Regenerating supervisor and nginx configs"
  bench setup supervisor --skip-redis
  bench setup nginx

  if ! grep -q "log_format main" /etc/nginx/nginx.conf; then
    echo "[PATCH] Injecting main log_format into /etc/nginx/nginx.conf"
    sudo sed -i '/http {/r /patches/log.patch.conf' /etc/nginx/nginx.conf || true
  fi

  sudo ln -sf "$BENCH_DIR/config/nginx.conf" /etc/nginx/conf.d/frappe-bench.conf

  echo "[SUPERVISOR] Merging configs -> $MERGED_SUPERVISOR_CONF"
  sudo bash -c "cat /dev/null > '$MERGED_SUPERVISOR_CONF'"
  sudo bash -c "cat '$HEAD_PATCH_CONF' >> '$MERGED_SUPERVISOR_CONF' && echo >> '$MERGED_SUPERVISOR_CONF' && cat '$BENCH_DIR/config/supervisor.conf' >> '$MERGED_SUPERVISOR_CONF'"

  echo "[BIN] bench: $(which bench)"
  command -v gunicorn >/dev/null && echo "[BIN] gunicorn: $(which gunicorn)" || echo "[BIN] gunicorn: not found"

  sudo supervisord -n -c "$MERGED_SUPERVISOR_CONF"
else
  echo "[MODE] DEVELOPMENT"
  exec bench start
fi