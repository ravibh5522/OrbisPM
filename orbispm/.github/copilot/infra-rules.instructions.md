---
applyTo: "docker-compose*.yml,Dockerfile,k8s/**,Makefile"
---

# Infrastructure & Docker Rules

## Docker Compose (Development)

### Service Dependencies
- API depends on: postgres, redis, gotrue, meilisearch, minio
- WebSocket server depends on: redis, gotrue
- Worker depends on: postgres, redis, meilisearch, minio
- Frontend depends on: API (for SSR data fetching)
- MCP server depends on: API (calls internal endpoints)

### Health Checks
Every service MUST have a health check:
```yaml
healthcheck:
  test: ["CMD", "pg_isready", "-U", "orbispm"]
  interval: 10s
  timeout: 5s
  retries: 5
```

### Volumes
- Postgres data: named volume `orbispm-pgdata`
- Redis data: named volume `orbispm-redisdata`
- MinIO data: named volume `orbispm-miniodata`
- Meilisearch data: named volume `orbispm-meilidata`

### Networks
- Single network: `orbispm-network` (bridge)

## Dockerfile (Go Services)

### Multi-Stage Build
```dockerfile
# Build stage
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/api ./cmd/api

# Runtime stage
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /bin/api /bin/api
USER 1000:1000
ENTRYPOINT ["/bin/api"]
```

### Rules
- ALWAYS use multi-stage builds (build → runtime)
- ALWAYS run as non-root user (USER 1000:1000)
- ALWAYS use specific image tags (NOT `latest`)
- ALWAYS copy only the compiled binary + necessary files
- NEVER include source code in production images
- NEVER store secrets in Dockerfiles or images

## Makefile Targets
```makefile
# Required targets:
make dev          # docker compose up --build
make test         # run all tests
make migrate-up   # run database migrations
make migrate-down # rollback last migration
make sqlc         # regenerate sqlc code
make lint         # run linters (golangci-lint + eslint)
make build        # build all Docker images
```

## Kubernetes
- Use Kustomize (base + overlays for staging/prod)
- Never hardcode secrets — use K8s Secrets or external secrets operator
- HPA on api and ws deployments (min 2, max 10 replicas)
- PVC for stateful services (postgres, redis, minio, meilisearch)
- Readiness probes on all deployments (`/ready` endpoint)
- Liveness probes on all deployments (`/health` endpoint)
