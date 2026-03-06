# GoTrue → Zitadel Migration Plan

## Overview

Replace Supabase GoTrue (simple HTTP auth) with Zitadel (full OIDC/OAuth2 identity provider).

## Architecture Changes

### Current (GoTrue)
- GoTrue issues HS256 JWTs with a shared secret
- Frontend posts credentials directly to `/auth/v1/token`
- Backend validates JWTs with shared `JWT_SECRET` (HS256)
- User ID = GoTrue UUID in `sub` claim

### Target (Zitadel)
- Zitadel issues RS256 JWTs verified via JWKS endpoint
- Frontend uses OIDC Resource Owner Password Credentials (ROPC) grant for compatibility
  - signup handled by Zitadel Management API through backend proxy
- Backend validates JWTs using Zitadel JWKS public keys (RS256)
- User ID = Zitadel user ID in `sub` claim
- Zitadel Console UI exposed at port 8080

## Migration Steps

### 1. Docker Compose
- Remove `gotrue` service
- Add `zitadel` service (ghcr.io/zitadel/zitadel, PostgreSQL-backed)
- Remove `01-auth-schema.sql` (GoTrue schema no longer needed)
- Update API service env vars: remove `GOTRUE_URL`, `JWT_SECRET`; add `ZITADEL_*` vars
- Update Kong depends_on

### 2. Kong Routes
- Remove `gotrue` service/route
- Add `zitadel` service/route for console UI at `/zitadel/`

### 3. Backend
- Replace `internal/auth/gotrue.go` → `internal/auth/zitadel.go` (OIDC + Management API client)
- Update `internal/middleware/auth.go`: HS256 → RS256 with JWKS key fetching
- Update `internal/handler/auth_handler.go`: new Zitadel-backed endpoints
- Update `internal/config/config.go`: new Zitadel config fields
- Update `cmd/api/main.go`: new client initialization

### 4. Frontend
- Update `lib/api.ts`: new auth endpoint paths (now via backend API)
- No change to auth-store.ts/auth.ts — they work with the same token format
- Login/signup pages remain the same (email/password forms)

### 5. Zitadel Setup
- Zitadel runs with `--masterkey` for dev
- Machine user (service account) for backend Management API access
- Human users created via Management API (signup endpoint)
- ROPC grant for login (password flow through backend)

## Files Changed
- `docker-compose.yml`
- `kong.yml`
- `db-init/01-auth-schema.sql` (remove or replace)
- `backend/internal/auth/gotrue.go` → `zitadel.go`
- `backend/internal/middleware/auth.go`
- `backend/internal/handler/auth_handler.go`
- `backend/internal/config/config.go`
- `backend/cmd/api/main.go`
- `frontend/src/lib/api.ts`
