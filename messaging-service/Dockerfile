FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/messaging-service ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/migrate ./cmd/migrate

# ─── Runtime ───────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata curl && \
    addgroup -g 1001 app && adduser -u 1001 -G app -s /bin/sh -D app

WORKDIR /app

COPY --from=builder /app/messaging-service .
COPY --from=builder /app/migrate .
COPY --from=builder /build/db/migrations ./db/migrations
COPY --from=builder /build/entrypoint.sh .
RUN chmod +x /app/entrypoint.sh

USER app

EXPOSE 8082

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8082/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
