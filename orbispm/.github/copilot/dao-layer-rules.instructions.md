---
applyTo: "backend/internal/domain/**,backend/internal/repository/**,backend/internal/service/**,backend/internal/handler/**"
---

# DAO Layer Architecture Rules

## Layer Boundaries — STRICTLY ENFORCED

### Domain Layer (`internal/domain/`)
```
ALLOWED imports:     standard library ONLY (fmt, time, errors)
FORBIDDEN imports:   database/sql, net/http, redis, any external pkg
Contains:            Entity structs, value objects, domain errors, event types
Tests:               Pure unit tests, no mocks needed
```

### Repository Layer (`internal/repository/`)
```
ALLOWED imports:     domain, database drivers (pgx, sqlx), standard library
FORBIDDEN imports:   service, handler, redis, http
Contains:            SQL execution, row scanning, interface implementations
Tests:               Integration tests with real DB
```

### Service Layer (`internal/service/`)
```
ALLOWED imports:     domain, repository interfaces, redis, asynq, standard library
FORBIDDEN imports:   handler, net/http, chi
Contains:            Business logic, transaction management, event publishing
Tests:               Unit tests with mocked repositories
```

### Handler Layer (`internal/handler/`)
```
ALLOWED imports:     service interfaces, domain (for error types), chi, net/http
FORBIDDEN imports:   repository, database drivers, redis
Contains:            HTTP parsing, validation, response formatting
Tests:               Integration tests via HTTP client
```

## Adding a New Feature (Checklist)

1. [ ] Define domain entity in `internal/domain/entity_name.go`
2. [ ] Define domain errors in `internal/domain/errors.go`
3. [ ] Define repository interface in `internal/repository/interfaces.go`
4. [ ] Write SQL queries in `db/queries/entity_name.sql`
5. [ ] Run `make sqlc` to generate Go code
6. [ ] Implement repository in `internal/repository/entity_name_repo.go`
7. [ ] Implement service in `internal/service/entity_name_service.go`
8. [ ] Implement handler in `internal/handler/entity_name_handler.go`
9. [ ] Wire in `cmd/api/main.go` (repo → service → handler → router)
10. [ ] Write unit tests for service layer
11. [ ] Write integration tests for handler (API endpoint)
12. [ ] Add DB migration if new table/column needed
13. [ ] Add RLS policy if new table is tenant-scoped
14. [ ] Update Meilisearch indexer if entity should be searchable
15. [ ] Add WebSocket events if entity changes should be real-time

## Transaction Pattern
```go
// Service owns transactions. Repos accept tx parameter.
func (s *Service) CreateWithChildren(ctx context.Context, parent *domain.Parent, children []*domain.Child) error {
    return s.txManager.WithTx(ctx, func(tx pgx.Tx) error {
        p, err := s.parentRepo.Create(ctx, tx, parent)
        if err != nil { return err }
        for _, c := range children {
            c.ParentID = p.ID
            if _, err := s.childRepo.Create(ctx, tx, c); err != nil {
                return err
            }
        }
        return nil
    })
    // After tx commits: publish events, enqueue jobs
}
```

## Anti-Patterns (NEVER Do These)

```go
// ❌ WRONG: Business logic in handler
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
    if task.Depth > 5 { /* This belongs in service */ }
}

// ❌ WRONG: Business logic in repository
func (r *Repo) Create(ctx context.Context, task *domain.Task) error {
    if task.Status == "done" { /* This belongs in service */ }
}

// ❌ WRONG: Handler calls repository directly
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
    task, _ := h.taskRepo.GetByID(/* ... */)  // Must go through service
}

// ❌ WRONG: Service imports net/http
import "net/http"  // Service should never know about HTTP

// ❌ WRONG: Global state
var db *sql.DB  // Must be injected via constructor

// ❌ WRONG: Manual org_id filtering (RLS handles this)
func (r *Repo) List(ctx context.Context, orgID uuid.UUID) {
    db.Query("SELECT * FROM tasks WHERE org_id = $1", orgID)  // RLS handles this!
}
```
