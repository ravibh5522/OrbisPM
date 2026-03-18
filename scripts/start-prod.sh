#!/usr/bin/env bash
# Production startup / redeploy script for OrbisPM
# Usage: ./scripts/start-prod.sh [--skip-pull] [--skip-migrate]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

ENV_FILE=".env.production"
COMPOSE_PROFILE="prod"
GIT_BRANCH="ravi2"

SKIP_PULL=false
SKIP_MIGRATE=false
for arg in "$@"; do
  case $arg in
    --skip-pull)    SKIP_PULL=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found in $PROJECT_DIR" >&2
  exit 1
fi

echo "=============================="
echo " OrbisPM Production Deploy"
echo "=============================="
date

# ── 1. Pull latest code ────────────────────────────────────────────────────────
if [[ "$SKIP_PULL" == false ]]; then
  echo ""
  echo "[1/4] Pulling latest code from origin/$GIT_BRANCH ..."
  git pull origin "$GIT_BRANCH"
else
  echo "[1/4] Skipping git pull (--skip-pull)"
fi

# ── 2. Build & start containers ───────────────────────────────────────────────
echo ""
echo "[2/4] Building and starting containers ..."
docker compose --env-file "$ENV_FILE" --profile "$COMPOSE_PROFILE" up --build -d

# ── 3. Wait for API container to be healthy ───────────────────────────────────
echo ""
echo "[3/4] Waiting for API container to be healthy ..."
RETRIES=30
until docker compose --env-file "$ENV_FILE" ps api | grep -q "healthy" || [[ $RETRIES -eq 0 ]]; do
  echo "  ... waiting ($RETRIES retries left)"
  sleep 3
  RETRIES=$((RETRIES - 1))
done

if [[ $RETRIES -eq 0 ]]; then
  echo "WARNING: API container did not become healthy in time — continuing anyway"
fi

# ── 4. Run DB migrations ───────────────────────────────────────────────────────
if [[ "$SKIP_MIGRATE" == false ]]; then
  echo ""
  echo "[4/4] Running database migrations ..."
  docker compose --env-file "$ENV_FILE" run --rm migrate up
else
  echo "[4/4] Skipping migrations (--skip-migrate)"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "=============================="
echo " Deploy complete!"
echo "=============================="
docker compose --env-file "$ENV_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "Service URLs:"
echo "  Frontend  : https://orbispm.live"
echo "  API (Kong): https://api.orbispm.in"
echo "  Zitadel   : https://zitadel.orbispm.in"
echo "  MinIO API : https://minioapi.orbispm.in"
echo "  MinIO UI  : https://minioconsol.orbispm.in"
