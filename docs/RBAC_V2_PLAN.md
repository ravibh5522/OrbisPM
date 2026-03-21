# OrbisPM — RBAC V2: Membership-Based Access Control

## Detailed Implementation Plan

> **Date:** March 12, 2026  
> **Status:** PLANNING  
> **Scope:** Backend + Frontend  
> **Estimated Phases:** 5

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Requirements](#3-requirements)
4. [Gap Analysis](#4-gap-analysis)
5. [Architecture Design](#5-architecture-design)
6. [Phase 1: Project Ownership & Creator Auto-Membership](#phase-1-project-ownership--creator-auto-membership)
7. [Phase 2: Enforce Permission Resolver on All Routes](#phase-2-enforce-permission-resolver-on-all-routes)
8. [Phase 3: Custom Roles Enhancement](#phase-3-custom-roles-enhancement)
9. [Phase 4: Team Takeover & Project Governance](#phase-4-team-takeover--project-governance)
10. [Phase 5: Frontend Permission Integration](#phase-5-frontend-permission-integration)
11. [Migration Strategy](#migration-strategy)
12. [Testing Plan](#testing-plan)
13. [Rollout Strategy](#rollout-strategy)

---

## 1. Executive Summary

Transform OrbisPM's authorization from a **coarse-grained role check** (RequireOrgMember/RequireOrgAdmin) to a **fine-grained, membership-based permission system** where:

- **Org Admins** have full cross-cutting access without joining teams/projects
- **Members** get permissions based on their team and project roles
- **Custom roles** allow org admins to define bespoke permission sets
- **Project creators** automatically become project leads for unlinked projects
- **Team association** enables team leads to govern project settings and override creator privileges

---

## 2. Current State Analysis

### What EXISTS and WORKS

| Component | Status | Notes |
|-----------|--------|-------|
| `permissions` table (60+ canonical perms) | ✅ Exists | org, team, project scoped |
| `roles` table (12 system roles per org) | ✅ Exists | 5 org, 3 team, 4 project |
| `role_permissions` join table | ✅ Exists | Maps roles → permissions |
| `project_teams` multi-team linking | ✅ Exists | project ↔ team M:N |
| `project_members` with source tracking | ✅ Exists | `source` = direct/team, `source_team_id` |
| `seed_org_roles()` trigger on org create | ✅ Exists | Auto-seeds all 12 roles |
| Custom role CRUD API | ✅ Exists | `POST/PATCH/DELETE /permissions/roles` |
| `PermissionResolver.HasPermission()` | ✅ Exists | Full resolution chain |
| `PermissionResolverMiddleware` | ✅ Exists | But barely used in routes |
| Team→Project role mapping | ✅ Exists | `DefaultTeamProjectRoleMap` in org settings |
| Frontend `usePermissions` hook | ✅ Exists | Org-level only |
| Frontend `PermissionGate` component | ✅ Exists | Wraps UI elements |

### What EXISTS but is NOT USED

| Component | Issue |
|-----------|-------|
| `PermissionResolverMiddleware` | Not wired to any route except maybe a few deprecated paths |
| `RequireTeamRole` middleware | Exists but no routes use it |
| `RequireProjectRole` middleware | Exists but no routes use it |
| Team-scope permissions (13 perms) | Seeded but not enforced |
| Project-scope permissions (17 perms) | Seeded but not enforced |
| Custom roles | API exists but no route enforces custom role permissions |

### What is MISSING

| Requirement | Status |
|-------------|--------|
| Auto-add creator as project lead on `Create` | ❌ Missing |
| Project-level middleware on project routes | ❌ Missing — routes use only `RequireOrgMember` |
| Team-level middleware on team routes | ❌ Missing — routes use only `RequireOrgMember` |
| "Project owner" role concept | ❌ Missing — no ownership transfer |
| Team takeover workflow | ❌ Missing — no governance rules |
| Frontend project/team-scoped permission checks | ❌ Missing — only org-level |
| Permission audit trail | ❌ Missing |
| Custom role assignment to team/project members | ❌ Partial — roles table supports it, assignment flow missing |

---

## 3. Requirements

### R1: Admin Cross-Cutting Access
> *"Admins who have all access across all projects and teams without joining them."*

- Org `owner` and `admin` roles MUST bypass ALL team and project permission checks.
- They should NOT need to be in `team_members` or `project_members` tables.
- They CAN see and manage all projects, all teams, all tasks.

**Current state:** ✅ Already implemented in `PermissionResolver.HasPermission()` — owner bypasses everything, admin bypasses everything except `org.delete` and `org.transfer_ownership`. Also implemented in all legacy middleware (`RequireOrgAdmin`, `RequireTeamRole`, `RequireProjectRole`).

**Gap:** The middleware is correctly coded, but it's not _applied_ to routes. Routes currently use only `RequireOrgMember` which gives ANY member of the org access to ALL projects.

### R2: Predefined Roles with Permissions
> *"Predefined roles with their permissions."*

System roles with pre-configured permission sets:

**Org Scope:**
| Role | Slug | Permissions |
|------|------|-------------|
| Owner | `owner` | All 40+ org permissions |
| Admin | `admin` | All except `org.delete`, `org.transfer_ownership` |
| Member | `member` | `*.read` + tasks/comments/checklists/attachments CRUD + `templates.read` |
| Viewer | `viewer` | `*.read` only |
| Billing Admin | `billing_admin` | `*.read` + `billing.*` |

**Team Scope:**
| Role | Slug | Permissions |
|------|------|-------------|
| Team Lead | `team_lead` | All 13 team permissions |
| Member | `member` | `*.read` + `*.create` + `*.update` + `comments.create/read` |
| Viewer | `viewer` | `*.read` only |

**Project Scope:**
| Role | Slug | Permissions |
|------|------|-------------|
| Lead | `lead` | All 17 project permissions |
| Contributor | `contributor` | `*.read/create/update` (no `project.update/delete`, `members.manage`, `tasks.review/direct_update`) |
| Reviewer | `reviewer` | `*.read` + `tasks.review/direct_update` + `comments.create/read` |
| Observer | `observer` | `*.read` + `comments.create` |

**Current state:** ✅ All 12 system roles are seeded by `seed_org_roles()` with correct permission mappings.

**Gap:** These roles are defined but not enforced — routes don't check them. The permissions exist in the DB but most requests bypass permission checking entirely.

### R3: Members Get Permissions from Team/Project Roles
> *"Members who have permission according to their team roles and project roles."*

Permission resolution chain:
1. Check org membership (must be member)
2. Owner/Admin → bypass
3. Check project-level direct membership → map role → check permissions
4. Check team-inherited membership (via `project_teams`) → map team role to project role → check permissions
5. Fall through to org-level role permissions

**Current state:** ✅ `PermissionResolver.HasPermission()` implements this exact chain correctly.

**Gap:** The resolver EXISTS but is not WIRED to routes. All project/task routes use `RequireOrgMember(pool)` which only checks "are you in this org?" — not "do you have permission for this specific action on this project?"

### R4: Custom Roles
> *"Custom roles."*

Org admins can create roles with any combination of permissions:
- Pick a scope (org/team/project)
- Pick a slug and name
- Select which permissions to include
- Assign the custom role to members

**Current state:** ✅ Custom role CRUD exists:
- `POST /orgs/{orgId}/permissions/roles` — Create
- `PATCH /orgs/{orgId}/permissions/roles/{roleId}` — Update
- `DELETE /orgs/{orgId}/permissions/roles/{roleId}` — Delete
- `PUT /orgs/{orgId}/permissions/roles/{roleId}/permissions` — Set permissions

**Gap:** Custom roles can be created but:
1. No UI to assign a custom role to a team member or project member (the role field is a plain TEXT, so it CAN store any slug, but the frontend dropdowns only show system roles)
2. When checking permissions, `roleHasPermission()` looks up by slug — if a member's `role` column matches a custom role slug, it will work. But the assignment flow is incomplete.
3. Frontend `usePermissions` only checks org-level roles, not custom team/project roles

### R5: Project Creator Ownership + Team Takeover
> *"If a user creates a project and it's not associated to any team, then they will be that project's full admin. But when it's associated to a team, then members in that team who have access to modify project roles and settings can take over and manage rules and remove the owner."*

This is the most complex requirement. It needs:

**Phase A: Project Creator = Auto Project Lead**
- When a user creates a project, automatically add them to `project_members` as `lead`
- If the project has no team association, the creator is the sole authority

**Phase B: Team Association = Governance Transfer**
- When a project is linked to a team via `project_teams`:
  - Team leads (with `project.update` permission) can modify project settings
  - Team leads (with `members.manage` permission) can manage project members
  - Team leads CAN change the creator's role (downgrade from `lead` to `contributor` or even remove)
  - The team's governance overrides individual project lead privileges when there's a conflict

**Current state:**
- ❌ Project creation does NOT add creator to `project_members`
- ✅ `project_teams` linking exists (LinkTeams/UnlinkTeam)
- ❌ No governance transfer logic
- ❌ No "original creator" tracking

**Gap:** This is entirely unimplemented.

---

## 4. Gap Analysis Summary

```
┌─────────────────────────────────────┬──────────┬──────────────┐
│ Feature                             │ Backend  │ Frontend     │
├─────────────────────────────────────┼──────────┼──────────────┤
│ R1: Admin cross-cutting access      │ ✅ Code  │ ✅ Works     │
│    → Enforce via middleware          │ ⚠️ Not   │ n/a          │
│      on routes                      │   wired  │              │
├─────────────────────────────────────┼──────────┼──────────────┤
│ R2: Predefined roles + permissions  │ ✅ Seeded│ ⚠️ Org-only  │
│    → Enforce on team/project routes │ ❌ No    │ ❌ No        │
├─────────────────────────────────────┼──────────┼──────────────┤
│ R3: Team/project role enforcement   │ ✅ Code  │ ❌ No        │
│    → Wire to routes                 │ ❌ No    │ ❌ No        │
├─────────────────────────────────────┼──────────┼──────────────┤
│ R4: Custom roles                    │ ✅ CRUD  │ ⚠️ No assign │
│    → Assignment flow                │ ❌ No    │ ❌ No        │
├─────────────────────────────────────┼──────────┼──────────────┤
│ R5a: Creator auto-membership        │ ❌ No    │ n/a          │
│ R5b: Team takeover governance       │ ❌ No    │ ❌ No        │
└─────────────────────────────────────┴──────────┴──────────────┘
```

---

## 5. Architecture Design

### Permission Resolution (Final State)

```
Request → Auth(JWT) → RLSTenant() → PermissionResolverMiddleware(scope, resource, action)
                                          │
                                          ▼
                                   PermissionResolver.HasPermission()
                                          │
                                          ├─ 1. Not org member? → 403
                                          ├─ 2. Owner? → ✅ Allow all
                                          ├─ 3. Admin? → ✅ (except org.delete/transfer)
                                          │
                                          ├─ 4. Project scope?
                                          │     ├─ Direct project_members → lookup role → check perms
                                          │     ├─ Team inherited (project_teams → team_members → role map) → check perms
                                          │     └─ Fall through to org-level
                                          │
                                          ├─ 5. Team scope?
                                          │     ├─ Direct team_members → lookup role → check perms
                                          │     └─ Fall through to org-level
                                          │
                                          └─ 6. Org scope?
                                                └─ org_members → lookup role → check perms
```

### Project Ownership Model

```
Project Created (no team)
    │
    ├─ Creator auto-added as project_members.role = 'lead', source = 'direct'
    ├─ Creator has full project permissions (lead role)
    ├─ Creator can invite other members directly
    │
    ▼
Project Linked to Team
    │
    ├─ Team members auto-synced to project_members (source = 'team')
    ├─ Team lead → project lead (via team_project_role_map)
    ├─ Team lead can:
    │     ├─ Modify project settings (project.update permission)
    │     ├─ Manage members (members.manage permission)
    │     ├─ Change creator's role (downgrade/remove)
    │     └─ Transfer project lead to another member
    │
    └─ Original creator retains their current role unless changed by team lead
```

### Custom Role Architecture

```
roles table
    ├─ System roles (is_system = true) → cannot delete, can rename
    └─ Custom roles (is_system = false) → full CRUD

org_members.role      → stores role slug (system or custom org-scope)
team_members.role     → stores role slug (system or custom team-scope)
project_members.role  → stores role slug (system or custom project-scope)

Assignment Flow:
    Admin → POST /orgs/{orgId}/members/invite { email, role: "custom-slug" }
    Admin → PATCH /orgs/{orgId}/teams/{teamId}/members/{userId} { role: "custom-slug" }
    Lead  → PATCH /orgs/{orgId}/projects/{projectId}/members/{userId} { role: "custom-slug" }
```

---

## Phase 1: Project Ownership & Creator Auto-Membership

**Goal:** When a user creates a project, they automatically become the project lead.

### 1.1 Backend: Auto-Add Creator as Project Lead

**File:** `backend/internal/service/project_service.go`

**Change:** In `Create()`, after creating the project and linking teams, add the creator as a direct project member with role `lead`.

```go
// Inside Create(), after s.projectTeamRepo.Link:

// Auto-add creator as project lead
creatorID := tenant.UserIDFromContext(ctx) // Need to pass userID into params or extract from ctx
if creatorID != uuid.Nil {
    creatorMember := &domain.ProjectMember{
        ProjectID: created.ID,
        UserID:    creatorID,
        Role:      domain.RoleProjectLead,
        Source:    "direct",
    }
    if err := s.projectMemberRepo.Add(ctx, tx, creatorMember); err != nil {
        return fmt.Errorf("add creator as lead: %w", err)
    }
}
```

**Changes needed:**
1. Add `UserID uuid.UUID` field to `CreateProjectParams`
2. In `project_handler.go`, set `params.UserID` from `tenant.UserID(r.Context())`
3. In `project_service.go` `Create()`, add creator as project lead inside the transaction

### 1.2 Backend: Track Original Creator

**Migration:** `db/migrations/000018_project_creator.up.sql`

```sql
-- Track who originally created a project
ALTER TABLE projects ADD COLUMN created_by UUID;

-- Backfill: set created_by to the first org member (best guess for existing data)
UPDATE projects p SET created_by = (
    SELECT user_id FROM org_members om 
    WHERE om.org_id = p.org_id AND om.role = 'owner' 
    LIMIT 1
) WHERE created_by IS NULL;
```

**Why:** We need to know who the original creator is for governance rules. Even after a team takeover, we want to track provenance.

### 1.3 Backend: Sync Team Members to Project on Team Link

**File:** `backend/internal/service/project_team_service.go`

**Change:** When `LinkTeams()` is called, automatically sync team members into `project_members` with `source = 'team'` and the mapped project role.

```go
// In LinkTeams(), after linking team:

// Sync team members into project_members
teamMembers, err := s.teamMemberRepo.ListByTeam(ctx, teamID)
if err == nil {
    roleMap, _ := s.permSvc.GetTeamProjectRoleMap(ctx, project.OrgID)
    for _, tm := range teamMembers {
        projectRole, ok := roleMap[tm.Role]
        if !ok {
            projectRole = "observer" // fallback
        }
        pm := &domain.ProjectMember{
            ProjectID:    params.ProjectID,
            UserID:       tm.UserID,
            Role:         projectRole,
            Source:       "team",
            SourceTeamID: &teamID,
        }
        _ = s.projectMemberRepo.Add(ctx, tx, pm) // ON CONFLICT DO NOTHING
    }
}
```

### 1.4 Migration: Backfill Existing Projects

For existing projects that have team associations but no project_members entries:

```sql
-- Backfill project_members from team_members for already-linked projects
INSERT INTO project_members (project_id, user_id, role, source, source_team_id)
SELECT pt.project_id, tm.user_id, 
       CASE tm.role 
           WHEN 'team_lead' THEN 'lead'
           WHEN 'member' THEN 'contributor'
           WHEN 'viewer' THEN 'observer'
           ELSE 'observer'
       END,
       'team', pt.team_id
FROM project_teams pt
JOIN team_members tm ON tm.team_id = pt.team_id
ON CONFLICT (project_id, user_id) DO NOTHING;
```

### 1.5 Files to Modify

| File | Change |
|------|--------|
| `db/migrations/000018_project_creator.up.sql` | Add `created_by` column + backfill |
| `db/migrations/000018_project_creator.down.sql` | Remove `created_by` column |
| `internal/domain/project.go` | Add `CreatedBy *uuid.UUID` field |
| `internal/service/project_service.go` | Params.UserID, auto-add creator as lead |
| `internal/handler/project_handler.go` | Pass UserID into CreateProjectParams |
| `internal/service/project_team_service.go` | Sync team members on LinkTeams |
| `internal/repository/project_repo.go` | Include `created_by` in INSERT/SELECT |

---

## Phase 2: Enforce Permission Resolver on All Routes

**Goal:** Replace `RequireOrgMember`/`RequireOrgAdmin` on project and team routes with `PermissionResolverMiddleware` that checks actual permissions.

### 2.1 Route Middleware Mapping

Replace the current "flat" middleware with granular permission checks:

**Team Routes** (`/orgs/{orgId}/teams/...`):
```
GET    /teams                         → org-scope: teams.read
POST   /teams                         → org-scope: teams.create
GET    /teams/{teamId}                → team-scope: team.read
PATCH  /teams/{teamId}                → team-scope: team.update
DELETE /teams/{teamId}                → org-scope: teams.delete
GET    /teams/{teamId}/members        → team-scope: team.read
POST   /teams/{teamId}/members        → team-scope: team.manage_members
PATCH  /teams/{teamId}/members/{uid}  → team-scope: team.manage_members
DELETE /teams/{teamId}/members/{uid}  → team-scope: team.manage_members
```

**Project Routes** (`/orgs/{orgId}/projects/...`):
```
GET    /projects                      → org-scope: projects.read
POST   /projects                      → org-scope: projects.create
GET    /projects/{projectId}          → project-scope: project.read
PATCH  /projects/{projectId}          → project-scope: project.update
DELETE /projects/{projectId}          → project-scope: project.delete
GET    /projects/{pid}/members        → project-scope: project.read
POST   /projects/{pid}/members        → project-scope: members.manage
PATCH  /projects/{pid}/members/{uid}  → project-scope: members.manage
DELETE /projects/{pid}/members/{uid}  → project-scope: members.manage
```

**Task Routes** (`/orgs/{orgId}/projects/{projectId}/tasks/...`):
```
GET    /tasks                         → project-scope: tasks.read
POST   /tasks                         → project-scope: tasks.create
GET    /tasks/{taskId}                → project-scope: tasks.read
PATCH  /tasks/{taskId}                → project-scope: tasks.update
DELETE /tasks/{taskId}                → project-scope: tasks.delete
POST   /tasks/{taskId}/submit-review  → project-scope: tasks.update
POST   /tasks/{taskId}/complete       → project-scope: tasks.update
```

**Comment Routes** (`/tasks/{taskId}/comments/...`):
```
GET    /comments                      → project-scope: comments.read
POST   /comments                      → project-scope: comments.create
PATCH  /comments/{commentId}          → project-scope: comments.update
DELETE /comments/{commentId}          → project-scope: comments.delete
```

### 2.2 Implementation in `cmd/api/main.go`

Replace the flat `RequireOrgMember(pool)` on project routes with per-endpoint permission checks:

```go
// BEFORE (current):
r.Group(func(r chi.Router) {
    r.Use(middleware.RequireOrgMember(pool))
    r.Route("/projects", func(r chi.Router) {
        r.Post("/", projectHandler.Create)
        r.Get("/", projectHandler.List)
        r.Route("/{projectId}", func(r chi.Router) {
            r.Get("/", projectHandler.Get)
            r.Patch("/", projectHandler.Update)
            // ... all routes accessible to any org member
        })
    })
})

// AFTER (new):
r.Group(func(r chi.Router) {
    r.Use(middleware.RequireOrgMember(pool)) // Still need basic membership check
    
    r.Route("/projects", func(r chi.Router) {
        // Org-level project operations
        r.With(prm("org", "", "projects", "read")).Get("/", projectHandler.List)
        r.With(prm("org", "", "projects", "create")).Post("/", projectHandler.Create)
        
        r.Route("/{projectId}", func(r chi.Router) {
            // Project-scoped operations
            r.With(prm("project", "projectId", "project", "read")).Get("/", projectHandler.Get)
            r.With(prm("project", "projectId", "project", "update")).Patch("/", projectHandler.Update)
            r.With(prm("project", "projectId", "project", "delete")).Delete("/", projectHandler.Delete)
            
            // Project members management
            r.With(prm("project", "projectId", "project", "read")).Get("/members", projectHandler.ListMembers)
            r.With(prm("project", "projectId", "members", "manage")).Post("/members", projectHandler.AddMember)
            r.With(prm("project", "projectId", "members", "manage")).Patch("/members/{userId}", projectHandler.UpdateMemberRole)
            r.With(prm("project", "projectId", "members", "manage")).Delete("/members/{userId}", projectHandler.RemoveMember)
            
            // Tasks (project-scoped)
            r.Route("/tasks", func(r chi.Router) {
                r.With(prm("project", "projectId", "tasks", "read")).Get("/", taskHandler.List)
                r.With(prm("project", "projectId", "tasks", "create")).Post("/", taskHandler.Create)
                r.With(prm("project", "projectId", "tasks", "read")).Get("/tree", taskHandler.ListTree)
                
                r.Route("/{taskId}", func(r chi.Router) {
                    r.With(prm("project", "projectId", "tasks", "read")).Get("/", taskHandler.Get)
                    r.With(prm("project", "projectId", "tasks", "update")).Patch("/", taskHandler.Update)
                    r.With(prm("project", "projectId", "tasks", "delete")).Delete("/", taskHandler.Delete)
                })
            })
        })
    })
})
```

Where `prm` is a shorthand:
```go
prm := func(scope, scopeParam, resource, action string) func(http.Handler) http.Handler {
    return middleware.PermissionResolverMiddleware(resolver, scope, scopeParam, resource, action)
}
```

### 2.3 Backward Compatibility Strategy

**CRITICAL:** This is a breaking change for users who are org "members" and currently access all projects. After this change, they need to be project members too.

**Migration strategy:**
1. Add all existing org members as project members for ALL existing projects with their org-level mapped roles:
   - `owner` → `lead`
   - `admin` → `lead`
   - `member` → `contributor`
   - `viewer` → `observer`
2. This ensures no one loses access during migration
3. Going forward, new projects only have their creator + linked team members

```sql
-- Backfill: add all org members to all existing projects
INSERT INTO project_members (project_id, user_id, role, source)
SELECT p.id, om.user_id,
       CASE om.role
           WHEN 'owner' THEN 'lead'
           WHEN 'admin' THEN 'lead'
           WHEN 'member' THEN 'contributor'
           WHEN 'viewer' THEN 'observer'
           WHEN 'billing_admin' THEN 'observer'
           ELSE 'observer'
       END,
       'direct'
FROM projects p
CROSS JOIN org_members om
WHERE om.org_id = p.org_id
ON CONFLICT (project_id, user_id) DO NOTHING;
```

### 2.4 Update PermissionResolver for Non-Member Org Roles

Currently, if a user is NOT in `project_members` and NOT in any linked team, permission falls through to org-level check. This means an org `member` role with `tasks.create` at org scope could create tasks in ANY project.

**Decision needed:** Should org-level permissions grant project access?

**Recommended approach:** 
- Org-level permissions ONLY grant access to org-wide resources (team list, project list, dashboard, templates, search)
- Project-specific operations REQUIRE project membership (direct or team-inherited)
- EXCEPT: owner and admin always bypass

**Change in PermissionResolver:**
```go
// For project-scoped checks, if user is not a project member and not admin/owner,
// do NOT fall through to org-level permissions
if scope == domain.ScopeProject && scopeID != nil {
    // ... check direct + team inherited ...
    // If no project/team membership found, DENY (don't fall through to org level)
    return false, nil  // Changed from falling through to org-level
}
```

### 2.5 Files to Modify

| File | Change |
|------|--------|
| `cmd/api/main.go` | Replace RequireOrgMember with PermissionResolverMiddleware per route |
| `internal/service/permission_resolver.go` | Don't fall through to org-level for project scope |
| `db/migrations/000019_backfill_project_members.up.sql` | Backfill existing org members into project_members |
| `internal/handler/team_handler.go` | Update route registration (if Routes() method needs changes) |

---

## Phase 3: Custom Roles Enhancement

**Goal:** Complete the custom role lifecycle — creation, assignment, enforcement, and UI.

### 3.1 Custom Role Assignment Flow

Currently, role assignment uses plain text slugs. To assign a custom role, the admin just sets `role = "custom-slug"` when inviting or updating a member.

**Validation Required:**
- When setting a member's role, validate the slug exists in the `roles` table for the correct scope
- System roles are always valid
- Custom roles must match the scope (org role for org_members, team role for team_members, etc.)

**File:** `backend/internal/service/org_service.go`

```go
func (s *OrgService) UpdateMemberRole(ctx context.Context, orgID, userID uuid.UUID, role string) error {
    // NEW: Validate role exists
    systemRoles := []string{"owner", "admin", "member", "viewer", "billing_admin"}
    if !slices.Contains(systemRoles, role) {
        // Check if it's a valid custom role for this org
        _, err := s.roleRepo.GetBySlug(ctx, orgID, "org", role)
        if err != nil {
            return domain.ErrBadRequest.WithDetail("invalid role: " + role)
        }
    }
    
    return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
        return s.orgMemberRepo.UpdateRole(ctx, tx, orgID, userID, role)
    })
}
```

Similar validation for `team_service.go` and `project_service.go`.

### 3.2 Custom Role in Permission Resolution

The `PermissionResolver.roleHasPermission()` ALREADY supports custom roles — it looks up the role by slug + scope in the `roles` table and checks its `role_permissions`. No change needed here.

### 3.3 API Enhancements

**New Endpoints:**

```
GET  /orgs/{orgId}/permissions/roles?scope=team     → List available roles for team scope
GET  /orgs/{orgId}/permissions/roles?scope=project   → List available roles for project scope
POST /orgs/{orgId}/permissions/roles                 → Create custom role (already exists)
```

**Modify Existing Endpoints:**

```
PATCH /orgs/{orgId}/members/{userId}                → Validate role slug against org-scope roles
PATCH /orgs/{orgId}/teams/{teamId}/members/{userId}  → Validate role slug against team-scope roles
PATCH /orgs/{orgId}/projects/{projectId}/members/{userId} → Validate role slug against project-scope roles
```

### 3.4 Files to Modify

| File | Change |
|------|--------|
| `internal/service/org_service.go` | Validate role slug on member role update |
| `internal/service/team_service.go` | Validate role slug on team member role update |
| `internal/service/project_service.go` | Validate role slug on project member role update |
| `internal/handler/permission_handler.go` | No changes (already supports scope filter) |

---

## Phase 4: Team Takeover & Project Governance

**Goal:** When a project is linked to a team, team leads with appropriate permissions can govern the project — including overriding the creator's privileges.

### 4.1 Governance Rules

When a project is linked to team(s):

1. **Team leads** (with `members.manage` project permission) CAN:
   - Add/remove project members
   - Change any member's role (including the original creator)
   - Downgrade creator from `lead` to `contributor`/`observer`
   - Remove creator from project entirely

2. **Original creator** with `lead` role CAN:
   - Do everything a project lead can do (as long as they retain the role)
   - Their role IS subject to changes by team leads

3. **No team linked:**
   - Only the project lead (creator) and org admins can manage members
   - Creator's role cannot be changed by other project members

### 4.2 Implementation: Governance Check in Member Management

**File:** `backend/internal/service/project_service.go`

```go
func (s *ProjectService) UpdateMemberRole(ctx context.Context, projectID, actorID, targetUserID uuid.UUID, newRole string) error {
    project, err := s.projectRepo.GetByID(ctx, projectID)
    if err != nil {
        return err
    }
    
    // Get actor's effective permissions
    actorCanManage, err := s.permResolver.HasPermission(ctx, actorID, project.OrgID, 
        "project", &projectID, "members", "manage")
    if err != nil || !actorCanManage {
        return domain.ErrForbidden
    }
    
    // Check if project has linked teams
    teams, _ := s.projectTeamRepo.ListByProject(ctx, projectID)
    hasTeams := len(teams) > 0
    
    // If no teams linked, only the lead (creator) can manage members
    if !hasTeams {
        // Check if actor is the project lead
        actorMember, err := s.getProjectMember(ctx, projectID, actorID)
        if err != nil || actorMember.Role != domain.RoleProjectLead {
            // Unless they're org admin/owner (handled by permission resolver)
            return domain.ErrForbidden.WithDetail("only project lead can manage members in unlinked projects")
        }
    }
    
    // If teams linked, team-sourced leads CAN change anyone's role (including creator)
    // Direct leads CAN also change roles
    // This is already handled by the permission check above
    
    return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
        return s.projectMemberRepo.UpdateRole(ctx, tx, projectID, targetUserID, newRole)
    })
}
```

### 4.3 New Permission: `project.manage_settings`

Add a new permission to distinguish between updating project details and managing governance:

```sql
INSERT INTO permissions (resource, action, scope, description) VALUES
    ('project', 'manage_settings', 'project', 'Manage project governance settings (review rules, visibility)'),
    ('project', 'transfer_lead', 'project', 'Transfer project lead role to another member');
```

### 4.4 Team Member Sync on Team Member Changes

When a member is added/removed from a team, sync their project memberships:

**File:** `backend/internal/service/team_service.go`

```go
func (s *TeamService) AddMember(ctx context.Context, teamID, userID uuid.UUID, role string) error {
    // ... existing add logic ...
    
    // Sync: add user to all projects linked to this team
    projectTeams, _ := s.projectTeamRepo.ListByTeam(ctx, teamID)
    roleMap, _ := s.permSvc.GetTeamProjectRoleMap(ctx, team.OrgID)
    projectRole := roleMap[role]
    if projectRole == "" {
        projectRole = "observer"
    }
    
    for _, pt := range projectTeams {
        pm := &domain.ProjectMember{
            ProjectID:    pt.ProjectID,
            UserID:       userID,
            Role:         projectRole,
            Source:       "team",
            SourceTeamID: &teamID,
        }
        _ = s.projectMemberRepo.Add(ctx, tx, pm)
    }
    
    return nil
}

func (s *TeamService) RemoveMember(ctx context.Context, teamID, userID uuid.UUID) error {
    // ... existing remove logic ...
    
    // Sync: remove user from projects where source is this team
    projectTeams, _ := s.projectTeamRepo.ListByTeam(ctx, teamID)
    for _, pt := range projectTeams {
        _ = s.projectMemberRepo.RemoveBySourceTeamAndUser(ctx, tx, pt.ProjectID, teamID, userID)
    }
    
    return nil
}
```

### 4.5 New Repository Method

```go
// RemoveBySourceTeamAndUser removes a specific user's team-sourced membership
func (r *projectMemberRepo) RemoveBySourceTeamAndUser(ctx context.Context, tx pgx.Tx, projectID, sourceTeamID, userID uuid.UUID) error {
    q := conn(r.pool, tx)
    _, err := q.Exec(ctx,
        `DELETE FROM project_members WHERE project_id = $1 AND source_team_id = $2 AND user_id = $3`,
        projectID, sourceTeamID, userID)
    return err
}
```

### 4.6 Files to Modify

| File | Change |
|------|--------|
| `db/migrations/000020_governance_permissions.up.sql` | New permissions |
| `internal/service/project_service.go` | Governance checks in member management |
| `internal/service/team_service.go` | Sync members on add/remove |
| `internal/repository/project_member_repo.go` | New RemoveBySourceTeamAndUser method |
| `internal/repository/interfaces.go` | Interface update |

---

## Phase 5: Frontend Permission Integration

**Goal:** Make the frontend respect project-level and team-level permissions, not just org-level.

### 5.1 New API: User's Effective Permissions for a Scope

**Backend Endpoint:**
```
GET /orgs/{orgId}/projects/{projectId}/my-permissions
→ { role: "contributor", permissions: [{resource: "tasks", action: "create"}, ...] }

GET /orgs/{orgId}/teams/{teamId}/my-permissions  
→ { role: "member", permissions: [{resource: "tasks", action: "read"}, ...] }
```

**Handler:**
```go
func (h *ProjectHandler) GetMyPermissions(w http.ResponseWriter, r *http.Request) {
    userID := tenant.UserID(r.Context())
    orgID := middleware.OrgIDFromCtx(r.Context())
    projectID, _ := uuidParam(r, "projectId")
    
    role, err := h.permResolver.GetEffectiveRole(ctx, userID, orgID, "project", &projectID)
    perms, err := h.permResolver.GetEffectivePermissions(ctx, userID, orgID, "project", &projectID)
    
    JSON(w, http.StatusOK, map[string]any{
        "role": role,
        "permissions": perms,
    })
}
```

### 5.2 New PermissionResolver Method

```go
// GetEffectivePermissions returns all permissions a user has in the given scope.
func (r *PermissionResolver) GetEffectivePermissions(ctx context.Context, userID, orgID uuid.UUID, scope string, scopeID *uuid.UUID) ([]*domain.Permission, error) {
    role, err := r.GetEffectiveRole(ctx, userID, orgID, scope, scopeID)
    if err != nil {
        return nil, err
    }
    
    // Owner gets all permissions
    if role == domain.RoleOrgOwner {
        return r.roleRepo.GetAllPermissions(ctx, scope)
    }
    
    // Look up role's permissions
    dbRole, err := r.roleRepo.GetBySlug(ctx, orgID, scope, role)
    if err != nil {
        return nil, nil
    }
    return r.roleRepo.GetPermissions(ctx, dbRole.ID)
}
```

### 5.3 Frontend: Scoped Permission Hook

**New hook:** `frontend/src/hooks/use-project-permissions.ts`

```typescript
export function useProjectPermissions(projectId: string): PermissionsApi {
    const { data, isLoading } = useQuery({
        queryKey: ["project-permissions", orgId, projectId],
        queryFn: () => api.projects.getMyPermissions(orgId, projectId),
        staleTime: 30_000,
    });
    
    const can = (resource: string, action: string): boolean => {
        if (!data) return false;
        if (data.role === "owner" || data.role === "admin") return true;
        return data.permissions.some(p => p.resource === resource && p.action === action);
    };
    
    return { can, role: data?.role ?? null, isLoading, ... };
}
```

### 5.4 Frontend: Update UI Components

**Project Page — Conditionally show buttons:**
```tsx
const { can } = useProjectPermissions(projectId);

// Only show "Add Member" if user has members.manage
{can("members", "manage") && <Button>Add Member</Button>}

// Only show "Edit Project" if user has project.update  
{can("project", "update") && <Button>Edit</Button>}

// Only show "Create Task" if user has tasks.create
{can("tasks", "create") && <CreateTaskButton />}

// Only show "Delete" on task if user has tasks.delete
{can("tasks", "delete") && <DeleteButton />}
```

**Team Page — Conditionally show buttons:**
```tsx
const { can } = useTeamPermissions(teamId);

{can("team", "manage_members") && <Button>Add Member</Button>}
{can("team", "update") && <Button>Edit Team</Button>}
```

**Settings Page — Role Assignment Dropdowns:**
```tsx
// In member role dropdown, show both system and custom roles
const { data: availableRoles } = useQuery({
    queryKey: ["roles", orgId, scope],
    queryFn: () => api.permissions.roles.list(orgId, scope),
});

<select value={member.role} onChange={...}>
    {availableRoles?.map(role => (
        <option key={role.slug} value={role.slug}>
            {role.name} {role.is_system ? "(System)" : "(Custom)"}
        </option>
    ))}
</select>
```

### 5.5 Files to Create/Modify

| File | Change |
|------|--------|
| `frontend/src/hooks/use-project-permissions.ts` | New hook |
| `frontend/src/hooks/use-team-permissions.ts` | New hook |
| `frontend/src/lib/api.ts` | Add `getMyPermissions` API methods |
| `frontend/src/types/domain.ts` | Add `EffectivePermissions` type |
| `frontend/src/app/[orgSlug]/projects/[projectId]/page.tsx` | Use project permissions |
| `frontend/src/app/[orgSlug]/teams/[teamId]/page.tsx` | Use team permissions |  
| `frontend/src/app/[orgSlug]/settings/_components/members-tab.tsx` | Show custom roles in dropdown |
| `frontend/src/app/[orgSlug]/settings/_components/roles-tab.tsx` | Enhance with scope tabs |
| `backend/internal/handler/project_handler.go` | New `GetMyPermissions` endpoint |
| `backend/internal/handler/team_handler.go` | New `GetMyPermissions` endpoint |
| `backend/internal/service/permission_resolver.go` | New `GetEffectivePermissions` method |

---

## Migration Strategy

### Database Migrations (in order)

```
000018_project_creator.up.sql
    - ALTER TABLE projects ADD COLUMN created_by UUID
    - Backfill created_by from org owners

000019_backfill_project_members.up.sql
    - Backfill project_members from org_members for all existing projects
    - Backfill project_members from team_members via project_teams
    - Ensures no one loses access during rollout

000020_governance_permissions.up.sql
    - INSERT new permissions (project.manage_settings, project.transfer_lead)
    - Add to lead role
    - Update seed function
```

### Rollout Order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
   │          │          │          │          │
   │          │          │          │          └─ Frontend UI updates
   │          │          │          └─ Team governance logic
   │          │          └─ Custom role assignment validation
   │          └─ Route middleware enforcement (BREAKING - needs migration first)
   └─ Creator auto-membership + backfill migration
```

**CRITICAL:** Phase 1 (migration + creator auto-membership) MUST be deployed BEFORE Phase 2 (route enforcement). Otherwise existing users will be locked out of projects they currently access.

---

## Testing Plan

### Unit Tests (Service Layer)

```
TestProjectService_Create_AddsCreatorAsLead
TestProjectService_Create_NoTeam_CreatorIsLead
TestProjectService_Create_WithTeam_SyncsMembers
TestPermissionResolver_OwnerBypassesAll
TestPermissionResolver_AdminBypassesExceptOrgDelete
TestPermissionResolver_MemberNeedsProjectMembership
TestPermissionResolver_TeamInheritedPermissions
TestPermissionResolver_CustomRolePermissions
TestPermissionResolver_NoFallthroughForProjectScope
TestTeamService_AddMember_SyncsToProjects
TestTeamService_RemoveMember_RemovesFromProjects
TestProjectTeamService_LinkTeam_SyncsMembers
TestProjectTeamService_UnlinkTeam_RemovesTeamMembers
TestGovernance_TeamLeadCanDowngradeCreator
TestGovernance_NonLeadCannotManageMembers
TestGovernance_UnlinkedProject_OnlyLeadManages
TestCustomRole_ValidSlugRequired
TestCustomRole_PermissionsEnforced
```

### Integration Tests (API Level)

```
TestAPI_ProjectCreate_Returns201_AddsCreatorAsMember
TestAPI_ProjectMemberList_RequiresProjectReadPermission
TestAPI_TaskCreate_RequiresProjectTaskCreatePermission
TestAPI_TaskUpdate_AsObserver_Returns403
TestAPI_TaskUpdate_AsContributor_Returns200
TestAPI_TaskDelete_AsContributor_Returns403
TestAPI_TaskDelete_AsLead_Returns200
TestAPI_MemberManage_AsContributor_Returns403
TestAPI_MemberManage_AsLead_Returns200
TestAPI_TeamLead_CanDowngradeProjectCreator
TestAPI_OrgAdmin_CanAccessAnyProject
TestAPI_OrgMember_CannotAccessProjectWithoutMembership
TestAPI_CustomRole_WithTaskCreate_CanCreate
TestAPI_CustomRole_WithoutTaskCreate_CannotCreate
```

### RLS Isolation Tests

```
TestRLS_OrgA_CannotSeeOrgB_Projects
TestRLS_OrgA_CannotSeeOrgB_ProjectMembers
TestRLS_OrgA_CannotSeeOrgB_Roles
```

### Frontend Tests

```
TestPermissionGate_HidesCreateButton_ForObserver
TestPermissionGate_ShowsCreateButton_ForContributor
TestPermissionGate_ShowsAllButtons_ForLead
TestProjectPermissions_LoadsFromAPI
TestCustomRoleDropdown_ShowsSystemAndCustom
```

---

## Rollout Strategy

### Step 1: Deploy Phase 1 (Non-Breaking)
- Run migration 000018 (added_by column)
- Run migration 000019 (backfill project_members)
- Deploy backend with creator auto-membership
- **Zero user impact** — everyone keeps current access, new projects just also create membership

### Step 2: Deploy Phase 2 (Access Restriction)
- Deploy backend with PermissionResolverMiddleware on routes
- **User impact:** org members without project membership lose project access
- **Mitigated by:** Migration 000019 already added everyone

### Step 3: Deploy Phase 3 (Enhancement)
- Deploy custom role validation
- **Zero user impact** — additive only

### Step 4: Deploy Phase 4 (Governance)
- Deploy team takeover logic
- **Zero user impact** — only affects new team-link operations

### Step 5: Deploy Phase 5 (UI)
- Deploy frontend with scoped permission hooks
- **User impact:** UI now hides buttons user can't use (better UX)

---

## Summary of All Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `db/migrations/000018_project_creator.up.sql` | `created_by` column |
| `db/migrations/000018_project_creator.down.sql` | Rollback |
| `db/migrations/000019_backfill_project_members.up.sql` | Backfill existing members |
| `db/migrations/000019_backfill_project_members.down.sql` | Rollback |
| `db/migrations/000020_governance_permissions.up.sql` | New permissions |
| `db/migrations/000020_governance_permissions.down.sql` | Rollback |
| `frontend/src/hooks/use-project-permissions.ts` | Project-scoped permission hook |
| `frontend/src/hooks/use-team-permissions.ts` | Team-scoped permission hook |

### Modified Files
| File | Changes |
|------|---------|
| `backend/cmd/api/main.go` | Wire PermissionResolverMiddleware per route |
| `backend/internal/domain/project.go` | Add `CreatedBy` field |
| `backend/internal/service/project_service.go` | Creator auto-membership, governance checks |
| `backend/internal/service/project_team_service.go` | Sync members on link/unlink |
| `backend/internal/service/team_service.go` | Sync members to projects on add/remove |
| `backend/internal/service/org_service.go` | Role slug validation |
| `backend/internal/service/permission_resolver.go` | No-fallthrough for project scope, GetEffectivePermissions |
| `backend/internal/handler/project_handler.go` | Pass UserID, new GetMyPermissions endpoint |
| `backend/internal/handler/team_handler.go` | New GetMyPermissions endpoint |
| `backend/internal/repository/project_repo.go` | Include `created_by` in queries |
| `backend/internal/repository/project_member_repo.go` | New RemoveBySourceTeamAndUser |
| `backend/internal/repository/interfaces.go` | Interface updates |
| `frontend/src/hooks/use-permissions.ts` | Optional enhancements |
| `frontend/src/lib/api.ts` | New API methods |
| `frontend/src/types/domain.ts` | New types |
| `frontend/src/app/[orgSlug]/projects/[projectId]/page.tsx` | Scoped permission checks |
| `frontend/src/app/[orgSlug]/teams/[teamId]/page.tsx` | Scoped permission checks |
| `frontend/src/app/[orgSlug]/settings/_components/members-tab.tsx` | Custom role in dropdown |
| `frontend/src/app/[orgSlug]/settings/_components/roles-tab.tsx` | Scope tabs |
| `frontend/src/components/permission-gate.tsx` | Optional: scope-aware variant |
