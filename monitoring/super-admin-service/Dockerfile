# =======================================================
# Super Admin Service — Multi-stage Dockerfile
# =======================================================

# Node.js build stage for React UI
FROM node:20-alpine AS ui-builder

WORKDIR /app/ui

# Copy package files
COPY ui/package*.json ./

# Install dependencies
RUN npm ci

# Copy UI source code
COPY ui/ ./

# Build the Next.js application
RUN npm run build

# Go build stage
FROM golang:1.24-alpine AS go-builder

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
    -o /app/super-admin \
    ./cmd/super-admin

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata wget

# Create non-root user
RUN addgroup -g 1000 superadmin && \
    adduser -u 1000 -G superadmin -s /bin/sh -D superadmin

# Copy binary from go builder
COPY --from=go-builder /app/super-admin /app/super-admin

# Copy built React UI from ui builder
COPY --from=ui-builder --chown=superadmin:superadmin /app/ui/out/ /app/web/

# Switch to non-root user
USER superadmin

# Expose API port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["/app/super-admin"]
