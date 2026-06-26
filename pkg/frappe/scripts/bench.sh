#!/bin/bash
set -Eeuo pipefail

if [ ! -d "$BENCH_DIR" ]; then
  echo "[INIT] bench init --frappe-branch $FRAPPE_BRANCH $BENCH_DIR"
  bench init --frappe-branch "$FRAPPE_BRANCH" "$BENCH_DIR"
fi
cd "$BENCH_DIR"

# Ensure sites dir exists
mkdir -p "$BENCH_DIR/sites"

# Copy common config into bench (source of truth is outside)
COMMON_CONFIG_DEST="$BENCH_DIR/sites/common_site_config.json"
cp "$COMMON_CONFIG_SOURCE" "$COMMON_CONFIG_DEST"
sudo chown frappe:frappe "$COMMON_CONFIG_DEST"