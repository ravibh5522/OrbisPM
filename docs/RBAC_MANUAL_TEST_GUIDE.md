# RBAC Manual Test Guide — 1 Hour, You Drive

**Your intent:** create an org as Admin/Owner (full access baseline), then create two custom roles — **Product Manager** and **Developer** — and grant them permissions one feature at a time, confirming after each grant that the account's UI reflects exactly that change. Nothing more, nothing less.

This guide gives you the exact click-path and the exact expected result for every step, built from permission shapes and UI states already verified in this branch (`docs/RBAC_PERMISSION_MATRIX.md`, `RBAC_CONFORMANCE_TEST_REPORT.md`, `RBAC_FRONTEND_TEST_REPORT.md`) — so you have a known-correct answer to check your screen against at every step, not just "does something happen."

---

## Before you start: accounts and windows

Login is SSO-only (Google/GitHub) — there's no password form in the browser. You need **3 separate login identities**:

1. **Your main account** → becomes Owner
2. **A second email/account** → will become "Product Manager"
3. **A third email/account** → will become "Developer"

If you don't have 3 distinct Google/GitHub accounts handy, this is the point to sort that out (e.g. a personal + work account + one more) — a Gmail `+alias` trick won't work here since Google OAuth authenticates the real underlying account, not the alias.

**Set up 3 browser windows so all 3 sessions stay logged in simultaneously:**
- **Window A** (normal window) — Owner
- **Window B** (Incognito/Private window) — Product Manager
- **Window C** (a different browser, or another Incognito profile) — Developer

You'll flip between these 3 windows constantly, so keep them all open and positioned side by side if you can.

---

## Part 0 — Setup (0:00–0:05)

1. In **Window A**, go to the app, sign in via SSO with your main account.
2. Create a new organization — name it something like `RBAC Live Test`.
3. Confirm you landed in the org as **Owner** (check the sidebar — your name/role badge should say "Owner").

**Expected:** you're in a brand-new, empty org, no teams/projects yet.

---

## Part 1 — Owner sanity check: confirm full access (0:05–0:15)

Quickly click through these — don't overthink it, just confirm each one is visibly there and clickable:

| # | Action | Expected |
|---|---|---|
| 1 | Create a Team, e.g. "Engineering" | Team created, you're listed as Team Lead |
| 2 | Create a Project, e.g. "Launch Q1" (no team link needed) | Project created, you're auto-added as **Lead** |
| 3 | Open the project → create a task, e.g. "Sample Task" | Task appears in the board |
| 4 | Click the task → check the detail panel | Fields (Status, Priority, Dates, Hours) are **editable**, no "View Only" badge |
| 5 | Look at project top nav | You should see: Dashboard, Tasks, **Members**, Teams, Reviews, Announcements, Canvas, **Settings** — all present |
| 6 | Look at the task panel bottom | **+ Subtask**, **Clone**, **Delete** all visible |
| 7 | Go to Org **Settings → Roles & Permissions** | Page loads, shows 5 org roles + "New Role" button |
| 8 | Switch the scope tab to **Project** | Shows 4 system project roles (Lead, Contributor, Reviewer, Observer) |
| 9 | Check Settings → Billing, Webhooks, API Keys tabs | All visible and load without error |

**If anything here fails** — stop and tell me, since everything downstream assumes Owner has full access (already proven true in every automated test so far, so a failure here would mean something changed).

---

## Part 2 — Create the two custom roles, empty (0:15–0:22)

Both roles will start with **zero permissions** so you can watch each one "light up" as you add permissions.

1. Settings → Roles & Permissions → **Project** scope tab → **New Role**
2. Create role: name = `Product Manager`, slug = `product_manager` (or whatever the form auto-generates), **check nothing**, save.
3. Repeat: name = `Developer`, slug = `developer`, **check nothing**, save.

**Invite your 2 test accounts into the org:**
4. Settings → Members → Invite → enter your 2nd account's email, role = `member` (org-level baseline — this just lets them into the org, it does NOT give them project access).
5. Repeat for your 3rd account.
6. In **Window B**, sign in with your 2nd account and accept/land in the org.
7. In **Window C**, sign in with your 3rd account.

**Assign the empty custom roles to your project:**
8. Back in **Window A**, go to your "Launch Q1" project → Members → Add Member → pick your 2nd account, role = `Product Manager` (your new custom role).
9. Add your 3rd account, role = `Developer`.

**Now check the baseline (both should be almost empty):**
10. In **Window B** (Product Manager), navigate to the "Launch Q1" project.
11. In **Window C** (Developer), do the same.

**Expected for both:** the project page shows **"Project not found"** — because neither role has `project:read` yet. This matches the exact pattern from `RBAC_FRONTEND_TEST_REPORT.md` (a role with zero relevant read permission gets this safe fallback, not a crash). This is your true zero baseline.

---

## Part 3 — Incremental permission walk (0:22–0:48, the main event)

For **every** row below: go to **Window A** → Settings → Roles & Permissions → Project scope → click the role → check the box → Save. Then flip to that role's window, **refresh the project page**, and confirm the expected change. Check it off as you go.

### Product Manager — build up planning + oversight access

| Step | Grant this permission | Refresh in Window B and expect... |
|---|---|---|
| 3.1 | `project:read` | Page now loads! You see the board, "Sample Task" is visible, but no top nav tabs beyond basics, no create/edit controls yet |
| 3.2 | `tasks:read` | Task list/board fully visible (should already show from 3.1 actually rendering the task — confirm task details are viewable) |
| 3.3 | `tasks:create` | An **"Add"**-style button appears on the task columns — click it, confirm you can create a new task |
| 3.4 | `tasks:update` | Task detail fields (Status, Priority, Dates) become **editable** instead of grayed out |
| 3.5 | `tasks:review` | Look for a "Mark Complete" / review-related action (may only appear on a task that's `In Review` status — if you don't see it, move a task to "In Review" first via drag or status dropdown, then check) |
| 3.6 | `comments:create` + `comments:read` | Open a task's comment area (likely a "Chat" or "Comments" tab in the detail panel) — you can now see and post comments |
| 3.7 | `members:manage` | The **"Members"** tab appears in the project top nav; you can add/remove project members |
| 3.8 | `project:update` | The **"Settings"** tab appears in the project top nav |

**Deliberately withhold `tasks:delete` and `project:delete` from Product Manager** — confirm at the end of this section that no Delete button ever appeared on tasks or the project itself, even with everything else granted.

### Developer — build up execution access, no planning/management

| Step | Grant this permission | Refresh in Window C and expect... |
|---|---|---|
| 3.9 | `project:read` | Page loads, board visible, still no create/edit controls |
| 3.10 | `tasks:read` | Full task list visible |
| 3.11 | `tasks:create` | "Add" button appears — create a task |
| 3.12 | `tasks:update` | Task fields become editable |
| 3.13 | `checklists:create` + `checklists:read` | Checklist section inside a task's detail panel becomes usable — add a checklist item |
| 3.14 | `attachments:create` + `attachments:read` | The "Files" tab/area in the task panel allows uploading |
| 3.15 | `comments:create` + `comments:read` | Same as 3.6 — can view/post comments |

**Deliberately withhold `tasks:delete`, `tasks:review`, `project:update`, and `members:manage` from Developer** — confirm at the end: no Delete button, no review/complete action, no Settings tab, no Members tab, ever appear for this account, no matter how much else is granted.

---

## Part 4 — Cross-checks (0:48–0:56)

1. **Negative check, Product Manager:** with everything from 3.1–3.8 granted, confirm the **Delete** button is still nowhere on a task and the project itself has no delete option. This proves permissions are additive and precise — granting 8 things didn't accidentally unlock a 9th.
2. **Negative check, Developer:** same — confirm no Settings tab, no Members tab, no Delete, no review action, despite having create/update/comment/checklist/attachment access.
3. **Live revoke check:** pick one permission you granted Developer (e.g. `tasks:update`) and **uncheck** it in Window A. Refresh Window C. Confirm the task fields go back to **disabled/View Only** immediately — no caching lag, no stale access.
4. **Isolation check:** confirm Product Manager's permissions never leaked into Developer's window or vice versa — they should look meaningfully different from each other at every step, not converge.

---

## Part 5 — Wrap-up (0:56–1:00)

Fill this in and send it back to me:

```
Part 1 (Owner sanity): PASS / FAIL — notes: ___
Part 2 (empty baseline): PASS / FAIL — notes: ___
Part 3.1–3.8 (Product Manager buildup): all matched expected? Y/N — first mismatch at step: ___
Part 3.9–3.15 (Developer buildup): all matched expected? Y/N — first mismatch at step: ___
Part 4.1 (PM negative check): PASS / FAIL
Part 4.2 (Dev negative check): PASS / FAIL
Part 4.3 (live revoke): PASS / FAIL
Part 4.4 (isolation): PASS / FAIL
Anything that looked wrong, confusing, or different from the "expected" column: ___
```

If everything matches — that's a full manual confirmation of the same thing the automated tests already proved, but from your own hands, watching it happen live. If something doesn't match, that's a real, fresh finding — bring me the exact step number and what you saw instead, and we'll dig into it immediately.

---

## Notes on labels

A few UI labels in Part 3 (comments tab name, review action name, checklist location) are described by what they *do*, not guaranteed exact text — the app's copy may say "Chat" where I've said "comments," or similar. If a described control isn't where expected, look for the nearest equivalent by function first; if you genuinely can't find it anywhere, that itself is worth flagging back to me as a possible gap.
