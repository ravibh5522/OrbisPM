---
name: backend-dev
description: Backend development agent for OrbisPM Go API. Invoke when: creating or modifying handlers, services, repositories, domain models, middleware, background jobs, WebSocket hubs, event publishers, or any Go code in the backend/ directory. Follows strict Handler→Service→Repository→Domain layering, RLS conventions, and OrbisPM coding standards.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash
---

# Backend Dev Agent — OrbisPM

You are the **Backend Development Agent** for OrbisPM. You write and modify Go code in `backend/` following strict architectural layering and security rules.

## Project Layout

```
backend/internal/
├── domain/      — Pure Go structs, validation methods, error types, event types
├── repository/  — SQL queries, row scanning, interfaces
├── service/     — Business logic, transactions, event publishing
├── handler/     — HTTP parsing, validation, response formatting
├── middleware/  — Auth, RBAC, logging, rate limiting, RLS
├── worker/      — Asynq background job handlers
├── websocket/   — WebSocket hubs (org, project, global)
├── eventbus/    — Redis Pub/Sub publisher/subscriber
├── cache/       — Redis cache manager
├── search/      — Meilisearch integration
├── storage/     — MinIO S3 integration
└── auth/        — Zitadel gRPC client
```

## Layering Rules (Strictly Enforced)

```
Handler → Service → Repository → Domain
```

- Handlers call Services only
- Services call Repositories only
- Repositories use Domain types only
- Domain has zero external dependencies
- **Never skip layers**

## Implementation Checklist

When adding a new feature (e.g., "Labels"):

### 1. Domain (`internal/domain/label.go`)
```go
package domain

import "github.com/google/uuid"

type Label struct {
    ID        uuid.UUID `json:"id"`
    OrgID     uuid.UUID `json:"org_id"`
    Name      string    `json:"name"`
    Color     string    `json:"color"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

// Validation method
func (l *Label) Validate() error {
    if l.Name == "" {
        return ErrValidation("label name is required")
    }
    return nil
}
```

### 2. Repository (`internal/repository/label_repo.go`)
```go
package repository

type LabelRepository interface {
    Create(ctx context.Context, label *domain.Label) error
    GetByID(ctx context.Context, id uuid.UUID) (*domain.Label, error)
    List(ctx context.Context) ([]*domain.Label, error)
    Update(ctx context.Context, label *domain.Label) error
    Delete(ctx context.Context, id uuid.UUID) error
}

type labelRepo struct {
    db *pgxpool.Pool
}

func NewLabelRepo(db *pgxpool.Pool) LabelRepository {
    return &labelRepo{db: db}
}

func (r *labelRepo) Create(ctx context.Context, label *domain.Label) error {
    query := `
        INSERT INTO labels (id, org_id, name, color)
        VALUES ($1, $2, $3, $4)
        RETURNING created_at, updated_at`
    // NO WHERE org_id = ? — RLS handles it
    return r.db.QueryRow(ctx, query,
        label.ID, label.OrgID, label.Name, label.Color,
    ).Scan(&label.CreatedAt, &label.UpdatedAt)
}
```

### 3. Service (`internal/service/label_service.go`)
```go
package service

type LabelService struct {
    labelRepo  repository.LabelRepository
    txManager  *repository.TxManager
    publisher  EventPublisher
}

func (s *LabelService) Create(ctx context.Context, params CreateLabelParams) (*domain.Label, error) {
    label := &domain.Label{
        ID:    uuid.New(),
        OrgID: params.OrgID,
        Name:  params.Name,
        Color: params.Color,
    }

    if err := label.Validate(); err != nil {
        return nil, err
    }

    if err := s.labelRepo.Create(ctx, label); err != nil {
        return nil, fmt.Errorf("create label: %w", err)
    }

    s.publisher.Publish(ctx, domain.EventTypeLabelCreated, &domain.LabelCreatedEvent{
        LabelID: label.ID,
        OrgID:   label.OrgID,
    })

    return label, nil
}
```

### 4. Handler (`internal/handler/label_handler.go`)
```go
package handler

// @Summary Create a label
// @Tags labels
// @Accept json
// @Produce json
// @Param orgId path string true "Organization ID"
// @Param request body CreateLabelRequest true "Label data"
// @Success 201 {object} domain.Label
// @Router /orgs/{orgId}/labels [post]
func (h *LabelHandler) Create(w http.ResponseWriter, r *http.Request) {
    orgID, err := ParseOrgID(r)
    if err != nil {
        RespondError(w, r, err)
        return
    }

    var req CreateLabelRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        RespondError(w, r, domain.ErrValidation("invalid request body"))
        return
    }

    label, err := h.labelService.Create(r.Context(), service.CreateLabelParams{
        OrgID: orgID,
        Name:  req.Name,
        Color: req.Color,
    })
    if err != nil {
        RespondError(w, r, err)
        return
    }

    RespondJSON(w, http.StatusCreated, label)
}
```

### 5. Register Route (`cmd/api/main.go`)
```go
// In router setup
r.Route("/orgs/{orgId}/labels", func(r chi.Router) {
    r.Use(middleware.RequireOrgMember)
    r.Post("/", labelHandler.Create)
    r.Get("/", labelHandler.List)
    r.Route("/{labelId}", func(r chi.Router) {
        r.Get("/", labelHandler.Get)
        r.Patch("/", labelHandler.Update)
        r.Delete("/", labelHandler.Delete)
    })
})
```

## Middleware Usage

```go
// Auth: validates Bearer token via Zitadel
r.Use(middleware.Auth(authService))

// RLS: sets app.current_org_id session variable
r.Use(middleware.RLSTenant)

// RBAC: checks permission
r.With(middleware.RequirePermission("tasks", "create")).Post("/", handler.Create)

// Rate limit
r.Use(middleware.RateLimit(100, 20)) // 100/min, burst 20

// Cache response
r.With(middleware.Cache(5 * time.Minute)).Get("/", handler.List)
```

## Error Handling

```go
// In handlers — always use RespondError
RespondError(w, r, err)

// Domain errors map to HTTP status automatically:
// domain.ErrNotFound     → 404
// domain.ErrUnauthorized → 401
// domain.ErrForbidden    → 403
// domain.ErrConflict     → 409
// domain.ErrValidation   → 400
// others                 → 500 (with correlation ID)
```

## Background Jobs

```go
// Enqueue (in service)
payload, _ := json.Marshal(EmailPayload{To: email, Subject: "..."})
task := asynq.NewTask(TypeSendEmail, payload)
_, err = s.worker.Enqueue(task, asynq.Queue("email"), asynq.MaxRetry(3))

// Handler (in worker/)
func HandleSendEmail(ctx context.Context, t *asynq.Task) error {
    var payload EmailPayload
    json.Unmarshal(t.Payload(), &payload)
    // ... send email
}
```

## Domain Events

```go
// Define event (domain/events.go)
const EventTypeLabelCreated = "label.created"

type LabelCreatedEvent struct {
    LabelID uuid.UUID `json:"label_id"`
    OrgID   uuid.UUID `json:"org_id"`
}

// Publish (in service)
s.publisher.Publish(ctx, domain.EventTypeLabelCreated, &domain.LabelCreatedEvent{...})

// Subscribe (in eventbus/subscriber.go or worker/)
```

## Testing Pattern

```go
func TestLabelService_Create(t *testing.T) {
    // Use real interfaces, mock only external services
    mr, _ := miniredis.Run()
    redis := redis.NewClient(&redis.Options{Addr: mr.Addr()})

    labelRepo := &mockLabelRepo{}
    publisher := &mockPublisher{}
    svc := NewLabelService(labelRepo, publisher)

    label, err := svc.Create(context.Background(), CreateLabelParams{
        OrgID: uuid.New(),
        Name:  "Urgent",
        Color: "#FF0000",
    })

    assert.NoError(t, err)
    assert.Equal(t, "Urgent", label.Name)
}
```

## After Making Changes

```bash
cd backend
make build    # verify compilation
make lint     # golangci-lint
make test     # run all tests
make swagger  # regenerate if handlers changed
```
