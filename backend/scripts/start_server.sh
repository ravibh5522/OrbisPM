#!/bin/bash
# Start the backend API server for local development.
# Loads configuration from the project root .env file.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load .env if present (don't override existing env vars)
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi

cd "$SCRIPT_DIR/.." || exit 1

# For local dev, override hosts to localhost (containers use service names)
export DATABASE_URL="${DATABASE_URL:-postgres://${POSTGRES_USER:-orbispm}:${POSTGRES_PASSWORD:-orbispm}@localhost:${POSTGRES_MAPPED_PORT:-5432}/${POSTGRES_DB:-orbispm}?sslmode=disable}"
export REDIS_URL="${REDIS_URL:-redis://localhost:${REDIS_MAPPED_PORT:-6380}/0}"
export JWT_SECRET="${JWT_SECRET:-orbispm-dev-jwt-secret-32chars!!}"

exec go run ./cmd/api
