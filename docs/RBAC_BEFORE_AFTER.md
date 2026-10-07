# RBAC — Custom Role Bug: Before / After

Scope: exactly the bug you flagged — "custom role backend/frontend conditional rendering only partially working." Everything else in `RBAC_CURRENT_IMPLEMENTATION.md` was already correct and untouched.

---

## BEFORE

**Symptom:** a user assigned a custom **team** or **project** role could have real, correctly-configured permissions on the backend (e.g. `tasks:create`), but the frontend would never show the corresponding buttons — permanently, with no error, no matter how long they waited.

**Root cause, step by step:**

1. An org admin creates a custom team/project role in the permissions editor and doesn't check `read` (nothing forced them to).
2. The frontend calls `GET /teams/{id}/my-permissions` or `GET /projects/{id}/my-permissions` to ask "what can I do here?"
3. Those two routes were themselves gated behind the exact permission they exist to answer about:
   ```go
   // backend/cmd/api/main.go (team, was line 565)
   r.With(prm("team", "teamId", "team", "read")).Get("/my-permissions", teamHandler.GetMyPermissions)
   // backend/cmd/api/main.go (project, was line 660)
   r.With(prm("project", "projectId", "project", "read")).Get("/my-permissions", projectHandler.GetMyPermissions)
   ```
   → user's role lacks `read` → the self-check call itself 403s. Chicken-and-egg: you need `read` to find out what else you have.
4. On the frontend, `use-project-permissions.ts` / `use-team-permissions.ts` computed:
   ```ts
   isLoading: !data || isLoading
   ```
   When the query errors, React Query's own `isLoading` settles to `false`, but `data` stays `undefined` forever — so this expression stayed `true` **forever**.
5. Every consumer downstream (`useProjectPolicies`, `useTeamPolicies`, task view buttons, member-management buttons) treated "still loading" as "show nothing" — so the UI hid *everything*, including permissions the role legitimately had.

**Blast radius:** team- and project-scoped custom roles only. System roles were unaffected because they always have broad permission sets that happen to include `read`. Org-scoped custom roles were unaffected — the org-level `/my-permissions` route never had this guard.

---

## AFTER

**Fix 1 — Backend** (`backend/cmd/api/main.go`): both `/my-permissions` routes now require org membership only (already enforced by the outer `RequireOrgMember` group), never a specific `team:read`/`project:read` permission — matching the pattern the org-level `/my-permissions` route already used:

```go
// team
r.Get("/my-permissions", teamHandler.GetMyPermissions)
// project
r.Get("/my-permissions", projectHandler.GetMyPermissions)
```

Safe by construction: `GetMyPermissions` calls `PermissionResolver.GetEffectivePermissions()`, which itself checks org membership internally and returns an empty role + empty permission list (no error) for a non-member — it was already written to handle "you have nothing" gracefully. The route guard was the only thing standing in the way.

**Fix 2 — Frontend** (`use-project-permissions.ts`, `use-team-permissions.ts`): `isLoading` now reflects the real query state instead of being forced `true` whenever `data` is empty:

```ts
isLoading, // was: isLoading: !data || isLoading
```

**Result:** a custom team/project role missing `read` now still successfully calls `/my-permissions`, gets back its real (possibly `read`-less) permission list, `isLoading` correctly settles to `false`, and every gated button renders based on what the role actually has — no more permanent hang, no more invisible-but-working permissions.

**What did NOT change:** the resolver, the middleware for every other route, the role/permission CRUD, the assignment flow, the owner/admin bypass rules, the `org.delete`/`org.transfer_ownership` escalation guard. Those were already correct and are untouched.

---

## Verification note

No Go or Node toolchain was available in this sandbox to run `go build` / `tsc`, so these changes were verified by manual diff review only (all four edits are minimal — a route-guard removal and a one-line object property change). **Recommend running the backend build and a manual custom-role smoke test (create a team/project custom role without `read`, assign it, confirm the UI now shows the right buttons) before merging.**
