#!/usr/bin/env bash
# =============================================================================
# zitadel-init-to-rds.sh
#
# Runs Zitadel start-from-init directly against the production RDS using
# credentials from .env.production.  No local postgres needed — Zitadel
# applies all DDL migrations and seeds the first instance straight into RDS.
#
# Requirements: docker
#
# Usage:
#   ./scripts/zitadel-init-to-rds.sh
#
# Optional overrides (env vars):
#   WAIT_TIMEOUT   seconds to wait for healthy (default: 480)
#   ZITADEL_VERSION image tag override (default: from .env.production)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.production"
CONTAINER_NAME="zitadel-init-migrate"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-480}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[$(date +%H:%M:%S)] $*"; }
info() { log "INFO  $*"; }
ok()   { log "OK    $*"; }
err()  { log "ERROR $*" >&2; }
hr()   { echo "──────────────────────────────────────────────────────────────"; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  err "docker not found — install Docker and retry."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  err ".env.production not found at $ENV_FILE"
  exit 1
fi

# Extract vars from .env.production safely (handles unquoted spaces in values)
_env() { grep -m1 "^${1}=" "$ENV_FILE" | cut -d'=' -f2-; }

POSTGRES_HOST=$(_env POSTGRES_HOST)
POSTGRES_PORT=${POSTGRES_PORT:-$(_env POSTGRES_PORT)}
POSTGRES_USER=$(_env POSTGRES_USER)
POSTGRES_PASSWORD=$(_env POSTGRES_PASSWORD)
POSTGRES_DB=$(_env POSTGRES_DB)
ZITADEL_VERSION=$(_env ZITADEL_VERSION)
ZITADEL_MASTERKEY=$(_env ZITADEL_MASTERKEY)
ZITADEL_DB_SSL_MODE=$(_env ZITADEL_DB_SSL_MODE)
ZITADEL_ADMIN_USER=$(_env ZITADEL_ADMIN_USER)
ZITADEL_ADMIN_PASSWORD=$(_env ZITADEL_ADMIN_PASSWORD)
ZITADEL_ORG_NAME=$(_env ZITADEL_ORG_NAME)
ZITADEL_INSTANCE_NAME=$(_env ZITADEL_INSTANCE_NAME)
ZITADEL_MACHINE_USERNAME=$(_env ZITADEL_MACHINE_USERNAME)
ZITADEL_MACHINE_NAME=$(_env ZITADEL_MACHINE_NAME)
ZITADEL_MACHINE_PAT_EXPIRY=$(_env ZITADEL_MACHINE_PAT_EXPIRY)
ZITADEL_LOG_LEVEL=${ZITADEL_LOG_LEVEL:-$(_env ZITADEL_LOG_LEVEL)}

# Resolve image tag
ZITADEL_IMG="ghcr.io/zitadel/zitadel:${ZITADEL_VERSION:-v4.12.1}"

hr
info "Zitadel init-from-start → production RDS"
info "  Image     : $ZITADEL_IMG"
info "  RDS host  : ${POSTGRES_HOST}:${POSTGRES_PORT:-5432}"
info "  Database  : ${POSTGRES_DB}"
info "  DB user   : ${POSTGRES_USER}"
info "  SSL mode  : ${ZITADEL_DB_SSL_MODE:-require}"
info "  External  : https://zitadel.orbispm.in"
info "  Org       : ${ZITADEL_ORG_NAME:-OrbisPM}"
info "  Admin     : ${ZITADEL_ADMIN_USER:-admin@orbispm.local}"
hr
echo ""

# ── Clean up any leftover container from a previous run ───────────────────────
if docker inspect "$CONTAINER_NAME" &>/dev/null; then
  info "Removing leftover container: $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME"
fi

# ── Start Zitadel — it connects to RDS and runs all migrations ────────────────
info "Starting Zitadel container (start-from-init) ..."
info "Redis caching disabled for this one-shot migration run."
echo ""

docker run -d \
  --name "$CONTAINER_NAME" \
  --user 0 \
  \
  -e ZITADEL_PORT=8080 \
  -e ZITADEL_TLS_ENABLED=false \
  -e ZITADEL_EXTERNALDOMAIN=zitadel.orbispm.in \
  -e ZITADEL_EXTERNALPORT=443 \
  -e ZITADEL_EXTERNALSECURE=true \
  \
  -e "ZITADEL_DATABASE_POSTGRES_HOST=${POSTGRES_HOST}" \
  -e "ZITADEL_DATABASE_POSTGRES_PORT=${POSTGRES_PORT:-5432}" \
  -e "ZITADEL_DATABASE_POSTGRES_DATABASE=${POSTGRES_DB}" \
  -e "ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME=${POSTGRES_USER}" \
  -e "ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD=${POSTGRES_PASSWORD}" \
  -e "ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE=${ZITADEL_DB_SSL_MODE:-require}" \
  -e "ZITADEL_DATABASE_POSTGRES_USER_USERNAME=${POSTGRES_USER}" \
  -e "ZITADEL_DATABASE_POSTGRES_USER_PASSWORD=${POSTGRES_PASSWORD}" \
  -e "ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE=${ZITADEL_DB_SSL_MODE:-require}" \
  -e ZITADEL_DATABASE_POSTGRES_MAXOPENCONNS=10 \
  -e ZITADEL_DATABASE_POSTGRES_MAXIDLECONNS=5 \
  -e ZITADEL_DATABASE_POSTGRES_CONNMAXLIFETIME=1h \
  -e ZITADEL_DATABASE_POSTGRES_CONNMAXIDLETIME=5m \
  -e ZITADEL_DATABASE_POSTGRES_DIALER_TIMEOUT=30s \
  \
  -e ZITADEL_CACHES_CONNECTORS_REDIS_ENABLED=false \
  \
  -e "ZITADEL_FIRSTINSTANCE_ORG_NAME=${ZITADEL_ORG_NAME:-OrbisPM}" \
  -e "ZITADEL_FIRSTINSTANCE_INSTANCENAME=${ZITADEL_INSTANCE_NAME:-OrbisPM}" \
  -e ZITADEL_FIRSTINSTANCE_DEFAULTLANGUAGE=en \
  -e "ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME=${ZITADEL_ADMIN_USER:-admin@orbispm.local}" \
  -e "ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD=${ZITADEL_ADMIN_PASSWORD:-Admin123!}" \
  -e ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORDCHANGEREQUIRED=false \
  -e "ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_USERNAME=${ZITADEL_MACHINE_USERNAME:-backend-service}" \
  -e "ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_NAME=${ZITADEL_MACHINE_NAME:-OrbisPM Backend}" \
  -e "ZITADEL_FIRSTINSTANCE_ORG_MACHINE_PAT_EXPIRATIONDATE=${ZITADEL_MACHINE_PAT_EXPIRY:-2030-01-01T00:00:00Z}" \
  \
  -e ZITADEL_EVENTSTORE_PUSHTIMEOUT=600s \
  -e ZITADEL_EVENTSTORE_MAXRETRIES=15 \
  -e "ZITADEL_LOG_LEVEL=${ZITADEL_LOG_LEVEL:-info}" \
  -e ZITADEL_LOGSTORE_ACCESS_STDOUT_ENABLED=false \
  -e ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_REQUIRED=false \
  -e ZITADEL_SYSTEMDEFAULTS_MULTIFACTORS_OTP_ISSUER=OrbisPM \
  \
  "$ZITADEL_IMG" \
  start-from-init --masterkey "${ZITADEL_MASTERKEY:-MasterkeyNeedsToHave32Characters}"

# ── Wait for "setup completed" in container logs ──────────────────────────────
# start-from-init is a persistent server: it migrates then stays running.
# We detect completion by watching for "setup completed" in the log stream
# rather than relying on the Docker healthcheck start_period.
info "Waiting for Zitadel to finish migrations + init (can take 3-6 min on RDS)..."
echo ""

elapsed=0
while true; do
  # Check container is still alive
  cstate=$(docker inspect --format='{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "gone")

  if [ "$cstate" = "gone" ] || [ "$cstate" = "exited" ] || [ "$cstate" = "dead" ]; then
    exit_code=$(docker inspect --format='{{.State.ExitCode}}' "$CONTAINER_NAME" 2>/dev/null || echo "?")
    err "Container exited unexpectedly (state=$cstate, exit=$exit_code)"
    err "--- Last 60 log lines ---"
    docker logs --tail=60 "$CONTAINER_NAME" >&2 || true
    exit 1
  fi

  # Success signal: "setup completed" appears after all migrations are done
  if docker logs "$CONTAINER_NAME" 2>&1 | grep -q '"setup completed"'; then
    ok "Migration complete after ${elapsed}s — 'setup completed' confirmed in logs."
    break
  fi

  if [ "$elapsed" -ge "$WAIT_TIMEOUT" ]; then
    err "Timed out after ${WAIT_TIMEOUT}s — last 80 lines:"
    docker logs --tail=80 "$CONTAINER_NAME" >&2
    exit 1
  fi

  latest=$(docker logs --tail=1 "$CONTAINER_NAME" 2>&1 | grep -oP 'msg="[^"]+"' | head -1 || true)
  echo "    [${elapsed}s] $latest"
  sleep 10
  elapsed=$((elapsed + 10))
done

echo ""

# ── Extract the machine user PAT from logs ────────────────────────────────────
info "Extracting machine-user PAT from container logs ..."
PAT=$(docker logs "$CONTAINER_NAME" 2>&1 \
  | grep -oP '(?<="pat":")[^"]+' \
  | head -1 || true)

echo ""
hr
if [ -n "$PAT" ]; then
  ok "Machine user PAT (copy this into .env.production → ZITADEL_SERVICE_TOKEN):"
  echo ""
  echo "  ZITADEL_SERVICE_TOKEN=$PAT"
else
  info "PAT not found in logs (it may have been set previously or logged differently)."
  info "Check logs manually: docker logs $CONTAINER_NAME 2>&1 | grep -i pat"
fi
hr
echo ""

# ── Stop the migration container ──────────────────────────────────────────────
info "Migration complete. Stopping migration container ..."
docker stop "$CONTAINER_NAME" >/dev/null
docker rm   "$CONTAINER_NAME" >/dev/null
ok "Container removed."

echo ""
hr
ok "Done — Zitadel schema + seed data applied to RDS."
hr
echo ""
echo "  Next steps:"
echo "  1. If the PAT above is new, update .env.production:"
echo "       ZITADEL_SERVICE_TOKEN=<token above>"
echo "  2. Ensure ZITADEL_CLIENT_ID is set (create the app in Zitadel console"
echo "       at https://zitadel.orbispm.in after the full stack is up)."
echo "  3. Start the full production stack:"
echo "       docker compose --env-file .env.production up -d"
echo ""
