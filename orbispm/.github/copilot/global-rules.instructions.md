---
applyTo: "**"
---

# Global Project Rules — OrbisPM

## Before ANY Code Change
1. READ the existing code in the file and surrounding files first
2. READ `docs/PROJECT.md` for architecture reference
3. UNDERSTAND the 4-layer DAO pattern (Domain → Repository → Service → Handler)
4. RUN via Docker Compose — never run services directly on host

## After ANY Code Change
1. TEST the change — unit test for logic, integration test for API
2. CHECK for lint errors — `make lint`
3. VERIFY RLS isolation is not broken
4. VERIFY RBAC permissions are enforced
5. CONFIRM Docker Compose still builds and starts: `make dev`

## Critical Invariants (NEVER Violate)
1. Subtask max depth = 5 (enforced by DB CHECK + service validation)
2. All tenant data has `org_id` column with RLS policy
3. All API endpoints require auth (except health/ready/metrics)
4. No business logic in handlers or repositories
5. No global mutable state — everything via dependency injection
6. No hardcoded secrets — everything via env vars
7. No raw SQL string concatenation — parameterized queries only
8. UUIDs for all entity IDs — never auto-increment integers

## Code Quality Standards
- Go: pass `golangci-lint` with zero warnings
- TypeScript: pass ESLint + Prettier with zero warnings
- SQL: consistent formatting (uppercase keywords, lowercase identifiers)
- All public Go functions have doc comments
- All exported TypeScript types/functions have JSDoc comments
- HTTP handlers have OpenAPI annotations (for spec generation)

## Performance Guidelines
- Database queries: ALWAYS use indexes, EXPLAIN ANALYZE for complex queries
- Redis: set TTL on all cache keys (default 5 min, configurable)
- API responses: paginate lists (default 25, max 100 per page)
- File uploads: max 50MB per file (configurable per plan)
- WebSocket: heartbeat every 30s, reconnect with exponential backoff
- Background jobs: set timeout per task type, retry with backoff
