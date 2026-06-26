#!/bin/bash
set -Eeuo pipefail

if [ "$WAIT_FOR_DB" = "1" ]; then
  echo "[WAIT] MariaDB at ${DB_HOST}:${DB_PORT}..."
  until mysqladmin ping -h "$DB_HOST" -P "$DB_PORT" -u "$DB_ROOT_USERNAME" -p"$DB_ROOT_PASSWORD" --silent; do
    sleep 2
    [ "$DB_DEBUG" = "1" ] && echo "[DEBUG][DB] waiting..."
  done
  echo "[OK] MariaDB reachable."
fi

if [ "$WAIT_FOR_REDIS" = "1" ]; then
  for R in "$REDIS_QUEUE" "$REDIS_CACHE" "$REDIS_SOCKETIO"; do
    host=$(parse_redis_host "$R")
    port=$(parse_redis_port "$R")
    echo "[WAIT] Redis at ${host}:${port}..."
    until redis-cli -h "$host" -p "$port" ping >/dev/null 2>&1; do
      sleep 2
      [ "$REDIS_DEBUG" = "1" ] && echo "[DEBUG][REDIS $host:$port] waiting..."
    done
    echo "[OK] Redis ${host}:${port} reachable."
  done
fi