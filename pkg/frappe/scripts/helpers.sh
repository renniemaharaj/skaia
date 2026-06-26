#!/bin/bash
set -Eeuo pipefail

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "[FATAL] Missing required command: $1"; exit 1; }
}

json_get() { # json_get <file> <jq_expr> [default]
  local file=$1; shift
  local expr=$1; shift
  local def=${1-}
  if [ ! -f "$file" ]; then
    echo "$def"; return 0
  fi
  local out
  if ! out=$(jq -r "$expr // empty" "$file" 2>/dev/null); then
    echo "$def"; return 0
  fi
  if [ -z "$out" ]; then echo "$def"; else echo "$out"; fi
}

read_apps_array() { # read_apps_array <file> <jq_expr> -> outputs lines
  local file=$1; local expr=$2
  jq -r "$expr // [] | .[]?" "$file" 2>/dev/null || true
}

parse_redis_host() { # parse_redis_host <redis://host:port>
  echo "$1" | sed -E 's|redis://([^:/]+):?.*|\1|'
}

parse_redis_port() { # parse_redis_port <redis://host:port>
  echo "$1" | sed -E 's|redis://[^:]+:([0-9]+).*|\1|'
}