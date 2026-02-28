#!/bin/bash
cd /home/ravi/Desktop/Project/orbispm/backend
export DATABASE_URL="postgres://orbispm:orbispm@localhost:5432/orbispm?sslmode=disable"
export REDIS_URL="redis://localhost:6380/0"
export JWT_SECRET="test-secret"
exec go run ./cmd/api
