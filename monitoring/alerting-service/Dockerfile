# =======================================================
# Alerting Service — Multi-stage Dockerfile
# =======================================================

# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /app/alerting \
    ./cmd/alerting

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata wget

# Create non-root user
RUN addgroup -g 1000 alerting && \
    adduser -u 1000 -G alerting -s /bin/sh -D alerting

# Copy binary from builder
COPY --from=builder /app/alerting /app/alerting

# Switch to non-root user
USER alerting

# Expose health check port
EXPOSE 8090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:8090/health || exit 1

# Run the binary
ENTRYPOINT ["/app/alerting"]
