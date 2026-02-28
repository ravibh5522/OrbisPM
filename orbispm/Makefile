.PHONY: dev build test lint migrate-up migrate-down docker-up docker-down swagger

# Development
dev: docker-up
	cd backend && go run ./cmd/api

build:
	cd backend && go build -o bin/api ./cmd/api

# Testing
test:
	cd backend && go test ./... -v -count=1

test-short:
	cd backend && go test ./... -short -count=1

# Linting
lint:
	cd backend && golangci-lint run ./...

# Database migrations
migrate-up:
	cd backend && go run ./cmd/migrate -direction up

migrate-down:
	cd backend && go run ./cmd/migrate -direction down

# Docker
docker-up:
	docker compose up -d postgres redis

docker-down:
	docker compose down

docker-build:
	docker compose build api

docker-all:
	docker compose up --build -d

# Full reset
reset: docker-down
	docker volume rm orbispm_pgdata orbispm_redisdata 2>/dev/null || true
	$(MAKE) docker-up
	sleep 3
	$(MAKE) migrate-up

# Swagger docs
swagger:
	cd backend && ~/go/bin/swag init -g cmd/api/main.go -o docs/ --parseInternal
	@echo "Swagger docs generated at backend/docs/"
