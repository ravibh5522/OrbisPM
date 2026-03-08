---
applyTo: "**"
---

# Security Review — OrbisPM

Apply these security rules when generating, editing, or reviewing ANY code in this project.

## Authentication & Authorization

### Authentication (Zitadel v4 OIDC)
- ALL API endpoints require JWT authentication (except `/health`, `/metrics`, `/swagger`, `/api/v1/auth/*`, `/api/v1/webhooks/stripe`, `/api/v1/public/contact`)
- JWT is validated in `middleware/auth.go` via Zitadel JWKS endpoint — NEVER skip this middleware
- Extract `user_id` from JWT claims — `org_id` comes from URL path via `middleware/rls_tenant.go`
- API key authentication is an alternative for programmatic access — validated in `middleware/api_key.go`
- Token refresh is handled via Zitadel OIDC refresh_token flow — proxied through `/api/v1/auth/refresh`
- WebSocket connections authenticate via JWT in query parameter (`?token=`)

### Authorization (DB-driven RBAC)
- Check permissions BEFORE executing any business logic
- Use middleware-based RBAC: `RequireOrgMember`, `RequireOrgAdmin`, `RequireTeamRole`, `RequireProjectRole`, `RequirePermission`
- Permission resolution merges org → team → project roles (see `service/permission_resolver.go`)
- NEVER rely on client-side permission checks alone — server MUST enforce
- Role inheritance: org admin → implicit access to all org resources
- Custom roles stored in `custom_roles` table with role_permissions join table
- Predefined roles: org (owner/admin/member/viewer/billing_admin), team (team_lead/member), project (lead/contributor/reviewer/observer)

### Multi-Tenant Isolation (RLS)
- PostgreSQL RLS is the PRIMARY isolation mechanism
- Middleware sets `set_config('app.current_org_id', 'uuid', true)` per-transaction via TxManager.WithTx()
- NEVER bypass RLS with superuser connections in application code
- Integration tests MUST verify cross-tenant isolation returns 0 rows

## Input Validation & Sanitization

- Validate ALL input at handler layer using struct tags (`validate:"required,max=255"`)
- Sanitize HTML in rich text fields (task descriptions, comments) — use allowlist-based sanitizer
- Validate UUID format before passing to service layer
- Validate file MIME types before storage (allowlist: images, PDFs, documents)
- Limit file upload size (configurable per plan)
- Validate `depth` parameter: reject if `parentTask.Depth >= domain.MaxTaskDepth` (currently 3)
- Validate column mapping in imports — only allow known target fields

## Data Protection

- Hash API keys with SHA-256 before storage
- Store only `key_prefix` (first 8 chars) for key identification
- NEVER log: passwords, tokens, API keys, email addresses, personal data
- Use pre-signed URLs for file downloads (MinIO, expire in 1h)
- NEVER return internal database IDs in error messages
- Include `X-Request-ID` in all responses for correlation (NEVER expose stack traces)
- JSONB metadata fields: validate schema before storing (prevent injection of arbitrary keys)

## Rate Limiting & Abuse Prevention

- Rate limit: 100 req/min per user (default), configurable per plan
- Rate limit: 10 req/min for auth endpoints (login, register, reset)
- Rate limit: 5 req/min for AI review endpoints
- Rate limit: 20 req/min for import/export endpoints
- Use Redis sliding window algorithm
- Return `429 Too Many Requests` with `Retry-After` header

## WebSocket Security

- Authenticate via JWT passed as query parameter on connection
- Validate org membership before allowing room joins
- Rate limit incoming WebSocket messages (10 msg/sec per client)
- Validate message payload schema before processing
- Auto-disconnect idle clients after 30 minutes

## SQL & Database Security

- ALWAYS use parameterized queries (sqlc generates safe queries)
- For sqlx dynamic queries: ALWAYS use `$1, $2` placeholders — NEVER string concatenation
- NEVER run raw SQL from user input
- Down migrations: NEVER drop the `orgs` table without cascading cleanup
- Database user: application connects with a limited-privilege role (NOT superuser)

## Dependency Security

- NEVER add a dependency without checking its license and security advisories
- Keep dependencies updated — run `go mod tidy` and `npm audit` regularly
- Pin exact versions in `go.mod` and `package.json`
- Use `golangci-lint` for static analysis (configured in `.golangci.yml`)

## Secrets Management

- ALL secrets via environment variables (loaded in `internal/config/config.go`)
- Template in `.env.example` — NEVER commit actual `.env` files
- Required secrets: `DATABASE_URL`, `REDIS_URL`, `ZITADEL_ISSUER`, `ZITADEL_PROJECT_ID`, `ZITADEL_API_KEY`, `STRIPE_SECRET_KEY`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MEILISEARCH_API_KEY`
- Docker Compose: use `env_file` directive, mount secrets as files in K8s

## CORS Configuration

```go
cors.Options{
    AllowedOrigins:   []string{cfg.FrontendURL}, // NEVER use "*" in production
    AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
    AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-ID"},
    ExposedHeaders:   []string{"X-Request-ID"},
    AllowCredentials: true,
    MaxAge:           300,
}
```
