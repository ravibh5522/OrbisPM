---
description: "Guide for adding a new API endpoint to the Go backend"
---

# Add New API Endpoint

## Required Context
Before starting, read:
- `internal/handler/request.go` and `response.go` for helper patterns
- `internal/repository/interfaces.go` for existing repo interfaces
- `cmd/api/main.go` for routing and middleware wiring

## Endpoint Template

### 1. Handler Method
```go
// internal/handler/<resource>_handler.go

type Create<Resource>Request struct {
    Title       string    `json:"title" validate:"required,max=255"`
    Description string    `json:"description" validate:"max=5000"`
}

func (h *<Resource>Handler) Create(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    orgID := tenant.OrgID(ctx)
    userID := tenant.UserID(ctx)

    var req Create<Resource>Request
    if err := parseBody(r, &req); err != nil {
        WriteError(w, r, err)
        return
    }

    result, err := h.svc.Create(ctx, service.Create<Resource>Params{
        OrgID:  orgID,
        UserID: userID,
        Title:  req.Title,
    })
    if err != nil {
        WriteError(w, r, err)
        return
    }

    JSON(w, http.StatusCreated, result)
}
```

### 2. Route Registration
```go
// Inside the org router group in cmd/api/main.go
r.Route("/<resources>", func(r chi.Router) {
    r.Use(middleware.RequireOrgMember)
    r.Get("/", resourceHandler.List)
    r.Post("/", resourceHandler.Create)
    r.Route("/{resourceId}", func(r chi.Router) {
        r.Get("/", resourceHandler.Get)
        r.Patch("/", resourceHandler.Update)
        r.Delete("/", resourceHandler.Delete)
    })
})
```

### 3. Middleware Stack (applied in order)
Routes inside org group automatically get:
1. `AuthMiddleware` — JWT validation
2. `RLSTenantMiddleware` — extracts orgId from URL to context
3. `RequireOrgMember` / `RequireOrgAdmin` — RBAC check

For team/project scoped routes, add:
- `RequireTeamRole("team_lead")` for team-admin operations
- `RequireProjectRole("contributor")` for project write operations
- `RequirePermission("tasks", "create")` for fine-grained permissions

## Response Patterns
- Success: `JSON(w, http.StatusOK, data)` or `JSON(w, http.StatusCreated, data)`
- List: `JSON(w, http.StatusOK, ListResponse{Items: items, Total: total})`
- No content: `w.WriteHeader(http.StatusNoContent)`
- Error: `WriteError(w, r, err)` — maps `domain.AppError` to HTTP status
