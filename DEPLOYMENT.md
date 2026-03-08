# OrbisPM Deployment Guide

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start (Development)](#quick-start-development)
- [Service Layout](#service-layout)
- [Configuration Reference](#configuration-reference)
- [Using External PostgreSQL (e.g. Postgres 18)](#using-external-postgresql)
- [Using External Redis / MinIO / Zitadel](#using-other-external-services)
- [Horizontal Scaling](#horizontal-scaling)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────────────────────────────────────────┐
│  Frontend    │     │  Docker Compose                                  │
│  (Next.js)   │────►│                                                  │
│  :3000       │     │  ┌─────────┐    ┌──────────┐   ┌────────────┐  │
└─────────────┘     │  │  Kong    │───►│  API x N  │──►│ PostgreSQL │  │
                     │  │  :8000   │    │  :8080    │   │  :5432     │  │
                     │  └────┬────┘    └─────┬────┘   └────────────┘  │
                     │       │               │                         │
                     │       │         ┌─────┴──────┐                  │
                     │       │         │  Redis      │                  │
                     │  ┌────┴────┐    │  :6379      │                  │
                     │  │ Zitadel │    └────────────┘                  │
                     │  │ :8081   │                                     │
                     │  └─────────┘    ┌────────────┐  ┌────────────┐  │
                     │                 │  MinIO      │  │Meilisearch │  │
                     │                 │  :9000      │  │  :7700     │  │
                     │                 └────────────┘  └────────────┘  │
                     └──────────────────────────────────────────────────┘
```

### Compose File Structure

| File | Services | Purpose |
|------|----------|---------|
| `docker-compose.yml` | api, kong, meilisearch, mailpit, nocodb | Core application services |
| `docker-compose.postgres.yml` | postgres | Database (removable for external DB) |
| `docker-compose.redis.yml` | redis | Cache & pub/sub (removable) |
| `docker-compose.minio.yml` | minio | Object storage (removable) |
| `docker-compose.zitadel.yml` | zitadel | Identity provider (removable) |

All files are merged via `include:` in `docker-compose.yml`. Remove any include line to use an external service instead.

---

## Quick Start (Development)

### Prerequisites

- Docker Engine 24+ with Compose v2.20+
- Go 1.24+ (for local backend development)
- Node.js 20+ (for frontend)
- Python 3.8+ (for Zitadel setup script)

### Steps

```bash
# 1. Clone and enter the project
cd orbispm

# 2. Create your .env from the example
cp .env.example .env

# 3. Start all services
docker compose up -d

# 4. Wait for Zitadel to be healthy (~30-60s)
docker compose logs -f zitadel  # Wait until you see "server is listening"

# 5. Run the Zitadel setup script (creates OIDC app + service token)
python3 scripts/zitadel-setup.py

# 6. Restart the API to pick up the new Zitadel tokens
docker compose restart api

# 7. Start the frontend (separate terminal)
cd frontend
npm install
npm run dev

# 8. Open http://localhost:3000
```

### Verify Everything Works

```bash
# Check all services are healthy
docker compose ps

# Test API through Kong
curl http://localhost:8000/api/v1/orgs
# Expected: {"message":"missing authorization header"}

# Test Zitadel
curl http://localhost:8081/debug/healthz
# Expected: ok

# Test MinIO
curl http://localhost:9000/minio/health/live
# Expected: empty 200

# Test Meilisearch
curl http://localhost:7700/health
# Expected: {"status":"available"}
```

---

## Service Layout

| Service | Internal Port | Default Host Port | Purpose |
|---------|--------------|-------------------|---------|
| PostgreSQL | 5432 | 5432 | Primary database |
| Redis | 6379 | 6380 | Cache, pub/sub, background jobs |
| Zitadel | 8080 | 8081 | Identity provider (OIDC) |
| MinIO | 9000/9001 | 9000/9001 | Object storage (API/Console) |
| Meilisearch | 7700 | 7700 | Full-text search |
| Mailpit | 1025/8025 | 1025/8025 | Dev SMTP/UI |
| API (Go) | 8080 | — (via Kong) | Backend API |
| Kong | 8000/8443 | 8000/8443 | API Gateway |
| NocoDB | 8080 | 8082 | Database UI |

---

## Configuration Reference

All configuration lives in a single `.env` file. See `.env.example` for all available variables with documentation.

### Key Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `postgres` | PostgreSQL hostname |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_USER` | `orbispm` | Database username |
| `POSTGRES_PASSWORD` | `orbispm` | Database password |
| `POSTGRES_DB` | `orbispm` | Database name |
| `REDIS_HOST` | `redis` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `MINIO_HOST` | `minio` | MinIO hostname |
| `MINIO_ROOT_USER` | `minioadmin` | MinIO access key |
| `MINIO_ROOT_PASSWORD` | `minioadmin` | MinIO secret key |
| `JWT_SECRET` | (dev value) | JWT signing secret (**change in prod**) |
| `ZITADEL_MASTERKEY` | (dev value) | Zitadel master key (**change in prod**) |
| `API_REPLICAS` | `1` | Number of API instances |
| `APP_ENV` | `development` | Environment mode |

---

## Using External PostgreSQL

If you already have PostgreSQL (e.g. Postgres 18) running on your machine or a remote server, you can use it instead of the Docker container.

### Step 1: Prepare Your PostgreSQL

```sql
-- Connect to your existing PostgreSQL as superuser
CREATE DATABASE orbispm;
CREATE USER orbispm WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE orbispm TO orbispm;

-- Grant schema permissions (required for Zitadel)
\c orbispm
GRANT ALL ON SCHEMA public TO orbispm;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO orbispm;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO orbispm;
```

### Step 2: Update .env

```env
# Point to your external PostgreSQL
POSTGRES_HOST=localhost          # or your-db-host.example.com
POSTGRES_PORT=5432               # your Postgres port
POSTGRES_USER=orbispm
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=orbispm
```

> **Note**: If your PostgreSQL is on the Docker host machine, use `host.docker.internal` (macOS/Windows) or `172.17.0.1` (Linux) as `POSTGRES_HOST` so Docker containers can reach it.

### Step 3: Remove Managed PostgreSQL from Compose

Edit `docker-compose.yml` and remove the postgres include:

```yaml
include:
  # - docker-compose.postgres.yml    # ← Comment out or remove this line
  - docker-compose.redis.yml
  - docker-compose.minio.yml
  - docker-compose.zitadel.yml
```

Also remove the `depends_on: postgres` blocks from the `api` and `nocodb` services in `docker-compose.yml`:

```yaml
  api:
    # ...
    depends_on:
      # postgres:                     # ← Remove
      #   condition: service_healthy   # ← Remove
      redis:
        condition: service_healthy
```

Similarly for `nocodb` and `zitadel` (in `docker-compose.zitadel.yml`).

### Step 4: Run Migrations

```bash
cd backend
DATABASE_URL="postgres://orbispm:your-secure-password@localhost:5432/orbispm?sslmode=disable" \
  go run ./cmd/migrate -direction up
```

### Step 5: Start Services

```bash
docker compose up -d
```

### Compatibility Notes

- **PostgreSQL 14-18**: Fully compatible. OrbisPM and Zitadel use standard SQL features.
- **Connection pooling**: If using PgBouncer, set `sslmode=disable` and use transaction-level pooling.
- **Extensions**: No special extensions required. Zitadel creates its own schemas automatically.

---

## Using Other External Services

The same pattern applies to Redis, MinIO, and Zitadel.

### External Redis

```env
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
```

Remove `docker-compose.redis.yml` from includes and `depends_on: redis` from the api service.

### External MinIO / S3

```env
MINIO_HOST=s3.amazonaws.com        # or your MinIO host
MINIO_ROOT_USER=your-access-key
MINIO_ROOT_PASSWORD=your-secret-key
MINIO_BUCKET=orbispm
MINIO_USE_SSL=true
```

Remove `docker-compose.minio.yml` from includes. Update `MINIO_PUBLIC_URL` if objects are served from a CDN.

### External Zitadel

```env
ZITADEL_EXTERNAL_DOMAIN=auth.example.com
ZITADEL_MAPPED_PORT=443
ZITADEL_EXTERNAL_SECURE=true
```

Remove `docker-compose.zitadel.yml` from includes and `depends_on: zitadel` from kong.

---

## Horizontal Scaling

The API service supports horizontal scaling out of the box.

### How It Works

1. **Docker DNS round-robin**: Kong connects to `http://api:8080`. Docker's internal DNS resolves this to all API container IPs and round-robins across them.
2. **Stateless API**: Authentication uses JWT tokens (no server-side sessions). All state lives in PostgreSQL and Redis.
3. **Redis Pub/Sub**: WebSocket connections across API instances share events via Redis pub/sub channels. Each instance subscribes independently.
4. **Background jobs**: Asynq (Redis-backed) distributes background tasks across all instances automatically.

### Scale via .env

```env
API_REPLICAS=3
```

Then restart:

```bash
docker compose up -d
```

### Scale at Runtime

```bash
# Scale to 4 instances
docker compose up -d --scale api=4 --no-recreate

# Scale back down
docker compose up -d --scale api=1 --no-recreate
```

### Verify Scaling

```bash
# See all running instances
docker compose ps api

# Check logs across instances
docker compose logs api --tail 5
```

### Production Scaling Considerations

- **Database connections**: Each API instance uses a connection pool (default: 20 max). With N instances, you need PostgreSQL `max_connections >= N * 20 + overhead`.
- **Redis connections**: Each instance maintains ~5 connections (client + pub/sub + Asynq). Ensure Redis `maxclients` is sufficient.
- **Kong**: If you need more than Docker DNS round-robin, deploy Kong with a proper upstream configuration and enable active health checks.
- **WebSocket stickiness**: Not required — Redis pub/sub ensures all instances see all events.

---

## Production Deployment

### 1. Security Checklist

- [ ] Change all default passwords in `.env`:
  - `POSTGRES_PASSWORD`
  - `JWT_SECRET` (must be 32+ characters)
  - `ZITADEL_MASTERKEY` (must be exactly 32 characters)
  - `ZITADEL_ADMIN_PASSWORD`
  - `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`
  - `MEILI_MASTER_KEY`
- [ ] Set `APP_ENV=production`
- [ ] Set `ZITADEL_EXTERNAL_SECURE=true` (if behind HTTPS)
- [ ] Update `BASE_URL`, `FRONTEND_URL`, `ZITADEL_EXTERNAL_DOMAIN` to production domains
- [ ] Configure real SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`)
- [ ] Remove or disable Mailpit
- [ ] Set up TLS termination (e.g., Nginx/Caddy/Traefik in front of Kong)
- [ ] Add `REDIS_PASSWORD` if Redis is network-accessible

### 2. Production .env Example

```env
COMPOSE_PROJECT_NAME=orbispm
APP_ENV=production

BASE_URL=https://api.orbispm.com
FRONTEND_URL=https://app.orbispm.com

POSTGRES_HOST=db.internal
POSTGRES_PORT=5432
POSTGRES_USER=orbispm
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=orbispm

REDIS_HOST=redis.internal
REDIS_PORT=6379
REDIS_PASSWORD=<strong-random-password>

ZITADEL_MASTERKEY=<exactly-32-random-characters>
ZITADEL_EXTERNAL_DOMAIN=auth.orbispm.com
ZITADEL_EXTERNAL_SECURE=true
ZITADEL_ADMIN_PASSWORD=<strong-password>

MINIO_HOST=s3.internal
MINIO_ROOT_USER=<access-key>
MINIO_ROOT_PASSWORD=<secret-key>
MINIO_USE_SSL=true

JWT_SECRET=<32-character-random-secret>
API_REPLICAS=3

SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_ENABLED=true
```

### 3. Reverse Proxy (Nginx Example)

```nginx
upstream kong {
    server 127.0.0.1:8000;
}

server {
    listen 443 ssl;
    server_name api.orbispm.com;

    ssl_certificate     /etc/ssl/certs/orbispm.pem;
    ssl_certificate_key /etc/ssl/private/orbispm.key;

    location / {
        proxy_pass http://kong;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

### 4. Backup Strategy

```bash
# PostgreSQL backup
docker compose exec postgres pg_dump -U orbispm orbispm > backup.sql

# MinIO backup (using mc client)
mc alias set orbispm http://localhost:9000 minioadmin minioadmin
mc mirror orbispm/orbispm ./minio-backup/

# Redis (if persistence is critical)
docker compose exec redis redis-cli BGSAVE
```

---

## Troubleshooting

### Zitadel won't start
```bash
# Check logs
docker compose logs zitadel --tail 50

# Common issue: PostgreSQL not ready yet
# Solution: Wait and retry, or check POSTGRES_HOST is correct
```

### API can't connect to services
```bash
# Check that all services are on the same Docker network
docker network inspect orbispm_default

# Verify env vars are correct
docker compose exec api env | grep -E "DATABASE_URL|REDIS_URL"
```

### "connection refused" from local dev backend
When running the backend locally (not in Docker), use host-mapped ports:
```bash
# In your shell or .env override for local dev:
export DATABASE_URL="postgres://orbispm:orbispm@localhost:5432/orbispm?sslmode=disable"
export REDIS_URL="redis://localhost:6380/0"
```

### Port conflicts
Change mapped ports in `.env`:
```env
POSTGRES_MAPPED_PORT=15432
REDIS_MAPPED_PORT=16380
ZITADEL_MAPPED_PORT=18081
```

### Reset everything
```bash
docker compose down -v    # Stop and remove all volumes
docker compose up -d      # Start fresh
```
