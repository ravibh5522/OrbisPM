# OrbisPM RBAC — Current Implementation (as of 2026-07-29, branch `rbac` off `feature/centralized-user`)

This document is the ground truth of what exists in code TODAY, verified by reading source directly (not by trusting the older audit docs in this repo, which are 3-4 months stale and superseded by this one). It exists so the next design proposal starts from an accurate baseline.

Prior audit docs for historical context (now stale, kept for record):
- `docs/RBAC_V2_PLAN.md` (2026-03-12)
- `RBAC_AUDIT.md` (2026-03-31)
- `RBAC_AUDIT_REPORT.md` (2026-04-08)

---

## 1. Architecture

Three scopes, each independently DB-driven (`roles` + `permissions` + `role_permissions` tables, seeded per-org):

| Scope | System roles |
|-------|-------------|
| Org | `owner`, `admin`, `member`, `viewer`, `billing_admin` |
| Team | `team_lead`, `member` (optional custom `viewer`) |
| Project | `lead`, `contributor`, `reviewer`, `observer` |

Custom roles (any slug, any scope, any permission set) can be created per-org and layered alongside system roles.

### Resolution engine
`backend/internal/service/permission_resolver.go` — `PermissionResolver.HasPermission()`:
1. Owner → bypass everything
2. Admin → bypass everything except `org.delete` / `org.transfer_ownership`
3. Project scope → direct `project_members` membership, else team-inherited via `project_teams` + `team_project_role_map`, else deny (no fallthrough to org level)
4. Team scope → direct `team_members` membership, else deny (no fallthrough)
5. Org scope → role's permission list via `roleHasPermission()`

`roleHasPermission()` (lines 236-277) is fully generic: `(orgID, scope, roleSlug) → roles.GetBySlug → role_permissions → permissions`, with wildcard support (`resource: "*"`). No hardcoded role-name switch — works identically for system and custom roles.

### Enforcement layers
- **HTTP**: every route in `backend/cmd/api/main.go` guarded by `prm(scope, param, resource, action)` → `PermissionResolverMiddleware`. Confirmed for org/team/project/task/CR/webhooks/api-keys/billing routes.
- **WebSocket**: every task/CR action in `ws_handler.go` calls `checkProjectPermission()` before dispatch.
- **Service layer**: assignee-membership validation, designated-CR-approver validation, role-slug validation on assignment (see §3).
- **Frontend**: `usePermissions()` / `useProjectPermissions()` / `useTeamPermissions()` hooks feed policy flags (`lib/policies.ts`) consumed inline in pages; `PermissionGate` wraps a couple of org-level buttons.

### Legacy system status
The old hardcoded-matrix middleware (`RBAC()`, `RequireOrgAdmin`, `RequireTeamRole`, `RequireProjectRole`, `RequirePermission`/`hasBuiltInPermission`) still exists in `backend/internal/middleware/rbac.go` but is **fully unwired** — the only surviving call site is `RequireOrgMember(pool)` at `main.go:524`, used as an outer "is a member of this org at all" gate before the real per-route `prm()` checks apply. It explicitly denies custom-role access by design (own comment: "Custom roles are now handled by the PermissionResolver system... do not grant access based on it"). This is dead code, not a live gap, but it's a loaded gun if anyone wires a route to it in the future.

---

## 2. What is fully working (verified against live source, not docs)

| Item | Evidence |
|---|---|
| Legacy custom-role full-access bypass (was BUG-001) | Removed. `rbac.go:79-150` denies unknown roles outright. Fixed in commit `63737f4` (2026-04-01). |
| Org delete restricted to owner (was SEC-001) | `main.go:520` uses `RequireResolvedPermission(permResolver, "org","delete")`, not `RequireOrgAdmin`. |
| Team/project routes actually permission-checked (was RBAC_V2_PLAN gap) | `main.go:556-573` (teams), `644-830` (projects) all use `prm()` with correct scope/param. Fixed commit `301ed80` (2026-03-13). |
| Admin can't self-escalate to `org.delete` via custom role (was EDGE-004) | `permission_service.go:303-345` — `ownerOnlyPermissions` map filters `org.delete`/`org.transfer_ownership` out of ANY role's assignable permission set, enforced in `SetRolePermissions`. Covered by unit test `permission_resolver_test.go:363-369`. |
| Frontend/backend permission-key alignment (was BUG-005/006/007) | `frontend/src/lib/policies.ts:139-142` now checks `org.manage_members`, `roles.create||roles.update`, `org.update` — all of which are real seeded keys in `000006_permission_system.up.sql`. |
| Settings tab visibility via real permissions, not role strings (was BUG-003) | `settings/page.tsx:39-121` — `TabDef.check: (can, role) => boolean`, no `roles: [...]` string arrays left. |
| Project creator auto-membership | `project_service.go:125-136` — creator added to `project_members` as `lead` inside the create transaction. |
| Custom role ASSIGNMENT UI (org/team/project) | `members-tab.tsx:87-104`, `teams/[teamId]/page.tsx:601-608`, `projects/[projectId]/page.tsx:721-722,855-858` — all three role dropdowns fetch `api.permissions.roles.list(orgId, scope)` dynamically; custom roles appear labeled `(Custom)`. |
| `usePermissions()` correctly resolves custom org roles | `use-permissions.ts:41-91` — no hardcoded 5-role matrix; unknown role slugs resolve via `roleHasPermission()` against the fetched DB role list. Denies safely while loading. |
| Role-slug validation on assignment (was RBAC_V2_PLAN Phase 3 gap) | `org_service.go:196-229`, `team_service.go:345-390`, `project_service.go:381-439` — each `UpdateMemberRole` validates the slug exists via `roleRepo.GetBySlug` before saving, correctly scoped per org+scope. |

**Net assessment: the core RBAC pipeline (DB → resolver → HTTP/WS middleware → service checks → most frontend gating) is genuinely end-to-end and has held stable, unregressed, for ~4 months of unrelated development.**

---

## 3. Confirmed live bug: custom team/project roles can get stuck permanently hidden in the UI

This is the concrete explanation for "custom roles work partially."

**Mechanism:**
1. `backend/internal/handler/team_handler.go` / `project_handler.go` expose `GET /my-permissions` — a self-check endpoint a user calls to learn their own effective role + permissions.
2. These endpoints are gated behind an explicit permission check:
   ```go
   // main.go:565
   r.With(prm("team", "teamId", "team", "read")).Get("/my-permissions", teamHandler.GetMyPermissions)
   // main.go:657
   r.With(prm("project", "projectId", "project", "read")).Get("/my-permissions", projectHandler.GetMyPermissions)
   ```
3. The `permissions-tab.tsx` custom-role editor imposes no minimum permission set — an admin can create a custom team/project role with, say, only `tasks.create` checked and `team.read`/`project.read` left unchecked.
4. A user with that role calls `/my-permissions` to discover what they can do → the endpoint itself 403s (they don't have `read`) → chicken-and-egg: you need `read` to find out you have anything else.
5. On the frontend, `use-project-permissions.ts` / `use-team-permissions.ts` compute:
   ```ts
   isLoading: !data || isLoading
   ```
   When the query errors, React Query's `isLoading` settles to `false`, but `data` stays `undefined` forever, so this expression is stuck `true` **permanently**. No error ever surfaces.
6. Every consumer of these hooks (`useProjectPolicies`, `useTeamPolicies`, task view buttons, `canManageMembers`, task tree/list/kanban views, `change-requests.tsx`) stays hidden/disabled forever — including for permissions the role legitimately DOES have (e.g. `tasks:create` in the example above).

**Scope of impact:** team- and project-scoped custom roles only. Org-scoped custom roles are unaffected (`main.go:553`, org `/my-permissions` has no such gate).

**Why this reads as "partial": ** backend enforcement of the actual permission (`tasks:create` etc.) is correct the whole time — a direct API call with that custom role's token would succeed. It's specifically the frontend's *self-introspection* path that silently breaks, so the UI never offers the button even though the underlying action would work.

---

## 4. Dead/orphaned code — not currently exploitable, but should not be built on top of

1. **A second, disconnected "custom roles" system.** `backend/internal/repository/custom_role_repo.go` writes to a separate `custom_roles` table via `CustomRoleService` (`import_service.go:1016-1098`) and `CustomRoleHandler` (`billing_handler.go:311-470`), mounted at `main.go:543`. `domain.CustomRole` has no `slug`/`scope` field, so it structurally cannot be assigned to any `*_members.role` column, and `PermissionResolver` never reads this table. The matching frontend `roles-tab.tsx` calls this dead API but is never imported into `settings/page.tsx`'s `TABS` — unreachable via the UI today. Looks like the remnant of an earlier, abandoned permission system that was superseded by the current `roles`/`role_permissions` design but never deleted.
2. **Unwired legacy middleware** (`RBAC()`, `RequireTeamRole`, `RequireProjectRole`, `RequirePermission`, `hasBuiltInPermission`) in `rbac.go` — dead, but present and easy to accidentally wire onto a new route by a future contributor who copies an old pattern.
3. **Chat channel roles are a fully separate, fully hardcoded system.** `frontend/src/hooks/use-channel-permissions.ts:24-30,74,85-88` — a fixed `owner/admin/moderator/member/viewer` `ROLE_RANK` hierarchy for messaging channels, entirely independent of the org/team/project RBAC system described above and not customizable at all. Out of scope of this document's "RBAC" but relevant if the vision is "everything should be custom-role-capable."

---

## 5. Known-but-unverified minor items (from the April 8 report, not rechecked in this pass)

- Approve/Reject CR buttons shown to any reviewer, not filtered by `project.settings.approver_ids` (backend correctly 403s designated-approver mismatches; frontend UX doesn't pre-filter).
- No explicit check that task reparenting keeps the new parent within the same project.
- Duplicate-task button gating inconsistent across Kanban/List/Tree views.
- Multi-team-membership role resolution picks the first matching team, not the highest-permission one (non-deterministic depending on `project_teams` order) — this was EDGE-001 in the March audit and has not been reverified since.
- 3-minute permission cache (Redis-backed, in the modern resolver) means a role change isn't instantly effective; there is an explicit `InvalidateUserPermissions()` call path but its coverage across all mutation points hasn't been reverified in this pass.
