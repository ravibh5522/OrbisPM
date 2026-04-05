# OrbisPM — UI Consistency Audit Round 2

> **Date:** April 5, 2026  
> **Scope:** Full frontend `src/` — 4 parallel agents covering CSS/components, dashboard/projects, settings/tasks, auth/marketing/layout  
> **Baseline:** Round 1 fixes already applied (globals.css tokens, new shared libs, shared UI components, alert migrations, badge unification)

---

## Round 1 — Verified Fixed ✅

These issues from Round 1 are confirmed resolved:

| Fix                                                                                              | Status  |
| ------------------------------------------------------------------------------------------------ | ------- |
| `<Alert>` component created and wired to all 22+ files                                           | ✅ Done |
| `STATUS_BADGE` / `PRIORITY_BADGE` from `task-colors.ts` replacing inline ternaries (9 files)     | ✅ Done |
| `THEME_PREVIEWS` deduplicated → single import from `@/lib/theme-previews`                        | ✅ Done |
| `CHART_TOOLTIP_STYLE` / `CHART_AXIS_STYLE` from `chart-utils.ts` wired into all chart components | ✅ Done |
| `--progress-height` token — `height: 6px` replaced                                               | ✅ Done |
| `--radius-box` token — hardcoded `0.75rem` replaced in theme-selector rules                      | ✅ Done |
| `<StatCard>` / `<Tabs>` / `<Alert>` shared components created                                    | ✅ Done |
| `isLightHex` moved to `utils.ts`, re-exported from `color-picker-panel.tsx`                      | ✅ Done |
| `bg-base-50` in `performance/reports/page.tsx`                                                   | ✅ Done |
| Per-theme alias vars `--gl-*`, `--gd-*`, `--od-*`, `--ol-*` added to `globals.css`               | ✅ Done |

---

## Severity Summary

| Severity    | Count | Category                                                                          |
| ----------- | ----- | --------------------------------------------------------------------------------- |
| 🔴 Critical | 3     | Invalid CSS token, dead CSS, raw oklch in component rules                         |
| 🟠 High     | 9     | Ad-hoc tabs, raw oklch in UI components, inline badge logic, missing chart utils  |
| 🟡 Medium   | 12    | Marketing/layout raw buttons, custom dropdown inconsistency, dropdown duplication |
| 🔵 Low      | 7     | Code smell, naming, minor polish                                                  |

---

## Part 1 — CSS & globals.css

### 🔴 Critical C1 — Raw `oklch()` literals in non-theme component rules

**File:** `src/app/globals.css`  
**Lines:** ~628-631 (`.frosted-dialog-surface`), ~875-895 (`.user-menu-logout-action`)

Component-level rules (outside `[data-theme]` blocks) still use raw `oklch()` literals instead of the per-theme alias vars that were added in Round 1 (`--gd-*`, `--gl-*`, etc.).

```css
/* BAD — still exists */
.frosted-dialog-surface {
  border: 1px solid oklch(100% 0 0 / 0.12) !important;
  box-shadow:
    inset 0 1px 0 oklch(100% 0 0 / 0.16),
    ...;
}

/* GOOD — should be */
.frosted-dialog-surface {
  border: 1px solid var(--gd-border-light);
  box-shadow:
    inset 0 1px 0 var(--gd-border-inset),
    ...;
}
```

**Fix:** Replace raw oklch literals in component rules with the alias vars defined in the `[data-theme]` blocks.  
**Estimated scope:** ~25-40 literal replacements across `.frosted-*`, `.user-menu-*`, `.org-switcher-*` rules.

---

### 🔴 Critical C2 — Dead/duplicate CSS rules (~80 lines)

**File:** `src/app/globals.css`  
**Lines:** ~744-759 duplicated at ~999-1015; `.user-menu-dropdown` similarly duplicated

`.org-switcher-dropdown` and `.user-menu-dropdown` are fully defined twice. The second definition overrides the first — the first is dead code.

**Fix:** Delete the earlier (dead) definitions. Keep only the later consolidated blocks.

---

### 🟠 High H1 — 25-30 hardcoded `blur()` values not using CSS vars

**File:** `src/app/globals.css`  
**Lines:** ~293, 513, 664, 682, 717, 1189 and many more

`blur(38px)`, `blur(24px)`, `blur(48px)`, etc. are sprinkled throughout component rules. The `@theme` blur scale tokens were added in Round 1 (`--blur-sm`, `--blur-surface`, `--blur-sidebar`, `--blur-elevated`, `--blur-heavy`) but no component rules were updated to reference them.

```css
/* BAD — ~25 instances */
backdrop-filter: blur(38px);

/* GOOD */
backdrop-filter: blur(var(--blur-elevated));
```

**Fix:** Global search-replace across component rules only (not theme blocks). Map:

- `blur(8px)` → `var(--blur-sm)`
- `blur(24px)` → `var(--blur-surface)`
- `blur(36px)` or `blur(38px)` → `var(--blur-sidebar)`
- `blur(48px)` or `blur(46px)` → `var(--blur-elevated)`
- `blur(72px)` or `blur(78px)` → `var(--blur-heavy)`

---

## Part 2 — Shared UI Components

### 🟠 High H2 — `color-picker-panel.tsx`: hardcoded oklch/hex in inline styles

**File:** `src/components/ui/color-picker-panel.tsx`  
**Lines:** ~39-42, ~75-77, ~164

```tsx
// Line 39-42 — WRONG
backgroundColor: colorScheme === "dark"
  ? "oklch(16% 0.02 270)"
  : "oklch(96% 0.01 265)";

// Line 75-77 — WRONG
color: colorScheme === "dark" ? "#f0f0ff" : "#1e1b4b";

// Line 164 — WRONG
color: isLightHex(hex) ? "#000" : "#fff";
```

**Fix:** Use CSS custom properties or DaisyUI semantic colors:

```tsx
backgroundColor: "var(--color-base-200)";
color: "var(--color-base-content)";
color: isLightHex(hex) ? "var(--color-base-content)" : "var(--color-base-100)";
```

---

### 🟡 Medium M1 — `theme-customizer-modal.tsx`: hardcoded oklch in inline style

**File:** `src/components/ui/theme-customizer-modal.tsx`  
**Lines:** ~115-120

```tsx
// WRONG
style={{
  background: colorScheme === "dark" ? "oklch(14% 0.02 270)" : "oklch(96% 0.015 265)",
}}
```

**Fix:** Replace with `background: "var(--color-base-100)"` — DaisyUI already keys `base-100` to the appropriate value per theme.

---

### 🔵 Low L1 — `shared.tsx` Card component: oklch in arbitrary Tailwind shadow

**File:** `src/components/ui/shared.tsx`  
**Lines:** ~78-79

```tsx
"shadow-[inset_0_1px_0_oklch(100%_0_0_/_0.12),0_12px_32px_oklch(0%_0_0_/_0.14)]";
```

**Note:** Arbitrary Tailwind shadow values cannot reference CSS vars. Extract to a named utility class in `globals.css`:

```css
.card-shadow {
  box-shadow:
    inset 0 1px 0 oklch(100% 0 0 / 0.12),
    0 12px 32px oklch(0% 0 0 / 0.14);
}
```

---

## Part 3 — Dashboard & Project Pages

### 🔴 Critical C3 — `bg-base-50` invalid DaisyUI v5 token

**File:** `src/app/[orgSlug]/projects/page.tsx`  
**Line:** ~141

`bg-base-50` does not exist in DaisyUI v5. Valid tokens are `base-100`, `base-200`, `base-300`, `base-content`.

**Fix:** `bg-base-50` → `bg-base-100/50` or `bg-base-100`

---

### 🟠 High H3 — Ad-hoc tabs in projects list page

**File:** `src/app/[orgSlug]/projects/page.tsx`  
**Lines:** ~356-376

Manual `role="tablist"` + inline `tabs-boxed` + `tab-active` ternary instead of `<Tabs>` component.

**Fix:**

```tsx
import { Tabs } from "@/components/ui/tabs";

<Tabs
  tabs={[
    { id: "all", label: "All Projects" },
    { id: "active", label: "Active" },
    { id: "archived", label: "Archived" },
  ]}
  activeTab={activeFilter}
  onChange={setActiveFilter}
  variant="boxed"
  size="sm"
/>;
```

---

### 🟠 High H4 — Ad-hoc tabs in project detail page (2 instances)

**File:** `src/app/[orgSlug]/projects/[projectId]/page.tsx`  
**Lines:** ~140-167 (main nav tabs), ~211-245 (task view toggle tabs)

Both are manual `role="tablist"` with ternary class logic. Should use `<Tabs>`.

---

### 🟠 High H5 — Status badge inline ternary in projects/page.tsx

**File:** `src/app/[orgSlug]/projects/page.tsx`  
**Line:** ~458

```tsx
// WRONG
<Badge variant={project.status === "active" ? "badge-success" : project.status === "planning" ? "badge-info" : "badge-ghost"}>

// CORRECT
<Badge variant={STATUS_BADGE[project.status as TaskStatus] ?? "badge-ghost"}>
```

---

### 🟠 High H6 — Status badge inline ternary in reports/page.tsx

**File:** `src/app/[orgSlug]/performance/reports/page.tsx`  
**Line:** ~16

Same inline ternary badge pattern. Replace with `STATUS_BADGE` from `@/lib/task-colors`.

---

### 🟠 High H7 — Locally-defined chart styles in `project-dashboard.tsx`

**File:** `src/components/projects/project-dashboard.tsx`  
**Lines:** ~115-131

Recharts tooltip and axis styles defined locally as constants instead of imported from `@/lib/chart-utils`.

**Fix:**

```tsx
// Remove local definitions and replace with:
import {
  CHART_TOOLTIP_STYLE,
  CHART_AXIS_STYLE,
  CHART_CURSOR_STYLE,
} from "@/lib/chart-utils";
```

---

## Part 4 — Settings Pages

### 🟠 High H8 — `permissions-tab.tsx`: custom button group instead of `<Tabs>`

**File:** `src/app/[orgSlug]/settings/_components/permissions-tab.tsx`  
**Lines:** ~188-210

```tsx
// WRONG — custom button group
<div className="flex gap-1 bg-base-200 rounded-lg p-0.5">
  {SCOPE_TABS.map((tab) => (
    <button className={cn("px-3 py-1.5 text-sm rounded-md", scope === tab.value && "bg-base-100 shadow-sm")}>

// CORRECT
<Tabs
  tabs={SCOPE_TABS.map(t => ({ id: t.value, label: t.label }))}
  activeTab={scope}
  onChange={setScope}
  variant="boxed"
  size="sm"
/>
```

---

### 🟡 Medium M2 — Inconsistent custom filter dropdown styling (3 files)

**Files:**

- `src/app/[orgSlug]/activity/page.tsx` lines ~186-210
- `src/app/[orgSlug]/templates/page.tsx` lines ~237-261
- `src/app/[orgSlug]/teams/page.tsx` lines ~169-194

Pattern in all 3:

```tsx
className =
  "border border-base-200/55 bg-base-100/45 px-3 text-sm backdrop-blur-md";
```

The `/55` and `/45` opacity steps are non-standard and produce inconsistent results across themes. DaisyUI-native patterns should be used (`select select-bordered` or `btn btn-ghost` dropdown trigger).

**Fix:** Replace filter dropdowns with `<select className="select select-sm select-bordered">` which auto-themes correctly.

---

## Part 5 — Task Components

### 🟠 High H9 — Ad-hoc tabs in `task-preview-panel.tsx`

**File:** `src/components/tasks/task-preview-panel.tsx`  
**Lines:** ~290-312

Horizontal scrolling tab strip built with raw `<button>` + `border-b-2` + `ref` scroll tracking. This entire pattern should use `<Tabs variant="bordered">` which handles the underline style natively.

---

### 🟡 Medium M3 — Fragile custom CSS class names in `change-requests.tsx`

**File:** `src/components/tasks/change-requests.tsx`  
**Lines:** ~310-330

Uses `project-tab-btn`, `project-tab-active`, `project-tab-inactive` class names from `globals.css`. These are project-scoped class names managed outside the component. Replace with `<Tabs>` component.

---

### 🟡 Medium M4 — `ThemedDropdownSelect` defined locally in `task-preview-panel.tsx`

**File:** `src/components/tasks/task-preview-panel.tsx`  
**Lines:** ~75-119

A fully-featured themed `<details>`/`<summary>` dropdown defined inline. Near-identical pattern exists in `task-tree-view.tsx` (~line 230). Both should be extracted to a shared component.

**Fix:** Export `ThemedDropdownSelect` to `src/components/ui/dropdown-select.tsx` and import it.

---

### 🟡 Medium M5 — Hardcoded oklch colors in `health-ring.tsx`

**File:** `src/components/charts/health-ring.tsx`  
**Lines:** ~12-19

```tsx
// WRONG — hardcoded oklch
function getScoreColor(score: number) {
  if (score >= 80) return "oklch(64% 0.18 180)";
  if (score >= 60) return "oklch(56% 0.16 270)";
  ...
}
```

**Fix:** Use `STATUS_HEX` values from `task-colors.ts` or define a `SCORE_COLOR` map. These SVG fill colors need hex/oklch but should come from a shared constant:

```tsx
const SCORE_COLORS = {
  excellent: STATUS_HEX.done, // green
  good: STATUS_HEX.in_progress, // blue
  atRisk: STATUS_HEX.blocked, // orange/red (warning zone)
  critical: "#ef4444", // error red
};
```

---

### 🔵 Low L2 — `donut-chart.tsx`: hardcoded hex fallback `#94a3b8`

**File:** `src/components/charts/donut-chart.tsx`  
**Line:** ~27

```tsx
colors[entry.name] || "#94a3b8";
```

**Fix:** `colors[entry.name] || CHART_PALETTE[0]` — use the shared palette from `chart-utils.ts`.

---

### 🔵 Low L3 — Inline type import in `search/page.tsx`

**File:** `src/app/[orgSlug]/search/page.tsx`  
**Line:** ~96

```tsx
// AWKWARD
STATUS_BADGE[project.status as import("@/lib/task-colors").TaskStatus];

// CORRECT — add to top-level imports
import type { TaskStatus } from "@/lib/task-colors";
// then use:
STATUS_BADGE[project.status as TaskStatus];
```

---

## Part 6 — Marketing & Auth Pages

### 🟡 Medium M6 — `contact-form.tsx`: raw HTML inputs and buttons (8 instances)

**File:** `src/app/(marketing)/contact/contact-form.tsx`  
**Lines:** ~56, ~76-81, ~87-93, ~99-105, ~122-128, ~134

Auth pages (login, signup, onboarding) correctly use `<Input>`, `<Button>`, `<Alert>`. The contact form uses raw `<input className="input input-bordered">` and `<button className="btn btn-primary">` throughout.

**Fix:**

```tsx
// Replace raw inputs with FormField + Input from @/components/ui/form-fields
// Replace raw buttons with <Button> from @/components/ui/button
```

---

### 🟡 Medium M7 — `landing/page.tsx`: raw DaisyUI button classes (9 instances)

**File:** `src/app/(marketing)/landing/page.tsx`  
**Lines:** ~339, ~342, ~378, ~383, ~436, ~441, ~1471, ~1508, ~1512

All CTA and nav buttons use `className="btn btn-primary btn-lg"` directly on `<button>` / `<Link>` / `<a>` tags. While functional, this bypasses the shared `<Button>` component's variant system.

**Note:** Marketing pages are less critical than app pages but still create maintenance burden.

**Fix:**

```tsx
// For <Link> buttons, use Button with asChild pattern:
<Button asChild size="lg">
  <Link href="/signup">Get Started Free</Link>
</Button>
```

---

### 🟡 Medium M8 — `layout.tsx` (org shell): raw buttons in sidebar/topbar (~6-8 instances)

**File:** `src/app/[orgSlug]/layout.tsx`  
**Lines:** ~418, ~437, ~443, ~460-470

Sidebar toggle, theme switcher trigger, and user menu trigger buttons use raw `<button className="btn btn-ghost btn-sm">`. Should use `<Button variant="ghost" size="sm">`.

---

### 🟡 Medium M9 — `pricing/page.tsx`: dynamic DaisyUI class construction

**File:** `src/app/(marketing)/pricing/page.tsx`  
**Lines:** ~320+

```tsx
// WRONG — constructs class string dynamically
className={`btn ${plan.popular ? "btn-primary" : "btn-outline"}`}

// CORRECT
<Button variant={plan.popular ? "primary" : "outline"}>
```

---

### 🔵 Low L4 — `profile/page.tsx`: 1 raw button instance

**File:** `src/app/[orgSlug]/profile/page.tsx`  
**Line:** ~392

Single raw `<button className="btn btn-sm btn-outline gap-2">` for theme "Customise" button. Replace with `<Button size="sm" variant="outline">`.

---

## Part 7 — Lib Files

### 🔵 Low L5 — `utils.ts`: `statusColor()` and `priorityColor()` are now dead exports

**File:** `src/lib/utils.ts`  
**Lines:** ~39-66

These two functions are no longer called anywhere (all usages replaced with `STATUS_BADGE`/`PRIORITY_BADGE` maps). They should be removed to avoid confusion and prevent future accidental use.

**Fix:** Delete the `statusColor()` and `priorityColor()` function definitions from `utils.ts`.

---

## Priority Fix Order

### Immediate (Critical — breaks tokens or dead code)

| #   | File                          | Fix                                                                           |
| --- | ----------------------------- | ----------------------------------------------------------------------------- |
| C1  | `globals.css` component rules | Replace remaining raw `oklch()` with `var(--gd-*)` / `var(--gl-*)` alias vars |
| C2  | `globals.css`                 | Delete ~80 lines of duplicate/dead CSS rules                                  |
| C3  | `projects/page.tsx` line ~141 | `bg-base-50` → `bg-base-100/50`                                               |

### High (Breaks consistency system)

| #   | File                            | Fix                                                         |
| --- | ------------------------------- | ----------------------------------------------------------- |
| H1  | `globals.css`                   | Replace ~25-30 hardcoded `blur()` with `var(--blur-*)` vars |
| H2  | `color-picker-panel.tsx`        | Replace hardcoded oklch/hex in inline styles                |
| H3  | `projects/page.tsx`             | Ad-hoc tabs → `<Tabs>`                                      |
| H4  | `projects/[projectId]/page.tsx` | 2× ad-hoc tabs → `<Tabs>`                                   |
| H5  | `projects/page.tsx`             | Badge ternary → `STATUS_BADGE`                              |
| H6  | `performance/reports/page.tsx`  | Badge ternary → `STATUS_BADGE`                              |
| H7  | `project-dashboard.tsx`         | Local chart style defs → import from `chart-utils`          |
| H8  | `permissions-tab.tsx`           | Custom button group → `<Tabs>`                              |
| H9  | `task-preview-panel.tsx`        | Raw button tab strip → `<Tabs variant="bordered">`          |

### Medium (Inconsistency / DRY violations)

| #   | File                                            | Fix                                                              |
| --- | ----------------------------------------------- | ---------------------------------------------------------------- |
| M1  | `theme-customizer-modal.tsx`                    | Hardcoded oklch inline style → CSS var                           |
| M2  | `activity`, `templates`, `teams` pages          | `border-base-200/55` filter dropdowns → `select select-bordered` |
| M3  | `change-requests.tsx`                           | project-tab-\* classes → `<Tabs>`                                |
| M4  | `task-preview-panel.tsx` + `task-tree-view.tsx` | Extract `ThemedDropdownSelect` to shared component               |
| M5  | `health-ring.tsx`                               | Hardcoded oklch → `SCORE_COLORS` constant                        |
| M6  | `contact-form.tsx`                              | Raw inputs/buttons → `<Input>` / `<Button>`                      |
| M7  | `landing/page.tsx`                              | Raw btn classes → `<Button asChild>`                             |
| M8  | `layout.tsx`                                    | Raw sidebar buttons → `<Button>`                                 |
| M9  | `pricing/page.tsx`                              | Dynamic class strings → Button variant prop                      |

### Low (Polish)

| #   | File               | Fix                                             |
| --- | ------------------ | ----------------------------------------------- |
| L1  | `shared.tsx`       | Extract oklch shadow to named CSS class         |
| L2  | `donut-chart.tsx`  | `#94a3b8` fallback → `CHART_PALETTE[0]`         |
| L3  | `search/page.tsx`  | Inline type import → top-level import           |
| L4  | `profile/page.tsx` | 1 raw button → `<Button>`                       |
| L5  | `utils.ts`         | Delete dead `statusColor()` / `priorityColor()` |

---

## Files Fully Compliant ✅

| File                                                                                       | Notes                                           |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `login/page.tsx`, `signup/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx` | Full semantic component usage                   |
| `onboarding/page.tsx`                                                                      | Consistent with design system                   |
| `notifications/page.tsx`                                                                   | Uses `<Tabs>` correctly                         |
| `teams/[teamId]/page.tsx`                                                                  | Uses `<Tabs>`, `STATUS_BADGE`, `PRIORITY_BADGE` |
| `calendar/page.tsx`                                                                        | Consistent                                      |
| `messages/page.tsx`                                                                        | Consistent                                      |
| `settings/_components/` (most tabs)                                                        | Compliant — except permissions-tab (H8)         |
| `profile/page.tsx`                                                                         | 1 minor issue (L4), otherwise fully compliant   |
| `chart components` (except health-ring)                                                    | Correctly using `CHART_*` from chart-utils      |
| `task-card.tsx`, `task-list-item.tsx`, etc.                                                | Using STATUS_BADGE maps                         |
| `layout.tsx` theme/auth providers                                                          | Correct                                         |
| `src/lib/task-colors.ts`, `chart-utils.ts`, `theme-previews.ts`                            | Correct — single sources of truth               |
