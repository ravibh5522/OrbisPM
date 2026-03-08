---
description: "Step-by-step guide for adding a new feature end-to-end across all 4 layers"
---

# Add New Feature — End-to-End

You are adding a new feature to OrbisPM. Follow the strict 4-layer DAO pattern.

## Step-by-Step Checklist

### 1. Domain Layer (`internal/domain/`)
- [ ] Create entity struct in `internal/domain/<entity>.go` — pure Go, zero external imports
- [ ] Add domain error types to `internal/domain/errors.go` if needed (use `NewAppError`)
- [ ] Add event type constants to `internal/domain/events.go` (e.g., `EventEntityCreated`)
- [ ] Add validation methods on the entity struct if needed

### 2. Database Migration
- [ ] Create `db/migrations/NNNNNN_<name>.up.sql` and `.down.sql`
- [ ] Include: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- [ ] Include: `org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE` (if tenant-scoped)
- [ ] Include: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ`
- [ ] Enable RLS: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
- [ ] Create RLS policy: `USING (org_id = current_setting('app.current_org_id')::uuid)`
- [ ] Create indexes with `org_id` as leading column
- [ ] Run migration: `make migrate-up`

### 3. Repository Layer (`internal/repository/`)
- [ ] Add interface to `internal/repository/interfaces.go`
- [ ] Implement repository in `internal/repository/<entity>_repo.go`
- [ ] All methods accept `ctx context.Context` and `tx pgx.Tx`
- [ ] Use parameterized queries (`$1, $2, ...`)
- [ ] Never filter by `org_id` — RLS handles it via TxManager
- [ ] Map DB rows → domain models

### 4. Service Layer (`internal/service/`)
- [ ] Create `internal/service/<entity>_service.go`
- [ ] Accept repository interfaces via constructor (`New<Entity>Service(repo ...Repository)`)
- [ ] Use `txManager.WithTx(ctx, func(tx pgx.Tx) error { ... })` for transactions
- [ ] Publish events after mutations: `eventbus.Publish(ctx, domain.Event{...})`
- [ ] Enqueue Asynq jobs for async work: search indexing, notifications
- [ ] Return `domain.AppError` for business validation failures

### 5. Handler Layer (`internal/handler/`)
- [ ] Create `internal/handler/<entity>_handler.go`
- [ ] Define request DTOs with `json` + `validate` struct tags
- [ ] Use `parseBody(r, &req)` to decode + validate
- [ ] Use `uuidParam(r, "paramName")` for path params
- [ ] Use `tenant.OrgID(ctx)` / `tenant.UserID(ctx)` for context values
- [ ] Call service layer — NEVER call repository
- [ ] Respond with `JSON(w, statusCode, data)` or `WriteError(w, r, err)`
- [ ] Add routes using Chi: `r.Route("/<entities>", func(r chi.Router) { ... })`

### 6. Wire in Main (`cmd/api/main.go`)
- [ ] Instantiate repository: `entityRepo := repository.NewEntityRepo(pool)`
- [ ] Instantiate service: `entitySvc := service.NewEntityService(entityRepo, txManager, eventBus)`
- [ ] Instantiate handler: `entityHandler := handler.NewEntityHandler(entitySvc)`
- [ ] Mount routes inside the org router group with appropriate RBAC middleware

### 7. Frontend (if needed)
- [ ] Add TypeScript types to `frontend/src/types/domain.ts`
- [ ] Add API methods to `frontend/src/lib/api.ts` under the appropriate namespace
- [ ] Create page at `frontend/src/app/(app)/[orgSlug]/...`
- [ ] Use TanStack Query for data fetching in client components
- [ ] Add WebSocket event handling in `project-task-store.ts` if real-time updates needed

### 8. Testing
- [ ] Unit tests for service layer business logic
- [ ] Integration tests for API endpoints
- [ ] RLS isolation test (cross-tenant must return 404)
