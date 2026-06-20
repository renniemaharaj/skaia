#!/bin/bash
set -Eeuo pipefail

if [ ! -f "$INSTANCE_JSON_SOURCE" ]; then
  echo "[FATAL] $INSTANCE_JSON_SOURCE not found."; exit 1
fi

echo "[INFO] Loading instance.json..."
DEPLOYMENT=$(json_get "$INSTANCE_JSON_SOURCE" '.deployment' 'development')
FRAPPE_BRANCH=$(json_get "$INSTANCE_JSON_SOURCE" '.frappe_branch' 'develop')
BENCH_DIR="$FRAPPE_HOME/$(json_get "$INSTANCE_JSON_SOURCE" '.frappe_bench' "$BENCH_NAME_DEFAULT")"