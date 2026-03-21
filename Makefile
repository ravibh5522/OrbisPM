.PHONY: up up-prod down down-prod build build-prod scale logs \
        dev test test-short lint \
        migrate-up migrate-down migrate-version \
        migrate-up-prod migrate-down-prod migrate-version-prod \
        reset swagger zitadel-setup

# ── Env file selection ────────────────────────────────────────
# For make targets that use the DB directly (migrate, reset)
# override: make migrate-up ENV_FILE=.env.production
ENV_FILE ?= .env.local

ifneq (,$(wildcard $(ENV_FILE)))
    include $(ENV_FILE)
    export
endif

# ════════════════════════════════════════════════════════════
# LOCAL STACK
# Starts all services locally (postgres, redis, minio, zitadel,
# mailpit + all app services) via the "local" profile.
# ════════════════════════════════════════════════════════════

up:
	docker compose --env-file .env.local --profile local up -d

down:
	docker compose --env-file .env.local --profile local down

build:
	docker compose --env-file .env.local --profile local build

scale:
	docker compose --env-file .env.local --profile local up -d --scale api=$(API_REPLICAS)

logs:
	docker compose --env-file .env.local --profile local logs -f

# ════════════════════════════════════════════════════════════
# PRODUCTION STACK
# Uses remote DB / Redis / MinIO / Zitadel — no local profile.
# ════════════════════════════════════════════════════════════

up-prod:
	docker compose --env-file .env.production --profile prod up --build -d

down-prod:
	docker compose --env-file .env.production --profile prod down

build-prod:
	docker compose --env-file .env.production --profile prod build

scale-prod:
	docker compose --env-file .env.production --profile prod up -d --scale api=$(API_REPLICAS)

# ════════════════════════════════════════════════════════════
# DEVELOPMENT (backend runs locally, infra in Docker)
# ════════════════════════════════════════════════════════════

dev:
	cd backend && go run ./cmd/api

# ════════════════════════════════════════════════════════════
# TESTING & CODE QUALITY
# ════════════════════════════════════════════════════════════

test:
	cd backend && go test ./... -v -count=1

test-short:
	cd backend && go test ./... -short -count=1

lint:
	cd backend && golangci-lint run ./...

# ════════════════════════════════════════════════════════════
# DATABASE MIGRATIONS
# ════════════════════════════════════════════════════════════

migrate-up:
	@echo "▶ Migrating UP  → $(DATABASE_URL)"
	cd backend && go run ./cmd/migrate up

migrate-down:
	@echo "▶ Migrating DOWN → $(DATABASE_URL)"
	cd backend && go run ./cmd/migrate down

migrate-version:
	@echo "▶ Migration version → $(DATABASE_URL)"
	cd backend && go run ./cmd/migrate version

migrate-up-prod:
	@$(MAKE) migrate-up ENV_FILE=.env.production

migrate-down-prod:
	@$(MAKE) migrate-down ENV_FILE=.env.production

migrate-version-prod:
	@$(MAKE) migrate-version ENV_FILE=.env.production

# ════════════════════════════════════════════════════════════
# UTILITIES
# ════════════════════════════════════════════════════════════

reset:
	@echo "⚠  Dropping and recreating $(POSTGRES_DB) on $(POSTGRES_HOST):$(POSTGRES_PORT)..."
	PGPASSWORD=$(POSTGRES_PASSWORD) psql -h $(POSTGRES_HOST) -p $(POSTGRES_PORT) -U $(POSTGRES_USER) \
		-c "DROP DATABASE IF EXISTS $(POSTGRES_DB);" \
		-c "CREATE DATABASE $(POSTGRES_DB);"
	$(MAKE) migrate-up

zitadel-setup:
	python3 scripts/zitadel-setup.py

swagger:
	cd backend && ~/go/bin/swag init -g cmd/api/main.go -o docs/ --parseInternal
	@echo "Swagger docs generated at backend/docs/"
