# RBAC & Permission Management System Audit

**Date:** 2026-03-31
**Scope:** Full-stack RBAC analysis — Backend (Go), Frontend (Next.js/React), Database (PostgreSQL)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [How It All Works](#2-how-it-all-works)
3. [Bugs & Errors](#3-bugs--errors)
4. [Security Vulnerabilities](#4-security-vulnerabilities)
5. [Edge Cases](#5-edge-cases)
6. [Frontend/Backend Mismatches](#6-frontendbackend-mismatches)
7. [Improvements & Recommendations](#7-improvements--recommendations)
8. [File Reference](#8-file-reference)

---

## 1. Architecture Overview

### 1.1 Three-Tier Role Hierarchy

```
Organization Level          Team Level              Project Level
┌────────────────┐    ┌──────────────┐    ┌─────────────────────┐
│ owner          │    │ team_lead    │    │ lead                │
│ admin          │    │ member       │    │ contributor         │
│ member         │    │ viewer       │    │ reviewer            │
│ viewer         │    └──────────────┘    │ observer            │
│ billing_admin  │                        └─────────────────────┘
└────────────────┘
```

### 1.2 Permission Resolution Flow

```
Request → JWT Auth → RLS Tenant → Permission Middleware → Handler
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
              Org Membership    Team Membership    Project Membership
                    │                   │                   │
              Owner/Admin         Role Lookup         Role Lookup
              bypass all        (DB-driven)        (DB-driven or
                                                  team-inherited)
```

### 1.3 Dual Permission Systems (Legacy + Modern)

| System | File | Status | Used By |
|--------|------|--------|---------|
| **Legacy RBAC** | `middleware/rbac.go` — `RBAC()`, `RequireOrgAdmin()`, etc. | Deprecated | Admin routes, settings, webhooks, API keys, billing |
| **Modern PermissionResolver** | `service/permission_resolver.go` + `middleware/rbac.go` — `PermissionResolverMiddleware()` | Active | Teams, Projects, Tasks, Announcements |

### 1.4 Custom Roles — Two Systems

| System | Table | Status |
|--------|-------|--------|
| **Legacy** `custom_roles` | JSONB permissions | Deprecated, still referenced in `RBAC()` middleware and `RequirePermission()` |
| **Modern** `roles` + `role_permissions` | Normalized, scoped per org | Active, used by PermissionResolver |

---

## 2. How It All Works

### 2.1 Backend Permission Checking

**PermissionResolver.resolvePermission()** (`permission_resolver.go:69-154`):
1. Verify user is an org member
2. **Owner** → bypass everything (return true)
3. **Admin** → bypass everything EXCEPT `org.delete` and `org.transfer_ownership`
4. **Project scope**: check direct `project_members` → check inherited via `project_teams` + role mapping
5. **Team scope**: check direct `team_members`
6. **Project/Team with no membership** → deny (no fall-through to org)
7. **Org scope**: lookup role permissions from `roles` + `role_permissions` tables

**Role Permission Lookup** (`permission_resolver.go:210-251`):
- Fetch role by slug from `roles` table
- Fetch permissions from `role_permissions` join
- Supports wildcard: `resource: "*"` matches any resource for a given action
- Redis-backed caching with TTL

### 2.2 Frontend Permission Checking

**Three-layer architecture:**

1. **Permission Hooks** — raw `can(resource, action)` + role string
   - `usePermissions()` → org-level (built-in matrix + DB roles)
   - `useProjectPermissions(projectId)` → calls `/my-permissions` API
   - `useTeamPermissions(teamId)` → calls `/my-permissions` API

2. **Policy Hooks** — computed boolean decisions
   - `useOrgPolicies()` → `canCreateProject`, `viewTeamsScope`, etc.
   - `useProjectPolicies(id)` → `canEditTask`, `canReview`, etc.
   - `useTeamPolicies(id)` → `canManageMembers`, `canEditTeam`, etc.

3. **UI Guards** — conditional rendering
   - `<PermissionGate resource="x" action="y">` — org-level
   - `<ProjectPermissionGate projectId={id}>` — project-level
   - `<RequireAdmin>` — page-level admin guard

### 2.3 Team → Project Role Inheritance

When a team is linked to a project, team members are automatically added as project members with mapped roles:

```
Default mapping (configurable per org):
  team_lead  → lead
  member     → contributor
  viewer     → observer
```

Stored in `orgs.settings.team_project_role_map` (JSONB).

### 2.4 Database-Level Isolation (RLS)

All RBAC tables have Row Level Security with `tenant_isolation` policies keyed on `app.current_org_id`. The `orbispm_api` database role is subject to these policies.

---

## 3. Bugs & Errors

### BUG-001: Legacy RBAC Custom Role Check is Broken (CRITICAL)

**File:** `backend/internal/middleware/rbac.go:143-158`

The legacy `RBAC()` middleware treats ANY custom role as having ALL permissions:

```go
// Line 150-155
if permsJSON != nil {
    var perms map[string]any
    if json.Unmarshal(permsJSON, &perms) == nil {
        // Custom role found — allow through (role-based access is granted)
        next.ServeHTTP(w, r)  // ← GRANTS ACCESS regardless of actual permissions!
        return
    }
}
```

**Impact:** Any user with a custom role name matching a `custom_roles` entry gets full access to RBAC-protected endpoints, regardless of their actual permissions.

**Affected routes:** All routes using `RBAC()` middleware — currently `RequireOrgAdmin(pool)` and `RequireOrgMember(pool)` are wrappers around this.

**Fix:** Either remove the custom role fallback entirely (since new system handles this), or actually check the permissions JSON against the required roles.

---

### BUG-002: `RequireAdmin` Guard Redundant Check (LOW)

**File:** `frontend/src/components/permission-gate.tsx:50-54`

```tsx
if (!isAdmin && !isOwner) {
```

`isAdmin` is already defined as `role === "owner" || role === "admin"` in `usePermissions()`. So checking `!isOwner` is always redundant when `!isAdmin` is true (since isAdmin includes isOwner). Not a functional bug, but misleading.

---

### BUG-003: Settings Tabs Use Role String Matching Instead of Permissions (MEDIUM)

**File:** `frontend/src/app/[orgSlug]/settings/page.tsx:49-118`

Settings page visibility is hardcoded against role strings:
```ts
roles: ["owner", "admin"]    // hardcoded
roles: ["owner", "billing_admin"]  // hardcoded
```

**Impact:** Custom roles with the `settings.read`/`settings.update` permission will NEVER see the settings page. The entire RBAC system is bypassed for the most sensitive admin area.

**Fix:** Use `usePermissions().can("settings", "read")` or `useOrgPolicies()` instead of role string matching.

---

### BUG-004: DataPrefetcher Ignores Permission Changes (MEDIUM)

**File:** `frontend/src/components/data-prefetcher.tsx:17-51`

```tsx
const ranForOrg = useRef<string | null>(null);
// ...
if (!orgId || ranForOrg.current === orgId) return;
ranForOrg.current = orgId;
```

The prefetcher runs once per org and never re-runs, even if the user's role changes (e.g., promoted from viewer to admin). The `orgRole` dependency is not in the effect dependency array.

**Impact:** After a role change within the same org, the user sees stale data filtered by their old role until they do a full page refresh.

**Fix:** Include `orgRole` in the ref key or add it to the dependency tracking.

---

### BUG-005: `canManageMembers` Uses Wrong Permission Key (MEDIUM)

**File:** `frontend/src/lib/policies.ts:136`

```ts
canManageMembers: can("members", "invite"),
```

The backend's canonical permission for member management is `org.manage_members`, not `members.invite`. The built-in frontend permission matrix has `members.invite` only for owner/admin, but DB-driven roles would need to have `members.invite` explicitly — which doesn't exist in the seeded permissions table.

**Backend seeds these permissions:**
- `org.manage_members` (org scope)
- `members.manage` (project scope)

**But NOT:** `members.invite`

**Impact:** DB-driven custom org roles can never have `canManageMembers = true` because the permission `(members, invite)` doesn't exist in the canonical permissions table.

**Fix:** Align to use `can("org", "manage_members")` or add `members.invite` to the seed permissions.

---

### BUG-006: `canManageRoles` Uses Wrong Permission Key (MEDIUM)

**File:** `frontend/src/lib/policies.ts:137`

```ts
canManageRoles: can("roles", "create"),
```

The seeded permission is `roles.create` in org scope — this one IS correct. However, checking only `create` is insufficient; a user could have `roles.update` but not `roles.create`, and they'd be denied the entire roles management UI.

**Fix:** Use `can("roles", "create") || can("roles", "update")`.

---

### BUG-007: `canManageSettings` Doesn't Exist in Backend (LOW)

**File:** `frontend/src/lib/policies.ts:139`

```ts
canManageSettings: can("settings", "update"),
```

The backend's seeded permissions don't include a `settings` resource. The built-in matrix has it, but DB-driven roles will always return `false` for `settings.update`.

**Impact:** Custom roles can never manage settings through the new permission system.

---

### BUG-008: Permission List Query Key Missing orgId (LOW)

**File:** `frontend/src/app/[orgSlug]/settings/_components/permissions-tab.tsx:196`

```ts
queryKey: ["permissions-list", scope],  // ← missing orgId!
```

If a user switches orgs, the stale permission list from the previous org is shown. The `queryFn` uses `orgId` but the cache key doesn't include it.

**Fix:** Change to `queryKey: ["permissions-list", orgId, scope]`.

---

### BUG-009: No Org Ownership Validation on Role GetByID (MEDIUM)

**File:** `backend/internal/handler/permission_handler.go:150-162`

```go
func (h *PermissionHandler) GetRole(w http.ResponseWriter, r *http.Request) {
    roleID, _ := uuidParam(r, "roleId")
    role, err := h.permSvc.GetRole(r.Context(), roleID)
    // ← No check that role.OrgID matches the current org
}
```

RLS should protect this at the DB layer, but there's no application-level validation that the requested role belongs to the current org. If RLS is misconfigured or bypassed, this becomes a cross-tenant data leak.

Same issue in `UpdateRole`, `DeleteRole`, `SetRolePermissions`.

---

### BUG-010: Team Viewer Role Not in DefaultTeamProjectRoleMap... Wait, It IS

**File:** `backend/internal/domain/roles.go:52-56`

```go
var DefaultTeamProjectRoleMap = map[string]string{
    "team_lead": "lead",
    "member":    "contributor",
    "viewer":    "observer",
}
```

But "viewer" is NOT a seeded team-level role. The seeded team roles are: `team_lead`, `member`. There is no `viewer` team role in migration 000006 system seeds.

**Impact:** The default role map has a mapping for a role that doesn't exist by default. If an org creates a custom "viewer" team role, the mapping works. Otherwise, the `viewer → observer` entry is dead code.

---

## 4. Security Vulnerabilities

### SEC-001: Admin Can Delete Their Own Org (MEDIUM)

**File:** `backend/cmd/api/main.go:479`

```go
r.Use(middleware.RequireOrgAdmin(pool))
r.Delete("/", orgHandler.Delete)
```

The `RequireOrgAdmin` middleware allows admins through, but the `PermissionResolver` explicitly denies `org.delete` for admins. This route uses the LEGACY middleware, not the modern resolver.

**Impact:** Admins can delete the entire organization. Only owners should be able to.

**Fix:** Change to `RequireOrgOwner(pool)` or use `PermissionResolverMiddleware` with `("org", "", "org", "delete")`.

---

### SEC-002: No Rate Limiting on Permission Checks (LOW)

Permission endpoints (`/my-permissions`) are called on every page navigation. There's no rate limiting, allowing potential DoS through rapid permission queries.

---

### SEC-003: Cache Poisoning via Role Change Race (MEDIUM)

**File:** `backend/internal/middleware/rbac.go:20-30`

The in-memory `sync.Map` cache with 3-minute TTL can serve stale roles:

1. User has role `admin`
2. Admin demotes user to `viewer`
3. For up to 3 minutes, the user retains `admin` permissions in the legacy middleware

The modern PermissionResolver has the same issue with Redis cache, but at least it has explicit `InvalidateUserPermissions()` calls on role changes.

**Impact:** Role changes are not immediately effective for routes using legacy RBAC middleware.

---

### SEC-004: `RequirePermission()` Silently Ignores DB Scan Errors (MEDIUM)

**File:** `backend/internal/middleware/rbac.go:337-339`

```go
_ = pool.QueryRow(r.Context(),
    `SELECT permissions FROM custom_roles WHERE org_id = $1 AND name = $2`,
    orgID, orgRole,
).Scan(&permsJSON)
```

If the database query fails for any reason (connection issues, etc.), the error is silently swallowed, and the user is denied access. This is safe but can cause mysterious "insufficient permissions" errors that are hard to debug.

---

### SEC-005: Owner Role Cannot Be Transferred Safely

There is no `transfer_ownership` endpoint. The permission `org.transfer_ownership` exists in the seed but no handler implements it. An owner could theoretically:
1. Make someone else an owner by updating their role
2. Demote themselves

But if step 2 fails, the org has two owners.

---

### SEC-006: No Validation of Role Slug Against System Roles on Create (MEDIUM)

**File:** `backend/internal/service/permission_service.go:76-109`

When creating a custom role, there's no check that the slug doesn't match a system role slug (`owner`, `admin`, `member`, etc.). The `UNIQUE(org_id, scope, slug)` constraint will prevent exact duplicates, but only because system roles are seeded first.

If system role seeding fails for a new org, a user could create a custom role with slug `owner` and get owner-level access via the PermissionResolver (which looks up roles by slug).

---

## 5. Edge Cases

### EDGE-001: User in Multiple Teams Linked to Same Project

If a user is a `team_lead` in Team A and a `member` in Team B, and both teams are linked to Project X:

- **Permission resolution** (`permission_resolver.go:103-124`): iterates through project_teams and returns the FIRST matching team's mapped role, not the highest.
- **project_members table**: has `UNIQUE(project_id, user_id)`, so only ONE membership row exists.

**Result:** The user's project role depends on which team was linked first (order from `project_teams`), not which gives more permissions. This is non-deterministic.

**Fix:** When checking inherited permissions, check ALL team memberships and grant access if ANY team role has the required permission.

---

### EDGE-002: Removing Team From Project Leaves Orphaned Members

When `project_teams` is unlinked, `project_members` with `source = 'team'` and `source_team_id = ?` should be cleaned up. The `TeamService.RemoveMember()` handles this, but there's no guarantee that the `ProjectTeamHandler` unlink operation does the same cleanup.

---

### EDGE-003: Custom Role Deleted While Users Are Assigned

If an admin deletes a custom role while users have that role:
- The `org_members.role` column still references the deleted role's slug
- `PermissionResolver.roleHasPermission()` will fail to find the role by slug → denies all permissions
- User effectively becomes role-less (no permissions) without being notified

**Fix:** Either prevent deletion of roles that are in use, or cascade role deletion to reassign affected users to a default role.

---

### EDGE-004: Org Admin Can Escalate to Owner via Custom Role Permissions

An admin can:
1. Create a custom role at org scope
2. Assign ALL permissions (including `org.delete` and `org.transfer_ownership`) to that role
3. Assign themselves to that custom role

The `PermissionResolver` would then grant them `org.delete` permission since it checks role permissions, not the admin bypass restriction.

**However:** The admin bypass in `resolvePermission()` returns before checking DB permissions, so if they're still `admin` in `org_members`, they can't delete. But if they change their role to the custom role, they CAN get those permissions.

**Mitigation:** `UpdateMemberRole` and `InviteMember` are behind `RequireOrgAdmin`, so an admin could change their own role to the custom role. The `SetRolePermissions` is also behind `RequireOrgAdmin`, so admins CAN set any permissions on any role.

**Fix:** Filter out `org.delete` and `org.transfer_ownership` from permissions that admins can assign.

---

### EDGE-005: Team Role "member" Collides with Org Role "member"

Both org-level and team-level have a role with slug `member`. The `PermissionResolver` disambiguates via the `scope` parameter in `roleRepo.GetBySlug(ctx, orgID, scope, roleSlug)`, but any code that doesn't pass scope correctly could confuse the two.

---

### EDGE-006: `billing_admin` Cannot Access Any Settings Page

**File:** `frontend/src/app/[orgSlug]/settings/page.tsx`

The billing tab requires `roles: ["owner", "billing_admin"]`, but a `billing_admin` user can ONLY see the billing tab. They cannot see the members tab, permissions tab, or any other tab.

This is likely intentional but has a UX issue: if a billing admin navigates to `/settings`, they see only one tab. The URL defaults to `?tab=billing`, which works. But if they have a bookmark to `?tab=members`, they get "Access Denied".

---

### EDGE-007: Project Permission Check Doesn't Consider Org-Level Permissions

**File:** `backend/internal/service/permission_resolver.go:141-146`

```go
// 4. For project/team scoped requests, do NOT fall through to org-level.
if (scope == domain.ScopeProject || scope == domain.ScopeTeam) && scopeID != nil {
    return false, nil
}
```

An org `member` with `tasks.create` in org scope CANNOT create tasks in a project unless they have explicit project membership. This is by design but may confuse users who expect org-level permissions to cascade.

---

### EDGE-008: Frontend `isLoading` While Permissions Load Shows Nothing

**File:** `frontend/src/components/permission-gate.tsx:35`

```tsx
if (isLoading) return null;
```

During permission loading, all `PermissionGate` and `ProjectPermissionGate` components render nothing. This causes UI flashing — content appears, disappears during re-render, then reappears.

**Fix:** Show children optimistically or show a skeleton while loading.

---

## 6. Frontend/Backend Mismatches

### MISMATCH-001: Frontend Built-In Matrix vs Backend Seeded Permissions

| Permission | Frontend Built-In | Backend Seeded | Notes |
|-----------|------------------|----------------|-------|
| `members.invite` | Yes (owner, admin) | **No** | Frontend uses it for `canManageMembers` |
| `members.update_role` | Yes | **No** | Doesn't exist in backend seeds |
| `members.remove` | Yes | **No** | Doesn't exist in backend seeds |
| `settings.read` | Yes | **No** | Doesn't exist in backend seeds |
| `settings.update` | Yes | **No** | Doesn't exist in backend seeds |
| `tasks.assign` | Yes (owner, admin, member) | **No** | Doesn't exist in backend seeds |
| `change_requests.*` | Yes | **No** | Not in seed data |
| `announcements.*` | Yes | **No** | Not in seed data |
| `org.manage_members` | **No** | Yes | Backend has it, frontend doesn't use it |
| `org.transfer_ownership` | **No** | Yes | Backend has it, frontend doesn't check it |
| `templates.*` | **No** | Yes | Backend seeds them, frontend never checks |
| `imports.manage` | **No** | Yes | Backend seeds it, frontend never checks |
| `webhooks.manage` | **No** | Yes | Backend seeds it, frontend never checks |
| `api_keys.manage` | **No** | Yes | Backend seeds it, frontend never checks |
| `attachments.*` | **No** | Yes | Backend seeds them, frontend never checks |

**Impact:** When DB-driven roles are active, custom roles may have permissions that the frontend never checks, or the frontend may check permissions that don't exist in the DB.

---

### MISMATCH-002: Frontend "admin" Definition vs Backend

**Frontend** (`policies.ts:113`): `isAdmin = role === "owner" || role === "admin"`
**Backend** (`permission_resolver.go:81`): Admin gets all except `org.delete` + `org.transfer_ownership`

These are consistent. But the frontend also has:

**Settings page** (`settings/page.tsx`): Uses `tab.roles.includes(userRole)` — string matching, not permission checking. A custom role named "admin" would NOT match because `OrgRole` type limits to the 5 built-in values.

---

### MISMATCH-003: Member Tab Role Options Don't Include Custom Roles

**File:** `frontend/src/app/[orgSlug]/settings/_components/members-tab.tsx:45-50`

```ts
const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "billing_admin", label: "Billing Admin" },
];
```

When assigning roles to org members, only the 5 built-in roles are available. Custom org-level roles created in the permissions tab cannot be assigned to members.

**Fix:** Fetch available org-scope roles from `api.permissions.roles.list(orgId, "org")` and populate the dropdown dynamically.

---

## 7. Improvements & Recommendations

### IMP-001: Unify Permission Systems (HIGH PRIORITY)

Remove the legacy `RBAC()` middleware entirely. Migrate all routes using `RequireOrgAdmin(pool)` and `RequireOrgMember(pool)` to use `PermissionResolverMiddleware`. This eliminates:
- BUG-001 (broken custom role check)
- SEC-001 (admin can delete org)
- SEC-003 (stale role cache in sync.Map)

**Affected routes:**
- `DELETE /orgs/{orgId}` → use `prm("org", "", "org", "delete")`
- `PATCH /orgs/{orgId}` → use `prm("org", "", "org", "update")`
- `POST /members/invite` → use `prm("org", "", "org", "manage_members")`
- All admin-guarded settings routes

---

### IMP-002: Sync Frontend Permission Matrix with Backend Seeds

Create a shared source of truth. Options:
1. Generate the frontend built-in matrix from the backend seed SQL
2. Remove the frontend built-in matrix entirely and always use DB-driven roles (requires permission API to be fast)
3. At minimum, audit and align the two matrices

---

### IMP-003: Add Permission-Aware Role Assignment

Members tab should:
1. Fetch available roles from the DB (`api.permissions.roles.list`)
2. Show custom roles alongside built-in roles in the dropdown
3. Prevent assigning `owner` role (only transferable via dedicated flow)
4. Show role descriptions as hints

---

### IMP-004: Add Role Deletion Guards

Before deleting a role:
1. Check if any org/team/project members have this role assigned
2. If yes, show affected user count and require selecting a replacement role
3. Cascade the role change in a transaction

---

### IMP-005: Permission-Based Settings Tab Visibility

Replace hardcoded `roles: ["owner", "admin"]` with permission checks:

```ts
// Instead of:
{ key: "members", roles: ["owner", "admin"], ... }

// Use:
{ key: "members", check: (can) => can("org", "manage_members"), ... }
```

---

### IMP-006: Add Audit Logging for Permission Changes

Currently, role changes emit domain events, but there's no persistent audit trail for:
- Role permission modifications
- Custom role creation/deletion
- Team → project role map changes
- Member role assignments

Add an `rbac_audit_log` table or integrate with the existing `activity_log`.

---

### IMP-007: Add "Effective Permissions" Preview

In the settings UI, add a "Preview as User" or "Effective Permissions" view that shows what permissions a specific user actually has, combining their org role + team memberships + project memberships.

---

### IMP-008: Fix Permission Resolution for Multi-Team Users

When a user is in multiple teams linked to the same project, check ALL team roles and pick the one with the highest permissions, not the first one found.

```go
// Instead of returning on first match:
for _, pt := range projectTeams {
    // check and return first match
}

// Collect all matches and check if ANY grants the permission:
for _, pt := range projectTeams {
    // check and set allowed = true if any match
}
```

---

### IMP-009: Add Cache Invalidation for Legacy RBAC (if not removed)

If `RBAC()` middleware is kept, add invalidation when roles change:
```go
rbacCache.Delete(fmt.Sprintf("%s:%s", orgID, userID))
```

This is already done in the PermissionResolver's cache manager but not for the legacy sync.Map.

---

### IMP-010: Add Frontend Permission Prefetching

The `/my-permissions` endpoints are called per-component. For pages with multiple `ProjectPermissionGate` components, this causes duplicate API calls. Consider:
1. Prefetching permissions in `DataPrefetcher`
2. Combining permission checks into a single batch API call
3. Using React Query's `staleTime` effectively (already set at 30s)

---

## 8. File Reference

### Backend

| File | Purpose |
|------|---------|
| `backend/internal/domain/roles.go` | Role constants, CustomRole entity, DefaultTeamProjectRoleMap |
| `backend/internal/domain/permission.go` | Permission, Role, EffectiveMember entities |
| `backend/internal/middleware/rbac.go` | Legacy RBAC middleware + PermissionResolverMiddleware |
| `backend/internal/middleware/auth.go` | JWT validation (Zitadel) |
| `backend/internal/middleware/api_key.go` | API key auth + scope checking |
| `backend/internal/service/permission_resolver.go` | Core permission engine |
| `backend/internal/service/permission_service.go` | Role/permission CRUD service |
| `backend/internal/service/org_service.go` | Org member management |
| `backend/internal/service/team_service.go` | Team member management + project sync |
| `backend/internal/service/project_service.go` | Project member management |
| `backend/internal/handler/permission_handler.go` | Permission/role HTTP endpoints |
| `backend/internal/repository/role_repo.go` | Role DB operations |
| `backend/internal/repository/permission_repo.go` | Permission DB operations |
| `backend/cmd/api/main.go` | Route registration with middleware |
| `backend/db/migrations/000006_permission_system.up.sql` | RBAC V2 schema + seeds |
| `backend/db/migrations/000015_project_member_source.up.sql` | Source tracking |
| `backend/db/migrations/000016_project_creator_rbac.up.sql` | Creator RBAC |
| `backend/db/migrations/000019_team_manager.up.sql` | Team manager support |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/hooks/use-permissions.ts` | Org-level permission checking |
| `frontend/src/hooks/use-project-permissions.ts` | Project-level permission checking |
| `frontend/src/hooks/use-team-permissions.ts` | Team-level permission checking |
| `frontend/src/hooks/use-policies.ts` | Policy hook composition |
| `frontend/src/lib/policies.ts` | Policy computation functions |
| `frontend/src/components/permission-gate.tsx` | UI guard components |
| `frontend/src/components/data-prefetcher.tsx` | Data prefetching (permission-aware) |
| `frontend/src/app/[orgSlug]/settings/page.tsx` | Settings page with role-based tabs |
| `frontend/src/app/[orgSlug]/settings/_components/permissions-tab.tsx` | Permission/role management UI |
| `frontend/src/app/[orgSlug]/settings/_components/members-tab.tsx` | Member management UI |
| `frontend/src/stores/auth-store.ts` | Auth state (includes currentMembership.role) |
| `frontend/src/lib/api.ts` | API client with permission endpoints |
| `frontend/src/types/domain.ts` | Type definitions for roles/permissions |

---

## Summary of Priority Issues

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| BUG-001 | **CRITICAL** | Backend | Legacy RBAC grants full access to any custom role |
| SEC-001 | **HIGH** | Security | Admins can delete org via legacy middleware |
| EDGE-001 | **HIGH** | Edge Case | Multi-team user gets non-deterministic project role |
| EDGE-004 | **HIGH** | Security | Admin can escalate via custom role permissions |
| MISMATCH-001 | **HIGH** | Consistency | Frontend/backend permission matrices diverged |
| MISMATCH-003 | **MEDIUM** | UX | Custom roles can't be assigned to members |
| BUG-003 | **MEDIUM** | Frontend | Settings tabs bypass permission system |
| BUG-005 | **MEDIUM** | Frontend | `canManageMembers` uses non-existent permission |
| BUG-008 | **MEDIUM** | Frontend | Permission cache key missing orgId |
| EDGE-003 | **MEDIUM** | Edge Case | Deleting role leaves users with no permissions |
| SEC-003 | **MEDIUM** | Security | 3-minute stale role cache in legacy middleware |
| IMP-001 | **HIGH** | Architecture | Unify to single permission system |
