# OrbisPM — GitHub Copilot Instructions

> These instructions apply to ALL files in this repository. Copilot MUST follow these rules when generating, editing, or reviewing code.

---

## Project Overview

OrbisPM is a multi-tenant SaaS project management platform built with:
- **Backend:** Go 1.24 (Chi v5 router), PostgreSQL 16+ (RLS), Redis 7, DB-driven RBAC, Asynq (background jobs)
- **Frontend:** Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS 4, DaisyUI 5, Tiptap
- **Auth:** Zitadel v4 (OIDC + gRPC management API) — JWT RS256
- **Search:** Meilisearch v1.7
- **Storage:** MinIO (S3-compatible)
- **Real-time:** WebSockets (nhooyr.io/websocket) + Redis Pub/Sub
- **API Gateway:** Kong (declarative config)
- **Billing:** Stripe (optional, feature-flagged)
- **Metrics:** Prometheus
- **Email:** SMTP (Mailpit for dev)
- **AI:** MCP Server + LLM integration (planned v0.3.0)

---

## Architecture: Strict 4-Layer DAO Pattern

All backend code MUST follow these layers. NEVER mix responsibilities.

### Layer 1: Domain (`internal/domain/`)
- Pure Go structs — NO import from other packages (zero deps)
- NO database tags, NO JSON tags (those belong in handler DTOs)
- Business validation methods live here
- Domain error types defined here

### Layer 2: Repository / DAO (`internal/repository/`)
- SQL queries ONLY — use sqlc-generated code + pgx for dynamic queries
- NEVER put business logic in repositories
- Accept `pgx.Tx` as parameter (transaction-aware)
- Map DB rows → domain models
- All repos implement interfaces defined in `interfaces.go`
- NEVER filter by `org_id` — RLS handles tenant isolation via TxManager

### Layer 3: Service (`internal/service/`)
- ALL business logic lives here
- Orchestrate multiple repositories within transactions
- Emit events to Redis Pub/Sub
- Enqueue Asynq background jobs
- Transaction boundaries managed here (`txManager.WithTx`) — TxManager sets RLS context automatically

### Layer 4: Handler / Presentation (`internal/handler/`)
- Parse HTTP request (path params, query, body)
- Validate input using struct tags + custom validators
- Call service layer — NEVER call repository directly
- Format JSON response with proper HTTP status codes
- Use shared `request.go` and `response.go` helpers

### Dependency Rule
```
Handler → Service → Repository → Domain
  ↓          ↓          ↓           ↓
  NEVER depends on anything above or sideways
```

---

## Mandatory Rules

### Security
1. **NEVER** hardcode secrets, API keys, tokens, or passwords. Use environment variables loaded via `config.Load()`.
2. **NEVER** log sensitive data (passwords, tokens, PII). Use `zerolog` structured logging with field filtering.
3. **ALWAYS** validate and sanitize ALL user input at the handler layer before passing to service.
4. **ALWAYS** use parameterized queries. NEVER concatenate user input into SQL strings.
5. **ALWAYS** rely on PostgreSQL RLS for tenant isolation. The TxManager calls `set_config('app.current_org_id', ...)` inside transactions. Repository code should NEVER manually filter by `org_id` in WHERE clauses — RLS handles it.
6. **ALWAYS** check RBAC permissions via middleware (`RequireOrgAdmin`, `RequireOrgMember`, `RequireTeamRole`, `RequireProjectRole`, `PermissionResolverMiddleware`) before performing actions.
7. **ALWAYS** use pre-signed URLs for file access (MinIO). NEVER expose storage paths to clients.
8. **ALWAYS** hash API keys with SHA-256 before storing. Store only `key_prefix` (first 8 chars) for identification.
9. **ALWAYS** rate-limit API endpoints using the per-IP rate limiter middleware (`middleware.RateLimiter`).
10. **NEVER** expose internal error details to clients. Return generic error messages with correlation IDs via `X-Request-ID`.

### Clean Code
1. **ALWAYS** read and understand existing code files before making changes.
2. **ALWAYS** run the project via Docker Compose (`docker compose up`).
3. **ALWAYS** test all changes after implementation.
4. **NEVER** create `any` typed variables in TypeScript. Use proper types from `src/types/`.
5. **ALWAYS** use `context.Context` as the first parameter in all Go functions that do I/O.
6. **ALWAYS** handle errors explicitly. NEVER use `_` to ignore errors (except in deferred Close calls where noted).
7. **ALWAYS** return domain errors from service layer, map to HTTP status in handler.
8. **ALWAYS** add struct tags for validation (`validate:"required"`) on request DTOs.
9. **ALWAYS** use `uuid.UUID` for entity IDs, never `string`.
10. **ALWAYS** use `TIMESTAMPTZ` for all timestamp columns, never `TIMESTAMP`.

### Modularity & Extensibility
1. **ALWAYS** define interfaces at layer boundaries (repository interfaces, service interfaces).
2. **ALWAYS** use constructor injection (`NewXxxService(repo XxxRepository)`) — NEVER global state.
3. **ALWAYS** keep handler files focused on one resource (e.g., `task_handler.go` for `/tasks` routes).
4. **ALWAYS** use Chi's `r.Route()` and `r.Mount()` for route grouping.
5. **ALWAYS** make new features as independent modules under `internal/` that plug into the main router.
6. **NEVER** add `init()` functions. Wire everything explicitly in `cmd/*/main.go`.
7. **ALWAYS** use Asynq for any operation that takes >500ms (emails, AI calls, imports, exports).
8. **ALWAYS** publish domain events to Redis after state mutations for real-time sync.

### Database
1. **ALWAYS** write SQL migrations in `db/migrations/` using golang-migrate format (`XXXXXX_name.up.sql` / `.down.sql`).
2. **ALWAYS** add `org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE` to tenant-scoped tables.
3. **ALWAYS** create composite indexes with `org_id` as the leading column.
4. **ALWAYS** enable RLS and create isolation policies for new tables.
5. **ALWAYS** use `JSONB` (not `JSON`) for flexible metadata columns.
6. **ALWAYS** add `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` and `updated_at` to all tables.
7. **NEVER** use auto-increment integers for primary keys. Use `UUID DEFAULT gen_random_uuid()`.
8. Task `depth` column has `CHECK (depth >= 0 AND depth <= 3)` — NEVER exceed depth 3 for subtasks (domain constant `MaxTaskDepth = 3`).

### Frontend
1. **ALWAYS** use Server Components by default. Add `'use client'` ONLY when the component needs interactivity.
2. **ALWAYS** use TypeScript strict mode. No `// @ts-ignore` or `// @ts-nocheck`.
3. **ALWAYS** use DaisyUI 5 components with Tailwind CSS 4 utility classes. NEVER install competing component libraries.
4. **ALWAYS** use `cn()` utility (clsx) for conditional class names.
5. **ALWAYS** define API response types in `src/types/domain.ts` — NEVER use inline type assertions.
6. **ALWAYS** use TanStack Query v5 for server data fetching in client components.
7. **ALWAYS** use React Hook Form + Zod for form validation.
8. **ALWAYS** handle loading states with Skeleton components or suspense boundaries.
9. **ALWAYS** handle error states with error boundaries or try/catch.
10. **NEVER** fetch data in Client Components when it can be done in Server Components.
11. **ALWAYS** use `useOrgSocket` hook for real-time WebSocket connections (mounted in OrgLayout).
12. **ALWAYS** use `useProjectTaskStore` Zustand store for task state management within projects.
13. **ALWAYS** use `usePermissions` hook to check user permissions before rendering action buttons.
14. **ALWAYS** use the `api` client from `@/lib/api` for all backend API calls (handles auth headers automatically).

### Testing
1. **ALWAYS** write unit tests for service layer business logic.
2. **ALWAYS** write integration tests for API endpoints that test the full stack (handler → service → repo → DB).
3. **ALWAYS** test RLS isolation: verify Org A cannot access Org B's data.
4. **ALWAYS** test RBAC: verify each role can only perform permitted actions.
5. **ALWAYS** test subtask depth enforcement: creating depth 4 must return 400.
6. Use `docker compose -f docker-compose.test.yml up` for integration test infrastructure.

### Naming Conventions
- **Go files:** `snake_case.go` (e.g., `task_service.go`)
- **Go types:** `PascalCase` (e.g., `TaskService`, `CreateTaskParams`)
- **Go functions:** `PascalCase` for exported, `camelCase` for unexported
- **Go variables:** `camelCase` (e.g., `taskRepo`, `orgID`)
- **TypeScript files:** `kebab-case.tsx` (e.g., `task-tree.tsx`)
- **TypeScript types:** `PascalCase` (e.g., `Task`, `CreateTaskRequest`)
- **TypeScript variables/functions:** `camelCase`
- **SQL tables:** `snake_case` plural (e.g., `tasks`, `task_rules`)
- **SQL columns:** `snake_case` (e.g., `parent_task_id`)
- **API endpoints:** kebab-case (e.g., `/api/v1/api-keys`)
- **Environment variables:** `SCREAMING_SNAKE_CASE` (e.g., `DATABASE_URL`)

### Git & PR Conventions
- Commit messages: `type(scope): description` (e.g., `feat(task): add subtask depth validation`)
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `security`
- Branch naming: `type/short-description` (e.g., `feat/task-templates`)
