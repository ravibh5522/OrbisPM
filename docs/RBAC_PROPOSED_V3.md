# OrbisPM RBAC — Proposed Direction (DRAFT — awaiting correction)

**Status: PROPOSAL, not approved.** This is a starting point built from the gaps documented in `RBAC_CURRENT_IMPLEMENTATION.md`. Everything below — scope, priority, and even whether an item belongs here at all — is meant to be corrected against the actual product vision before any implementation starts.

---

## 0. What's driving this proposal

The core RBAC pipeline (DB roles/permissions → resolver → HTTP/WS middleware → service checks) already works and doesn't need a rewrite. This proposal targets three things:
1. **Fix the one confirmed live bug** — custom team/project roles can get permanently stuck hidden in the UI.
2. **Remove dead code that's a trap for future contributors** — the disconnected legacy `custom_roles` system and the unwired legacy middleware.
3. **Decide open design questions** the current code has quietly defaulted on, which may not match intent.

---

## 1. Fix: self-check permission endpoint shouldn't require the permission it's answering about

**Problem:** `GET /teams/{id}/my-permissions` and `GET /projects/{id}/my-permissions` require `team:read` / `project:read` to even call. A custom role missing `read` can never learn what it *does* have — and the frontend hook (`use-team-permissions.ts` / `use-project-permissions.ts`) then reports `isLoading: true` forever instead of surfacing the 403, hiding all UI for that user.

**Proposed fix:**
- Backend: change the guard on both `/my-permissions` endpoints from `prm(scope, param, "team"|"project", "read")` to a membership-only check (team/project member, or org owner/admin) — never a specific resource permission. This is a self-introspection endpoint; it should never itself be deniable by permission configuration.
- Frontend: fix `isLoading: !data || isLoading` in both hooks to derive from the query's actual `status` (distinguish `pending` / `error` / `success`), and expose `isError`/`error` so `useProjectPolicies`/`useTeamPolicies` can fail closed *with a visible reason* instead of hanging silently.

**Open question for you:** should a custom role be allowed to omit `read` at all? Alternative: enforce `read` as a mandatory, non-removable permission for any team/project role in the `permissions-tab.tsx` editor (simpler fix, but restricts what "custom" means). I lean toward fixing the endpoint (more correct, less restrictive) but this is your call.

---

## 2. Cleanup: remove or explicitly quarantine dead code

**A. Disconnected legacy `custom_roles` system** — `custom_role_repo.go`, `CustomRoleService` (in `import_service.go`), `CustomRoleHandler` (in `billing_handler.go`), the `custom_roles` DB table, and the unreachable `roles-tab.tsx` frontend component.
- **Proposed action:** confirm nothing in production actually has rows in `custom_roles` (quick `SELECT count(*) FROM custom_roles`), then delete the dead route mount, service, handler, repo, and frontend file. If there IS data in that table, it needs a one-time migration into `roles`/`role_permissions` before deletion — but note `domain.CustomRole` has no `scope`, so migrating it requires deciding a default scope (likely `org`) per legacy row.
- **Open question:** do you want this deleted, or kept as a reference in case it was mid-migration for a reason I don't have context on?

**B. Unwired legacy middleware** (`RBAC()`, `RequireTeamRole`, `RequireProjectRole`, `RequirePermission`, `hasBuiltInPermission` in `rbac.go`) — only `RequireOrgMember` (zero-role variant) is actually used.
- **Proposed action:** delete everything except `RequireOrgMember` (or fold that one function directly into `PermissionResolverMiddleware`'s call sites and delete the whole legacy file). Lower priority than (A) since it's not reachable, but every month it sits there is a chance someone copies the wrong pattern for a new route.

---

## 3. Open design decisions this document surfaces for your call

These aren't bugs — they're places the current code made an implicit choice that you may want to override.

| # | Current behavior | Alternative | Needs your call because |
|---|---|---|---|
| D1 | Multi-team membership resolves to the **first matching team's** role (order-dependent, non-deterministic) | Resolve to the **highest-permission** matching role across all linked teams | Changes real access outcomes for any user in 2+ teams linked to the same project |
| D2 | Project-scope and team-scope permission checks **never fall through to org-level** — an org `member` role with `tasks.create` still can't touch a project unless they're a project/team member | Allow a configurable per-org fallthrough | This is a deliberate design choice already (confirmed in resolver code) — flagging it in case it doesn't match your intended UX; if it's already correct, no action needed |
| D3 | Chat channel roles (`use-channel-permissions.ts`) are a fully separate, hardcoded, non-customizable 5-tier hierarchy | Fold channels into the same `roles`/`permissions` scope system as a 4th scope | Bigger scope of work — only worth it if "custom roles everywhere" is actually the vision, vs. channels being intentionally simple |
| D4 | Designated CR approvers (`project.settings.approver_ids`) are enforced backend-side only; frontend shows Approve/Reject to any reviewer regardless | Frontend pre-filters based on `approver_ids` before rendering the buttons | UX-only, not a security gap, but worth deciding if it's worth the frontend fetch |
| D5 | Permission cache TTL is 3 minutes (Redis-backed in the modern resolver) — a role change isn't instant | Reduce TTL, or push explicit invalidation to every mutation path (partially exists via `InvalidateUserPermissions()`, coverage unverified) | Tradeoff between DB load and staleness window — depends on how sensitive role changes are expected to be (e.g. "revoke access NOW" vs. "eventually consistent is fine") |

---

## 4. Explicitly out of scope for now (flag if wrong)

- CR approver UX pre-filtering (D4) and reparenting cross-project validation — cosmetic/edge, not blocking.
- Any change to the org/team/project three-scope model itself — the model works; this proposal assumes we're fixing/hardening it, not redesigning it.
- Chat channel RBAC unification (D3) — treated as a decision point, not a committed work item, until you say otherwise.

---

## 5. What I need from you

1. Confirm or correct §1's fix direction (endpoint change vs. mandatory-`read` UI constraint).
2. Decide §2A/2B — delete now, or hold?
3. Rule on D1–D5 — which are real requirements vs. which are fine as-is.
4. Anything missing entirely — features you expected in RBAC that neither this doc nor the current code accounts for.
