# Enhanced Access Control Implementation Plan

## Overview

This document outlines the implementation plan for enhanced feature-wise access control, membership-based project visibility, role-scoped dashboards, and personalized task analytics in OrbisPM.

---

## Current State Analysis

### Existing Permission Model
- **60+ canonical permissions** across 3 scopes: `org`, `team`, `project`
- **DB-driven roles** with auto-seeding on org creation
- **Hierarchical resolution**: Project → Team (via mapping) → Org
- **Review pipeline**: `task_change_requests` table for approval workflow

### Existing Roles
| Scope | Roles |
|-------|-------|
| Org | `owner`, `admin`, `member`, `viewer`, `billing_admin` |
| Team | `team_lead`, `member`, `viewer` |
| Project | `lead`, `contributor`, `reviewer`, `observer` |

### Gaps Identified
1. ❌ No `projects.view_all` vs membership-only visibility distinction
2. ❌ All users can see all projects in org (no membership filtering)
3. ❌ Dashboard shows all org data regardless of user's scope
4. ❌ No role-based filtering in project/team lists
5. ❌ My Tasks lacks analytics beyond simple task lists

---

## Requirements Mapping

| Requirement | Implementation |
|-------------|----------------|
| Feature-wise access (read/create/write/update/approve) | Already exists via permissions table — need to enforce in handlers |
| Membership-only project visibility | Add `projects.view_all` permission + `ListByMembership` repo method |
| Workers see only their projects | Default to membership filter unless `projects.view_all` |
| Dashboard scoped to user's projects | New `GetPersonalDashboardStats` service method |
| Dedicated role dashboards | New `/dashboard/role-summary` endpoints |
| Role-wise filters in lists | Add `role` query param to list endpoints |
| My Tasks with analytics | Enhanced `/my-tasks` with stats + predictions |

---

## Phase 1: Membership-Based Project Visibility

### 1.1 Database Changes
Add new permission to seed:
```sql
INSERT INTO permissions (resource, action, scope) VALUES 
('projects', 'view_all', 'org');
```

Update role permissions:
- `owner`, `admin` → get `projects.view_all`
- `member`, `viewer` → do NOT get `projects.view_all` (see only memberships)

### 1.2 Backend Changes

**Repository** (`project_repo.go`):
```go
// New method
func (r *projectRepo) ListByMembership(ctx context.Context, orgID, userID uuid.UUID) ([]*domain.Project, error)
```
Query: Projects where user is in `project_members` OR user is in `team_members` of a team linked via `project_teams`.

**Service** (`project_service.go`):
```go
func (s *ProjectService) ListForUser(ctx context.Context, orgID, userID uuid.UUID, viewAll bool) ([]*domain.Project, error) {
    if viewAll {
        return s.repo.ListByOrg(ctx, orgID, nil)
    }
    return s.repo.ListByMembership(ctx, orgID, userID)
}
```

**Handler** (`project_handler.go`):
Check `projects.view_all` permission, call appropriate service method.

### 1.3 Frontend Changes
- `usePermissions().can('projects', 'view_all')` determines list behavior
- No UI change needed — backend returns filtered list

---

## Phase 2: Granular Permission Enforcement

### 2.1 Task Operations Matrix

| Operation | Permission Required | Notes |
|-----------|---------------------|-------|
| View task | `tasks.read` | Already checked |
| Create task | `tasks.create` | Already checked |
| Update non-reviewable fields | `tasks.update` | Fields: title, description, labels, etc. |
| Update reviewable fields | `tasks.direct_update` OR approval | Fields: priority, status, due_date, assignee |
| Approve/reject change request | `tasks.review` | Via change_request_handler |

### 2.2 Project Operations Matrix

| Operation | Permission Required |
|-----------|---------------------|
| View project | `projects.read` |
| Create project | `projects.create` |
| Update project settings | `projects.update` |
| Delete project | `projects.delete` |
| Manage members | `projects.manage_members` |

### 2.3 Backend Changes
- Audit all handlers to use `PermissionResolverMiddleware`
- Remove legacy `RBAC()` middleware usage
- Ensure `tasks.direct_update` vs `tasks.review` distinction is enforced

---

## Phase 3: Role-Scoped Dashboards

### 3.1 New Endpoints

```
GET /api/v1/orgs/{orgId}/dashboard/personal
  → User's projects, tasks, activity (membership-scoped)

GET /api/v1/orgs/{orgId}/dashboard/team-summary
  → Aggregate stats for teams user leads

GET /api/v1/orgs/{orgId}/dashboard/org-summary (admin only)
  → Full org stats
```

### 3.2 Dashboard Stats by Role

| Role | Sees |
|------|------|
| Owner/Admin | All org stats, all projects, all teams |
| Team Lead | Team stats + aggregate of projects linked to their teams |
| Member | Only projects they're assigned to |
| Viewer | Read-only view of assigned projects |

### 3.3 Implementation
**Service** (`dashboard_service.go`):
```go
func (s *DashboardService) GetPersonalStats(ctx, orgID, userID uuid.UUID) (*PersonalDashboardStats, error)
func (s *DashboardService) GetTeamLeadStats(ctx, orgID, userID uuid.UUID) (*TeamLeadDashboardStats, error)
```

**Handler**: Route based on role detection or explicit endpoint.

---

## Phase 4: Role-Wise Filters

### 4.1 Backend Changes

**Projects List** (`GET /orgs/{orgId}/projects?role=contributor`):
- Filter projects where user has specific role
- Useful for "show projects where I'm a lead" vs "show projects where I'm just viewing"

**Teams List** (`GET /orgs/{orgId}/teams?role=team_lead`):
- Filter teams where user has specific role

### 4.2 Repository Changes
```go
func (r *projectRepo) ListByMembershipAndRole(ctx context.Context, orgID, userID uuid.UUID, role string) ([]*domain.Project, error)
```

### 4.3 Frontend Changes
- Add role filter dropdown in Projects page
- Add role filter dropdown in Teams page
- Persist filter in URL params

---

## Phase 5: Enhanced My Tasks Analytics

### 5.1 New Stats

```go
type MyTasksStats struct {
    TotalAssigned      int `json:"total_assigned"`
    Completed          int `json:"completed"`
    InProgress         int `json:"in_progress"`
    Overdue            int `json:"overdue"`
    DueSoon            int `json:"due_soon"` // next 7 days
    CompletionRate     float64 `json:"completion_rate"`
    AvgCompletionDays  float64 `json:"avg_completion_days"`
    TasksByProject     map[string]int `json:"tasks_by_project"`
    TasksByPriority    map[string]int `json:"tasks_by_priority"`
    WeeklyTrend        []TrendPoint `json:"weekly_trend"` // last 4 weeks
}
```

### 5.2 Predictions (Optional)
Based on historical data:
- Estimated completion date for in-progress tasks
- Workload prediction for upcoming week
- Overdue risk score

### 5.3 Backend Changes
**Handler** (`dashboard_handler.go`):
```
GET /api/v1/orgs/{orgId}/dashboard/my-tasks-stats
```

**Repository** (`task_repo.go`):
New aggregate queries for personal stats.

### 5.4 Frontend Changes
- Enhanced My Tasks page with stats cards
- Charts for trends and distribution
- Prediction widgets (if implemented)

---

## Implementation Order

| Phase | Tasks | Estimated Effort |
|-------|-------|------------------|
| **1** | Membership visibility | 2-3 hours |
| **2** | Granular permission enforcement | 2-3 hours |
| **3** | Role-scoped dashboards | 3-4 hours |
| **4** | Role-wise filters | 1-2 hours |
| **5** | My Tasks analytics | 2-3 hours |

**Total: ~12-15 hours**

---

## Files to Modify

### Backend
- `backend/db/migrations/000008_*.sql` — New permission seeds
- `backend/internal/repository/project_repo.go` — `ListByMembership`
- `backend/internal/service/project_service.go` — `ListForUser`
- `backend/internal/handler/project_handler.go` — Use new service method
- `backend/internal/service/dashboard_service.go` — New (or extend)
- `backend/internal/handler/dashboard_handler.go` — New endpoints
- `backend/internal/repository/task_repo.go` — My tasks stats queries
- `backend/cmd/api/main.go` — Wire new routes

### Frontend
- `frontend/src/lib/api.ts` — New endpoints
- `frontend/src/app/[orgSlug]/projects/page.tsx` — Role filter
- `frontend/src/app/[orgSlug]/teams/page.tsx` — Role filter
- `frontend/src/app/[orgSlug]/my-tasks/page.tsx` — Analytics
- `frontend/src/app/[orgSlug]/dashboard/page.tsx` — Personal dashboard
- `frontend/src/types/domain.ts` — New types

---

## Success Criteria

1. ✅ Non-admin users only see projects they're members of
2. ✅ Dashboard stats are scoped to user's accessible projects
3. ✅ Role filter works in project/team lists
4. ✅ My Tasks shows personal analytics
5. ✅ All operations respect granular permissions
6. ✅ All existing tests pass
7. ✅ No regressions in admin functionality
