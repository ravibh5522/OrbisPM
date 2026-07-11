#!/usr/bin/env bash
# ============================================================
# OrbisPM — one-shot local launcher
# Boots the entire stack (postgres, redis, minio, zitadel,
# mailpit, meilisearch, kong, api, messaging, email, frontend)
# then prints every service URL in the terminal.
#
# Usage:
#   ./start.sh                 # start local stack (build if needed)
#   ./start.sh --build         # force rebuild of all images
#   ./start.sh --monitoring    # also start Grafana/Prometheus stack
#   ./start.sh --logs          # tail logs after startup
#   ./start.sh --prod          # use .env.production + prod profile
#   ./start.sh --down          # stop the stack
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# ── Flags ───────────────────────────────────────────────────
ENV_FILE=".env.local"
PROFILE="local"
BUILD=""
WITH_MONITORING=false
TAIL_LOGS=false
DO_DOWN=false
for arg in "$@"; do
  case $arg in
    --prod)       ENV_FILE=".env.production"; PROFILE="prod" ;;
    --build)      BUILD="--build" ;;
    --monitoring) WITH_MONITORING=true ;;
    --logs)       TAIL_LOGS=true ;;
    --down)       DO_DOWN=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found in $PROJECT_DIR" >&2
  exit 1
fi

# ── Colors ──────────────────────────────────────────────────
if [[ -t 1 ]]; then
  B=$'\e[1m'; G=$'\e[32m'; C=$'\e[36m'; Y=$'\e[33m'; D=$'\e[2m'; R=$'\e[0m'
else
  B=""; G=""; C=""; Y=""; D=""; R=""
fi

DC=(docker compose --env-file "$ENV_FILE" --profile "$PROFILE")

# ── Down mode ───────────────────────────────────────────────
if [[ "$DO_DOWN" == true ]]; then
  echo "${Y}Stopping OrbisPM ($PROFILE)...${R}"
  "${DC[@]}" down
  $WITH_MONITORING && docker compose --env-file "$ENV_FILE" -f monitoring/docker-compose.yml down || true
  echo "${G}Stopped.${R}"
  exit 0
fi

# ── Load port values (defaults mirror docker-compose.yaml) ──
get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }
FRONTEND_PORT="$(get FRONTEND_PORT)";           FRONTEND_PORT="${FRONTEND_PORT:-3000}"
KONG_PROXY_PORT="$(get KONG_PROXY_PORT)";        KONG_PROXY_PORT="${KONG_PROXY_PORT:-8000}"
KONG_SSL_PORT="$(get KONG_SSL_PORT)";            KONG_SSL_PORT="${KONG_SSL_PORT:-8443}"
API_PORT="$(get API_PORT)";                      API_PORT="${API_PORT:-8080}"
MSG_PORT="$(get MSG_PORT)";                      MSG_PORT="${MSG_PORT:-8082}"
ZITADEL_PORT="$(get ZITADEL_EXTERNAL_PORT)";     ZITADEL_PORT="${ZITADEL_PORT:-8081}"
MINIO_API_PORT="$(get MINIO_API_PORT)";          MINIO_API_PORT="${MINIO_API_PORT:-9000}"
MINIO_CONSOLE_PORT="$(get MINIO_CONSOLE_PORT)";  MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9001}"
POSTGRES_PORT="$(get POSTGRES_PORT)";            POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="$(get REDIS_PORT)";                  REDIS_PORT="${REDIS_PORT:-6379}"
GRAFANA_PORT="$(get GRAFANA_PORT)";              GRAFANA_PORT="${GRAFANA_PORT:-3003}"

echo ""
echo "${B}=== OrbisPM launcher ($PROFILE) ===${R}"

# ── Start ───────────────────────────────────────────────────
echo "${C}▶ Bringing up the stack...${R}"
"${DC[@]}" up -d $BUILD

if [[ "$WITH_MONITORING" == true ]]; then
  echo "${C}▶ Starting monitoring stack...${R}"
  docker compose --env-file "$ENV_FILE" -f monitoring/docker-compose.yml up -d
fi

# ── Wait for Kong proxy to answer ───────────────────────────
echo -n "${C}▶ Waiting for Kong gateway${R}"
for _ in $(seq 1 40); do
  if curl -sf -o /dev/null "http://localhost:${KONG_PROXY_PORT}" 2>/dev/null \
     || curl -s -o /dev/null "http://localhost:${KONG_PROXY_PORT}"; then
    break
  fi
  echo -n "."; sleep 2
done
echo " ${G}ok${R}"

# ── Status table ────────────────────────────────────────────
echo ""
echo "${B}Containers:${R}"
"${DC[@]}" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# ── URLs ────────────────────────────────────────────────────
link() { printf "  %-22s ${C}%s${R}\n" "$1" "$2"; }
echo ""
echo "${B}${G}Service URLs${R}"
echo "${D}  ─────────────────────────────────────────────${R}"
link "Frontend"            "http://localhost:${FRONTEND_PORT}"
link "Kong API Gateway"    "http://localhost:${KONG_PROXY_PORT}"
link "Kong (SSL)"          "https://localhost:${KONG_SSL_PORT}"
link "Backend API"         "http://localhost:${KONG_PROXY_PORT}/api   ${D}(→ api:${API_PORT})${R}"
link "Chat / Messaging"    "http://localhost:${KONG_PROXY_PORT}/api/v1/chat   ${D}(→ msg:${MSG_PORT})${R}"
link "WebSocket (chat)"    "ws://localhost:${KONG_PROXY_PORT}/ws/chat"
link "Mailpit (email UI)"  "http://localhost:${KONG_PROXY_PORT}/mail/"
link "Zitadel (auth)"      "http://localhost:${ZITADEL_PORT}"
link "MinIO S3 API"        "http://localhost:${MINIO_API_PORT}"
link "MinIO Console"       "http://localhost:${MINIO_CONSOLE_PORT}"
link "Postgres"            "postgres://localhost:${POSTGRES_PORT}"
link "Redis"               "redis://localhost:${REDIS_PORT}"
$WITH_MONITORING && link "Grafana" "http://localhost:${GRAFANA_PORT}"
echo ""
echo "${D}  Logs:  ./start.sh --logs      Stop:  ./start.sh --down${R}"
echo ""

# ── Optional log tail ───────────────────────────────────────
if [[ "$TAIL_LOGS" == true ]]; then
  echo "${C}▶ Tailing logs (Ctrl-C to exit)...${R}"
  "${DC[@]}" logs -f
fi
