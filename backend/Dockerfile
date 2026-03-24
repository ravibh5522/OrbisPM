# Build stage
FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy proto dependency first (for replace directive)
COPY proto/ /proto/

# Copy backend source
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ .

RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/api ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/migrate ./cmd/migrate

# Runtime stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata curl

WORKDIR /app

COPY --from=builder /app/api /app/api
COPY --from=builder /app/migrate /app/migrate
COPY backend/db/migrations /app/db/migrations

EXPOSE 8080

# Run migrations then start API
CMD ["/bin/sh", "-c", "MIGRATIONS_PATH=file:///app/db/migrations /app/migrate up && /app/api"]
