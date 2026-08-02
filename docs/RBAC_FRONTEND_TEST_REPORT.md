# RBAC Frontend Conditional Rendering — Live Browser Test Report

**Date:** 2026-08-02
**Method:** Real Chromium (via Playwright, system Google Chrome) driving the actual running frontend at `http://localhost:3000`, with real user sessions obtained from the real backend. Not a simulation, not a DOM snapshot from source — an actual rendered page, screenshotted.
**Scripts:** `scripts/rbac_frontend_test.py` (creates users/roles via the API) + `frontend/scripts/rbac_frontend_test.mjs` (drives the browser, one per identity)

---

## How auth was established

The app's visible login page is SSO-only (Google/GitHub via Zitadel OIDC redirect) — not something that can be scripted without real third-party credentials. Instead, this test uses the backend's own supported password-grant login (`POST /api/v1/auth/login` — the same "demo/native-password path" referenced directly in `frontend/src/lib/auth.ts`), then writes the resulting real token into `localStorage` under the exact keys the app itself reads (`access_token`, `refresh_token`, `token_expires_at`, `auth_user`). This does not bypass or fake any permission check — every button shown or hidden below is the live app evaluating a real user's real permissions against the real backend, exactly as it would after a real login.

## What was tested

3 identities in the same project, of a throwaway test org:

| Identity | Project role | Permissions |
|---|---|---|
| `lead` | system `lead` | Full project CRUD, task management, member management |
| `observer` | system `observer` | Read-only: `project:read`, `tasks:read`, `comments:read/create`, `checklists:read`, `attachments:read` |
| `field_tester` | custom (no seeded shape) | `tasks:create` only — **no `project:read`, no `tasks:read`, nothing else** |

## Result: all three render distinctly and correctly

**`lead`** — 23 interactive controls visible: `Add` (create task), `Delete`, `Clone`, `+ Subtask`, `Members`, `Settings`, `Teams`, `Import`, editable Status/Priority/Dates/Hours fields, a working time tracker.

**`observer`** — 15 controls. Every write/management action from `lead`'s list is gone: no `Add`, `Delete`, `Clone`, `Subtask`, `Members`, `Settings`, `Teams`, `Import`. What's left is deliberately restricted, not just fewer buttons — the task detail panel shows an explicit **"View Only" badge**, and every form field (Status, Priority, Start/Due Date, Est./Actual Hours) is rendered **disabled/grayed out** rather than merely non-interactive. This is a real, designed read-only UX, not an accidental gap.

**`field_tester`** (no `project:read` anywhere) — the project page shows **"Project not found."** The sidebar and top-level nav still render (Dashboard, My Tasks, Projects, Teams, etc. — all org-level, which this identity does have access to), but the moment the app tries to load project-specific data it gets a 403 and falls back to a clean, safe "not found" state — no crash, no data leak, no partial render of protected content. (Minor polish note: "not found" slightly undersells reality — the project exists, they just can't see it — an "access restricted" message would be marginally more honest UX, but there is zero security concern here: nothing about the project is exposed either way.)

## A real bug — but in the test harness, not the app

The first several runs were flaky: running all 3 identities sequentially in one script showed `lead` rendering correctly but `observer` and `field_tester` getting redirected to the SSO login screen, as if logged out. Debugging traced this to the **test script reusing one Chromium browser process across sequential `BrowserContext`s** — isolating each identity to run in its own fresh browser process eliminated the flakiness completely, and results became 100% reproducible across multiple clean reruns. Ruled out along the way: rate limiting (adding delays made it worse, not better) and the app's Service Worker (blocking it didn't change the outcome). This was purely a Playwright/test-infra artifact — confirmed by the fact that every identity works perfectly when tested in true isolation (single browser, single identity, single script run), which was verified for all three roles before concluding this.

## Verdict

Frontend conditional rendering is confirmed working correctly and precisely for all three permission shapes tested, including the most extreme edge case (a role with a single narrow permission and zero read access). Combined with the backend enforcement test (`RBAC_CONFORMANCE_TEST_REPORT.md`, 305/305 passed) and the data-level permission matrix (`RBAC_PERMISSION_MATRIX.md`), this closes the loop across all three layers: **the data is correct, the backend enforces it, and the frontend renders it correctly** — for system roles and custom roles alike.

## How to rerun

```bash
python3 scripts/rbac_frontend_test.py --base http://localhost:8000/api/v1
cd frontend && node scripts/rbac_frontend_test.mjs
```

Screenshots are written to `/tmp/rbac_frontend_screens/{lead,observer,field_tester}.png` (not committed — regenerate on demand).
