#!/bin/bash
set -Eeuo pipefail

echo "[SITES] Syncing sites with instance.json..."

# Initialize sites array (empty by default)
INSTANCE_SITES=()
mapfile -t INSTANCE_SITES < <(jq -r '.instance_sites[].site_name // empty' "$INSTANCE_JSON_SOURCE")

# Build a map of site -> apps only if we have sites
declare -A SITE_APPS
if [ ${#INSTANCE_SITES[@]} -gt 0 ]; then
    for site in "${INSTANCE_SITES[@]}"; do
        apps=$(jq -r --arg s "$site" '.instance_sites[] | select(.site_name==$s) | .apps[]?' "$INSTANCE_JSON_SOURCE")
        SITE_APPS["$site"]="$apps"
    done
fi

# Collect current sites based on real directories with site_config.json
CURRENT_SITES=()
for dir in sites/*; do
    if [ -d "$dir" ] && [ -f "$dir/site_config.json" ]; then
        CURRENT_SITES+=("$(basename "$dir")")
    fi
done

# Get drop toggle from instance.json (default false)
DROP_ABANDONED_SITES=$(json_get "$INSTANCE_JSON_SOURCE" '.drop_abandoned_sites' 'false')

# Drop sites not in instance.json (only if enabled)
if [[ "$DROP_ABANDONED_SITES" == "true" ]]; then
    for site in "${CURRENT_SITES[@]}"; do
        if [[ ! " ${INSTANCE_SITES[*]} " =~ " $site " ]]; then
            echo "[SITE] Dropping unlisted site: $site"
            bench drop-site "$site" --force --root-password "$DB_ROOT_PASSWORD" || echo "[WARN] Failed to drop $site"
        fi
    done
else
    echo "[SITE] Skipping drop of abandoned sites (drop_abandoned_sites=false)"
fi

# Ensure and align each site
for site in "${INSTANCE_SITES[@]}"; do
  echo "[SITE] Processing: $site"

  # Create if missing
  if [ ! -d "sites/$site" ]; then
    echo "[SITE] Creating: $site"
    bench new-site "$site" \
      --db-root-username "$DB_ROOT_USERNAME" \
      --db-root-password "$DB_ROOT_PASSWORD" \
      --admin-password admin
  fi

  # Ensure apps exist in bench/apps (skip frappe)
  for app in ${SITE_APPS[$site]}; do
    if [ "$app" = "frappe" ]; then continue; fi
    if [ ! -d "apps/$app" ]; then
      echo "[APP] Fetching missing app: $app (branch: $FRAPPE_BRANCH)"
      bench get-app "$app" --branch "$FRAPPE_BRANCH" || \
        echo "[WARN] Failed to fetch $app"
    fi
  done

  # Align site apps
  echo "[APPS] Aligning apps for site: $site"
  current_apps=$(bench --site "$site" list-apps | awk '{print $1}' | sed '/^$/d')
  expected_apps=$(printf '%s\n' ${SITE_APPS[$site]} | sort -u)
  current_sorted=$(printf '%s\n' $current_apps | sort -u)

  # Install missing apps
  missing=$(comm -23 <(echo "$expected_apps") <(echo "$current_sorted"))
  if [ -n "$missing" ]; then
    echo "[APPS] Installing missing apps: $(echo "$missing" | xargs)"
    for app in $missing; do
      [ "$app" = "frappe" ] && continue
      bench --site "$site" install-app "$app" || echo "[WARN] Failed to install $app"
    done
  fi

  # Uninstall extras
  extras=$(comm -13 <(echo "$expected_apps") <(echo "$current_sorted") | grep -vx "frappe" || true)
  if [ -n "$extras" ]; then
    echo "[APPS] Uninstalling extra apps: $(echo "$extras" | xargs)"
    for app in $extras; do
      bench --site "$site" uninstall-app "$app" -y || echo "[WARN] Failed to uninstall $app"
    done
  fi

  # Migrate
  echo "[MIGRATE] bench --site $site migrate"
  bench --site "$site" migrate
done

# Set last site as current
if [ ${#INSTANCE_SITES[@]} -gt 0 ]; then
  bench use "${INSTANCE_SITES[-1]}"
fi