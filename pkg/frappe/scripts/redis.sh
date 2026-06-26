#!/bin/bash
set -Eeuo pipefail

if [ ! -f "$COMMON_CONFIG_SOURCE" ]; then
  echo "[FATAL] $COMMON_CONFIG_SOURCE not found."; exit 1
fi

echo "[INFO] Loading common_site_config.json..."
REDIS_QUEUE=$(json_get "$COMMON_CONFIG_SOURCE" '.redis_queue' 'redis://redis-queue:6379')
REDIS_CACHE=$(json_get "$COMMON_CONFIG_SOURCE" '.redis_cache' 'redis://redis-cache:6379')
REDIS_SOCKETIO=$(json_get "$COMMON_CONFIG_SOURCE" '.redis_socketio' 'redis://redis-socketio:6379')