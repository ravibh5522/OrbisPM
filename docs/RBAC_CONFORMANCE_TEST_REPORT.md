# RBAC Conformance Test Report

**Date:** 2026-07-30
**Branch:** `rbac`
**Method:** Live test against the running API (`http://localhost:8000/api/v1`) — real signups, real logins, real roles, real endpoints. Not mocked.
**Script:** `scripts/rbac_conformance_test.py` (self-contained, creates its own throwaway org so it never touches an existing org — safe to rerun anytime)

---

## What was tested

**3 new custom roles**, created via the real permissions API for this run:

| Role | Scope | Permissions | Why this combination |
|---|---|---|---|
| `field_tester` | project | `tasks:create` only — **deliberately no `read`** | Direct regression test for the `/my-permissions` self-check fix (see `RBAC_BEFORE_AFTER.md`) — this is the exact shape of role that used to break the frontend permanently |
| `reviewer_lite` | project | `tasks:read`, `tasks:review` | Narrower than the system `reviewer` role (no comments, no direct_update) — tests that narrow custom sets aren't over- or under-granted |
| `comms_only` | team | `team:read`, `comments:create` | Unusual combination — tests that arbitrary permission pairs resolve correctly, not just the seeded "shapes" |

**11 existing system roles**, unchanged, tested the same way:
- Org scope: `owner`, `admin`, `member`, `viewer`, `billing_admin`
- Project scope: `lead`, `contributor`, `reviewer`, `observer`
- Team scope: `team_lead`, `member`

**15 feature endpoints per identity** — project read/update, task create/read/update/comment/review/delete, project member management, team read/update/member management, and org-scope project/role/webhook creation. Each call's actual HTTP outcome was compared against what that identity's real `/my-permissions` response said it should be.

## Result

```
210 checks total
174 executed
174 passed
0 failed
36 skipped (correctly — dependent on tasks:create, which was correctly denied
            for those roles, so there was no task to run the follow-on
            update/comment/review/delete checks against)
```

**Every single (role, endpoint) combination that ran matched its expected outcome exactly.** No role got access it shouldn't have; no role was denied access it should have had.

### Highlight: the custom-role fix, proven under load

`field_tester` (has `tasks:create`, has **no** `project:read`) — the exact role shape that used to get permanently stuck hidden in the UI before the fix in this branch:

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| GET project | DENY | 403 | ✓ |
| GET tasks | DENY | 403 | ✓ |
| **POST task (create)** | **ALLOW** | **201** | **✓** |
| PATCH task | DENY | 403 | ✓ |

The role correctly gets denied everywhere it should and correctly succeeds at the one thing it's allowed to do — and its own `/my-permissions` self-check succeeded (returned exactly 1 permission), which is what would have 403'd before the fix.

### Cross-scope isolation, confirmed

- `project_lead` (project role `lead`, org role only `member`) is correctly **denied** on all team-scope and org-scope-role-creation endpoints — a project lead doesn't inherit team or org authority.
- `team_lead` / `team_member` / `team_comms_only` (no project membership) are correctly **denied** on all project-scope endpoints — team membership alone doesn't grant project access.
- `org_admin` / `owner` correctly bypass everything except the two ownership-only permissions (not exercised destructively in this run, but confirmed via the earlier automated Go test in this branch).

## Issues found and fixed during this test run (in the test script, not the RBAC system)

1. **Invite endpoint status code.** `POST /orgs/{orgId}/members/invite` returns `204 No Content` on success when inviting by `user_id` (only the invite-by-email path returns `201`). The script initially only accepted `200/201` and reported false failures. Fixed.
2. **Rate limiting.** The backend has a per-IP token-bucket limiter (600/min sustained, burst 50 — `RATE_LIMIT_PER_MINUTE`/`RATE_LIMIT_BURST`). All 14 test identities share one source IP, so an unthrottled run exhausted the burst and every subsequent call got `429`. The script's status classifier also mis-treated `429` as "allowed" (since it isn't `401`/`403`), producing 112 false failures on the first run. Fixed by adding a 200ms delay between requests, a retry-once-after-backoff on `429`, and a dedicated `RATE_LIMITED` verdict that isn't counted as pass or fail.

Neither issue was a defect in the actual permission system — both were test-harness bugs, corrected before trusting the results above.

## How to rerun

```bash
python3 scripts/rbac_conformance_test.py --base http://localhost:8000/api/v1
```

Creates a fresh throwaway org each run (`rbac-conf-<timestamp>`), so results are always against a clean slate and never pollute a real org's data.
