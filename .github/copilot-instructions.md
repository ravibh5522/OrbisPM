# OrbisPM — GitHub Copilot Instructions

> These instructions apply to ALL files in this repository. Copilot MUST follow these rules when generating, editing, or reviewing code.

---

## Project Overview

OrbisPM is a multi-tenant SaaS project management platform built with:
- **Backend:** Go (Chi router), PostgreSQL 18 (RLS), Redis 7, Casbin (RBAC), Asynq (background jobs)
- **Frontend:** Next.js 15 (App Router, SSR), TypeScript, Tailwind CSS, Shadcn/UI, Tiptap
- **Auth:** GoTrue (Supabase Auth) — JWT-based
- **Search:** Meilisearch
- **Storage:** MinIO (S3-compatible)
- **Real-time:** WebSockets (coder/websocket) + Redis Pub/Sub
- **Billing:** Stripe
- **AI:** MCP Server + LLM integration for task review

---

## Architecture: Strict 4-Layer DAO Pattern

All backend code MUST follow these layers. NEVER mix responsibilities.

### Layer 1: Domain (`internal/domain/`)
- Pure Go structs — NO import from other packages (zero deps)
- NO database tags, NO JSON tags (those belong in handler DTOs)
- Business validation methods live here
- Domain error types defined here

### Layer 2: Repository / DAO (`internal/repository/`)
- SQL queries ONLY — use sqlc-generated code + sqlx for dynamic queries
- NEVER put business logic in repositories
- Accept `pgx.Tx` or `*sqlx.DB` as parameter (transaction-aware)
- Map DB rows → domain models
- All repos implement interfaces defined in `interfaces.go`

### Layer 3: Service (`internal/service/`)
- ALL business logic lives here
- Orchestrate multiple repositories within transactions
- Emit events to Redis Pub/Sub
- Enqueue Asynq background jobs
- Transaction boundaries managed here (`repo.WithTx`)

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
5. **ALWAYS** rely on PostgreSQL RLS for tenant isolation. The middleware sets `SET LOCAL app.current_org_id`. Repository code should NEVER manually filter by `org_id` in WHERE clauses — RLS handles it.
6. **ALWAYS** check RBAC permissions via Casbin middleware or `rbac.Check()` before performing actions.
7. **ALWAYS** use pre-signed URLs for file access (MinIO). NEVER expose storage paths to clients.
8. **ALWAYS** hash API keys with bcrypt before storing. Store only `key_prefix` (first 8 chars) for identification.
9. **ALWAYS** rate-limit API endpoints using the Redis-based rate limiter middleware.
10. **NEVER** expose internal error details to clients. Return generic error messages with correlation IDs.

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
8. Task `depth` column has `CHECK (depth >= 0 AND depth <= 5)` — NEVER exceed depth 5 for subtasks.

### Frontend
1. **ALWAYS** use Server Components by default. Add `'use client'` ONLY when the component needs interactivity.
2. **ALWAYS** use TypeScript strict mode. No `// @ts-ignore` or `// @ts-nocheck`.
3. **ALWAYS** use Shadcn/UI components from `components/ui/`. NEVER install competing component libraries.
4. **ALWAYS** use `cn()` utility (clsx + tailwind-merge) for conditional class names.
5. **ALWAYS** define API response types in `src/types/` — NEVER use inline type assertions.
6. **ALWAYS** use React Query (TanStack Query) for server data fetching with SSR hydration.
7. **ALWAYS** use React Hook Form + Zod for form validation.
8. **ALWAYS** handle loading states with `loading.tsx` or `<Suspense>` boundaries.
9. **ALWAYS** handle error states with `error.tsx` error boundaries.
10. **NEVER** fetch data in Client Components when it can be done in Server Components.

### Testing
1. **ALWAYS** write unit tests for service layer business logic.
2. **ALWAYS** write integration tests for API endpoints that test the full stack (handler → service → repo → DB).
3. **ALWAYS** test RLS isolation: verify Org A cannot access Org B's data.
4. **ALWAYS** test RBAC: verify each role can only perform permitted actions.
5. **ALWAYS** test subtask depth enforcement: creating depth 6 must return 400.
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
