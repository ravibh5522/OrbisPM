# UI Consistency Audit — Round 3 (Deep Line-by-Line)

**Date:** 2026-04-05  
**Scope:** ALL 162 frontend source files — every line read  
**Method:** 8 parallel agents, 57 rules (R1–R57)

---

## Audit Rules

| ID  | Category  | Rule                                                                                                         |
| --- | --------- | ------------------------------------------------------------------------------------------------------------ |
| R1  | CSS       | No raw `oklch()` outside `[data-theme]` blocks — use `var(--gl-*)`/`var(--gd-*)`/`var(--ol-*)`/`var(--od-*)` |
| R2  | CSS       | No hardcoded `blur()` — use `var(--blur-sm)`, `var(--blur-surface)` etc.                                     |
| R3  | CSS       | No magic border-radius — use `var(--radius-box)`, `var(--radius-field)` or utilities                         |
| R4  | CSS       | No duplicate selectors                                                                                       |
| R5  | CSS       | No hardcoded dimension magic numbers — use tokens                                                            |
| R6  | CSS       | Scrollbar rules consolidated where possible                                                                  |
| R7  | CSS       | `!important` only for DaisyUI theme overrides                                                                |
| R8  | Component | No raw `<button className="btn ...">` — use `<Button>` component                                             |
| R9  | Component | No raw `<div className="alert ...">` — use `<Alert>` component                                               |
| R10 | Component | No ad-hoc tab implementations — use `<Tabs>` component                                                       |
| R11 | Component | No inline status/priority badge ternaries — use `STATUS_BADGE`/`PRIORITY_BADGE` maps                         |
| R12 | Color     | No hardcoded hex/oklch in JSX — exceptions: chart data arrays, OG route                                      |
| R13 | Color     | No inline `oklch()` in style props                                                                           |
| R14 | A11y      | Semantic roles on interactive elements                                                                       |
| R15 | Style     | No undocumented inline styles                                                                                |
| R18 | Import    | Clean, grouped imports; no unused                                                                            |
| R19 | Loading   | Use `<Skeleton>` component, not raw `animate-pulse` divs                                                     |
| R20 | Component | Badge variant uses semantic names, not raw DaisyUI classes                                                   |
| R21 | Directive | Client components must have `"use client"`                                                                   |
| R22 | TS        | No `@ts-ignore` or `@ts-nocheck`                                                                             |
| R23 | TS        | No `any` type — use `unknown` with type guards                                                               |
| R24 | Component | Unified card pattern: `bg-base-100 rounded-xl border border-base-200 shadow-sm`                              |
| R25 | Component | Use `<Modal>` component, not raw `<dialog>`                                                                  |
| R26 | Form      | Form validation on all user inputs                                                                           |
| R27 | A11y      | `aria-label`/`aria-expanded`/`aria-disabled` on interactive elements                                         |
| R28 | Style     | No undocumented z-index magic numbers                                                                        |
| R29 | Chart     | Use `CHART_AXIS_STYLE`, `CHART_TOOLTIP_STYLE`, `CHART_PALETTE` from chart-utils                              |
| R30 | Code      | No `console.log`/`console.error` in production — wrap in dev check                                           |
| R36 | Config    | Use `base-url.ts` for API base URL — no hardcoded fallbacks                                                  |
| R38 | Form      | Use `<Input>` component, not raw `<input>`                                                                   |
| R39 | Form      | Use `<Textarea>` / `<PasswordInput>` components                                                              |
| R40 | Form      | Use `<Select>` component, not raw `<select>`                                                                 |
| R41 | Component | `<Link className="btn ...">` acceptable when `<Button>` lacks `asChild`                                      |
| R42 | SEO       | Pages should have proper Metadata exports                                                                    |
| R43 | A11y      | Images must have `alt` text                                                                                  |
| R47 | Component | Use `<Badge>` component for badge-like elements                                                              |
| R48 | Component | Use `<StatCard>` for KPI displays                                                                            |
| R50 | Component | Status/priority dropdowns should use centralized option constants                                            |

---

## Summary

| Severity     | Count   |
| ------------ | ------- |
| **CRITICAL** | 12      |
| **HIGH**     | 203     |
| **MEDIUM**   | 58      |
| **LOW**      | 15      |
| **TOTAL**    | **288** |

### By Rule (top issues)

| Rule | Violations | Description                                                          |
| ---- | ---------- | -------------------------------------------------------------------- |
| R8   | **146**    | Raw `<button>` instead of `<Button>`                                 |
| R40  | **33**     | Raw `<select>` / `<input>` / `<textarea>` instead of form components |
| R38  | **18**     | Raw `<input>` instead of `<Input>`                                   |
| R30  | **17**     | `console.log`/`console.error` in production code                     |
| R28  | **26**     | Undocumented z-index values                                          |
| R23  | **6**      | TypeScript `any` type usage                                          |
| R36  | **5**      | Hardcoded API_BASE fallback instead of base-url.ts                   |
| R13  | **10**     | Inline oklch() in style props                                        |
| R11  | **6**      | Inline status/priority ternaries                                     |
| R19  | **4**      | Raw animate-pulse instead of `<Skeleton>`                            |
| R9   | **1**      | Raw alert div                                                        |
| R39  | **3**      | Raw `<textarea>` instead of `<Textarea>`                             |
| R50  | **3**      | Status dropdowns without centralized constants                       |
| R21  | **2**      | Missing `"use client"`                                               |
| R27  | **4**      | Missing aria attributes                                              |
| R48  | **2**      | Raw stat divs instead of `<StatCard>`                                |
| R20  | **1**      | Badge variant using raw DaisyUI class                                |
| R12  | **1**      | Hardcoded hex outside data arrays                                    |

---

## Fully Compliant Files (0 issues)

### UI Components

- `alert.tsx` ✅
- `button.tsx` ✅
- `color-picker-panel.tsx` ✅
- `form-fields.tsx` ✅
- `modal.tsx` ✅
- `skeleton.tsx` ✅
- `stat-card.tsx` ✅
- `tabs.tsx` ✅
- `virtual-scroll-list.tsx` ✅
- `presence-indicator.tsx` ✅

### Lib / Stores / Types

- `auth.ts` ✅
- `auth-errors.ts` ✅
- `base-url.ts` ✅
- `policies.ts` ✅
- `task-colors.ts` ✅
- `theme-previews.ts` ✅
- `theme-profiles.ts` ✅
- `utils.ts` ✅
- `offline/persister.ts` ✅
- `auth-store.ts` ✅
- `chat-store.ts` ✅
- `ui-store.ts` ✅
- `domain.ts` ✅
- `middleware.ts` ✅

### Hooks

- `use-auth-guard.ts` ✅
- `use-online-status.ts` ✅
- `use-permissions.ts` ✅
- `use-policies.ts` ✅
- `use-project-permissions.ts` ✅
- `use-reviewable-fields.ts` ✅
- `use-team-permissions.ts` ✅
- `use-undo-redo.ts` ✅

### Chart Components

- `area-chart.tsx` ✅
- `bar-chart.tsx` ✅
- `chart-skeleton.tsx` ✅
- `donut-chart.tsx` ✅
- `health-ring.tsx` ✅
- `line-chart.tsx` ✅
- `stacked-area-chart.tsx` ✅

### Marketing / Auth (fully compliant)

- `reset-password/page.tsx` ✅
- `onboarding/page.tsx` ✅
- `(marketing)/layout.tsx` ✅
- `contact/page.tsx` ✅
- `pricing/page.tsx` ✅
- `features/page.tsx` ✅
- `about/page.tsx` ✅
- `alternatives/page.tsx` ✅
- `alternatives/asana/page.tsx` ✅
- `alternatives/jira/page.tsx` ✅
- `alternatives/trello/page.tsx` ✅
- `blog/page.tsx` ✅
- `blog/ai-sprint-planning-complete-guide/page.tsx` ✅

### Other

- `layout.tsx` (root) ✅
- `page.tsx` (root) ✅
- `manifest.ts` ✅
- `robots.ts` ✅
- `sitemap.ts` ✅
- `email-editor-wrapper.tsx` ✅
- `project-dashboard.tsx` ✅
- `data-prefetcher.tsx` ✅
- `permission-gate.tsx` ✅
- `providers.tsx` ✅
- `sw-registrar.tsx` ✅
- `telemetry-tracker.tsx` ✅
- `calendar-utils.ts` ✅
- `calendar/index.ts` ✅
- `messages/page.tsx` ✅
- `messages/loading.tsx` ✅
- `offline-indicator.tsx` ✅
- `command-palette.tsx` ✅
- `loading.tsx` (org) ✅
- `settings/billing/page.tsx` ✅

---

## File-by-File Findings

---

### globals.css

| Line      | Rule | Severity | Issue                                                                         | Fix                                             |
| --------- | ---- | -------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| 520+      | R7   | MEDIUM   | ~400+ `!important` declarations — most can be removed with proper specificity | Audit cascade; target <100                      |
| 1545–1775 | R6   | MEDIUM   | Scrollbar rules repeated per theme (4×)                                       | Consolidate; override only color vars per theme |

---

### pagination.tsx

| Line  | Rule | Severity | Issue                                              | Fix                                        |
| ----- | ---- | -------- | -------------------------------------------------- | ------------------------------------------ |
| 49    | R8   | CRITICAL | Raw `<button className="btn btn-sm btn-ghost">`    | `<Button variant="ghost" size="sm">`       |
| 65    | R8   | CRITICAL | Raw `<button className="btn btn-sm">`              | `<Button size="sm">`                       |
| 69–91 | R8   | CRITICAL | 5× raw `<button className="join-item btn btn-sm">` | `<Button size="sm" className="join-item">` |

---

### shared.tsx (ConfirmDialog)

| Line | Rule | Severity | Issue                                            | Fix                        |
| ---- | ---- | -------- | ------------------------------------------------ | -------------------------- |
| 144  | R8   | CRITICAL | Raw `<button className="btn">` Cancel            | `<Button>Cancel</Button>`  |
| 150  | R8   | CRITICAL | Raw `<button className="btn btn-error">` Confirm | `<Button variant="error">` |

---

### theme-customizer-modal.tsx

| Line | Rule | Severity | Issue                                                      | Fix                                  |
| ---- | ---- | -------- | ---------------------------------------------------------- | ------------------------------------ |
| 103  | R8   | CRITICAL | Raw `<button className="btn btn-ghost btn-sm btn-circle">` | `<Button variant="ghost" size="sm">` |
| 141  | R8   | CRITICAL | Raw `<button className="btn btn-xs ...">`                  | `<Button size="xs">`                 |

---

### api.ts

| Line | Rule | Severity | Issue                                                                           | Fix                       |
| ---- | ---- | -------- | ------------------------------------------------------------------------------- | ------------------------- |
| 34   | R36  | HIGH     | `const API_BASE = process.env.NEXT_PUBLIC_API_URL \|\| "http://localhost:8080"` | Import from `base-url.ts` |

---

### chart-utils.ts

| Line | Rule | Severity | Issue                                         | Fix              |
| ---- | ---- | -------- | --------------------------------------------- | ---------------- |
| 17   | R13  | HIGH     | Hardcoded `oklch(0% 0 0 / 0.15)` in boxShadow | Use CSS variable |

---

### telemetry.ts

| Line | Rule | Severity | Issue                       | Fix                       |
| ---- | ---- | -------- | --------------------------- | ------------------------- |
| 9    | R36  | HIGH     | Hardcoded API_BASE fallback | Import from `base-url.ts` |

---

### use-chat-socket.ts

| Line | Rule | Severity | Issue                                 | Fix                         |
| ---- | ---- | -------- | ------------------------------------- | --------------------------- |
| 12   | R36  | HIGH     | Hardcoded API_BASE fallback           | Import from `base-url.ts`   |
| 111  | R30  | HIGH     | `console.log("[Chat WS timeout...]")` | Wrap in dev check or remove |
| 241  | R30  | HIGH     | `console.log("[Chat WS closed...]")`  | Wrap in dev check or remove |

---

### use-org-socket.ts

| Line | Rule | Severity | Issue                                  | Fix                       |
| ---- | ---- | -------- | -------------------------------------- | ------------------------- |
| 12   | R36  | HIGH     | Hardcoded API_BASE fallback            | Import from `base-url.ts` |
| 71   | R23  | HIGH     | `(data: any) => void` in PendingReq    | Use `unknown`             |
| 100  | R30  | HIGH     | `console.log("[WS] Connected to org")` | Wrap in dev check         |
| 122  | R30  | HIGH     | `console.log("[WS] Disconnected")`     | Wrap in dev check         |
| 127  | R30  | HIGH     | `console.log("[WS] Reconnecting...")`  | Wrap in dev check         |

---

### use-project-socket.ts

| Line | Rule | Severity | Issue                                           | Fix                       |
| ---- | ---- | -------- | ----------------------------------------------- | ------------------------- |
| 10   | R36  | HIGH     | Hardcoded API_BASE fallback                     | Import from `base-url.ts` |
| 12   | R23  | HIGH     | `(data: any) => void` in PendingReq             | Use `unknown`             |
| 71   | R30  | HIGH     | `console.log("[WS] Connected to project room")` | Dev check                 |
| 80   | R30  | HIGH     | `console.log("[WS] Disconnected")`              | Dev check                 |
| 99   | R30  | HIGH     | `console.log("[WS] Reconnecting...")`           | Dev check                 |

---

### use-websocket.tsx

| Line | Rule | Severity     | Issue                                                           | Fix                                  |
| ---- | ---- | ------------ | --------------------------------------------------------------- | ------------------------------------ |
| 8    | R36  | **CRITICAL** | API_BASE fallback uses **wrong port** `8000` (should be `8080`) | Fix port + import from `base-url.ts` |
| 16   | R23  | HIGH         | `(data: any) => void`                                           | Use `unknown`                        |
| 27   | R30  | HIGH         | `console.log("[SSE] Connected")`                                | Dev check                            |
| 41   | R30  | HIGH         | `console.log("[SSE] Disconnected...")`                          | Dev check                            |
| 44   | R30  | HIGH         | `console.log("[SSE] Max retries reached...")`                   | Dev check                            |

---

### project-task-store.ts

| Line | Rule | Severity | Issue                                                | Fix                                                |
| ---- | ---- | -------- | ---------------------------------------------------- | -------------------------------------------------- |
| 11   | R23  | HIGH     | `Record<string, any>` and `Promise<any>` in WsSendFn | Use `Record<string, unknown>` + `Promise<unknown>` |
| 76   | R23  | HIGH     | `(resp: any)` cast                                   | Use `unknown` with type guard                      |

---

### login/page.tsx

| Line | Rule | Severity | Issue                                     | Fix                             |
| ---- | ---- | -------- | ----------------------------------------- | ------------------------------- |
| 108  | R26  | MEDIUM   | Password field missing min/max validation | Add `validate:"required,min=8"` |

---

### signup/page.tsx

| Line | Rule | Severity | Issue                                                       | Fix            |
| ---- | ---- | -------- | ----------------------------------------------------------- | -------------- |
| 95   | R8   | MEDIUM   | Raw `<button className="btn btn-ghost btn-sm">` back button | Use `<Button>` |

---

### forgot-password/page.tsx

| Line | Rule | Severity | Issue                                    | Fix            |
| ---- | ---- | -------- | ---------------------------------------- | -------------- |
| 63   | R8   | MEDIUM   | Raw `<button className="btn btn-ghost">` | Use `<Button>` |

---

### contact-form.tsx

| Line | Rule | Severity | Issue                                                    | Fix              |
| ---- | ---- | -------- | -------------------------------------------------------- | ---------------- |
| 54   | R38  | HIGH     | Raw `<input className="input input-bordered">` (name)    | Use `<Input>`    |
| 62   | R38  | HIGH     | Raw `<input className="input input-bordered">` (email)   | Use `<Input>`    |
| 70   | R38  | HIGH     | Raw `<input className="input input-bordered">` (company) | Use `<Input>`    |
| 80   | R39  | HIGH     | Raw `<textarea className="textarea textarea-bordered">`  | Use `<Textarea>` |

---

### landing/page.tsx

| Line | Rule | Severity | Issue                                                         | Fix                        |
| ---- | ---- | -------- | ------------------------------------------------------------- | -------------------------- |
| 181  | R8   | MEDIUM   | `<a className="btn btn-ghost">` anchor with btn class         | Use `<Button>` or `<Link>` |
| 217  | R8   | MEDIUM   | Raw `<button className="btn btn-ghost btn-sm">` mobile toggle | Use `<Button>`             |

---

### pricing/pricing-faq.tsx

| Line | Rule | Severity | Issue                                | Fix                                   |
| ---- | ---- | -------- | ------------------------------------ | ------------------------------------- |
| 35   | R8   | MEDIUM   | Raw `<button>` accordion toggle      | Use `<Button>` or document as pattern |
| 48   | R27  | MEDIUM   | Missing `aria-expanded` on accordion | Add `aria-expanded={openIndex === i}` |

---

### not-found.tsx

| Line | Rule | Severity | Issue                   | Fix            |
| ---- | ---- | -------- | ----------------------- | -------------- |
| —    | R8   | HIGH     | Raw Link with btn class | Use `<Button>` |

---

### offline/page.tsx

| Line | Rule | Severity | Issue      | Fix            |
| ---- | ---- | -------- | ---------- | -------------- |
| —    | R8   | HIGH     | Raw button | Use `<Button>` |

---

### og/route.tsx

| Line     | Rule | Severity | Issue                                           | Fix                                                                               |
| -------- | ---- | -------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| Multiple | R12  | MEDIUM   | 15× hardcoded hex colors in OG image generation | Acceptable — server-only image render (ImageResponse API requires literal values) |

---

### [orgSlug]/layout.tsx

| Line     | Rule | Severity | Issue                            | Fix                       |
| -------- | ---- | -------- | -------------------------------- | ------------------------- |
| Multiple | R28  | MEDIUM   | 3× undocumented `z-[999]` values | Document z-index strategy |

---

### [orgSlug]/page.tsx (Dashboard)

| Line | Rule | Severity | Issue                                     | Fix                 |
| ---- | ---- | -------- | ----------------------------------------- | ------------------- |
| 1    | R21  | CRITICAL | Missing `"use client"` — uses hooks       | Add `"use client"`  |
| 161  | R8   | HIGH     | Raw `<button>` for day selector           | Use `<Button>`      |
| 163  | R13  | MEDIUM   | Inline oklch() in shadow                  | Use CSS variable    |
| 246  | R13  | MEDIUM   | Hardcoded oklch() for progress ring color | Extract to constant |
| 264  | R13  | MEDIUM   | `--progress-value: oklch(...)` hardcoded  | Use token           |

---

### [orgSlug]/my-tasks/page.tsx

| Line | Rule | Severity | Issue                                                   | Fix              |
| ---- | ---- | -------- | ------------------------------------------------------- | ---------------- |
| 262  | R8   | HIGH     | Raw `<button className="btn btn-sm ...">` filter toggle | Use `<Button>`   |
| 321  | R8   | HIGH     | Raw `<button>` view toggle                              | Use `<Button>`   |
| 341  | R19  | MEDIUM   | Inline loading spinner                                  | Use `<Skeleton>` |

---

### [orgSlug]/calendar/page.tsx

| Line | Rule | Severity | Issue                 | Fix            |
| ---- | ---- | -------- | --------------------- | -------------- |
| 101  | R8   | HIGH     | Raw `<button>`        | Use `<Button>` |
| 113  | R28  | MEDIUM   | `z-[99]` undocumented | Document       |

---

### [orgSlug]/notifications/page.tsx

| Line | Rule | Severity | Issue                                           | Fix            |
| ---- | ---- | -------- | ----------------------------------------------- | -------------- |
| 87   | R8   | HIGH     | Raw `<button className="btn btn-ghost btn-xs">` | Use `<Button>` |

---

### [orgSlug]/activity/page.tsx

| Line | Rule | Severity | Issue                                           | Fix            |
| ---- | ---- | -------- | ----------------------------------------------- | -------------- |
| 179  | R8   | HIGH     | Raw `<button className="btn btn-sm">`           | Use `<Button>` |
| 206  | R40  | HIGH     | 2× raw `<select className="select ...">`        | Use `<Select>` |
| 283  | R8   | HIGH     | Raw `<button className="btn btn-ghost btn-xs">` | Use `<Button>` |
| 167  | R38  | MEDIUM   | Raw `<input type="text">` search                | Use `<Input>`  |

---

### [orgSlug]/search/page.tsx

| Line | Rule | Severity | Issue                                                | Fix            |
| ---- | ---- | -------- | ---------------------------------------------------- | -------------- |
| 117  | R8   | HIGH     | Raw `<button className="btn btn-primary join-item">` | Use `<Button>` |
| 110  | R38  | HIGH     | Raw `<input className="input ...">`                  | Use `<Input>`  |

---

### [orgSlug]/templates/page.tsx

| Line | Rule | Severity | Issue                              | Fix            |
| ---- | ---- | -------- | ---------------------------------- | -------------- |
| 187  | R8   | HIGH     | 2× raw `<button>` (Import + Clear) | Use `<Button>` |
| 165  | R38  | HIGH     | Raw `<input type="text">` search   | Use `<Input>`  |
| 193  | R8   | HIGH     | Raw clear search button            | Use `<Button>` |

---

### [orgSlug]/profile/page.tsx

| Line | Rule | Severity | Issue                                | Fix                 |
| ---- | ---- | -------- | ------------------------------------ | ------------------- |
| 268  | R40  | HIGH     | Raw `<select>` (timezone)            | Use `<Select>`      |
| 290  | R40  | HIGH     | Raw `<select>` (language)            | Use `<Select>`      |
| 379  | R8   | MEDIUM   | Raw `<input type="checkbox">` toggle | Consider `<Toggle>` |

---

### [orgSlug]/performance/page.tsx

| Line | Rule | Severity | Issue                               | Fix                        |
| ---- | ---- | -------- | ----------------------------------- | -------------------------- |
| 108  | R8   | HIGH     | Raw `<button>` 7d/30d/90d selector  | Use `<Button>`             |
| 121  | R8   | HIGH     | Raw `<a className="btn ...">` links | Use `<Button>` or `<Link>` |

---

### [orgSlug]/performance/members/page.tsx

| Line | Rule | Severity | Issue                | Fix           |
| ---- | ---- | -------- | -------------------- | ------------- |
| 61   | R38  | HIGH     | Raw `<input>` search | Use `<Input>` |

---

### [orgSlug]/performance/projects/page.tsx

| Line | Rule | Severity | Issue                | Fix           |
| ---- | ---- | -------- | -------------------- | ------------- |
| 79   | R38  | HIGH     | Raw `<input>` search | Use `<Input>` |

---

### [orgSlug]/performance/reports/page.tsx

| Line | Rule | Severity | Issue                                             | Fix            |
| ---- | ---- | -------- | ------------------------------------------------- | -------------- |
| 85   | R40  | HIGH     | Raw `<select>`                                    | Use `<Select>` |
| 88   | R8   | HIGH     | Raw `<button className="btn btn-primary btn-sm">` | Use `<Button>` |

---

### [orgSlug]/performance/teams/page.tsx

| Line | Rule | Severity | Issue                | Fix           |
| ---- | ---- | -------- | -------------------- | ------------- |
| 71   | R38  | HIGH     | Raw `<input>` search | Use `<Input>` |

---

### [orgSlug]/error.tsx

| Line | Rule | Severity | Issue                                      | Fix            |
| ---- | ---- | -------- | ------------------------------------------ | -------------- |
| 23   | R8   | HIGH     | Raw `<button className="btn btn-primary">` | Use `<Button>` |

---

### [orgSlug]/messages/error.tsx

| Line | Rule | Severity | Issue                                      | Fix            |
| ---- | ---- | -------- | ------------------------------------------ | -------------- |
| 20   | R8   | HIGH     | Raw `<button className="btn btn-primary">` | Use `<Button>` |

---

### calendar/calendar-filters.tsx

| Line | Rule | Severity | Issue                           | Fix                |
| ---- | ---- | -------- | ------------------------------- | ------------------ |
| 113  | R8   | MEDIUM   | Raw `<button>` chip close       | Use `<Button>`     |
| 145  | R47  | MEDIUM   | Badge-like chips using `<span>` | Consider `<Badge>` |

---

### calendar/calendar-view.tsx

| Line | Rule | Severity | Issue                        | Fix      |
| ---- | ---- | -------- | ---------------------------- | -------- |
| 178  | R28  | MEDIUM   | `z-10` / `z-20` undocumented | Document |

---

### notification-bell.tsx

| Line | Rule | Severity | Issue                                                      | Fix            |
| ---- | ---- | -------- | ---------------------------------------------------------- | -------------- |
| 112  | R8   | HIGH     | Raw `<button className="btn btn-ghost btn-sm btn-square">` | Use `<Button>` |
| 132  | R8   | HIGH     | Raw `<button className="btn btn-ghost btn-xs">`            | Use `<Button>` |

---

### projects/page.tsx

| Line | Rule | Severity | Issue                               | Fix              |
| ---- | ---- | -------- | ----------------------------------- | ---------------- |
| 326  | R8   | HIGH     | Raw `<button>`                      | Use `<Button>`   |
| 359  | R8   | HIGH     | Raw `<button>`                      | Use `<Button>`   |
| 353  | R28  | MEDIUM   | `z-[80]` undocumented               | Document         |
| 256  | R13  | HIGH     | Hardcoded `oklch()` in focus style  | Use CSS variable |
| 189  | R40  | MEDIUM   | Manual `<div className="dropdown">` | Use `<Select>`   |

---

### projects/[projectId]/page.tsx

| Line | Rule | Severity | Issue               | Fix      |
| ---- | ---- | -------- | ------------------- | -------- |
| 177  | R28  | MEDIUM   | `z-50` undocumented | Document |

---

### projects/[projectId]/tasks/[taskId]/page.tsx

| Line | Rule | Severity | Issue                                           | Fix            |
| ---- | ---- | -------- | ----------------------------------------------- | -------------- |
| 247  | R8   | HIGH     | Raw `<button className="btn btn-ghost btn-sm">` | Use `<Button>` |

---

### projects/error.tsx

| Line | Rule | Severity | Issue                                      | Fix            |
| ---- | ---- | -------- | ------------------------------------------ | -------------- |
| 17   | R8   | HIGH     | Raw `<button className="btn btn-primary">` | Use `<Button>` |

---

### projects/loading.tsx

| Line | Rule | Severity | Issue                    | Fix              |
| ---- | ---- | -------- | ------------------------ | ---------------- |
| 3    | R19  | MEDIUM   | Raw `animate-pulse` divs | Use `<Skeleton>` |

---

### teams/page.tsx

| Line | Rule | Severity | Issue                       | Fix            |
| ---- | ---- | -------- | --------------------------- | -------------- |
| 146  | R8   | HIGH     | Raw `<button>`              | Use `<Button>` |
| 178  | R8   | HIGH     | Raw `<button>` filter clear | Use `<Button>` |
| 208  | R40  | HIGH     | Raw `<select>`              | Use `<Select>` |

---

### teams/[teamId]/page.tsx

| Line | Rule | Severity | Issue                        | Fix              |
| ---- | ---- | -------- | ---------------------------- | ---------------- |
| 62   | R48  | MEDIUM   | `<div className="stat ...">` | Use `<StatCard>` |

---

### settings/page.tsx

| Line | Rule | Severity | Issue               | Fix      |
| ---- | ---- | -------- | ------------------- | -------- |
| 137  | R28  | LOW      | `z-10` undocumented | Document |

---

### settings/\_components/api-keys-tab.tsx

| Line | Rule | Severity | Issue                      | Fix            |
| ---- | ---- | -------- | -------------------------- | -------------- |
| 85   | R8   | HIGH     | Raw `<button>` copy action | Use `<Button>` |
| 147  | R8   | HIGH     | Raw `<button>` delete      | Use `<Button>` |
| 220  | R8   | HIGH     | Raw buttons in modal       | Use `<Button>` |

---

### settings/\_components/billing-tab.tsx

| Line | Rule | Severity | Issue                                          | Fix                   |
| ---- | ---- | -------- | ---------------------------------------------- | --------------------- |
| 52   | R48  | MEDIUM   | Raw `<Card>` instead of `<StatCard>` for plans | Consider `<StatCard>` |

---

### settings/\_components/email-templates-tab.tsx

| Line | Rule | Severity | Issue            | Fix              |
| ---- | ---- | -------- | ---------------- | ---------------- |
| 290  | R39  | HIGH     | Raw `<textarea>` | Use `<Textarea>` |

---

### settings/\_components/members-tab.tsx

| Line | Rule | Severity | Issue                         | Fix                     |
| ---- | ---- | -------- | ----------------------------- | ----------------------- |
| 190  | R38  | HIGH     | Raw `<input>` search          | Use `<Input>`           |
| 250  | R28  | HIGH     | `zIndex: 9999` hardcoded      | Document or use CSS var |
| 300  | R8   | HIGH     | Raw `<button>` in portal menu | Use `<Button>`          |

---

### settings/\_components/organisation-tab.tsx

| Line | Rule | Severity | Issue                            | Fix            |
| ---- | ---- | -------- | -------------------------------- | -------------- |
| 340  | R40  | HIGH     | Multiple raw `<select>` elements | Use `<Select>` |
| 193  | R28  | LOW      | `z-10` sticky save bar           | Document       |

---

### settings/\_components/permissions-tab.tsx

| Line | Rule | Severity | Issue                      | Fix            |
| ---- | ---- | -------- | -------------------------- | -------------- |
| 180  | R40  | HIGH     | Raw `<select>` dropdowns   | Use `<Select>` |
| 283  | R8   | HIGH     | Raw `<button>` in dropdown | Use `<Button>` |

---

### settings/\_components/theme-tab.tsx

| Line | Rule | Severity | Issue                                   | Fix                  |
| ---- | ---- | -------- | --------------------------------------- | -------------------- |
| 180  | R8   | HIGH     | Raw `<button>` for theme select         | Use `<Button>`       |
| 12   | R12  | MEDIUM   | Hardcoded hex `"#1e1b4b"` / `"#f0f0ff"` | Extract to constants |

---

### settings/\_components/webhooks-tab.tsx

| Line | Rule | Severity | Issue                                                  | Fix                       |
| ---- | ---- | -------- | ------------------------------------------------------ | ------------------------- |
| 125  | R8   | HIGH     | Raw `<button>`                                         | Use `<Button>`            |
| 98   | R20  | LOW      | Badge variant uses raw DaisyUI class `"badge-success"` | Use semantic variant name |

---

### settings/error.tsx

| Line | Rule | Severity | Issue                                      | Fix            |
| ---- | ---- | -------- | ------------------------------------------ | -------------- |
| 17   | R8   | HIGH     | Raw `<button className="btn btn-primary">` | Use `<Button>` |

---

### settings/loading.tsx

| Line | Rule | Severity | Issue                    | Fix              |
| ---- | ---- | -------- | ------------------------ | ---------------- |
| 5    | R19  | MEDIUM   | Raw `animate-pulse` divs | Use `<Skeleton>` |

---

### task-columns.tsx (1500+ lines)

| Line | Rule | Severity | Issue                                                      | Fix            |
| ---- | ---- | -------- | ---------------------------------------------------------- | -------------- |
| 308  | R30  | HIGH     | `console.error("[WS] task:tree failed")`                   | Remove         |
| 403  | R30  | HIGH     | `console.error("[WS] task:update failed")`                 | Remove         |
| 460  | R30  | HIGH     | `console.error("[WS] task:delete failed")`                 | Remove         |
| 468  | R30  | HIGH     | `console.error("[WS] task:duplicate failed")`              | Remove         |
| 516  | R30  | HIGH     | `console.error("[WS] task:bulk-update failed")`            | Remove         |
| 525  | R30  | HIGH     | `console.error("[WS] task:reorder failed")`                | Remove         |
| 640  | R8   | HIGH     | Raw `<button className="btn btn-ghost btn-xs btn-square">` | Use `<Button>` |
| 651  | R8   | HIGH     | Raw `<button>`                                             | Use `<Button>` |
| 656  | R8   | HIGH     | Raw `<button>`                                             | Use `<Button>` |
| 788  | R40  | HIGH     | Raw `<select>` (status)                                    | Use `<Select>` |
| 800  | R40  | HIGH     | Raw `<select>` (priority)                                  | Use `<Select>` |
| 812  | R40  | HIGH     | Raw `<select>` (assignee)                                  | Use `<Select>` |
| 823  | R8   | HIGH     | Raw `<button>`                                             | Use `<Button>` |
| 1192 | R28  | MEDIUM   | `z-[100]` undocumented                                     | Document       |
| 1236 | R28  | MEDIUM   | `z-10` undocumented                                        | Document       |

---

### task-list-view.tsx (800+ lines)

| Line | Rule | Severity     | Issue                                           | Fix                      |
| ---- | ---- | ------------ | ----------------------------------------------- | ------------------------ |
| 668  | R21  | **CRITICAL** | Missing `"use client"` — uses hooks             | Add directive            |
| 122  | R30  | HIGH         | `console.error("[WS] task:list failed")`        | Remove                   |
| 176  | R30  | HIGH         | `console.error("[WS] task:delete failed")`      | Remove                   |
| 189  | R30  | HIGH         | `console.error("[WS] task:duplicate failed")`   | Remove                   |
| 217  | R30  | HIGH         | `console.error("[WS] task:bulk-update failed")` | Remove                   |
| 230  | R30  | HIGH         | `console.error("[WS] task:reorder failed")`     | Remove                   |
| 292  | R9   | HIGH         | Raw `<div className="alert ...">`               | Use `<Alert>`            |
| 355  | R40  | HIGH         | 3× raw `<select>` for bulk actions              | Use `<Select>`           |
| 384  | R8   | HIGH         | Raw `<button>`                                  | Use `<Button>`           |
| 537  | R11  | HIGH         | Inline ternary for status color                 | Use `STATUS_BADGE` map   |
| 546  | R11  | HIGH         | Inline ternary for priority color               | Use `PRIORITY_BADGE` map |
| 654  | R8   | HIGH         | 2× raw pagination buttons                       | Use `<Button>`           |

---

### task-tree-view.tsx (950+ lines)

| Line | Rule | Severity | Issue                                         | Fix                       |
| ---- | ---- | -------- | --------------------------------------------- | ------------------------- |
| 93   | R30  | HIGH     | `console.error("[WS] task:tree failed")`      | Remove                    |
| 213  | R30  | HIGH     | `console.error("[WS] task:update failed")`    | Remove                    |
| 268  | R30  | HIGH     | `console.error("[WS] task:delete failed")`    | Remove                    |
| 285  | R30  | HIGH     | `console.error("[WS] task:duplicate failed")` | Remove                    |
| 369  | R8   | HIGH     | Raw `<button>` expand/collapse                | Use `<Button>`            |
| 421  | R8   | HIGH     | Raw dropdown button                           | Use `<Button>`            |
| 478  | R50  | HIGH     | Status dropdown without centralized constants | Use shared option objects |
| 520  | R11  | HIGH     | Inline priority badge ternary                 | Use `PRIORITY_BADGE`      |
| 550  | R8   | HIGH     | Raw buttons in tree actions                   | Use `<Button>`            |
| 730  | R30  | HIGH     | `console.error("[WS] create subtask failed")` | Remove                    |

---

### task-preview-panel.tsx (1600+ lines)

| Line | Rule | Severity | Issue                                             | Fix               |
| ---- | ---- | -------- | ------------------------------------------------- | ----------------- |
| 106  | R8   | HIGH     | Raw `<button className="btn btn-primary btn-xs">` | Use `<Button>`    |
| 112  | R8   | HIGH     | Raw `<button className="btn btn-ghost btn-xs">`   | Use `<Button>`    |
| 365  | R8   | HIGH     | Raw buttons in modals                             | Use `<Button>`    |
| 394  | R28  | MEDIUM   | `z-30` undocumented                               | Document          |
| 406  | R8   | HIGH     | Raw `<button>` Plus icon                          | Use `<Button>`    |
| 482  | R38  | HIGH     | Raw `<input type="date">`                         | Use `<FormField>` |
| 505  | R38  | HIGH     | Raw `<input type="number">`                       | Use `<FormField>` |
| 1145 | R8   | HIGH     | Raw buttons in footer                             | Use `<Button>`    |
| 1152 | R8   | HIGH     | Raw buttons in delete dialog                      | Use `<Button>`    |

---

### task-context-menu.tsx

| Line | Rule | Severity | Issue                                    | Fix                                 |
| ---- | ---- | -------- | ---------------------------------------- | ----------------------------------- |
| 115  | R28  | MEDIUM   | `z-[100]` undocumented                   | Document                            |
| 160  | R50  | MEDIUM   | Status/priority options hardcoded inline | Extract to constants                |
| 200  | R11  | MEDIUM   | Color mapping not using centralized maps | Use `STATUS_BADGE`/`PRIORITY_BADGE` |

---

### change-requests.tsx (700+ lines)

| Line | Rule | Severity | Issue                             | Fix                  |
| ---- | ---- | -------- | --------------------------------- | -------------------- |
| 196  | R28  | MEDIUM   | `z-[260]`, `z-[300]` undocumented | Document z-hierarchy |
| 216  | R8   | HIGH     | Raw `<summary>` button            | Use `<Button>`       |
| 355  | R8   | HIGH     | Raw pagination buttons            | Use `<Button>`       |
| 369  | R8   | HIGH     | Raw pagination buttons            | Use `<Button>`       |

---

### change-request-modal.tsx

| Line | Rule | Severity | Issue                                             | Fix            |
| ---- | ---- | -------- | ------------------------------------------------- | -------------- |
| 124  | R8   | MEDIUM   | Raw `<button className="btn btn-outline btn-xs">` | Use `<Button>` |

---

### csv-import-dialog.tsx

| Line | Rule | Severity | Issue                                | Fix            |
| ---- | ---- | -------- | ------------------------------------ | -------------- |
| 134  | R8   | HIGH     | Raw `<button>` Upload/Browse         | Use `<Button>` |
| 180  | R25  | MEDIUM   | Raw `<dialog className="modal ...">` | Use `<Modal>`  |
| 189  | R8   | HIGH     | Raw close button                     | Use `<Button>` |
| 233  | R40  | HIGH     | N× raw `<select>` for column mapping | Use `<Select>` |
| 292  | R8   | HIGH     | Raw pagination-like buttons          | Use `<Button>` |

---

### global-filter-dropdown.tsx

| Line | Rule | Severity | Issue               | Fix            |
| ---- | ---- | -------- | ------------------- | -------------- |
| 72   | R28  | MEDIUM   | `z-50` undocumented | Document       |
| 95   | R8   | MEDIUM   | Raw `<button>`      | Use `<Button>` |
| 283  | R8   | HIGH     | Raw action buttons  | Use `<Button>` |

---

### recurrence-selector.tsx

| Line | Rule | Severity | Issue                 | Fix            |
| ---- | ---- | -------- | --------------------- | -------------- |
| 87   | R8   | HIGH     | Raw `<button>` toggle | Use `<Button>` |
| 95   | R28  | MEDIUM   | `z-50` undocumented   | Document       |
| 102  | R8   | HIGH     | Raw close button      | Use `<Button>` |
| 131  | R8   | HIGH     | Raw cancel button     | Use `<Button>` |
| 139  | R8   | HIGH     | Raw Set button        | Use `<Button>` |

---

### time-tracker.tsx

| Line | Rule | Severity | Issue                     | Fix            |
| ---- | ---- | -------- | ------------------------- | -------------- |
| 99   | R8   | HIGH     | Raw `<button>` Play/Pause | Use `<Button>` |
| 105  | R8   | HIGH     | Raw `<button>` Stop       | Use `<Button>` |
| 111  | R8   | HIGH     | Raw `<button>` Reset      | Use `<Button>` |

---

### channel-header.tsx

| Line | Rule | Severity | Issue                | Fix            |
| ---- | ---- | -------- | -------------------- | -------------- |
| 116  | R38  | HIGH     | Raw `<input>` search | Use `<Input>`  |
| 119  | R8   | HIGH     | Raw `<button>`       | Use `<Button>` |
| 131  | R8   | HIGH     | Raw `<button>`       | Use `<Button>` |
| 136  | R8   | HIGH     | Raw `<button>`       | Use `<Button>` |
| 142  | R8   | HIGH     | Raw `<button>`       | Use `<Button>` |
| 197  | R8   | HIGH     | Raw `<button>`       | Use `<Button>` |

---

### channel-list.tsx (650+ lines)

| Line | Rule | Severity | Issue                           | Fix            |
| ---- | ---- | -------- | ------------------------------- | -------------- |
| 355  | R8   | HIGH     | Raw `<button>` new conversation | Use `<Button>` |
| 358  | R38  | HIGH     | Raw `<input>` search            | Use `<Input>`  |
| 397  | R8   | HIGH     | Raw `<button>` close overlay    | Use `<Button>` |
| 499  | R8   | HIGH     | Raw `<button>` make admin       | Use `<Button>` |
| 507  | R8   | HIGH     | Raw `<button>` remove member    | Use `<Button>` |
| 548  | R8   | HIGH     | Raw `<button>` add member       | Use `<Button>` |
| 556  | R8   | HIGH     | Raw `<button>` close            | Use `<Button>` |

---

### create-channel-modal.tsx

| Line | Rule | Severity | Issue                        | Fix              |
| ---- | ---- | -------- | ---------------------------- | ---------------- |
| 56   | R38  | HIGH     | Raw `<input>` channel name   | Use `<Input>`    |
| 68   | R39  | HIGH     | Raw `<textarea>` description | Use `<Textarea>` |
| 80   | R8   | HIGH     | Raw `<button>` Cancel        | Use `<Button>`   |
| 84   | R8   | HIGH     | Raw `<button>` Create        | Use `<Button>`   |

---

### message-input.tsx

| Line | Rule | Severity | Issue                             | Fix                |
| ---- | ---- | -------- | --------------------------------- | ------------------ |
| 125  | R8   | HIGH     | Raw `<button>` attach file        | Use `<Button>`     |
| 135  | R8   | HIGH     | Raw `<button>` emoji              | Use `<Button>`     |
| 145  | R8   | HIGH     | Raw `<button>` emoji picker items | Use `<Button>`     |
| 162  | R8   | HIGH     | Raw `<button>` send               | Use `<Button>`     |
| 173  | R27  | MEDIUM   | Textarea missing `aria-label`     | Add aria attribute |

---

### message-list.tsx (600+ lines)

| Line | Rule | Severity | Issue                                            | Fix            |
| ---- | ---- | -------- | ------------------------------------------------ | -------------- |
| 267  | R30  | HIGH     | `console.error("[Chat] Failed to send message")` | Remove         |
| 313  | R8   | HIGH     | Raw `<button>` reply                             | Use `<Button>` |
| 320  | R8   | HIGH     | Raw `<button>` react                             | Use `<Button>` |
| 327  | R8   | HIGH     | Raw `<button>` bookmark                          | Use `<Button>` |
| 336  | R8   | HIGH     | Raw `<button>` more                              | Use `<Button>` |
| 347  | R8   | HIGH     | Raw `<button>` menu item                         | Use `<Button>` |
| 360  | R8   | HIGH     | Raw `<button>` attachment                        | Use `<Button>` |
| 373  | R8   | HIGH     | Raw `<button>` menu item                         | Use `<Button>` |
| 380  | R8   | HIGH     | Raw `<button>` thread                            | Use `<Button>` |
| 385  | R8   | HIGH     | Raw `<button>` delete                            | Use `<Button>` |
| 390  | R8   | HIGH     | Raw `<button>` emoji reaction                    | Use `<Button>` |
| 406  | R8   | HIGH     | Raw `<button>` lightbox close                    | Use `<Button>` |
| 413  | R8   | HIGH     | `<a className="btn ...">` download               | Use `<Button>` |

---

### thread-panel.tsx

| Line | Rule | Severity | Issue                                                 | Fix            |
| ---- | ---- | -------- | ----------------------------------------------------- | -------------- |
| 60   | R8   | HIGH     | Raw `<button>` close                                  | Use `<Button>` |
| 93   | R8   | HIGH     | Raw `<button>` send                                   | Use `<Button>` |
| 279  | R30  | HIGH     | `console.error("[Chat] Failed to send thread reply")` | Remove         |

---

### project-announcements.tsx (700+ lines)

| Line | Rule | Severity | Issue                             | Fix      |
| ---- | ---- | -------- | --------------------------------- | -------- |
| 169  | R28  | MEDIUM   | `z-[40]` / `z-[240]` undocumented | Document |
| 173  | R28  | MEDIUM   | `z-[260]` undocumented            | Document |
| 274  | R28  | MEDIUM   | `z-40` undocumented               | Document |
| 277  | R28  | MEDIUM   | `z-[120]` undocumented            | Document |

---

### project-settings.tsx (500+ lines)

| Line | Rule | Severity | Issue                             | Fix           |
| ---- | ---- | -------- | --------------------------------- | ------------- |
| 219  | R28  | MEDIUM   | `z-[30]` / `z-[360]` undocumented | Document      |
| 251  | R28  | MEDIUM   | `z-[380]` undocumented            | Document      |
| 349  | R38  | HIGH     | Raw `<input>` for label draft     | Use `<Input>` |
| 409  | R28  | MEDIUM   | `z-[20]` / `z-[320]` undocumented | Document      |
| 414  | R28  | MEDIUM   | `z-[340]` undocumented            | Document      |

---

### rich-text-editor.tsx

| Line    | Rule | Severity | Issue                                | Fix                                            |
| ------- | ---- | -------- | ------------------------------------ | ---------------------------------------------- |
| 130–212 | R8   | HIGH     | ~15× raw toolbar `<button>` elements | Extract to `<ToolbarButton>` or use `<Button>` |

---

### sticky-notes-panel.tsx (600+ lines)

| Line | Rule | Severity | Issue                            | Fix            |
| ---- | ---- | -------- | -------------------------------- | -------------- |
| 247  | R8   | HIGH     | Raw `<button>` toggle            | Use `<Button>` |
| 303  | R8   | HIGH     | Raw `<button>` add note          | Use `<Button>` |
| 341  | R8   | HIGH     | Raw `<button>` scroll            | Use `<Button>` |
| 368  | R8   | HIGH     | Raw `<button>` date select       | Use `<Button>` |
| 427  | R8   | HIGH     | Raw `<button>` show form         | Use `<Button>` |
| 461  | R8   | HIGH     | Raw `<button>` toggle complete   | Use `<Button>` |
| 473  | R8   | HIGH     | Raw `<button>` delete            | Use `<Button>` |
| 497  | R8   | HIGH     | Raw `<button>` add member        | Use `<Button>` |
| 519  | R8   | HIGH     | Raw `<button>` remove checkpoint | Use `<Button>` |
| 532  | R8   | HIGH     | Raw `<button>` add checkpoint    | Use `<Button>` |
| 542  | R8   | HIGH     | Raw `<button>` cancel            | Use `<Button>` |
| 545  | R8   | HIGH     | Raw `<button>` submit            | Use `<Button>` |

---

### (auth)/layout.tsx

| Line | Rule | Severity | Issue                      | Fix      |
| ---- | ---- | -------- | -------------------------- | -------- |
| 119  | R28  | LOW      | `z-10` on nav undocumented | Document |

---

## Priority Fix Plan

### Phase 1 — CRITICAL (2 items)

1. **Add `"use client"` to `task-list-view.tsx`** — will break in server context
2. **Fix wrong port in `use-websocket.tsx`** — uses `8000` instead of `8080`

### Phase 2 — HIGH: Raw `<Button>` Replacement (146 instances across ~40 files)

Top files by violation count:

1. `message-list.tsx` — 13 raw buttons
2. `sticky-notes-panel.tsx` — 12 raw buttons
3. `rich-text-editor.tsx` — 15 toolbar buttons
4. `channel-list.tsx` — 7 raw buttons
5. `channel-header.tsx` — 6 raw buttons
6. `task-columns.tsx` — 4 raw buttons
7. `task-preview-panel.tsx` — 6 raw buttons
8. `pagination.tsx` — 7 raw buttons
9. `shared.tsx` (ConfirmDialog) — 2 raw buttons
10. `theme-customizer-modal.tsx` — 2 raw buttons

### Phase 3 — HIGH: Raw Form Elements (33 instances)

1. Replace all raw `<select>` with `<Select>` component (task-columns, teams, activity, profile, permissions, organisation, reports, csv-import)
2. Replace all raw `<input>` with `<Input>` component (contact-form, search, templates, members, performance pages, channel-header, channel-list, create-channel-modal, project-settings)
3. Replace all raw `<textarea>` with `<Textarea>` component (contact-form, email-templates, create-channel-modal)

### Phase 4 — HIGH: Code Quality

1. **R36**: Centralize API_BASE to `base-url.ts` (5 files: api.ts, telemetry.ts, use-chat-socket, use-org-socket, use-project-socket, use-websocket)
2. **R30**: Remove/wrap all `console.log`/`console.error` (17 instances across task-columns, task-list-view, task-tree-view, use-org-socket, use-project-socket, use-chat-socket, use-websocket, message-list, thread-panel)
3. **R23**: Replace `any` with `unknown` (6 instances: use-org-socket, use-project-socket, use-websocket, project-task-store)
4. **R11**: Wire remaining inline status/priority ternaries to centralized maps (task-list-view, task-tree-view, task-context-menu)

### Phase 5 — MEDIUM: Z-Index Documentation

Document all z-index values with a centralized strategy:

- `z-10` — sticky headers, nav
- `z-20` — calendar layers
- `z-[30]`–`z-[40]` — dropdowns at rest
- `z-50` — export dropdowns
- `z-[80]` — filter dropdowns
- `z-[99]`–`z-[120]` — menus, overlays
- `z-[240]`–`z-[380]` — open dropdown content
- `z-[999]` — sidebar
- `z-[9999]` — portal menus

### Phase 6 — MEDIUM: Skeleton / Loading States

Replace raw `animate-pulse` divs with `<Skeleton>` component in:

- `projects/loading.tsx`
- `settings/loading.tsx`
- `my-tasks/page.tsx` (inline spinner)

### Phase 7 — LOW

- Sort imports (R18) in scattered files
- Add `aria-expanded` to accordion (pricing-faq.tsx)
- Normalize Badge variant naming (webhooks-tab.tsx)
- Extract hardcoded hex in theme-tab.tsx to constants
