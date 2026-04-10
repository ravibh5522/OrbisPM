# RBAC Audit Report — Task Manager & Core System

**Date**: 2026-04-08  
**Branch**: gaurav1  
**Scope**: Full RBAC enforcement audit across backend, WebSocket layer, and frontend task manager views

---

## 1. RBAC Core Architecture

### 1.1 Role & Permission Model

**Location**: `backend/internal/domain/`

| File | Purpose |
|------|---------|
| `permission.go` | Permission struct (resource, action, scope), Role struct, scope constants |
| `roles.go` | Role slug constants per scope |

**Scope levels** (from `permission.go`):
- `org` — organisation-wide
- `team` — team-scoped
- `project` — project-scoped

**Role slugs** (from `roles.go`):

| Scope | Slugs |
|-------|-------|
| Org | `owner`, `admin`, `member`, `viewer`, `billing_admin` |
| Team | `team_lead`, `member` |
| Project | `lead`, `contributor`, `reviewer`, `observer` |

Roles are DB-driven per org. System roles can be renamed but their slugs are immutable. Custom roles can be created with flexible permission sets.

---

### 1.2 Permission Resolver

**Location**: `backend/internal/service/permission_resolver.go`

**Entry point**: `HasPermission(userID, orgID, scope, scopeID, resource, action) bool`

**Resolution algorithm**:

1. **Org owner** → always `true` (bypasses all checks)
2. **Org admin** → `true` except for `org:delete` and `org:transfer_ownership`
3. **Project-scoped**:
   - Check direct project membership via `GetByProjectAndUser()`
   - If no direct membership, check team memberships + apply `team_project_role_map`
   - Regular members do NOT fall through to org-level
4. **Team-scoped**: Check direct team membership via `GetByTeamAndUser()`
5. **Org-scoped**: Check role's permission list against canonical permissions

**Team → Project role inheritance** (`team_project_role_map`, default):

| Team Role | Project Role |
|-----------|-------------|
| `team_lead` | `lead` |
| `member` | `contributor` |
| `viewer` | `observer` |

Configurable per org via `orgs.settings.team_project_role_map`.

**Caching**: Optional Redis cache with a 3-minute TTL on role lookups.

---

### 1.3 Backend Middleware

**Location**: `backend/internal/middleware/`

#### Auth Middleware (`auth.go`)
- Validates Zitadel-issued JWTs (RS256) from `Authorization` header
- Falls back to `?token=` query param for SSE/WebSocket connections
- Sets `userID` and `email` in request context
- Returns **401** on missing or invalid token

#### RBAC Middleware (`rbac.go`)
```
PermissionResolverMiddleware(resolver, scope, scopeIDParam, resource, action)
```
- Validates `userID` and `orgID` are present in context
- Extracts `scopeID` from URL path parameter (e.g., `projectId`)
- Calls `resolver.HasPermission()` with extracted values
- Returns **403** if denied

**Convenience wrapper**: `RequireResolvedPermission(resolver, resource, action)` — org-scope shorthand.

**In-memory permission cache** (`rbac.go:18-29`): 3-minute TTL, keyed by `"orgID:userID"` to reduce DB round-trips.

---

## 2. Route Registration & Permission Guards

**Location**: `backend/cmd/api/main.go`

All routes are registered with inline `prm()` guards:
```go
prm := func(scope, paramName, resource, action string) func(http.Handler) http.Handler {
    return middleware.PermissionResolverMiddleware(permResolver, scope, paramName, resource, action)
}
```

**Design intent** (`task_handler.go:31-33`): `TaskHandler.Routes()` panics — permission checks are intentionally forced at route registration time in `main.go`, preventing any handler from being mounted without a guard.

---

### 2.1 Task Routes

| Endpoint | Method | Resource | Action | Scope |
|----------|--------|----------|--------|-------|
| `/tasks` | POST | tasks | create | project |
| `/tasks` | GET | tasks | read | project |
| `/tasks/tree` | GET | tasks | read | project |
| `/tasks/{taskId}` | GET | tasks | read | project |
| `/tasks/{taskId}` | PATCH | tasks | update | project |
| `/tasks/{taskId}` | DELETE | tasks | delete | project |
| `/tasks/{taskId}/submit-review` | POST | tasks | update | project |
| `/tasks/{taskId}/complete` | POST | tasks | review | project |
| `/tasks/{taskId}/duplicate` | POST | tasks | create | project |
| `/tasks/bulk` | POST | tasks | update | project |
| `/tasks/reorder` | PATCH | tasks | update | project |
| `/tasks/export` | GET | tasks | read | project |
| `/tasks/calendar.ics` | GET | tasks | read | project |

---

### 2.2 Sub-Resource Routes (per task)

| Endpoint | Method | Resource | Action |
|----------|--------|----------|--------|
| `/tasks/{id}/checklists` | GET | tasks | read |
| `/tasks/{id}/checklists` | POST/PATCH/DELETE | tasks | update |
| `/tasks/{id}/comments` | GET | tasks | read |
| `/tasks/{id}/comments` | POST | comments | create |
| `/tasks/{id}/comments/{id}` | DELETE | comments | delete |
| `/tasks/{id}/attachments` | GET | tasks | read |
| `/tasks/{id}/attachments` | POST | tasks | update |
| `/tasks/{id}/dependencies` | GET | tasks | read |
| `/tasks/{id}/dependencies` | POST/DELETE | tasks | update |
| `/tasks/{id}/watchers` | GET/POST/DELETE | tasks | read |
| `/tasks/{id}/change-requests` | POST | tasks | update |
| `/tasks/{id}/change-requests` | GET | tasks | read |

---

### 2.3 Change Request Routes

| Endpoint | Method | Resource | Action | Scope |
|----------|--------|----------|--------|-------|
| `/change-requests` (org-level) | POST/GET | tasks | review | org |
| `/projects/{projectId}/change-requests` | GET | tasks | read | project |
| `/projects/{projectId}/change-requests/{crId}/approve` | POST | tasks | review | project |
| `/projects/{projectId}/change-requests/{crId}/reject` | POST | tasks | review | project |

---

## 3. Backend Handler Analysis

### 3.1 Task Handler (`backend/internal/handler/task_handler.go`)

| Method | Lines | Route Guard | Service-Level Checks |
|--------|-------|-------------|---------------------|
| `Create` | 48–69 | `tasks:create` | Validates all assignees are effective project members |
| `Get` | 83–95 | `tasks:read` | None |
| `Update` | 278–300 | `tasks:update` | Injects `ActorID`; enforces review pipeline if enabled |
| `Delete` | 314–325 | `tasks:delete` | None |
| `SubmitForReview` | 340–352 | `tasks:update` | Transitions status to `in_review` |
| `MarkComplete` | 367–379 | `tasks:review` | Sets `status=done`, `review_status=approved` |
| `Duplicate` | 394–406 | `tasks:create` | Deep-copies task tree |
| `BulkUpdate` | 421–444 | `tasks:update` | Injects `ActorID`; max 100 tasks; review pipeline enforced |
| `Reorder` | 458–484 | `tasks:update` | Injects `projectID` per item; updates position + parent |

---

### 3.2 Change Request Handler (`backend/internal/handler/change_request_handler.go`)

| Method | Lines | Route Guard | Service-Level Checks |
|--------|-------|-------------|---------------------|
| `Create` | 54–79 | `tasks:update` | Proposes change only (does not apply) |
| `ListByTask` | 81–96 | `tasks:read` | Supports status filter |
| `ListByProject` | 98–124 | `tasks:read` | Paginated; supports search, proposer filter |
| `Approve` | 126–153 | `tasks:review` | Validates `CR.status==pending`; validates designated approver if `approver_ids` configured |
| `Reject` | 155–182 | `tasks:review` | Validates `CR.status==pending`; does NOT apply changes |

**Designated approver check** (service, `change_request_service.go:122-134`):
```
if approver_ids configured in project settings:
    if reviewerID not in list → 403 ErrForbidden("you are not a designated approver")
```

---

### 3.3 WebSocket Handler (`backend/internal/handler/ws_handler.go`)

Auth: JWT in `Authorization` header or `?token=` query param for the WS upgrade request.

**Per-message permission enforcement** (`ws_handler.go:58-77`):
```go
func (h *WSHandler) checkProjectPermission(ctx, conn, msgID, action, projectID, resource, perm) bool {
    allowed, _ := h.permResolver.HasPermission(
        ctx, conn.UserID, conn.OrgID, ScopeProject, &projectID, resource, perm)
    if !allowed { h.reply(error: "insufficient permissions"); return false }
    return true
}
```

Every WS task/CR action calls this before invoking any service method.

#### WS Task Operations

| Action | Lines | Resource | Permission | Notes |
|--------|-------|----------|------------|-------|
| `task:list` | 366 | tasks | read | Filtered by projectID |
| `task:tree` | 456 | tasks | read | Hierarchical structure |
| `task:get` | 476 | tasks | read | Single task |
| `task:create` | 504 | tasks | create | |
| `task:update` | 544 | tasks | update | Injects ActorID; review pipeline |
| `task:delete` | 599 | tasks | delete | |
| `task:bulk-create` | 634 | tasks | create | Multiple tasks |
| `task:bulk-update` | 666 | tasks | update | Review pipeline enforced |
| `task:reorder` | 698 | tasks | update | Drag-drop positions |
| `task:duplicate` | 726 | tasks | create | Deep copy |
| `task:submit-review` | 757 | tasks | update | Transitions to `in_review` |
| `task:complete` | 789 | tasks | review | Sets `done` + `approved` |

#### WS Change Request Operations

| Action | Lines | Resource | Permission |
|--------|-------|----------|------------|
| `cr:list` | 1247 | tasks | read |
| `cr:approve` | 1282 | tasks | review |
| `cr:reject` | 1316 | tasks | review |

---

## 4. Frontend RBAC Enforcement

### 4.1 Permission Hooks

| Hook | Location | What it does |
|------|----------|-------------|
| `usePermissions()` | `hooks/use-permissions.ts` | Fetches org roles from DB; returns `can(resource, action)`, `isOwner`, `isAdmin` |
| `useProjectPermissions(projectId)` | `hooks/use-project-permissions.ts` | Calls `/my-permissions` endpoint for project scope; returns `can()` |
| `useProjectPolicies(projectId)` | `lib/policies.ts` | Merges org + project permissions into pre-computed boolean flags |

**usePermissions resolution** (mirrors backend):
- Owner → bypass all
- Admin → bypass except `org:delete`, `org:transfer_ownership`
- Member → DB-driven role permission list
- Safe default: **deny** while loading

### 4.2 Policy Flags (`ProjectPolicies`)

| Flag | Permission |
|------|-----------|
| `canCreateTask` | `tasks:create` |
| `canEditTask` | `tasks:update` |
| `canDeleteTask` | `tasks:delete` |
| `canDirectUpdate` | `tasks:direct_update` |
| `canReview` | `tasks:review` |
| `canManageMembers` | `members:manage` |
| `canComment` | `comments:create` |
| `canAttach` | `attachments:create` |

### 4.3 Permission Gate Components

```tsx
<PermissionGate resource="tasks" action="create">
  <Button>Create Task</Button>
</PermissionGate>

<ProjectPermissionGate projectId={id} resource="tasks" action="review">
  <ApproveButton />
</ProjectPermissionGate>
```

- Renders children only if permission granted
- Returns `null` while loading (safe default)
- Org owner/admin always pass `ProjectPermissionGate`

---

## 5. Task Manager — Three-View Operation Matrix

### 5.1 Kanban View (`task-columns.tsx`)

Permission hook: `useProjectPolicies(projectId)` (line 93)

| Operation | Frontend Gate | Backend Guard | Resource | Action | Notes |
|-----------|--------------|---------------|----------|--------|-------|
| View columns | implicit | `tasks:read` | tasks | read | |
| Create task | `canCreateTask` | `tasks:create` | tasks | create | Assignees validated as project members |
| Edit title | `canEditTask` | `tasks:update` | tasks | update | Review pipeline if enabled |
| Edit description | `canEditTask` | `tasks:update` | tasks | update | |
| Change assignee | `canEditTask` | `tasks:update` | tasks | update | Service validates assignee membership |
| Change status (drag) | `canDirectUpdate` | `tasks:update` | tasks | update | Creates CR if review enabled |
| Change priority | `canEditTask` | `tasks:update` | tasks | update | |
| Change due date | `canEditTask` | `tasks:update` | tasks | update | |
| Move column (drag) | `canDirectUpdate` | `tasks:update` | tasks | update | `task:reorder` WS action |
| Delete task | `canDeleteTask` | `tasks:delete` | tasks | delete | |
| Duplicate task | (needs icon gate) | `tasks:create` | tasks | create | Deep copy |
| Create sub-task | `canCreateTask` | `tasks:create` | tasks | create | |
| Submit for review | `canEditTask` | `tasks:update` | tasks | update | Transitions to `in_review` |
| Mark complete | `canReview` | `tasks:review` | tasks | review | Sets `done` + `approved` |
| Add comment | `canComment` | `comments:create` | comments | create | |
| Upload attachment | `canAttach` | `tasks:update` | tasks | update | |
| Add dependency | `canEditTask` | `tasks:update` | tasks | update | |
| Watch task | implicit | `tasks:read` | tasks | read | Self-watch only |

---

### 5.2 List View (`task-list-view.tsx`)

Permission hook: `useProjectPolicies(projectId)` (line 93)

| Operation | Frontend Gate | Backend Guard | Resource | Action | Notes |
|-----------|--------------|---------------|----------|--------|-------|
| View list | implicit | `tasks:read` | tasks | read | |
| Sort / filter | none | `tasks:read` | tasks | read | Read-only query params |
| Create task | `canCreateTask` | `tasks:create` | tasks | create | |
| Inline edit | `canEditTask` | `tasks:update` | tasks | update | |
| Delete task | `canDeleteTask` | `tasks:delete` | tasks | delete | |
| Bulk update | `canDirectUpdate` | `tasks:update` | tasks | update | Max 100; review pipeline enforced |
| Export CSV | none (visible to all readers) | `tasks:read` | tasks | read | No additional frontend guard |
| Export iCal | none (visible to all readers) | `tasks:read` | tasks | read | No additional frontend guard |
| Submit for review | `canEditTask` | `tasks:update` | tasks | update | |
| Mark complete | `canReview` | `tasks:review` | tasks | review | |

---

### 5.3 Tree View (`task-tree-view.tsx`)

Permission hook: `useProjectPolicies(projectId)`

| Operation | Frontend Gate | Backend Guard | Resource | Action | Notes |
|-----------|--------------|---------------|----------|--------|-------|
| View tree | implicit | `tasks:read` | tasks | read | `task:tree` WS action |
| Expand/collapse nodes | none (DOM only) | N/A | N/A | N/A | Client-side only |
| Create task | `canCreateTask` | `tasks:create` | tasks | create | |
| Edit task | `canEditTask` | `tasks:update` | tasks | update | |
| Delete task | `canDeleteTask` | `tasks:delete` | tasks | delete | |
| Drag to reorder | `canDirectUpdate` | `tasks:update` | tasks | update | |
| Drag to reparent | `canDirectUpdate` | `tasks:update` | tasks | update | New `parent_task_id` sent in update payload |
| Create sub-task | `canCreateTask` | `tasks:create` | tasks | create | Max nesting depth enforced in service |
| Submit for review | `canEditTask` | `tasks:update` | tasks | update | |
| Mark complete | `canReview` | `tasks:review` | tasks | review | |

---

### 5.4 Change Requests (`change-requests.tsx`)

Permission hook: `useProjectPolicies(projectId)` (line 99)

| Operation | Frontend Gate | Backend Guard | Resource | Action | Notes |
|-----------|--------------|---------------|----------|--------|-------|
| List task CRs | implicit | `tasks:read` | tasks | read | |
| List project CRs | implicit | `tasks:read` | tasks | read | Paginated |
| Create CR | conditional (review enabled) | `tasks:update` | tasks | update | Proposes change, does not apply |
| Approve CR | `canReview` | `tasks:review` | tasks | review | Service re-validates designated approvers |
| Reject CR | `canReview` | `tasks:review` | tasks | review | Service re-validates designated approvers |
| Comment on CR | `canComment` | `comments:create` | comments | create | |

---

## 6. Review Pipeline

**Activated when**: project setting `review_enabled = true`

**Flow**:
1. User with `tasks:update` submits a status change
2. Service creates a `TaskChangeRequest` instead of applying the update directly
3. Task status remains unchanged until CR is approved
4. User with `tasks:review` approves or rejects
5. On approval: changes applied to task, `status=done`, `review_status=approved`
6. On rejection: CR marked rejected, task unchanged

**Designated approvers** (optional, per project):
- Set via `project.settings.approver_ids[]`
- Service validates reviewer is in list on every `Approve` and `Reject` call
- Returns `403 ErrForbidden("you are not a designated approver")` if not listed
- **Gap**: Frontend shows Approve/Reject buttons to anyone with `canReview` — it does not pre-filter based on `approver_ids`. Backend correctly enforces it, but UX exposes the button to non-designated reviewers who will get a 403.

---

## 7. Findings

### 7.1 Confirmed Correct

| # | Finding |
|---|---------|
| 1 | Every HTTP task/CR route in `main.go` has an inline `prm()` guard |
| 2 | Every WebSocket action calls `checkProjectPermission()` before service dispatch |
| 3 | `TaskHandler.Routes()` panics — prevents unmounted/unguarded handler registration |
| 4 | Org owner bypass correctly applied in both backend resolver and frontend hooks |
| 5 | Org admin blocked from `org:delete` and `org:transfer_ownership` on both layers |
| 6 | Review pipeline enforced in both HTTP handler and WS handler for `update` and `bulk-update` |
| 7 | Assignee validation (project membership) enforced in service on create and update |
| 8 | Designated approver validation is service-layer (cannot be bypassed by frontend) |
| 9 | JWT auth enforced on both HTTP and WS upgrade paths |
| 10 | Sub-task nesting depth limit enforced in service layer |

---

### 7.2 Gaps & Issues

| # | Severity | Layer | Finding | Recommendation |
|---|----------|-------|---------|----------------|
| G1 | Low | Frontend | Approve/Reject CR buttons shown to anyone with `canReview`, regardless of `approver_ids` config. Backend correctly 403s, but UX is misleading. | Fetch `approver_ids` from project settings in frontend; show buttons only to designated approvers (or show a tooltip). |
| G2 | Low | Frontend | Export CSV and Export iCal buttons have no additional frontend permission gate beyond implicit project access. | Acceptable since backend guards `tasks:read`; consider hiding from `observer` role if export is considered sensitive. |
| G3 | Info | Backend | Reparenting a task (tree drag) sends a new `parent_task_id` via `tasks:update`. Service does not explicitly validate that the new parent belongs to the same project. | Add a cross-project reparenting check in `task_service.go` Reorder/Update path. |
| G4 | Info | Frontend | Duplicate task operation in Kanban view may lack a dedicated UI permission gate icon/button guard (noted as "needs icon gate" in view analysis). | Wrap duplicate action button in `canCreateTask` check consistently across all three views. |
| G5 | Info | Backend | Watcher self-watch endpoints use `tasks:read` permission, meaning anyone who can read tasks can also watch them. This is likely intentional but undocumented. | Document this as an intentional design decision if confirmed. |
| G6 | Info | Backend | Org-level CR list endpoint (`/change-requests` POST/GET) uses `tasks:review` at org scope. This is broader than project-scoped review and could expose CRs across all projects. | Confirm this is intentional (e.g., a dashboard role); otherwise restrict to project scope. |

---

## 8. Permission Inheritance Summary

```
Org Owner
  └── Full access everywhere (bypasses all checks)

Org Admin
  └── Full access everywhere except org:delete, org:transfer_ownership

Org Member / Viewer
  └── Org-level permissions from role's permission list
  └── Project access ONLY via:
        ├── Direct project membership (project_members table)
        └── Team membership → team_project_role_map → project role

Team Lead   → Project Lead         (tasks:create, update, delete, review, direct_update)
Team Member → Project Contributor  (tasks:create, update)
Team Viewer → Project Observer     (tasks:read only)

Project Reviewer → tasks:review (approve/reject CRs, mark complete)
```

---

## 9. Summary Assessment

The RBAC system is **well-architected and consistently enforced**. The core enforcement pattern is sound:

- **HTTP layer**: Route-level `prm()` middleware guards every endpoint
- **WebSocket layer**: Per-message `checkProjectPermission()` before every service call
- **Service layer**: Secondary validation for business-critical operations (review pipeline, assignee membership, designated approvers)
- **Frontend**: `useProjectPolicies` + `PermissionGate` components mirror backend roles

The three task views (Kanban, List, Tree) all use the same `useProjectPolicies(projectId)` hook and apply consistent gates on create, edit, delete, bulk operations, and review actions. Change request operations are properly gated at both frontend and backend with the review permission.

The identified gaps (G1–G6) are minor UX or documentation issues — no critical security bypass was found. The most actionable fix is **G1** (designated approver UI), **G3** (cross-project reparenting validation), and **G4** (duplicate button gate consistency).
