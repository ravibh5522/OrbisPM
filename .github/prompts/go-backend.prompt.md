---
applyTo: "backend/**/*.go"
---

# Go Backend Development — OrbisPM

You are working on the OrbisPM Go backend. Follow these rules strictly.

## Architecture

This project uses a strict 4-layer DAO architecture:
1. **Domain** (`internal/domain/`) — Pure entities, zero imports from other layers
2. **Repository** (`internal/repository/`) — SQL queries only (sqlc + sqlx), no business logic
3. **Service** (`internal/service/`) — All business logic, transactions, event publishing
4. **Handler** (`internal/handler/`) — HTTP parsing, validation, response formatting

## Before Writing Code

1. Read `docs/PROJECT.md` for full architecture, schema, and API reference
2. Read relevant existing files in the same layer to match patterns
3. Check `internal/domain/errors.go` for existing error types before creating new ones
4. Check `internal/repository/interfaces.go` for existing interfaces

## Code Patterns

### Handler Pattern
```go
func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req CreateTaskRequest
    if err := parseBody(r, &req); err != nil {
        WriteError(w, r, err)
        return
    }
    orgID := tenant.OrgID(r.Context())
    projectID := uuidParam(r, "projectId")
    
    task, err := h.taskSvc.Create(r.Context(), service.CreateTaskParams{
        OrgID:     orgID,
        ProjectID: projectID,
        Title:     req.Title,
        // ...
    })
    if err != nil {
        WriteError(w, r, err)
        return
    }
    JSON(w, http.StatusCreated, task)
}
```

### Service Pattern
```go
func (s *TaskService) Create(ctx context.Context, params CreateTaskParams) (*domain.Task, error) {
    // Business validation
    if params.ParentTaskID != nil {
        parent, err := s.taskRepo.GetByID(ctx, *params.ParentTaskID)
        if err != nil { return nil, err }
        if parent.Depth >= domain.MaxTaskDepth {
            return nil, domain.ErrMaxDepthExceeded
        }
    }
    // Transaction
    var result *domain.Task
    err := s.txManager.WithTx(ctx, func(tx pgx.Tx) error {
        var err error
        result, err = s.taskRepo.Create(ctx, tx, task)
        return err
    })
    if err != nil { return nil, err }
    // Side effects (non-transactional)
    s.events.Publish(ctx, "task.created", result)
    s.asynq.Enqueue(tasks.NewSearchIndex("task", result.ID))
    return result, nil
}
```

### Repository Pattern
```go
func (r *TaskRepo) Create(ctx context.Context, tx pgx.Tx, task *domain.Task) (*domain.Task, error) {
    row := tx.QueryRow(ctx, createTaskQuery,
        task.OrgID, task.ProjectID, task.ParentTaskID,
        task.Title, task.Description, task.Status,
        task.Priority, task.Depth, task.Position,
    )
    var t domain.Task
    err := row.Scan(&t.ID, &t.OrgID, /* ... */)
    return &t, err
}
```

## Rules

- Use `context.Context` as first param in all functions doing I/O
- Use `uuid.UUID` for all IDs, never `string`
- Use `zerolog` for logging: `log.Ctx(ctx).Info().Str("task_id", id.String()).Msg("task created")`
- Handle ALL errors — never use `_` to ignore (except deferred `Close()`)
- NO `init()` functions — wire in `cmd/*/main.go`
- NO global state — use dependency injection
- Use `TIMESTAMPTZ` always, never `TIMESTAMP`
- RLS handles org_id filtering — do NOT add `WHERE org_id = ?` in repo queries
- Publish Redis events after successful mutations for real-time sync
- Enqueue Asynq jobs for operations >500ms
