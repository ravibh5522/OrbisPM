---
description: "Guide for working with RBAC permissions and role-based access control"
---

# RBAC & Permissions Guide

## Role Hierarchy

### Organization Roles (in `org_members` table)
| Role | Slug | Access |
|------|------|--------|
| Owner | `owner` | Full access, can delete org, transfer ownership |
| Admin | `admin` | Manage members, teams, projects, settings |
| Member | `member` | Create/edit own tasks, join projects |
| Viewer | `viewer` | Read-only access to all org data |
| Billing Admin | `billing_admin` | Manage billing, subscription, invoices |

### Team Roles (in `team_members` table)
| Role | Slug | Inherits Project Role |
|------|------|-----------------------|
| Team Lead | `team_lead` | → Project Lead |
| Team Member | `member` | → Project Contributor |

### Project Roles (in `project_members` table)
| Role | Slug | Permissions |
|------|------|-------------|
| Lead | `lead` | Full project management, settings, invite members |
| Contributor | `contributor` | Create/edit tasks, comments, checklists |
| Reviewer | `reviewer` | Review change requests, comment |
| Observer | `observer` | Read-only access |

## Permission Resolution Flow
`PermissionResolverMiddleware` in `middleware/rbac.go` resolves effective permissions:
1. Check explicit project membership → use project role
2. If no project membership, check team membership → map team role to project role
3. If no team membership, fall back to org role (admin/owner → full access)

## Key Files
- `internal/middleware/rbac.go` — Middleware functions for role checks
- `internal/service/permission_resolver.go` — `HasPermission()` logic with role fallback
- `internal/domain/permission.go` — Permission and Role structs
- `internal/domain/roles.go` — Role slug constants and `DefaultTeamProjectRoleMap`
- `frontend/src/hooks/use-permissions.ts` — Client-side permission checking

## Adding RBAC to a New Route
```go
// Require org-level membership
r.With(middleware.RequireOrgMember).Get("/", handler.List)

// Require org admin
r.With(middleware.RequireOrgAdmin).Post("/settings", handler.UpdateSettings)

// Require specific project role
r.With(middleware.RequireProjectRole("contributor")).Post("/tasks", handler.CreateTask)

// Require specific permission
r.With(middleware.RequirePermission("tasks", "create")).Post("/tasks", handler.CreateTask)
```

## Frontend Permission Check
```tsx
const { hasPermission } = usePermissions()

// Check before rendering action buttons
{hasPermission('tasks', 'create') && <Button onClick={handleCreate}>Create Task</Button>}
```
