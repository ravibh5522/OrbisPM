# OrbisPM — UI Consistency Audit

> Date: April 5, 2026 | Audited by: 5 parallel agents covering CSS, shared components, dashboard/projects, settings/teams/activity, and task/chart components.

---

## Executive Summary

The frontend has **4 themes, 2,239-line globals.css, ~70+ page files and components** — but almost no reuse of the design token system that already exists.  
Core problems in one sentence: **every page reinvents its own cards, tabs, status badges, font sizes, dropdowns, and color mappings instead of using the shared components and DaisyUI semantic tokens.**

### Severity counts

| Severity                                                         | Count |
| ---------------------------------------------------------------- | ----- |
| 🔴 Critical (broken UX / wrong token / semantic contradiction)   | 14    |
| 🟠 High (visual inconsistency / hardcoded bypasses theming)      | 23    |
| 🟡 Medium (duplication, DRY violation, missing shared component) | 19    |
| 🔵 Low (minor polish, naming, scale alignment)                   | 12    |

---

## Part 1 — CSS & Theme Layer (`globals.css`)

### File stats

- **2,239 lines** total
- **135 CSS custom property** (`--`) occurrences
- **379 `[data-theme]` selector** usages
- Tailwind **v4.1.6**, DaisyUI **v5.0.35**

### 4 Themes defined correctly

| Theme         | Selector                            |
| ------------- | ----------------------------------- |
| `orbis-light` | `:root, [data-theme="orbis-light"]` |
| `glass-light` | `[data-theme="glass-light"]`        |
| `glass-dark`  | `[data-theme="glass-dark"]`         |
| `orbis-dark`  | `[data-theme="orbis-dark"]`         |

Each theme defines **26 CSS custom properties** covering surface colors, semantic palette, status colors, shape, and size tokens. This token system is in place — the problem is that **none of the component/page CSS follows it**.

---

### 🔴 Critical: Token system defined but never consumed

Every component CSS rule below the theme blocks uses raw `oklch(...)` literals instead of referencing the tokens already defined:

```css
/* BAD — appears 50+ times */
background-color: oklch(99% 0.005 270 / 0.55) !important;
color: oklch(95% 0.005 270) !important;

/* CORRECT — uses existing token */
background-color: var(--color-base-100);
color: var(--color-base-content);
```

The single literal `oklch(95% 0.005 270)` (glass-dark base content) alone appears **~50 times**. Changing a theme color requires a mass find-and-replace.

**Fix:** Extract repeated `oklch()` literals into per-theme custom properties (e.g., `--glass-surface-alpha`, `--glass-content`, `--glass-primary`) and reference them. This is the single highest-leverage change in the entire codebase.

---

### 🔴 Critical: `--radius-*` tokens defined but never consumed

`--radius-selector`, `--radius-field`, `--radius-box` are set in each theme block but every component CSS rule uses hardcoded values:

| Hardcoded value                  | Should use               |
| -------------------------------- | ------------------------ |
| `0.5rem` / `0.75rem` / `0.85rem` | `var(--radius-box)`      |
| `0.65rem`                        | `var(--radius-field)`    |
| `0.375rem`                       | `var(--radius-selector)` |

---

### 🔴 Critical: Dead CSS (unreachable rules — should be deleted)

These definitions exist and are immediately overridden later in the same file:

| Dead rule                                              | Approximate location | Override location                 |
| ------------------------------------------------------ | -------------------- | --------------------------------- |
| `.org-switcher-dropdown` glass-dark (first definition) | ~line 937            | ~line 1100                        |
| `.user-menu-dropdown` glass-dark (first definition)    | ~line 660            | ~line 1090                        |
| `.user-menu-logout-action` (two theme-specific blocks) | ~lines 1000–1040     | ~line 1080 (combined override)    |
| Global modal-backdrop transparent rule                 | top                  | Per-theme rules below (redundant) |

**Estimated dead CSS to delete: ~50–80 lines.**

---

### 🟠 High: 15+ arbitrary blur values — no scale

`blur(8px)` / `blur(12px)` / `blur(16px)` / `blur(18px)` / `blur(24px)` / `blur(28px)` / `blur(32px)` / `blur(34px)` / `blur(36px)` / `blur(38px)` / `blur(40px)` / `blur(46px)` / `blur(48px)` / `blur(56px)` / `blur(72px)` / `blur(78px)` — all used as one-off values with no documentation.

**Fix:** Define a 4-level blur scale in `@theme`:

```css
@theme {
  --blur-surface: blur(24px);
  --blur-sidebar: blur(36px);
  --blur-modal: blur(48px);
  --blur-heavy: blur(72px);
}
```

---

### 🟠 High: Progress bar height magic number

```css
height: 6px; /* appears identically in glass-light AND glass-dark blocks */
```

**Fix:** Define `--progress-height: 6px` as a token and reference it.

---

### 🟡 Medium: Structurally identical scrollbar blocks repeated 4 times

Width (4px), track (transparent), corner (transparent), thumb border-radius (99px) — identical across all 4 themes; only thumb color differs.

**Fix:** One shared `@layer base` scrollbar rule; per-theme blocks only override thumb color.

---

### 🟡 Medium: `next.config.ts` silences all errors

```ts
typescript: {
  ignoreBuildErrors: true;
}
eslint: {
  ignoreDuringBuilds: true;
}
```

TypeScript type errors and lint violations are silently swallowed. This masks runtime failures and explains why many of the issues below were not caught.

---

## Part 2 — Shared UI Components (`src/components/ui/`)

### Existing components inventory

| File                         | Exports                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `button.tsx`                 | `Button` — variants: primary, secondary, accent, ghost, error, outline; sizes: xs/sm/md/lg                                           |
| `modal.tsx`                  | `Modal` — portal dialog with title/actions                                                                                           |
| `pagination.tsx`             | `Pagination` — full-featured with page jump                                                                                          |
| `shared.tsx`                 | `Badge`, `ConnectionBadge`, `Card`, `EmptyState`, `PageHeader`, `LoadingPage`, `ConfirmDialog`, `Avatar`, `AvatarStack`, `DataTable` |
| `skeleton.tsx`               | `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonTable`, `SkeletonStats`                                                         |
| `form-fields.tsx`            | `Input`, `Textarea`, `Select`, `PasswordInput`, `DatePicker`, `Combobox`                                                             |
| `presence-indicator.tsx`     | `PresenceIndicator`, `PresenceBadge`                                                                                                 |
| `color-picker-panel.tsx`     | `ProfileSwatch`, `PrimaryColorPicker`                                                                                                |
| `virtual-scroll-list.tsx`    | `VirtualScrollList<T>`                                                                                                               |
| `theme-customizer-modal.tsx` | `ThemeCustomizerModal`                                                                                                               |

---

### 🔴 Critical: Two competing modal implementations

`modal.tsx` exports a shared `Modal` (portal + backdrop + close logic).  
`theme-customizer-modal.tsx` re-implements a completely separate fixed-position modal from scratch, duplicating all portal/backdrop/close logic.  
`ConfirmDialog` in `shared.tsx` also duplicates `<dialog class="modal modal-open">` instead of wrapping `<Modal>`.

**Fix:** All modals must use or extend the shared `Modal` component.

---

### 🔴 Critical: `Badge` variant type is `string` — no type safety

```tsx
// shared.tsx
variant?: string  // BAD — accepts invalid DaisyUI class names
```

```tsx
// button.tsx
variant: "primary" | "secondary" | "accent" | "ghost" | "error" | "outline"; // correct
```

**Fix:** Change `Badge.variant` to a strict union of valid DaisyUI badge modifier classes.

---

### 🔴 Critical: 3 different loading spinner patterns

| Location                     | Pattern                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `button.tsx`                 | `<Loader2 className="w-4 h-4 animate-spin" />` (Lucide)                          |
| `shared.tsx` `ConfirmDialog` | `<span className="loading loading-spinner loading-sm" />` (DaisyUI)              |
| `shared.tsx` `LoadingPage`   | `<span className="loading loading-spinner loading-lg text-primary" />` (DaisyUI) |

**Fix:** Standardise on DaisyUI `loading loading-spinner` everywhere. Remove `Loader2` from `Button`.

---

### 🟠 High: `color-picker-panel.tsx` — raw hex/oklch inline styles everywhere

All text colors are raw hex (`#f0f0ff`, `#1e1b4b`) and backgrounds are raw `oklch()` strings — breaks immediately on theme change. Should use `text-base-content`, `bg-base-100`, etc.

---

### 🟠 High: `cn()` not used in all components

`pagination.tsx` and `virtual-scroll-list.tsx` use template literals for className — every other component uses `cn()`. **Fix:** Replace string concatenation with `cn()` in both files.

---

### 🟠 High: Inline `style` for transparent background

Both `modal.tsx` and `shared.tsx` `ConfirmDialog` use `style={{ backgroundColor: "transparent" }}` instead of `className="bg-transparent"`.

---

### 🟠 High: Border-radius scale is inconsistent

| Component                | Radius class used |
| ------------------------ | ----------------- |
| `Skeleton` base          | `rounded`         |
| `SkeletonCard`           | `rounded-xl`      |
| `Card` (DaisyUI default) | varies            |
| `Combobox` dropdown      | `rounded-box`     |
| `ColorPicker` swatches   | `rounded-lg`      |
| `ProfileSwatch`          | `rounded-xl`      |

No stated rule for "card radius = X, interactive element = Y, badge = Z".

---

### 🟠 High: Font size scale has no documented tier

```
text-2xl (PageHeader)
→ text-lg (Modal title)
→ text-[1.05rem] (Card title — non-standard!)
→ text-sm
→ text-xs
→ text-[10px]  ← not on Tailwind scale
→ text-[9px]   ← not on Tailwind scale
```

`text-[9px]` and `text-[10px]` must be replaced or replaced with `text-xs` (12px is the Tailwind floor).

---

### 🟡 Medium: Missing shared components (most likely re-invented per page)

| Missing Component         | Evidence of ad-hoc reimplementation found                          |
| ------------------------- | ------------------------------------------------------------------ |
| `Tabs` / `TabBar`         | 4+ different tab implementations across pages (see Part 3 & 4)     |
| `DropdownMenu`            | 3+ different dropdown mechanisms across task views (see Part 5)    |
| `Alert` / `Banner`        | `email-templates-tab.tsx` inline info banners; no shared component |
| `StatCard` / `KPICard`    | 4 separate card implementations for the same "stat + icon" pattern |
| `Toggle` / `Switch`       | Raw DaisyUI `toggle` class used directly with no shared component  |
| `Checkbox` / `RadioGroup` | Not in `form-fields.tsx`                                           |
| `ProgressBar`             | Not in shared components                                           |
| `Tooltip` wrapper         | Raw DaisyUI `tooltip` div used inline everywhere                   |
| `FileUpload` / `DropZone` | Not in shared components                                           |

---

### 🟡 Medium: `Combobox` internally re-implements `Input`

The search input inside `Combobox`'s dropdown uses raw `<input className="input input-sm input-bordered w-full">` instead of the shared `<Input>` component from the same file.

---

### 🟡 Medium: `isLightHex` utility exported from a component file

Pure utility function mixed into `color-picker-panel.tsx`. **Fix:** Move to `@/lib/utils`.

---

### 🟡 Medium: `DataTable` always renders `table-zebra` — no variant prop

No way to suppress zebra striping even where it's not appropriate.

---

### 🟡 Medium: `AvatarStack` overflow placeholder duplicates `Avatar` logic

Instead of rendering `<Avatar>` it reimplements the same `bg-primary text-primary-content` div inline. `PresenceIndicator` does likewise with a manual `w-7 h-7` div instead of `<Avatar size="sm">`.

---

## Part 3 — Dashboard & Projects Pages

### Files audited

`[orgSlug]/page.tsx`, `projects/page.tsx`, `projects/[projectId]/page.tsx`, `my-tasks/page.tsx`, `performance/page.tsx`, `performance/projects/`, `performance/members/`, `performance/teams/`, `performance/reports/`

---

### 🔴 Critical: `bg-base-50` is not a valid DaisyUI 5 token

Found in `performance/reports/page.tsx`:

```tsx
<div className="border-t border-base-200 p-3 bg-base-50">
```

DaisyUI 5 uses `base-100 / base-200 / base-300`. `base-50` does not exist and silently produces no background.  
**Fix:** Replace with `bg-base-100`.

---

### 🔴 Critical: `blocked` status has contradictory colors across views

| Location                                 | Color used for "blocked"        |
| ---------------------------------------- | ------------------------------- |
| `task-columns.tsx`, `task-tree-view.tsx` | `bg-error` / `text-error` → RED |
| `project-dashboard.tsx` `STATUS_COLORS`  | `#f59e0b` → AMBER               |
| `stacked-area-chart.tsx` `STATUS_COLORS` | `#ef4444` → RED                 |

Dashboard shows blocked as amber, task views show it as red — opposite semantic meaning.

---

### 🔴 Critical: `low` priority is semantically inverted between views and dashboard

| Location                                  | "low" priority color          |
| ----------------------------------------- | ----------------------------- |
| `lib/utils.ts` `priorityColor()`          | `badge-ghost` → neutral/muted |
| `project-dashboard.tsx` `PRIORITY_COLORS` | `#22c55e` → GREEN             |

Low priority appears gray in task boards but green in dashboard charts.

---

### 🔴 Critical: `in_review` and `cancelled` / `urgent` statuses don't exist in domain types

`project-dashboard.tsx` `STATUS_COLORS` includes `in_review` and `cancelled`.  
The backend `TaskStatus` domain type only defines: `todo | in_progress | done | blocked`.  
`PRIORITY_COLORS` includes `urgent` which is not in `TaskPriority`.  
These keys are dead — chart slices fall through to the gray fallback silently.

---

### 🟠 High: Stat/KPI widget has 4 different implementations for the same concept

| Pattern                                      | Where                           |
| -------------------------------------------- | ------------------------------- |
| Raw `div` with `glass-card` class            | `page.tsx` `MiniStat`           |
| DaisyUI `stat` div with manual border/shadow | `my-tasks/page.tsx` quick stats |
| Local `StatCard` function component          | `performance/page.tsx`          |
| `<Card compact>` wrapping inner flex         | `performance/members/page.tsx`  |

All four show the same "icon + big number + label" layout. Should be one shared `<StatCard>` component.

---

### 🟠 High: Hardcoded hex colors in health score avatars

```tsx
style={{
  backgroundColor: p.health_score >= 80 ? "#22c55e" : p.health_score >= 60 ? "#f59e0b" : "#ef4444",
}}
```

Plus `className="... text-white"` — hardcoded white text won't invert on light themes. Use `text-base-100` or the `-content` token variant.

---

### 🟠 High: Chart color props hardcoded in 5+ files

The same hex values are passed as `color` and `secondaryColor` props to chart components across `page.tsx`, `performance/page.tsx`, `performance/projects/page.tsx`, `performance/teams/page.tsx`, `performance/members/page.tsx`:

```ts
color = "#22c55e"; // should be var(--color-success)
secondaryColor = "#3b82f6"; // should be var(--color-info)
color = "#6366f1"; // should be var(--color-accent)
```

---

### 🟠 High: Day-range picker (7d/30d/90d) rendered two completely different ways

| Page                   | Implementation                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `page.tsx` (Dashboard) | Custom pill buttons with `oklch` gradient inline in `cn()` inside a `rounded-full` container |
| `performance/page.tsx` | DaisyUI `join` + `btn-primary`/`btn-outline`                                                 |

Same control, same data, completely different look and DOM structure.

---

### 🟠 High: View-toggle (table/grid, grouped/flat) has 3 implementations

| Page                                                        | Implementation                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `projects/page.tsx` (table/grid)                            | Custom inline-flex toggle with `cn()`                                          |
| `my-tasks/page.tsx` (grouped/flat)                          | Same pattern but with template literals — **inconsistent within same pattern** |
| `projects/[projectId]/page.tsx` (list/tree/kanban/calendar) | DaisyUI `tabs tabs-boxed` with custom CSS classes                              |

---

### 🟡 Medium: Performance sub-pages selector widget duplicated 3 times

`performance/members/page.tsx`, `performance/projects/page.tsx`, `performance/teams/page.tsx` all implement the identical `VirtualScrollList` + search input + selected state pattern. Should be a shared `<SelectorPanel>` component.

---

### 🟡 Medium: `text-white` used for avatar text on colored background

```tsx
className = "... text-white flex-shrink-0";
```

Will be invisible on light themes. Use `text-primary-content` or other `-content` token.

---

### 🔵 Low: Stat value font sizes differ for the same data type

| Page                              | Font size for the "big number" |
| --------------------------------- | ------------------------------ |
| `my-tasks/page.tsx`               | `text-lg`                      |
| `page.tsx` `MiniStat`             | `text-xl`                      |
| `performance/page.tsx` `StatCard` | `text-2xl`                     |

---

### 🔵 Low: Caption-level text uses 3 interchangeable sizes

`text-[10px]`, `text-[11px]`, and `text-xs` are all used for the same "secondary small caption" purpose. Pick one (`text-xs`) and apply it everywhere.

---

## Part 4 — Settings, Teams, Activity Pages

### Files audited

`settings/page.tsx`, all settings `_components/`, `teams/page.tsx`, `teams/[teamId]/page.tsx`, `activity/page.tsx`, `notifications/page.tsx`, `profile/page.tsx`

---

### 🔴 Critical: Settings page tab bar has no ARIA roles

`settings/page.tsx` renders `<button>` elements with a custom `border-b-2` active indicator but no `role="tablist"` / `role="tab"` attribution — it's inaccessible. All other pages correctly use DaisyUI `tabs` markup or proper `role` attributes.

---

### 🟠 High: 4 different tab implementations on settings + related pages

| Implementation                                                                     | Where                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Custom `<button>` + `border-b-2` active indicator (hand-rolled)                    | `settings/page.tsx` main tab bar                                                                        |
| `tabs tabs-bordered` (DaisyUI)                                                     | `notifications/page.tsx` top-level Inbox/Preferences                                                    |
| `tabs tabs-boxed` (DaisyUI)                                                        | `notifications/page.tsx` All/Unread/Read sub-tabs, `teams/[teamId]/page.tsx`, `email-templates-tab.tsx` |
| Custom `bg-base-200 rounded-lg p-0.5` pill with `bg-base-100 shadow-sm` active tab | `permissions-tab.tsx` scope switcher                                                                    |

`notifications/page.tsx` uses **two different DaisyUI tab variants on the same page** (`tabs-bordered` top, `tabs-boxed` inner).

---

### 🟠 High: `email-templates-tab.tsx` — 8 hardcoded Tailwind palette color families

```tsx
text - blue - 500 / bg - blue - 500 / 10;
text - amber - 500 / bg - amber - 500 / 10;
text - emerald - 500 / bg - emerald - 500 / 10;
text - violet - 500 / bg - violet - 500 / 10;
text - pink - 500 / bg - pink - 500 / 10;
text - cyan - 500 / bg - cyan - 500 / 10;
text - green - 500 / bg - green - 500 / 10;
text - red - 500 / bg - red - 500 / 10;
```

Used purely for icon decoration — will clash or disappear in custom themes.  
**Fix:** Replace with `text-primary`, `text-warning`, `text-success`, `text-error`, `text-info`, `text-secondary`, `text-accent`.

---

### 🟠 High: Search input has 3 inconsistent implementations

| Page                | Pattern                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `members-tab.tsx`   | `<input className="input input-bordered w-full pl-10 input-sm">` — raw input, not `<Input>`             |
| `teams/page.tsx`    | `<input className="h-10 rounded-xl search-anchor-surface bg-transparent px-3 pl-8 ...">` — custom class |
| `activity/page.tsx` | Same `search-anchor-surface` pattern as teams                                                           |

`search-anchor-surface` is a custom CSS class defined in `globals.css` that applies backdrop-blur + border. It styles search differently from `input-bordered`. One consistent `<Input>` usage would show one unified look.

---

### 🟠 High: `focus:ring-oklch(...)` in Tailwind class attribute

Both `teams/page.tsx` and `activity/page.tsx` search inputs use:

```tsx
focus:ring-2 focus:ring-oklch(64%_0.18_180_/_0.35)
```

This is an arbitrary Tailwind value with a raw OKLCH color injected — bypasses `focus:ring-primary`. Difficult to maintain and not visible in orbis-light theme.

---

### 🟠 High: Duplicate `THEME_PREVIEWS` constant in two files

`settings/_components/theme-tab.tsx` and `profile/page.tsx` define the **identical `THEME_PREVIEWS` constant** verbatim (same array, same preview swap classes, same color strings).  
**Fix:** Extract to `@/lib/theme-previews.ts` and import in both places.

---

### 🟡 Medium: `roles-tab.tsx` is dead code — never imported or linked

`settings/page.tsx`'s `TABS` definition does not include a `RolesTab` entry. The file exists and exports a component but is never used.  
**Fix:** Delete `settings/_components/roles-tab.tsx`.

---

### 🟡 Medium: Dropdown patterns — 3 inconsistent implementations

| Pattern                                                           | Where                                               |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| DaisyUI `dropdown dropdown-end` with tabIndex                     | `roles-tab.tsx`, `permissions-tab.tsx`              |
| Portal `createPortal` + `useLayoutEffect` positioned div          | `members-tab.tsx` per-row action menu               |
| DaisyUI `dropdown dropdown-bottom` (with task board CSS classes!) | `teams/page.tsx` filter, `activity/page.tsx` filter |

The filter dropdowns in `teams/page.tsx` and `activity/page.tsx` use CSS classes named `task-status-menu`, `task-status-item`, `task-status-item-active` — which are semantically for the **task board**, indicating copy-paste without renaming.

---

### 🟡 Medium: Two `<select>` inputs bypass the shared `Select` component

`permissions-tab.tsx` TeamProjectRoleMapSection uses raw `<select className="select select-bordered select-xs">` instead of the `<Select>` component from `form-fields.tsx`.

---

### 🟡 Medium: Duplicate notification preferences UI

`notifications/page.tsx` Preferences sub-tab: simple table toggling prefs from DB (8 rows, no description).  
`profile/page.tsx` NotificationsTab: rich grid of event types × channels with descriptions (16 toggles).  
Both operate on the same data endpoint but present completely different UX — confusing for users and a maintenance burden.

**Fix:** Keep only one (profile's richer version). Replace notifications page's preferences with a link to profile settings.

---

### 🟡 Medium: Icon-only buttons oscillate between `btn-xs` and `btn-sm`

`members-tab.tsx` uses `btn btn-ghost btn-xs btn-square` for row action buttons.  
`webhooks-tab.tsx` identical action uses `btn btn-ghost btn-sm btn-square` — one size larger.

---

### 🔵 Low: Section heading font size is undeclared in two settings tabs

`billing-tab.tsx` section name uses `text-xl font-bold` — all other card section headings cap at `text-base font-semibold`. The billing tab looks visually louder than the rest of settings.

---

### 🔵 Low: `stat-value` + `text-2xl` double-specified in `teams/[teamId]/page.tsx`

DaisyUI `stat-value` already applies font-size; adding `text-2xl` overrides it redundantly.

---

## Part 5 — Task Components, Charts, Projects Component

### Files audited

All files in `components/tasks/`, `components/charts/`, `components/projects/`, `components/marketing/`, `app/(marketing)/landing/`

---

### 🔴 Critical: `project-dashboard.tsx` defines `STATUS_COLORS` and `PRIORITY_COLORS` that contradict `lib/utils.ts`

```ts
// project-dashboard.tsx — ALL hardcoded hex, not semantic tokens
STATUS_COLORS = {
  todo: "#94a3b8",
  blocked: "#f59e0b", // AMBER ← wrong, rest of app uses RED
  in_progress: "#3b82f6",
  in_review: "#a855f7", // in_review doesn't exist in domain
  done: "#22c55e",
  cancelled: "#6b7280", // cancelled doesn't exist in domain
};
PRIORITY_COLORS = {
  urgent: "#ef4444", // urgent doesn't exist in domain
  critical: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#22c55e", // low is GREEN ← task views show low as gray
};
```

`stacked-area-chart.tsx` independently defines the same `STATUS_COLORS` with `blocked: "#ef4444"` (RED) — contradicting the dashboard's amber.

**Fix:** Create a single `src/lib/task-colors.ts` that exports both DaisyUI-class variants (for UI badges) and CSS-variable-based hex for charts (reading `getComputedStyle` or a static map from `--color-*` tokens). Delete all per-file color constant redefinitions.

---

### 🔴 Critical: `MiniDonut` in `project-dashboard.tsx` duplicates `donut-chart.tsx`

`project-dashboard.tsx` contains a local `MiniDonut` function component that implements the same Recharts `PieChart` with a legend as `components/charts/donut-chart.tsx`. Two divergent implementations for the same chart type.  
**Fix:** Delete `MiniDonut` from the dashboard and use `<DonutChart>` from charts.

---

### 🔴 Critical: Filter logic duplicated across 3 task views

The recursive filter predicate (checking `assigneeIds`, `statuses`, `priorities`, `labels`, `dueDateFrom`, `dueDateTo`, `search`) is copy-pasted into:

- `task-columns.tsx` (`applyFilter()` ~50 lines)
- `task-tree-view.tsx` (`filterTree()` inside `useMemo` ~35 lines)
- Partial duplication in `global-filter-dropdown.tsx`

A bug fix or field addition must be made 3 times.  
**Fix:** Extract to `src/lib/task-filter.ts` as `applyTaskFilter(task, filters)` and `filterTaskTree(tasks, filters)`.

---

### 🔴 Critical: Status badge pattern is 4 different implementations in 4 task views

| Component                | How status is shown                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `task-preview-panel.tsx` | `<span className={cn("badge badge-sm", statusColor(task.status))}>`                 |
| `task-tree-view.tsx`     | `<details>` dropdown with Lucide `<Circle>` colored icon — no badge                 |
| `task-list-view.tsx`     | `<select className="select select-ghost select-xs">` with `text-success/info/error` |
| `task-columns.tsx`       | `w-2 h-2 rounded-full` dot with `bg-success/info/error`                             |

All four views show the same data (task status), but the user sees 4 entirely different UX patterns.

---

### 🟠 High: Priority color mapping defined 3 separate times

| Location                         | Definition                                         |
| -------------------------------- | -------------------------------------------------- |
| `lib/utils.ts` `priorityColor()` | DaisyUI badge variants                             |
| `task-context-menu.tsx`          | Local `priorityOptions` array with CSS class names |
| `project-dashboard.tsx`          | `PRIORITY_COLORS` with hex strings                 |

Same for status: defined in `lib/utils.ts`, `task-context-menu.tsx`, `project-dashboard.tsx`, and `stacked-area-chart.tsx`.

---

### 🟠 High: `ThemedDropdownSelect` duplicates `StatusDropdown` / `PriorityDropdown`

`task-preview-panel.tsx` defines a local `ThemedDropdownSelect` using `<details>/<summary>`.  
`task-tree-view.tsx` defines `StatusDropdown` and `PriorityDropdown` using `<details>/<summary>`.  
Both use the same `task-status-menu` / `task-status-item` CSS classes and are functionally identical.  
**Fix:** Extract one shared `<TaskFieldDropdown>` component and delete both local implementations.

---

### 🟠 High: `landing/page.tsx` has a duplicate inline nav instead of using `<MarketingHeader>`

The landing page renders its own `navLinks` array + dropdown state + sticky header — `<MarketingHeader>` exists as a shared component but the landing page doesn't use it for this.

---

### 🟠 High: Chart tooltip styles hardcoded in every chart component

`bar-chart.tsx`, `line-chart.tsx`, `stacked-area-chart.tsx` each have their own `contentStyle` inline object:

```ts
contentStyle={{ fontSize: 12, borderRadius: 8, boxShadow: "...", background: "var(--color-base-100)" }}
```

One file has the shared `CHART_TOOLTIP_STYLE` constant that mixes `var(--color-base-100)` with hardcoded values — it is not exported or reused by the other chart components.  
**Fix:** Export a shared `CHART_TOOLTIP_STYLE` from `src/lib/chart-utils.ts` and import into all chart components.

---

### 🟠 High: `health-ring.tsx` uses computed `oklch()` strings instead of CSS variables

Health ring colors are computed as JS `oklch(...)` strings and applied via `style={{ color }}`. These bypass theme switching entirely.  
**Fix:** Map health score tiers to CSS variables: `var(--color-success)` / `var(--color-warning)` / `var(--color-error)`.

---

### 🟡 Medium: 4 dropdown mechanisms across task views

| Mechanism                                                 | Where                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `<details>/<summary>` custom dropdown                     | `task-preview-panel.tsx`, `task-tree-view.tsx`, `change-requests.tsx`    |
| Native `<select>`                                         | `task-list-view.tsx` (status/priority inline), `task-columns.tsx` (bulk) |
| DaisyUI `dropdown` + `<ul class="dropdown-content menu">` | `task-tree-view.tsx` (actions menu), `task-columns.tsx` (sort menus)     |
| Fixed-position context menu div                           | `task-context-menu.tsx`                                                  |

The same "change status inline" action uses mechanism 1 in tree view and mechanism 2 in list view.

---

### 🟡 Medium: `memberLabel()` / `memberName()` helpers duplicated in 2 files

Both `task-preview-panel.tsx` and `task-list-view.tsx` define private functions to resolve a `userId` to a display name from a members array.  
**Fix:** Extract to `src/lib/member-utils.ts`.

---

### 🟡 Medium: `done` task strikethrough/opacity not applied in list view

`task-tree-view.tsx` applies `opacity-60` to done tasks. `task-list-view.tsx` does not — done tasks look identical to active tasks.

---

### 🔵 Low: `border-base-300` vs `border-base-200` — 1-level inconsistency

`task-tree-view.tsx` container uses `border-base-300`. Every other task view container uses `border-base-200`.

---

### 🔵 Low: Logo size inconsistency in marketing components

`marketing-header.tsx`: logo `w-9 h-9`, text `text-xl` with gradient.  
`marketing-footer.tsx`: logo `w-8 h-8`, text `text-lg` without gradient.

---

## Part 6 — Design System Gap: What Needs to Be Built

Based on the audit, these shared components need to be created **before any page refactoring begins**, so pages can adopt them cleanly:

### Tier 1 — Build first (used on nearly every page)

| Component              | Location                            | Notes                                                     |
| ---------------------- | ----------------------------------- | --------------------------------------------------------- |
| `Tabs`                 | `components/ui/tabs.tsx`            | Wrap DaisyUI `tabs tabs-boxed` with size/variant prop     |
| `Alert`                | `components/ui/alert.tsx`           | `variant: info\|success\|warning\|error`                  |
| `StatCard` / `KPICard` | `components/ui/stat-card.tsx`       | Replaces 4 ad-hoc implementations                         |
| `DropdownMenu`         | `components/ui/dropdown-menu.tsx`   | Replaces 3+ dropdown mechanisms                           |
| `SectionLabel`         | `components/ui/shared.tsx` addition | `text-[10px] uppercase tracking-widest` pattern extracted |

### Tier 2 — Build next (eliminates specific page-level duplication)

| Component                      | Notes                                                                  |
| ------------------------------ | ---------------------------------------------------------------------- |
| `Toggle` / `Switch` form field | Add to `form-fields.tsx`                                               |
| `Checkbox` / `RadioGroup`      | Add to `form-fields.tsx`                                               |
| `TaskFieldDropdown`            | Replace `ThemedDropdownSelect` + `StatusDropdown` + `PriorityDropdown` |
| `ViewToggle`                   | Replaces the 3 table/grid/groups toggle implementations                |
| `DateRangePicker`              | Replaces the 2 completely different day-range pickers                  |

### Tier 3 — Extract to lib files (no UI, just logic)

| Utility                                                                    | Location                    |
| -------------------------------------------------------------------------- | --------------------------- |
| `applyTaskFilter` / `filterTaskTree`                                       | `src/lib/task-filter.ts`    |
| `TASK_STATUS_COLORS` / `TASK_PRIORITY_COLORS` (both DaisyUI and chart hex) | `src/lib/task-colors.ts`    |
| `CHART_TOOLTIP_STYLE`                                                      | `src/lib/chart-utils.ts`    |
| `THEME_PREVIEWS`                                                           | `src/lib/theme-previews.ts` |
| `memberLabel()`                                                            | `src/lib/member-utils.ts`   |

---

## Part 7 — Recommended Fix Priority Order

### Phase 0 — Immediate (no visual change, just correctness)

1. Remove `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` from `next.config.ts`
2. Delete dead CSS in `globals.css` (~50–80 lines of unreachable rules)
3. Fix `bg-base-50` → `bg-base-100` in `performance/reports/page.tsx`
4. Delete `settings/_components/roles-tab.tsx` (dead file)
5. Consolidate duplicate `THEME_PREVIEWS` constant into `src/lib/theme-previews.ts`
6. Extract `isLightHex` from `color-picker-panel.tsx` to `src/lib/utils.ts`
7. Fix `Badge` variant type from `string` to a strict union

### Phase 1 — Token housekeeping (globals.css)

1. Extract repeated `oklch()` literals into per-theme CSS properties
2. Consume existing `--radius-*` tokens in component rules
3. Define a 4-level blur scale token and apply it
4. Consolidate scrollbar rules into one base + 4 color overrides
5. Add `--progress-height` token

### Phase 2 — Build missing shared components

1. `Tabs`, `Alert`, `StatCard`, `DropdownMenu`, `SectionLabel`
2. `Toggle`, `Checkbox`, `TaskFieldDropdown`, `ViewToggle`, `DateRangePicker`

### Phase 3 — Fix critical semantic contradictions

1. Unify `blocked` color to `bg-error` / `text-error` (red) everywhere
2. Unify `low` priority to neutral/muted (`badge-ghost`) everywhere
3. Remove non-existent enum values from `STATUS_COLORS` / `PRIORITY_COLORS`
4. Create `src/lib/task-colors.ts` and replace all per-file color constant redefinitions
5. Build `KPICard` and replace all 4 stat widget implementations

### Phase 4 — Standardise component usage across pages

1. Replace all modal duplications with shared `Modal`
2. Replace all tab bar implementations with shared `Tabs`
3. Replace all inline spinners with DaisyUI `loading loading-spinner`
4. Replace all raw `btn` markup with `<Button>` component
5. Replace all raw `input / select` markup with shared form field components
6. Apply `cn()` consistently everywhere (remove all template literal className)

### Phase 5 — Charts and analytics

1. Move `MiniDonut` in dashboard to use `<DonutChart>`
2. Export and share `CHART_TOOLTIP_STYLE` constant
3. Replace `oklch()` inline strings in `health-ring.tsx` with CSS variable references
4. Replace hardcoded chart `color` prop defaults with CSS variable reads

---

## Appendix — File-to-Issue Index

| File                                                         | Issues                                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `globals.css`                                                | Token bypass, dead CSS, arbitrary blurs, duplicates                                     |
| `components/ui/modal.tsx`                                    | Inline `style`, no `cn()`, hardcoded title size                                         |
| `components/ui/shared.tsx`                                   | `ConfirmDialog` duplicates Modal, hardcoded sizes, `Badge` type, spinner inconsistency  |
| `components/ui/pagination.tsx`                               | No `cn()`, template literals                                                            |
| `components/ui/color-picker-panel.tsx`                       | Raw hex/oklch inline styles, `isLightHex` in wrong file                                 |
| `components/ui/theme-customizer-modal.tsx`                   | Duplicates `Modal`, arbitrary values                                                    |
| `components/tasks/task-list-view.tsx`                        | Status as native select, no `statusColor()`, inline priority, depth margin inline       |
| `components/tasks/task-tree-view.tsx`                        | `border-base-300` vs `border-base-200`, duplicates `StatusDropdown`                     |
| `components/tasks/task-columns.tsx`                          | `text-[10px]` × 6, duplicated filter logic, inline status dot                           |
| `components/tasks/task-preview-panel.tsx`                    | `ThemedDropdownSelect` duplicates existing components                                   |
| `components/tasks/task-context-menu.tsx`                     | Duplicate status/priority options arrays                                                |
| `components/charts/project-dashboard.tsx`                    | `STATUS_COLORS` contradicts app, `MiniDonut` duplicates chart, hardcoded hex everywhere |
| `components/charts/stacked-area-chart.tsx`                   | `STATUS_COLORS` contradicts dashboard                                                   |
| `components/charts/bar-chart.tsx`                            | Hardcoded default color                                                                 |
| `components/charts/line-chart.tsx`                           | Hardcoded default colors                                                                |
| `components/charts/health-ring.tsx`                          | Raw oklch JS strings                                                                    |
| `components/charts/donut-chart.tsx`                          | Hardcoded fallback color                                                                |
| `app/[orgSlug]/page.tsx`                                     | 4 inline card patterns, hardcoded hex status/priority, custom day-range pill            |
| `app/[orgSlug]/projects/page.tsx`                            | Mixed `cn()`/template literals, `border-base-50` pattern                                |
| `app/[orgSlug]/my-tasks/page.tsx`                            | Template literal className, stat card pattern D                                         |
| `app/[orgSlug]/performance/page.tsx`                         | `text-white`, hardcoded health hex, join-based day-picker                               |
| `app/[orgSlug]/performance/reports/page.tsx`                 | `bg-base-50` (invalid token)                                                            |
| `app/[orgSlug]/settings/page.tsx`                            | Hand-rolled tabs, no ARIA roles                                                         |
| `app/[orgSlug]/settings/_components/email-templates-tab.tsx` | 8 hardcoded palette color families                                                      |
| `app/[orgSlug]/settings/_components/theme-tab.tsx`           | Duplicate `THEME_PREVIEWS`                                                              |
| `app/[orgSlug]/settings/_components/permissions-tab.tsx`     | Raw `<select>`, custom panel divs, `task-status-menu` classes copied from task board    |
| `app/[orgSlug]/settings/_components/roles-tab.tsx`           | Dead file — never imported                                                              |
| `app/[orgSlug]/teams/page.tsx`                               | `search-anchor-surface` custom class, `focus:ring-oklch(...)`                           |
| `app/[orgSlug]/activity/page.tsx`                            | Same as teams page                                                                      |
| `app/[orgSlug]/notifications/page.tsx`                       | Two different DaisyUI tab variants on same page, duplicate preferences UI               |
| `app/[orgSlug]/profile/page.tsx`                             | Duplicate `THEME_PREVIEWS`, duplicate notifications preferences                         |
| `app/(marketing)/landing/page.tsx`                           | Duplicate inline nav, `text-[8px]`, hardcoded chart bar heights                         |
