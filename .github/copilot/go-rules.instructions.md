---
applyTo: "backend/**/*.go"
---

# Go Backend Rules

## Import Order
Standard library → third-party → internal packages, separated by blank lines:
```go
import (
    "context"
    "net/http"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "github.com/orbispm/orbispm/internal/domain"
    "github.com/orbispm/orbispm/internal/service"
)
```

## Error Handling
- Return errors, don't panic
- Wrap errors with context: `fmt.Errorf("create task: %w", err)`
- Use `domain.AppError` with HTTP status codes: `domain.NewAppError(http.StatusBadRequest, "invalid input")`
- Common sentinel errors: `domain.ErrNotFound`, `domain.ErrMaxDepthExceeded`, `domain.ErrForbidden`, `domain.ErrConflict`, `domain.ErrInvalidInput`, `domain.ErrDuplicateEntry`
- Handler maps `domain.AppError` → HTTP status codes in `response.go` via `WriteError()`
- Service layer returns `domain.AppError`; handler never creates HTTP status codes directly

## Naming
- Interfaces: verb-based (`TaskRepository`, `TaskService`) — NOT `ITaskRepository`
- Constructors: `NewTaskService(repo TaskRepository) *taskService`
- Unexported struct, exported interface
- Test files: `task_service_test.go` next to `task_service.go`

## Struct Tags
- Domain models: NO tags (pure Go structs)
- Handler request DTOs: `json:"fieldName" validate:"required,max=255"`
- Handler response DTOs: `json:"fieldName"`
- Repository DB models: use sqlc-generated structs (don't hand-write)

## Context Usage
- First param always: `func (s *TaskService) Create(ctx context.Context, ...) error`
- Extract user/org from context: `tenant.UserID(ctx)`, `tenant.OrgID(ctx)` (from `internal/pkg/tenant`)
- Set context in middleware: `tenant.SetOrgID(ctx, orgID)`, `tenant.SetUserID(ctx, userID)`
- Pass context through all layers — never create new background context in handlers
- TxManager uses `tenant.OrgID(ctx)` to set RLS config inside transactions

## Logging
- Use zerolog: `log.Ctx(ctx).Info().Str("task_id", id.String()).Msg("task created")`
- Log at service layer (business events), NOT at repository layer
- Never log sensitive data (passwords, tokens, PII)
- Include request_id in all log entries (middleware adds it to context)
