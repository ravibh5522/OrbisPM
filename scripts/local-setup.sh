#!/usr/bin/env bash
# ============================================================
# OrbisPM — Full Local Stack Setup
# ============================================================
# Run once after cloning or when remote infra is unavailable.
# Sets up postgres, redis, minio, zitadel locally and
# auto-configures .env with the generated tokens.
#
# Usage:  bash scripts/local-setup.sh
# ============================================================
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  OrbisPM Local Stack Setup"
echo "══════════════════════════════════════════════════════"

# 1. Stop everything clean
echo ""
echo "▶ Step 1: Stopping existing containers..."
docker compose down --remove-orphans 2>/dev/null || true

# 2. Start infrastructure first (postgres, redis, minio)
echo ""
echo "▶ Step 2: Starting postgres, redis, minio..."
docker compose up -d postgres redis minio
echo "  Waiting for postgres to be healthy..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres -d orbispmdev &>/dev/null; then
    echo "  postgres ready!"
    break
  fi
  sleep 2
done

# 3. Create orbispmdev database if it doesn't exist
echo ""
echo "▶ Step 3: Ensuring orbispmdev database exists..."
docker compose exec -T postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='orbispmdev'" | grep -q 1 \
  || docker compose exec -T postgres createdb -U postgres orbispmdev
echo "  Database ready."

# 4. Create MinIO bucket
echo ""
echo "▶ Step 4: Creating MinIO bucket 'orbispm'..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:9000/minio/health/live &>/dev/null; then
    break
  fi
  sleep 2
done
# Use mc via docker to create bucket
docker run --rm --network orbispm_default \
  minio/mc:latest \
  sh -c "mc alias set local http://minio:9000 minioadmin minioadmin123 && \
         mc mb --ignore-existing local/orbispm && \
         mc anonymous set download local/orbispm" 2>&1 | tail -5
echo "  MinIO bucket ready."

# 5. Start Zitadel
echo ""
echo "▶ Step 5: Starting Zitadel (this takes 1-2 minutes on first run)..."
docker compose up -d zitadel
echo "  Waiting for Zitadel to be healthy (up to 3 minutes)..."
for i in $(seq 1 36); do
  if curl -sf http://localhost:8081/debug/healthz 2>/dev/null | grep -q '"ok"'; then
    echo "  Zitadel is ready!"
    break
  fi
  printf "."
  sleep 5
done
echo ""

# 6. Run Zitadel setup to get PAT + client_id
echo ""
echo "▶ Step 6: Running Zitadel setup (creates service token and OIDC app)..."
sleep 5  # Extra delay for projections to settle
ZITADEL_URL=http://localhost:8081 python3 scripts/zitadel-setup.py

# 7. Start all remaining services
echo ""
echo "▶ Step 7: Building and starting all services..."
docker compose up -d --build

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Local Stack Running!"
echo "══════════════════════════════════════════════════════"
echo ""
echo "  Frontend:     http://localhost:3000"
echo "  API (Kong):   http://localhost:8000"
echo "  Zitadel:      http://localhost:8081"
echo "  MinIO API:    http://localhost:9000"
echo "  MinIO UI:     http://localhost:9001  (minioadmin / minioadmin123)"
echo "  Mailpit:      http://localhost:8025"
echo "  Meilisearch:  http://localhost:7700"
echo "  NocoDB:       http://localhost:8082"
echo ""
echo "  Login:  admin@orbispm.local / Admin123!"
echo ""
echo "  Note: Rebuild frontend after Zitadel tokens are updated:"
echo "        docker compose up -d --build frontend"
echo ""
