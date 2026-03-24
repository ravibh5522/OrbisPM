#!/usr/bin/env bash
# ============================================================
# OrbisPM Auto-Deploy Script
# ============================================================
# Modes:
#   --daemon [INTERVAL]   Poll git every INTERVAL seconds (default: 60)
#                         and deploy only when new commits arrive.
#   --once                Pull, build, restart once and exit.
#   --startup             Force full deploy (used on system boot).
#
# Flags (combine with any mode):
#   --skip-migrate        Skip database migrations.
#
# Examples:
#   ./scripts/auto-deploy.sh --once
#   ./scripts/auto-deploy.sh --daemon 120
#   ./scripts/auto-deploy.sh --startup
#
# Systemd setup:
#   sudo cp scripts/orbispm-autodeploy.service /etc/systemd/system/
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now orbispm-autodeploy
# ============================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.production"
COMPOSE_PROFILE="prod"
GIT_BRANCH="ravi2"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/deploy.log"
LOCK_FILE="/tmp/orbispm-deploy.lock"
MAX_LOG_LINES=5000

# ── Parse args ────────────────────────────────────────────────────────────────
MODE="once"
POLL_INTERVAL=60
FORCE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --daemon)
      MODE="daemon"
      if [[ $# -gt 1 && "$2" =~ ^[0-9]+$ ]]; then
        POLL_INTERVAL=$2
        shift
      fi
      ;;
    --once)    MODE="once" ;;
    --startup) MODE="once"; FORCE=true ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

# ── Helpers ───────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
  # Trim log if too large
  if [[ $(wc -l < "$LOG_FILE") -gt $MAX_LOG_LINES ]]; then
    tail -n $((MAX_LOG_LINES / 2)) "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
  fi
}

log_section() {
  log "──────────────────────────────────────"
  log " $*"
  log "──────────────────────────────────────"
}

acquire_lock() {
  if [[ -f "$LOCK_FILE" ]]; then
    local pid
    pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      log "Deploy already in progress (PID $pid), skipping."
      return 1
    fi
    log "Stale lock found, removing."
    rm -f "$LOCK_FILE"
  fi
  echo $$ > "$LOCK_FILE"
  return 0
}

release_lock() {
  rm -f "$LOCK_FILE"
}

has_new_commits() {
  cd "$PROJECT_DIR"
  git fetch origin "$GIT_BRANCH" --quiet 2>&1 | tee -a "$LOG_FILE"
  local local_sha remote_sha
  local_sha=$(git rev-parse HEAD)
  remote_sha=$(git rev-parse "origin/$GIT_BRANCH")
  if [[ "$local_sha" != "$remote_sha" ]]; then
    log "New commits detected: $local_sha → $remote_sha"
    return 0
  fi
  return 1
}

# ── Core deploy ───────────────────────────────────────────────────────────────
deploy() {
  cd "$PROJECT_DIR"

  if ! acquire_lock; then
    return 0
  fi
  trap 'release_lock' EXIT

  log_section "OrbisPM Deploy Started"

  # 1. Pull
  log "[1/4] Pulling latest from origin/$GIT_BRANCH ..."
  git pull origin "$GIT_BRANCH" 2>&1 | tee -a "$LOG_FILE"

  # 2. Build & start
  log "[2/4] Building and starting containers ..."
  docker compose --env-file "$ENV_FILE" --profile "$COMPOSE_PROFILE" up --build -d 2>&1 | tee -a "$LOG_FILE"

  # 3. Wait for API to be running (no healthcheck on api container — check state)
  log "[3/4] Waiting for API to be running ..."
  local retries=30
  until docker inspect orbispm-api-1 --format '{{.State.Status}}' 2>/dev/null | grep -q "running" || [[ $retries -eq 0 ]]; do
    log "  ... waiting ($retries left)"
    sleep 5
    retries=$((retries - 1))
  done
  # Extra: make sure it hasn't immediately crashed (restarting = bad)
  sleep 3
  local api_state
  api_state=$(docker inspect orbispm-api-1 --format '{{.State.Status}}' 2>/dev/null || echo "unknown")
  if [[ "$api_state" == "running" ]]; then
    log "  API is running!"
  else
    log "WARNING: API state is '$api_state' — check logs: docker logs orbispm-api-1"
  fi

  # 4. Migrations — handled automatically by the API container on startup
  log "[4/4] Migrations run automatically inside the API container on boot."

  # Summary
  log_section "Deploy Complete"
  docker compose --env-file "$ENV_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>&1 | tee -a "$LOG_FILE"
  log "  Frontend  : https://orbispm.live"
  log "  API       : https://api.orbispm.in"
  log "  Zitadel   : https://zitadel.orbispm.in"

  release_lock
  trap - EXIT
}

# ── Main ──────────────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

cd "$PROJECT_DIR"

if [[ "$MODE" == "daemon" ]]; then
  log "Auto-deploy daemon started (polling every ${POLL_INTERVAL}s, branch: $GIT_BRANCH)"
  # Force deploy once on daemon start
  deploy
  while true; do
    sleep "$POLL_INTERVAL"
    if has_new_commits; then
      deploy
    else
      log "No new commits on origin/$GIT_BRANCH — skipping."
    fi
  done

elif [[ "$MODE" == "once" ]]; then
  if [[ "$FORCE" == true ]]; then
    log "Startup deploy — forcing full rebuild."
    deploy
  else
    log "One-shot deploy triggered."
    deploy
  fi
fi
