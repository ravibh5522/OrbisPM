# OrbisPM — Review-Based Task Pipeline & Modular RBAC Implementation Plan

> **Version**: 2.0 — Redesigned for review-gated workflows and DB-driven permission management.
> **Primary goals**: (1) Review-based task lifecycle — updates to status, deadline, checkpoints etc. require reviewer approval.
> (2) Modular, DB-driven roles & permissions at every level (org → team → project) — no hardcoded role-mapping tables.
> (3) Multi-team projects with user-scoped eligibility from linked teams.

---

## 1. Current State Analysis

### 1.1 What already exists

| Concept | Current State | Gap |
|---------|---------------|-----|
| **Task review** | `review_status` field on tasks, `SubmitForReview` + `MarkComplete` endpoints, `task_rules` table with rule types (`all_checklists_done`, `reviewer_approved`, etc.) | Only checks checklists; no configurable "review required" per field; no approval/rejection flow for individual field changes; no review audit trail |
| **Roles** | Hardcoded constants in `roles.go`: org 5 roles, team 2, project 4 | Roles cannot be created/renamed/deleted by admins; no DB-driven role definitions |
| **Permissions** | `custom_roles` table with JSONB `permissions`, `hasBuiltInPermission()` in middleware | Built-in roles use hardcoded matrix; custom roles only at org level; no team/project-level custom roles; no per-field permission granularity |
| **Project ↔ Team** | `projects.team_id` — single FK to one team | No multi-team; users added to project independently of team membership |
| **Task assignee** | Any UUID accepted; no validation against team/project members | No eligibility check |
| **Project settings** | `settings JSONB` with custom task statuses (color/label) | No reviewable-fields config; no workflow config |
| **CustomRoleService** | Embedded in `import_service.go` | Needs extraction to dedicated file |
| **CustomRoleHandler** | Embedded in `billing_handler.go` | Needs extraction to dedicated file |

### 1.2 Existing building blocks we'll leverage
- `task_rules` table & `TaskRuleRepository` — extensible rule engine
- `review_status` field on tasks — `pending_review`, `approved`, `rejected`
- `domain.EventReviewRequested` / `EventReviewCompleted` events
- `custom_roles` table with JSONB permissions
- `activity_log` for audit trail
- Real-time event publisher (SSE)
- Worker queue (Asynq) for async jobs

---

## 2. Architecture: Review-Based Task Pipeline

### 2.1 Core Concept — "Reviewable Fields"

Instead of only reviewing "task completion", **every sensitive field** on a task can be configured to require review before changes take effect. This is configurable per-project.

**Reviewable fields** (initial set, extensible in future):
- `status` — changing task status (e.g. todo → in_progress → done)
- `due_date` — extending or changing deadlines
- `assignee_id` — reassigning tasks
- `priority` — changing priority
- `estimated_hours` — changing estimates
- `checklists` — marking checklist items
- `labels` — changing categorization

### 2.2 How it works

```
┌──────────┐     ┌─────────────────┐     ┌──────────────┐     ┌──────────┐
│ Proposer  │────▸│ Change Request  │────▸│  Reviewer(s)  │────▸│ Applied  │
│ (any role)│     │ (pending)       │     │ approve/reject│     │ to task  │
└──────────┘     └─────────────────┘     └──────────────┘     └──────────┘
                         │                       │
                         │   auto-approve if     │   rejected → proposer
                         │   user has permission  │   notified, task unchanged
                         ▼                       ▼
                  ┌─────────────────┐     ┌──────────────┐
                  │ No review needed│     │ Review audit  │
                  │ (apply directly)│     │ log created   │
                  └─────────────────┘     └──────────────┘
```

**Rules**:
1. Project settings define which fields require review (`reviewable_fields` in project `settings` JSONB).
2. When a user edits a reviewable field, the system checks if the user's **effective permission** includes `tasks.direct_update` (bypass review). If yes → apply directly. If no → create a **change request**.
3. Change requests are stored in a new `task_change_requests` table.
4. Users with `tasks.review` permission can approve or reject.
5. On approval → field changes are applied atomically to the task. On rejection → task remains unchanged, proposer is notified.
6. All reviews create entries in `activity_log` for full audit trail.

### 2.3 New Domain: `TaskChangeRequest`

```go
type TaskChangeRequest struct {
    ID          uuid.UUID      `json:"id"`
    OrgID       uuid.UUID      `json:"org_id"`
    TaskID      uuid.UUID      `json:"task_id"`
    ProposerID  uuid.UUID      `json:"proposer_id"`
    ReviewerID  *uuid.UUID     `json:"reviewer_id,omitempty"`
    Status      string         `json:"status"`       // pending, approved, rejected
    Changes     map[string]any `json:"changes"`      // {"status": "done", "due_date": "2026-04-01"}
    Reason      string         `json:"reason"`       // proposer's reason for change
    ReviewNote  string         `json:"review_note"`  // reviewer's note
    CreatedAt   time.Time      `json:"created_at"`
    ReviewedAt  *time.Time     `json:"reviewed_at,omitempty"`
}
```

### 2.4 Review-Aware Task Update Flow (service layer)

```
TaskService.Update(ctx, taskID, params, actorID):
  1. Load task
  2. Load project settings → get reviewable_fields list
  3. Partition params into:
     - directFields: fields NOT in reviewable_fields (apply immediately)
     - reviewFields: fields IN reviewable_fields
  4. If reviewFields is empty → apply all directly (existing flow)
  5. If reviewFields is non-empty:
     a. Check actor's effective permission for "tasks.direct_update"
        - YES → apply all directly (lead/admin bypass)
        - NO  → apply directFields immediately
               → create TaskChangeRequest for reviewFields
               → publish EventReviewRequested
               → return task + change_request in response
```

---

## 3. Architecture: Modular DB-Driven Permission System

### 3.1 Design Principles
1. **No hardcoded permission matrices.** All permissions stored in DB, seeded with defaults.
2. **Roles are DB records**, not Go constants. Admins can create, rename, modify permissions.
3. **Three scopes**: org, team, project — each with independent role ↔ permission assignments.
4. **Inheritance chain**: project permission check falls through to team → org if no explicit assignment.
5. **Backward compatible**: existing `org_members.role`, `team_members.role`, `project_members.role` TEXT columns remain. They reference `roles.slug`.

### 3.2 New Database Tables

#### `permissions` — Canonical permission registry
```sql
CREATE TABLE permissions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource   TEXT NOT NULL,           -- e.g. 'tasks', 'projects', 'teams', 'billing'
    action     TEXT NOT NULL,           -- e.g. 'create', 'read', 'update', 'delete', 'review', 'direct_update'
    scope      TEXT NOT NULL DEFAULT 'org' CHECK (scope IN ('org', 'team', 'project')),
    description TEXT,
    UNIQUE(resource, action, scope)
);
```

#### `roles` — DB-driven role definitions (replaces hardcoded constants)
```sql
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    scope       TEXT NOT NULL CHECK (scope IN ('org', 'team', 'project')),
    slug        TEXT NOT NULL,          -- e.g. 'owner', 'admin', 'member', 'lead', 'reviewer'
    name        TEXT NOT NULL,          -- Display name: "Project Lead"
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT false,  -- true = cannot be deleted, core roles
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, scope, slug)
);
```

#### `role_permissions` — Many-to-many: which roles have which permissions
```sql
CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY(role_id, permission_id)
);
```

#### `project_teams` — Multi-team projects
```sql
CREATE TABLE project_teams (
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, team_id)
);
CREATE INDEX idx_project_teams_team ON project_teams(team_id);
```

#### `task_change_requests` — Review pipeline
```sql
CREATE TABLE task_change_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    proposer_id  UUID NOT NULL,
    reviewer_id  UUID,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    changes      JSONB NOT NULL,
    reason       TEXT,
    review_note  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at  TIMESTAMPTZ
);
CREATE INDEX idx_change_requests_task ON task_change_requests(task_id, status);
CREATE INDEX idx_change_requests_org ON task_change_requests(org_id, status);
CREATE INDEX idx_change_requests_reviewer ON task_change_requests(reviewer_id) WHERE status = 'pending';
```

### 3.3 Seed Data — Default System Roles & Permissions

On org creation, the system seeds these roles. Admins can later modify permissions or create custom roles.

**Org-scope roles:**
| Slug | Name | System | Key permissions |
|------|------|--------|-----------------|
| `owner` | Owner | ✅ | `*.*` (all permissions) |
| `admin` | Admin | ✅ | All except `org.delete`, `org.transfer_ownership` |
| `member` | Member | ✅ | `projects.read`, `tasks.*`, `comments.*`, `checklists.*`, `teams.read` |
| `viewer` | Viewer | ✅ | `*.read` only |
| `billing_admin` | Billing Admin | ✅ | `billing.*`, `*.read` |

**Team-scope roles:**
| Slug | Name | System | Key permissions |
|------|------|--------|-----------------|
| `team_lead` | Team Lead | ✅ | `team.update`, `team.manage_members`, `projects.create`, `tasks.*` |
| `member` | Member | ✅ | `tasks.*`, `comments.*`, `projects.read` |
| `viewer` | Viewer | ✅ | `*.read` |

**Project-scope roles:**
| Slug | Name | System | Key permissions |
|------|------|--------|-----------------|
| `lead` | Project Lead | ✅ | `project.*`, `tasks.*`, `tasks.review`, `tasks.direct_update`, `members.manage` |
| `contributor` | Contributor | ✅ | `tasks.create`, `tasks.update`, `tasks.read`, `comments.*`, `checklists.*` |
| `reviewer` | Reviewer | ✅ | `tasks.read`, `tasks.review`, `tasks.direct_update`, `comments.*` |
| `observer` | Observer | ✅ | `*.read`, `comments.create` |

### 3.4 Permission Resolution Algorithm

```
ResolvePermission(userID, orgID, scope, scopeID, resource, action):

  1. Get org membership → orgRole
     - If orgRole.slug == 'owner' → ALLOW (owner bypasses everything)
     - If orgRole.slug == 'admin' → ALLOW for everything except ownership

  2. If scope == 'project':
     a. Check project_members for (projectID, userID) → projectRole
        - If found → check role_permissions for (projectRole, resource, action)
     b. Else: check project_teams for all linked teams
        - For each team, check team_members for (teamID, userID) → teamRole
        - Map highest teamRole to project scope via DEFAULT_TEAM_PROJECT_MAP
          or org-configurable mapping
        - Check role_permissions
     c. Else: fall through to org-level check

  3. If scope == 'team':
     a. Check team_members for (teamID, userID) → teamRole
        - If found → check role_permissions
     b. Else: fall through to org-level check

  4. Org-level: check role_permissions for (orgRole, resource, action)

  5. No match → DENY
```

### 3.5 Default Team → Project Role Inheritance Map

Stored in `orgs.settings.team_project_role_map` JSONB (configurable per org):

```json
{
  "team_lead": "lead",
  "member": "contributor",
  "viewer": "observer"
}
```

Admin can change this mapping — e.g., make `member` inherit `observer` instead of `contributor`.

---

## 4. API Design

### 4.1 Permission & Role Management

```
── /api/v1/orgs/{orgId}/
   ├── permissions                          GET    — List all permissions for this org
   ├── roles                                GET    — List all roles (filterable by ?scope=)
   │   ├──                                  POST   — Create a custom role
   │   └── /{roleId}                        GET    — Get role with permissions
   │       ├──                              PATCH  — Update role name/description
   │       ├──                              DELETE — Delete (non-system) role
   │       └── /permissions                 PUT    — Set role permissions (array of permission IDs)
   └── settings/team-project-role-map       GET/PUT — Get/set team→project role inheritance map
```

### 4.2 Project Team Management

```
── /api/v1/orgs/{orgId}/projects/{projId}/
   ├── teams                                GET    — List linked teams
   │   ├──                                  POST   — Link team(s) {team_ids: [...]}
   │   └── /{teamId}                        DELETE — Unlink a team (min 1 must remain)
   └── eligible-members                     GET    — Union of all linked team members
```

### 4.3 Task Change Requests (Review Pipeline)

```
── /api/v1/orgs/{orgId}/projects/{projId}/tasks/{taskId}/
   ├── change-requests                      GET    — List change requests for this task
   │   └──                                  POST   — Create change request (if auto-gating)
   └── change-requests/{crId}
       ├── approve                           POST   — Approve (applies changes)
       └── reject                            POST   — Reject (with note)

── /api/v1/orgs/{orgId}/projects/{projId}/
   └── change-requests?status=pending        GET    — List all pending CRs in project
```

### 4.4 Modified Existing Endpoints

| Endpoint | Change |
|----------|--------|
| `GET /projects` | Add `?team_id=` filter |
| `POST /projects` | Accept `team_ids[]` instead of single `team_id` |
| `PATCH /tasks/{id}` | Intercept reviewable field changes, return `202 + change_request` or `200 + task` |
| `GET /projects/{id}/members` | Return `source` field (direct / team_name / inherited) |

### 4.5 Key Response Shapes

**Task update response (when review required):**
```json
{
  "task": { /* current task, unchanged reviewable fields */ },
  "change_request": {
    "id": "...", "status": "pending",
    "changes": {"due_date": "2026-04-15", "status": "done"},
    "proposer_id": "..."
  },
  "applied_changes": {"priority": "high"},
  "pending_review": true
}
```

**Effective members response:**
```json
{
  "data": [
    {
      "user_id": "...", "email": "...", "display_name": "...",
      "role": "contributor",
      "source": "team",           // "direct" | "team"
      "source_team_id": "...",
      "source_team_name": "Backend Team"
    }
  ]
}
```

---

## 5. Frontend Changes

### 5.1 Projects Page
- **Team filter dropdown** above project grid
- **Multi-team selector** in "New Project" form (min 1 required)
- **Team badges** on project cards

### 5.2 Task Preview Panel — Review Flow
- When updating a reviewable field: show inline notification "Change submitted for review" or "Applied directly"
- **Pending changes indicator** on task card (badge with count of pending CRs)
- **Change request panel** (within task detail): list pending/approved/rejected CRs with approve/reject buttons for reviewers
- Reviewers see pending CRs in a global project-level queue

### 5.3 Project-Level Review Dashboard
- Tab/section in project settings: "Pending Reviews" — list all pending change requests
- Quick approve/reject actions from this view

### 5.4 Permission Management Page (Org Settings)
- **Roles tab**: list all roles grouped by scope (org/team/project), create/edit custom roles
- **Per-role permission editor**: checkbox grid (resource × action)
- **Team→Project role map** editor: for each team role, select which project role it maps to
- **Reviewable fields config** per project: checklist of which fields require review

### 5.5 Member Management Updates
- Assignee/reporter picker: only shows eligible members (from linked teams)
- Project members page: shows `source` column (Direct / via Team Name)

---

## 6. Implementation Tasks (30 tasks)

### Phase 1: Database Migration (Tasks 1–4)

| # | Task | Description | Files |
|---|------|-------------|-------|
| 1 | **Migration 000006: `permissions` + `roles` + `role_permissions` tables** | Create the three core permission tables. Seed canonical permissions (all resource/action combos). | `000006_permission_system.up.sql`, `.down.sql` |
| 2 | **Migration 000006: `project_teams` + `task_change_requests` tables** | Create multi-team join table. Create change request table with indexes. Migrate existing `projects.team_id` data into `project_teams`. Make `projects.team_id` nullable. | Same migration file |
| 3 | **Migration 000006: Seed system roles** | For a trigger/function that seeds default org/team/project roles + role_permissions whenever a new org is created. Also seed for all existing orgs. | Same migration file |
| 4 | **Migration 000006: Add `reviewable_fields` to project settings** | Add default `reviewable_fields: []` to `projects.settings` JSONB for all existing projects via UPDATE. | Same migration file |

### Phase 2: Backend Domain Models (Tasks 5–7)

| # | Task | Description | Files |
|---|------|-------------|-------|
| 5 | **New domain types: `Permission`, `Role`, `RolePermission`** | Structs matching the new tables. `Role` has `Scope`, `Slug`, `IsSystem`, `Permissions []Permission`. | `internal/domain/permission.go` (NEW) |
| 6 | **New domain type: `TaskChangeRequest`** | Struct with status constants (`CRPending`, `CRApproved`, `CRRejected`). Add new event types `EventChangeRequestCreated`, `EventChangeRequestApproved`, `EventChangeRequestRejected`. | `internal/domain/change_request.go` (NEW), `events.go` (MODIFY) |
| 7 | **Update existing domain types** | `Project`: add `TeamIDs []uuid.UUID`. `ProjectMember`: add `Source`, `SourceTeamID`, `SourceTeamName`. `CustomRole`: mark as deprecated (replaced by `Role`). Remove hardcoded role constants from `roles.go`, replace with slug constants for reference only. | `project.go`, `roles.go` (MODIFY) |

### Phase 3: Backend Repository Layer (Tasks 8–13)

| # | Task | Description | Files |
|---|------|-------------|-------|
| 8 | **`PermissionRepository`** | `List(ctx, scope)`, `ListByRole(ctx, roleID)`, `GetByResourceAction(ctx, resource, action, scope)` | `permission_repo.go` (NEW), `interfaces.go` (MODIFY) |
| 9 | **`RoleRepository`** | `Create`, `GetByID`, `GetBySlug(ctx, orgID, scope, slug)`, `Update`, `Delete`, `ListByOrg(ctx, orgID, scope?)`, `SetPermissions(ctx, tx, roleID, permIDs)`, `GetPermissions(ctx, roleID)` | `role_repo.go` (NEW), `interfaces.go` (MODIFY) |
| 10 | **`ProjectTeamRepository`** | `Link(ctx, tx, projectID, teamID)`, `Unlink(ctx, tx, projectID, teamID)`, `ListByProject(ctx, projectID)`, `ListByTeam(ctx, teamID)`, `Count(ctx, projectID)` | `project_team_repo.go` (NEW), `interfaces.go` (MODIFY) |
| 11 | **`TaskChangeRequestRepository`** | `Create`, `GetByID`, `Update`, `ListByTask(ctx, taskID, status?)`, `ListByProject(ctx, projectID, status?)`, `ListPendingForReviewer(ctx, userID)` | `change_request_repo.go` (NEW), `interfaces.go` (MODIFY) |
| 12 | **Update `ProjectRepository`** | `ListByOrg` accepts optional `teamID` filter via JOIN on `project_teams`. `Create` no longer requires `team_id` (nullable). | `project_repo.go` (MODIFY) |
| 13 | **Update `ProjectMemberRepository`** | New method `ListEffectiveMembers(ctx, projectID)` — UNION of direct `project_members` + inherited from `team_members` via `project_teams`, with source/team info. | `project_member_repo.go` (MODIFY) |

### Phase 4: Backend Service Layer (Tasks 14–20)

| # | Task | Description | Files |
|---|------|-------------|-------|
| 14 | **`PermissionService`** | `ListPermissions(scope)`, `ListRoles(orgID, scope)`, `CreateRole(orgID, scope, name, slug, permIDs)`, `UpdateRole`, `DeleteRole` (reject if `is_system`), `SetRolePermissions`, `GetRolePermissions`. Seeder function for new orgs. | `permission_service.go` (NEW) |
| 15 | **`PermissionResolver`** | `HasPermission(ctx, userID, orgID, scope, scopeID, resource, action) bool`. `GetEffectiveRole(ctx, userID, orgID, scope, scopeID) *Role`. Implements the resolution algorithm from §3.4. Uses `orgs.settings.team_project_role_map` for team→project inheritance. Caches per-request via context. | `permission_resolver.go` (NEW) |
| 16 | **`ProjectTeamService`** | `LinkTeams`, `UnlinkTeam` (enforce min 1), `ListTeams`, `ListEligibleMembers`. Validate team belongs to same org. | `project_team_service.go` (NEW) |
| 17 | **`TaskChangeRequestService`** | `ProposeChange(ctx, taskID, proposerID, changes, reason)`, `Approve(ctx, crID, reviewerID, note)`, `Reject(ctx, crID, reviewerID, note)`, `ListByTask`, `ListByProject`. Approve atomically applies `changes` JSONB to the task. | `change_request_service.go` (NEW) |
| 18 | **Update `TaskService.Update`** | Integrate review pipeline: partition fields into direct vs reviewable; check `PermissionResolver.HasPermission(tasks.direct_update)`; route reviewable fields to `TaskChangeRequestService.ProposeChange`. Return combined response. | `task_service.go` (MODIFY) |
| 19 | **Update `ProjectService`** | `Create` accepts `team_ids[]`, calls `ProjectTeamService.LinkTeams`. `ListByOrg` passes `teamID` filter. Remove single `TeamID` from `CreateProjectParams`. | `project_service.go` (MODIFY) |
| 20 | **Extract `CustomRoleService` → migrate to `PermissionService`** | Move CustomRoleService out of `import_service.go`. Either keep as compatibility shim or merge into PermissionService. Update all callers. | `import_service.go` (MODIFY), `permission_service.go` (MODIFY) |

### Phase 5: Backend Handler & Middleware (Tasks 21–25)

| # | Task | Description | Files |
|---|------|-------------|-------|
| 21 | **`PermissionHandler`** | Routes: `GET /permissions`, `GET/POST /roles`, `GET/PATCH/DELETE /roles/{id}`, `PUT /roles/{id}/permissions`, `GET/PUT /settings/team-project-role-map`. | `permission_handler.go` (NEW) |
| 22 | **`ProjectTeamHandler`** | Routes: `GET/POST /projects/{projId}/teams`, `DELETE /projects/{projId}/teams/{teamId}`, `GET /projects/{projId}/eligible-members`. | `project_team_handler.go` (NEW) |
| 23 | **`ChangeRequestHandler`** | Routes: `GET/POST /tasks/{taskId}/change-requests`, `POST /change-requests/{crId}/approve`, `POST /change-requests/{crId}/reject`, `GET /projects/{projId}/change-requests?status=`. | `change_request_handler.go` (NEW) |
| 24 | **Rewrite RBAC middleware** | Replace `RequireProjectRole`/`RequireTeamRole`/`RequirePermission`/`RBAC` with unified `RequirePermission(resolver, resource, action)`. Uses `PermissionResolver` for DB-driven checks. Keep context injection of effective role + permissions for handler use. | `middleware/rbac.go` (REWRITE) |
| 25 | **Wire everything in `main.go`** | Instantiate new repos/services/handlers. Register new routes under appropriate groups. Ensure backward compatibility for existing routes. Extract CustomRoleHandler from `billing_handler.go`. | `cmd/api/main.go` (MODIFY), `billing_handler.go` (MODIFY) |

### Phase 6: Frontend — Permission Management UI (Tasks 26–28)

| # | Task | Description | Files |
|---|------|-------------|-------|
| 26 | **API client updates** | Add `api.permissions.list()`, `api.roles.list/create/update/delete/setPermissions()`, `api.projectTeams.list/link/unlink()`, `api.changeRequests.list/approve/reject()`, `api.projects.eligibleMembers()`. Update `api.projects.create()` for `team_ids[]`. | `lib/api.ts` (MODIFY) |
| 27 | **TypeScript types** | Add `Permission`, `Role`, `RolePermission`, `TaskChangeRequest`, `EffectiveMember` types. Update `Project` interface (add `team_ids`). Update `CustomRole` to include scope. | `types/domain.ts` (MODIFY) |
| 28 | **Permission management page** | New page under org settings: role list (grouped by scope), create role modal, permission editor grid (resource × action checkboxes), delete non-system roles. Team→project role map editor. | `app/[orgSlug]/settings/roles/page.tsx` (NEW) |

### Phase 7: Frontend — Project & Team Changes (Tasks 29–31)

| # | Task | Description | Files |
|---|------|-------------|-------|
| 29 | **Projects page: team filter + multi-team form** | Add team filter dropdown. Update "New Project" form to multi-select teams. Show team badges on cards. | `app/[orgSlug]/projects/page.tsx` (MODIFY) |
| 30 | **Project settings: team management** | Link/unlink teams from project detail. Show linked teams. "Reviewable Fields" config checkboxes in project settings. | `components/projects/project-settings.tsx` (MODIFY) |
| 31 | **Project members: effective members view** | Show combined members with source (Direct / Team Name). Allow explicit role override. Restrict assignee/reporter picker to eligible members. | `components/tasks/task-preview-panel.tsx` (MODIFY), project members section |

### Phase 8: Frontend — Review Pipeline UI (Tasks 32–34)

| # | Task | Description | Files |
|---|------|-------------|-------|
| 32 | **Task preview: inline review flow** | When task update returns `pending_review: true`, show toast/badge "Change submitted for review". Show pending changes indicator on task. | `components/tasks/task-preview-panel.tsx` (MODIFY) |
| 33 | **Task change request panel** | New panel/tab in task detail: list pending CRs with diff view, approve/reject buttons for reviewers, status history. | `components/tasks/task-change-requests.tsx` (NEW) |
| 34 | **Project review dashboard** | Section in project view: pending reviews queue. Quick approve/reject. Filter by field type. Reviewer assignment. | `components/projects/project-reviews.tsx` (NEW) |

### Phase 9: Frontend — Permission Hook & Guards (Task 35)

| # | Task | Description | Files |
|---|------|-------------|-------|
| 35 | **Rewrite `usePermissions` hook** | Replace hardcoded matrix with API-backed permission check. Fetch user's effective role + permissions at project/team level. Cache per org+scope. Guard UI elements (buttons, actions) using `can(resource, action, scope?, scopeId?)`. | `hooks/use-permissions.ts` (REWRITE) |

### Phase 10: Testing, Cleanup & Migration (Tasks 36–38)

| # | Task | Description | Files |
|---|------|-------------|-------|
| 36 | **Backend integration tests** | Test: permission resolution chain, role CRUD, change request flow (propose → approve → verify task updated; propose → reject → verify task unchanged), multi-team project creation, team filter, eligible members, role inheritance. | `*_test.go` files |
| 37 | **Frontend E2E tests** | Test: role management UI, reviewable field flow (edit → pending → approve), team management, permission gating of UI elements. | Cypress/Playwright tests |
| 38 | **Deprecate old `custom_roles` table + hardcoded role constants** | Migration 000007: drop `custom_roles` table after migrating data into `roles` + `role_permissions`. Remove `hasBuiltInPermission()` from middleware. Remove `roles.go` constants (keep as slug reference only). | `000007_deprecate_custom_roles.up.sql` |

---

## 7. Migration Strategy

### 7.1 Migration 000006 (main migration)
```sql
-- Up: Create tables, seed permissions, seed roles for all existing orgs,
--     migrate project_teams from projects.team_id, make team_id nullable
-- Down: Drop new tables, restore projects.team_id NOT NULL from project_teams data
```

### 7.2 Migration 000007 (cleanup — run after full rollout)
```sql
-- Up: Migrate custom_roles data into roles+role_permissions, drop custom_roles
-- Down: Recreate custom_roles from roles+role_permissions
```

### 7.3 Rollback Safety
- `project_teams` data can rebuild `projects.team_id` (pick first team)
- `roles` + `role_permissions` can rebuild `custom_roles` JSONB
- Middleware fallback: if new tables not found, fall back to legacy checks

---

## 8. Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| Permission resolution adds queries | Cache resolved permissions in request context after first check. Use JOIN instead of multiple queries. |
| `project_teams` join on project list | Composite index `(team_id, project_id)` + `(project_id)` |
| Role/permission lookups | Cache roles + permissions per org in Redis (invalidate on role change) |
| Change request writes | Async notification via worker queue, not blocking |
| Effective member resolution | Pre-computed via CTE in single query |

---

## 9. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Breaking existing role checks | High | Dual-mode middleware: check new `roles` table first, fallback to old `hasBuiltInPermission` until migration 000007 |
| Review pipeline blocks users unexpectedly | Medium | Default `reviewable_fields: []` (empty) — review is opt-in per project |
| Performance regression on task update | Medium | Only partition fields if `reviewable_fields` is non-empty; skip entirely for empty |
| Custom role data loss during migration | High | Migration preserves all existing `custom_roles` data into new `roles` table with `is_system=false` |
| Frontend permission cache stale | Low | Invalidate on role change event via SSE |

---

## 10. File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `db/migrations/000006_permission_system.{up,down}.sql` | NEW | 1 |
| `internal/domain/permission.go` | NEW | 2 |
| `internal/domain/change_request.go` | NEW | 2 |
| `internal/domain/project.go` | MODIFY | 2 |
| `internal/domain/roles.go` | MODIFY | 2 |
| `internal/domain/events.go` | MODIFY | 2 |
| `internal/repository/interfaces.go` | MODIFY | 3 |
| `internal/repository/permission_repo.go` | NEW | 3 |
| `internal/repository/role_repo.go` | NEW | 3 |
| `internal/repository/project_team_repo.go` | NEW | 3 |
| `internal/repository/change_request_repo.go` | NEW | 3 |
| `internal/repository/project_repo.go` | MODIFY | 3 |
| `internal/repository/project_member_repo.go` | MODIFY | 3 |
| `internal/service/permission_service.go` | NEW | 4 |
| `internal/service/permission_resolver.go` | NEW | 4 |
| `internal/service/project_team_service.go` | NEW | 4 |
| `internal/service/change_request_service.go` | NEW | 4 |
| `internal/service/task_service.go` | MODIFY | 4 |
| `internal/service/project_service.go` | MODIFY | 4 |
| `internal/service/import_service.go` | MODIFY | 4 |
| `internal/handler/permission_handler.go` | NEW | 5 |
| `internal/handler/project_team_handler.go` | NEW | 5 |
| `internal/handler/change_request_handler.go` | NEW | 5 |
| `internal/handler/billing_handler.go` | MODIFY | 5 |
| `internal/middleware/rbac.go` | REWRITE | 5 |
| `cmd/api/main.go` | MODIFY | 5 |
| `frontend/src/lib/api.ts` | MODIFY | 6 |
| `frontend/src/types/domain.ts` | MODIFY | 6 |
| `frontend/src/app/[orgSlug]/settings/roles/page.tsx` | NEW | 6 |
| `frontend/src/app/[orgSlug]/projects/page.tsx` | MODIFY | 7 |
| `frontend/src/components/projects/project-settings.tsx` | MODIFY | 7 |
| `frontend/src/components/tasks/task-preview-panel.tsx` | MODIFY | 7–8 |
| `frontend/src/components/tasks/task-change-requests.tsx` | NEW | 8 |
| `frontend/src/components/projects/project-reviews.tsx` | NEW | 8 |
| `frontend/src/hooks/use-permissions.ts` | REWRITE | 9 |
| `db/migrations/000007_deprecate_custom_roles.{up,down}.sql` | NEW | 10 |
