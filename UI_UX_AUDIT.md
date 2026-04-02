# OrbisPM — Comprehensive UI/UX Audit

**Auditor:** Senior UI/UX Review  
**Date:** 2026-04-01  
**Scope:** Every page, component, layout, and data interaction in `frontend/src`  
**Framework:** Next.js 15 + DaisyUI (Tailwind) + React Query + Zustand  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Global / Cross-Cutting Issues](#global--cross-cutting-issues)
3. [Auth Pages](#auth-pages)
4. [Marketing Pages](#marketing-pages)
5. [Onboarding](#onboarding)
6. [Org Layout (Sidebar + TopBar)](#org-layout-sidebar--topbar)
7. [Dashboard](#dashboard)
8. [Projects List](#projects-list)
9. [Project Detail](#project-detail)
10. [Task Detail](#task-detail)
11. [Teams List](#teams-list)
12. [Team Dashboard](#team-dashboard)
13. [Messages / Chat](#messages--chat)
14. [Calendar](#calendar)
15. [My Tasks](#my-tasks)
16. [Search](#search)
17. [Activity Log](#activity-log)
18. [Notifications](#notifications)
19. [Templates](#templates)
20. [Profile](#profile)
21. [Settings (All Tabs)](#settings-all-tabs)
22. [Performance / Analytics](#performance--analytics)
23. [Reusable UI Components](#reusable-ui-components)
24. [Task Components](#task-components)
25. [Charts & Data Visualization](#charts--data-visualization)
26. [Typography, Colors & Theming](#typography-colors--theming)
27. [Priority Action Items](#priority-action-items)

---

## Executive Summary

OrbisPM has a solid functional foundation — most CRUD operations exist, DaisyUI provides decent baseline styling, and the app has real-time features, RBAC, and multi-theme support. However, the UI lacks the **polish and consistency** expected of a professional SaaS product competing with Jira/Asana. Key gaps:

- **Missing CRUD operations** on several entities (project edit, template edit, member invite flow)
- **Pagination missing** on Activity, My Tasks, Notifications, Templates, and Search results
- **Search missing** on Activity, Templates, Notifications inbox
- **Filter missing** on Activity, My Tasks, Notifications, Templates
- **Inconsistent card/grid patterns** across pages
- **No custom font loaded** — relying on system fonts despite `preconnect` to Google Fonts
- **No Tailwind config file** — all styling is through DaisyUI defaults and inline classes
- **Tables lack polish** — no row striping, inconsistent hover states, no column resize
- **Empty states vary wildly** in quality between pages
- **Loading states inconsistent** — some pages use skeletons, others use centered spinners
- **No breadcrumb trail** on inner pages (only topbar has a simple label)
- **No keyboard shortcuts** visible to users
- **Mobile experience is basic** — sidebar hidden on mobile with drawer, but no bottom nav bar
- **No dark mode toggle easily accessible** — buried in user dropdown under nested `<details>`

---

## Global / Cross-Cutting Issues

### G1. No Custom Font Loaded
- **Issue:** `layout.tsx` has `<link rel="preconnect" href="https://fonts.googleapis.com" />` but **no actual font import**. The body uses no `font-family` class.
- **Impact:** App renders in system fonts (different on every OS). Looks unprofessional and inconsistent across platforms.
- **Fix:** Add a Google Font import (e.g., Inter) and set `font-family` in `globals.css` or Tailwind config.

### G2. No Tailwind Config
- **Issue:** No `tailwind.config.ts/js` found. All theming is done via DaisyUI CSS variables in `globals.css`.
- **Impact:** No custom spacing scale, no custom breakpoints, no extended color palette beyond DaisyUI tokens. Design system is implicit, not explicit.

### G3. No Breadcrumb Navigation
- **Issue:** The `TopBar` shows a single breadcrumb label set via Zustand, but most pages don't set it. Only Calendar sets it. No trail (e.g., "Dashboard > Projects > Project Name > Task").
- **Impact:** Users lose context on deep pages. No way to navigate up the hierarchy from the topbar.

### G4. Inconsistent Loading States
- **Issue:** Pages use three different loading patterns:
  - Full-page centered spinner (`LoadingPage` component)
  - Inline skeleton shimmer blocks (Dashboard, Projects list)
  - `null` return while loading (Settings page)
- **Impact:** Jarring user experience. Some pages flash blank before content appears.

### G5. No Global Search in TopBar
- **Issue:** Search is a dedicated full page (`/search`). There is no search input in the TopBar for quick access.
- **Impact:** Users must navigate away from their current context to search. Professional tools have Cmd+K or a persistent search bar.

### G6. No Keyboard Shortcuts
- **Issue:** No keyboard shortcut system visible. No Cmd+K, no shortcut hints in tooltips, no shortcut modal.
- **Impact:** Power users (the target audience — engineering teams) expect keyboard-driven workflows.

### G7. Toast Styling Override
- **Issue:** Sonner toasts use `className: "!bg-base-100 !text-base-content !border-base-300"` with `!important` overrides.
- **Impact:** Fragile. DaisyUI theme changes may not propagate correctly to toasts. Toast design doesn't match the glass themes.

### G8. No Skip-to-Content / Accessibility Landmarks
- **Issue:** No skip-nav link, no ARIA landmarks on main content area. Modal backdrop uses inline `style={{ background: "transparent" }}` — semantically questionable.
- **Impact:** Screen reader users have poor navigation experience.

### G9. Mobile Bottom Navigation Missing
- **Issue:** On mobile, the sidebar is hidden behind a hamburger menu. There's no persistent bottom tab bar.
- **Impact:** Mobile users need to open the drawer for every navigation action. Standard mobile UX expects bottom tabs.

### G10. No 404 Page for Org Routes
- **Issue:** There's a root `not-found.tsx` but no org-level not-found page. Invalid org slugs or project IDs will show a generic error.
- **Impact:** Poor error recovery for invalid deep links.

---

## Auth Pages

**Files:** `(auth)/login`, `(auth)/signup`, `(auth)/forgot-password`, `(auth)/reset-password`, `(auth)/layout`

### Strengths
- Beautiful animated blob background with light/dark theme support
- Full MFA flow (TOTP, email OTP, SMS, recovery codes)
- IDP/social login support (Google, Microsoft, GitHub, GitLab)
- Password show/hide toggle
- Form validation with react-hook-form
- Error states shown inline
- Responsive card layout

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| A1 | Medium | **Login form missing validation errors** — `register("email", { required })` is set but no `error={errors.email?.message}` on the Input, unlike the signup page which properly shows errors | Login |
| A2 | Low | **IDP icons are plain text letters** ("G", "M", "GH") instead of actual SVG brand logos | Login, Signup |
| A3 | Low | **No "Remember me" checkbox** on login form | Login |
| A4 | Low | **No password strength indicator** on signup — only min-length validation, no visual feedback | Signup |
| A5 | Low | **Auth layout nav links use inline `style={{ opacity: 0.7 }}`** instead of Tailwind classes | Layout |
| A6 | Medium | **No email verification flow visible** — signup goes straight to onboarding without confirming email | Signup |
| A7 | Low | **Blob animations may cause performance issues** on low-end devices — no `prefers-reduced-motion` check | Layout |

---

## Marketing Pages

**Files:** `(marketing)/landing`, `pricing`, `features`, `about`, `contact`, `blog/*`, `alternatives/*`, `terms`, `privacy`

### Strengths
- Rich SEO metadata on every page (OpenGraph, Twitter, JSON-LD)
- Comprehensive pricing comparison table
- Feature grid with badges (AI-Powered, Unique, Enterprise, Coming Soon)
- Contact form with validation
- FAQ section on pricing
- Blog articles with structured content

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| M1 | High | **Landing page too large** — 19,178 tokens / extremely long single file. Hard to maintain, slow to parse | Landing |
| M2 | Medium | **No image/screenshot content** — entire marketing site is text and icons only. No product screenshots, no demo video, no hero image | All |
| M3 | Medium | **Feature category badges are non-functional** — the badges ("AI-Powered", "Collaboration", etc.) on the features page are static labels, not filter buttons | Features |
| M4 | Low | **Pricing CTA links all go to `/signup`** — no distinction between "Start Free Trial" (which implies time-limited) and "Get Started Free" (permanent free tier) | Pricing |
| M5 | Low | **About page stats are hardcoded** — "500+ Active Teams", "1M+ Tasks" — not dynamic, will become stale | About |
| M6 | Low | **Tech stack section uses letter avatars** instead of actual technology logos | Features |
| M7 | Medium | **Blog pages exist but no blog index pagination** — all blog posts shown on single page | Blog |
| M8 | Low | **No cookie consent banner** on marketing pages | All |
| M9 | Low | **Marketing header/footer not audited for mobile** — unclear if hamburger menu exists for marketing nav | All |

---

## Onboarding

**File:** `app/onboarding/page.tsx`

### Strengths
- Clean single-step org creation
- Auto-generates URL slug from name
- Proper redirects for authenticated/unauthenticated users

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| O1 | High | **Single-step onboarding** — only org name + slug. No team creation, no member invite, no project setup. Competitors have multi-step wizards | Onboarding |
| O2 | Medium | **No onboarding progress indicator** — if expanded to multi-step, no stepper component exists | Onboarding |
| O3 | Low | **Card uses `shadow-xl`** while rest of the app uses `shadow-sm` — inconsistent elevation | Onboarding |

---

## Org Layout (Sidebar + TopBar)

**File:** `app/[orgSlug]/layout.tsx`

### Strengths
- Collapsible sidebar with smooth animation
- Org switcher dropdown
- Mobile drawer with backdrop
- Theme switcher in user dropdown
- Real-time connection badge in topbar
- Sticky notes panel and notification bell in topbar
- Permission-gated settings nav item
- Active state highlighting on sidebar items

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| L1 | High | **Dark mode toggle buried** — Theme is inside User Dropdown > `<details>` accordion. Requires 2 clicks to even see options. Should be a quick toggle in the topbar or sidebar footer | Layout |
| L2 | Medium | **No tooltip on collapsed sidebar icons** — `title` attribute is set but no styled tooltip component. Browser native tooltip looks inconsistent | Sidebar |
| L3 | Medium | **Sidebar label truncation at 7 chars** is hardcoded — "Notifications" becomes "Notific…". This looks broken, not intentional | Sidebar |
| L4 | Low | **Mobile sidebar duplicates all nav items** — full copy-paste of desktop nav. Any change must be made in two places | Layout |
| L5 | Low | **glass-sidebar and glass-topbar classes** referenced but defined deep in globals.css — unclear if these apply on non-glass themes (they set transparent backgrounds) | Layout |
| L6 | Medium | **No visual indicator for new notifications** on the sidebar Bell icon (only the topbar NotificationBell has a badge) | Sidebar |
| L7 | Low | **`Performance` link in sidebar** has no permission gate — all members see it even if they can't access analytics | Sidebar |

---

## Dashboard

**File:** `app/[orgSlug]/page.tsx`

### Strengths
- 6-column stat cards with icons
- Donut charts for status/priority distribution
- Radial progress for completion
- Health ring with velocity/completion/blocked/overdue metrics
- Area chart for velocity trend
- Active warnings with severity coloring
- Virtual scroll for projects and recent tasks lists
- Good skeleton loading state

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| D1 | Medium | **Recent tasks not paginated** — shows whatever the API returns, no "View all" link or pagination | Dashboard |
| D2 | Medium | **No date range selector** — velocity trend and analytics are fixed. Can't switch between 7d/30d/90d | Dashboard |
| D3 | Low | **Completion card has redundant display** — shows `radial-progress` AND `progress` bar for the same metric | Dashboard |
| D4 | Medium | **No quick actions** — no "Create Project", "Create Task" buttons on the dashboard. Empty project state has one but the normal state doesn't | Dashboard |
| D5 | Low | **"glass-card" class** used on MiniStat but not on other cards — inconsistent glass effect application | Dashboard |

---

## Projects List

**File:** `app/[orgSlug]/projects/page.tsx`

### Strengths
- **Full CRUD** — Create, Read, Delete all present
- **Server-side pagination** with page size of 20
- **Search** with 300ms debounce
- **Filters** for status and team with filter count badge
- **Sorting** by name, status, created_at, updated_at
- **Table + Grid view toggle**
- **Empty state** with contextual message (filtered vs no data)
- **Confirm dialog** before delete
- **Multi-team assignment** on create

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| P1 | **Critical** | **No project Edit/Update** — can create and delete but cannot edit name, description, status, or team assignment after creation | Projects |
| P2 | Medium | **Grid view cards lack team display** — table view shows teams but grid cards don't | Projects |
| P3 | Low | **No bulk actions** — can't bulk delete, bulk archive, or bulk assign teams | Projects |
| P4 | Low | **Grid cards don't show description** unless it exists — no placeholder or consistent height | Projects |

---

## Project Detail

**File:** `app/[orgSlug]/projects/[projectId]/page.tsx` (large file, 16k+ tokens)

### Based on imports and structure:
- Has task management views (list, tree, kanban columns)
- Has project settings panel
- Has project dashboard/analytics
- Has CSV import dialog
- Has change request system
- Has global filter dropdown
- Has task context menu

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| PD1 | Medium | **File is extremely large** (16,258 tokens) — should be split into sub-components for maintainability | Project Detail |
| PD2 | Medium | **No project edit form visible at page level** — project name/description editing might be in `project-settings.tsx` but not easily discoverable | Project Detail |
| PD3 | Low | **No tab for project members** visible in the page routing — member management may be in settings but unclear | Project Detail |

---

## Task Detail

**File:** `app/[orgSlug]/projects/[projectId]/tasks/[taskId]/page.tsx` (large file, 16,941 tokens)

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| TD1 | Medium | **File is extremely large** (16,941 tokens) — single file handling all task detail concerns | Task Detail |
| TD2 | Medium | **Task detail page exists as a standalone route AND as a preview panel** — may cause confusion about which is the "canonical" view | Task Detail |

---

## Teams List

**File:** `app/[orgSlug]/teams/page.tsx`

### Strengths
- **Full CRUD** — Create, Read, Delete
- **Server-side pagination** (18 per page)
- **Search** with debounce
- **Sorting** by name and created_at
- **Team detail modal** with member management
- **Add/remove members** with role selection
- **Role change** with optimistic updates

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| T1 | **Critical** | **No team Edit/Update** — cannot edit team name or description after creation | Teams |
| T2 | Medium | **No filter by member count** or project count | Teams |
| T3 | Low | **Grid-only view** — no table view toggle unlike projects page (inconsistent) | Teams |
| T4 | Low | **Team detail modal member list** has no search/filter for large teams | Teams |
| T5 | Low | **"Add Member" section** uses plain `<select>` — not searchable, problematic for large orgs | Teams |

---

## Team Dashboard

**File:** `app/[orgSlug]/teams/[teamId]/page.tsx`

### Strengths
- KPI cards (projects, tasks, members, overdue, done 7d)
- Status and priority breakdown with progress bars
- Member workload table with stacked bar visualization
- Recent tasks table
- Calendar tab for team-specific task view
- Velocity banner

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| TM1 | Medium | **Recent tasks not paginated** — all shown in single table | Team Dashboard |
| TM2 | Medium | **Member workload table not sortable** — can't sort by total tasks, overdue, etc. | Team Dashboard |
| TM3 | Low | **No date range filter** for velocity/completion stats | Team Dashboard |
| TM4 | Low | **`window.location.href` used for task navigation** instead of Next.js router — causes full page reload | Team Dashboard |

---

## Messages / Chat

**File:** `app/[orgSlug]/messages/page.tsx`

### Strengths
- Three-panel layout (channel list, messages, thread/details)
- WebSocket-based real-time messaging
- Channel create modal
- Thread panel support
- Responsive — channel list hidden on mobile when chat is active

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| C1 | Medium | **No message search** within channels | Messages |
| C2 | Medium | **No channel edit/rename** visible | Messages |
| C3 | Medium | **No channel delete** visible | Messages |
| C4 | Low | **No typing indicator** visible in the page (may be in sub-components) | Messages |
| C5 | Low | **No emoji picker** visible | Messages |
| C6 | Low | **No file/attachment upload** visible at page level | Messages |
| C7 | Low | **No pinned messages** feature | Messages |

---

## Calendar

**File:** `app/[orgSlug]/calendar/page.tsx`

### Strengths
- Full calendar view component with month/week/day modes
- Rich filter system (project, team, status, priority, assignee, labels, parent task)
- Applied filter chips with remove
- Group-by selector
- Breadcrumb set in topbar
- Range change updates API query

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| CA1 | Medium | **No task creation from calendar** — can't click a date to create a task | Calendar |
| CA2 | Medium | **No drag-and-drop rescheduling** visible at page level (despite being mentioned in features page) | Calendar |
| CA3 | Low | **`window.location.href` used for task click** — full page reload instead of router push | Calendar |

---

## My Tasks

**File:** `app/[orgSlug]/my-tasks/page.tsx`

### Strengths
- Groups tasks by status (In Progress, Todo, Blocked, Done)
- Overdue section highlighted with error styling
- Done section collapsed by default
- Quick stat cards
- Labels shown as badges

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| MT1 | **Critical** | **No pagination** — fetches up to 100 tasks in single request. No "load more" or paging | My Tasks |
| MT2 | **Critical** | **No filter/sort options** — can't filter by project, priority, due date, labels. Can't sort by any column | My Tasks |
| MT3 | Medium | **No search** within my tasks | My Tasks |
| MT4 | Medium | **No inline status change** — must navigate to task detail to change status | My Tasks |
| MT5 | Low | **Table header has empty `<th></th>`** for status icon column — no accessible label | My Tasks |

---

## Search

**File:** `app/[orgSlug]/search/page.tsx`

### Strengths
- Searches both tasks and projects
- Debounced auto-search (300ms)
- Shows total result count
- Project name lookup for task results
- Good empty state

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| S1 | **Critical** | **No pagination on search results** — hardcoded limit of 25, shows "showing first 25" but no way to load more | Search |
| S2 | Medium | **No search filters** — can't filter by status, priority, assignee, date range | Search |
| S3 | Medium | **No search for teams, members, or activity** — only tasks and projects | Search |
| S4 | Medium | **No search result highlighting** — matching text not highlighted in results | Search |
| S5 | Low | **No recent searches** or search history | Search |
| S6 | Low | **Search input not autofocused** on page load | Search |

---

## Activity Log

**File:** `app/[orgSlug]/activity/page.tsx`

### Strengths
- Shows actor avatar and name
- Action type badges with color coding
- Change details shown inline
- Relative timestamps

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| AC1 | **Critical** | **No pagination** — hardcoded `limit=50`, no paging controls | Activity |
| AC2 | **Critical** | **No filters** — can't filter by user, action type, entity type, date range | Activity |
| AC3 | **Critical** | **No search** — can't search activity logs | Activity |
| AC4 | Medium | **Entity ID shown as truncated UUID** — not clickable, doesn't link to the entity | Activity |
| AC5 | Medium | **Changes shown as key list** ("Changed: status, priority") — no before/after values shown | Activity |
| AC6 | Low | **No export** option for audit compliance | Activity |

---

## Notifications

**File:** `app/[orgSlug]/notifications/page.tsx`

### Strengths
- Inbox/Preferences tabs
- Filter by all/unread/read
- Mark as read (individual and bulk)
- Notification preferences table with toggle
- Deep linking to relevant entity
- Unread indicator dot
- Auto-refresh every 15 seconds

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| N1 | Medium | **No pagination** — hardcoded `limit=100` | Notifications |
| N2 | Medium | **No search** in notifications | Notifications |
| N3 | Low | **No delete notification** option — can only mark as read | Notifications |
| N4 | Low | **Preference event_type shown raw** — e.g., "task_assigned" instead of "Task Assigned" | Notifications |
| N5 | Low | **No notification grouping** — similar notifications not batched visually | Notifications |

---

## Templates

**File:** `app/[orgSlug]/templates/page.tsx`

### Strengths
- Full CRUD (Create, Read, Delete)
- JSON import/export
- View template structure in modal
- Shared badge indicator

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| TP1 | **Critical** | **No template Edit/Update** — can create and delete but cannot modify name, description, or structure | Templates |
| TP2 | **Critical** | **No pagination** — all templates loaded at once | Templates |
| TP3 | **Critical** | **No search** for templates | Templates |
| TP4 | Medium | **Template structure is raw JSON** — no visual builder, no form fields. Users must understand JSON | Templates |
| TP5 | Medium | **No "Apply Template" action** visible — templates exist but unclear how to use them on a project | Templates |
| TP6 | Low | **No template categories/tags** for organization | Templates |

---

## Profile

**File:** `app/[orgSlug]/profile/page.tsx` (large file, 15,697 tokens)

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| PR1 | Medium | **File is extremely large** (15,697 tokens) — MFA setup, password change, avatar upload, personal info all in one file | Profile |
| PR2 | Low | **Profile page not visible in sidebar** — accessible only through user dropdown | Profile |

---

## Settings (All Tabs)

**File:** `app/[orgSlug]/settings/page.tsx` + 8 tab components

### Strengths
- 8 well-organized tabs (Organisation, Members, Billing, Roles & Permissions, Webhooks, API Keys, Email Templates, Theme)
- Permission-gated tabs
- URL-synced tab state (`?tab=members`)
- Sticky tab bar with backdrop blur
- Each tab has its own component

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| ST1 | Medium | **Tab descriptions change in the PageHeader** — good UX but the active tab badge is redundant with the tab bar itself | Settings |
| ST2 | Medium | **Members tab** — not audited in detail, but likely missing search/pagination for large orgs based on pattern | Members |
| ST3 | Medium | **Roles tab** — complexity of RBAC UI not assessed but likely needs better visual hierarchy | Permissions |
| ST4 | Low | **Email Templates tab lazy-loaded** — good for code splitting but shows plain skeleton, no contextual loading state | Email Templates |
| ST5 | Low | **No settings search** — with 8 tabs, users can't search for a specific setting | Settings |

---

## Performance / Analytics

**Files:** `performance/page.tsx`, `performance/members/page.tsx`, `performance/projects/page.tsx`, `performance/teams/page.tsx`, `performance/reports/page.tsx`

### Strengths
- Organization health ring with multi-metric breakdown
- Velocity trend area charts
- Workload bar charts
- Project health list with color-coded scores
- Active alerts list
- Member performance with personal velocity charts
- Sub-pages for projects, teams, members, reports

### Issues

| ID | Severity | Issue | Page |
|----|----------|-------|------|
| PF1 | Medium | **No date range selector** — all analytics are fixed-period, no 7d/30d/90d toggle | Performance |
| PF2 | Medium | **Member performance has no pagination** on the member list — uses VirtualScrollList but still loads all | Members |
| PF3 | Medium | **No export/download** for any analytics data (CSV, PDF) | Performance |
| PF4 | Low | **Sub-page navigation** uses plain `btn-outline` links — no active state, no tab-style navigation | Performance |
| PF5 | Low | **Performance link visible to all users** in sidebar — no permission check | Sidebar |

---

## Reusable UI Components

### Button (`components/ui/button.tsx`)
- Clean DaisyUI wrapper with variant and size support
- Has loading state with spinner
- **Missing:** No icon-only variant, no `as` prop for rendering as links

### Modal (`components/ui/modal.tsx`)
- Uses `createPortal` — correct approach
- Escape key not handled (no `onKeyDown`)
- **Backdrop is transparent** with inline style — clicking backdrop closes but there's no visual dim overlay actually from this component (DaisyUI `modal-backdrop` handles it with its own transparent default)
- **Missing:** No size variants (sm, md, lg, xl), no scroll management for long content

### Form Fields (`components/ui/form-fields.tsx`)
- Input, Textarea, Select, PasswordInput all properly implemented
- `forwardRef` used correctly for react-hook-form integration
- **Missing:** No DatePicker, no MultiSelect, no Combobox/Autocomplete, no FileUpload, no Toggle/Switch, no RadioGroup, no Checkbox component

### Shared (`components/ui/shared.tsx`)
- Badge, Card, EmptyState, PageHeader, Avatar, ConfirmDialog, LoadingPage, ConnectionBadge
- Good base set but:
  - **Avatar uses DaisyUI placeholder** with gradient colors — no image lazy loading
  - **Card has no hover variant** — some pages add `hover:shadow-xl` manually, others don't
  - **PageHeader is very basic** — title + description + actions, no breadcrumb integration
  - **ConfirmDialog** is good but uses only "Delete" red styling — no info/warning variants

### Missing Components
| Component | Status | Impact |
|-----------|--------|--------|
| DatePicker | Missing | No date selection UI in create/edit forms |
| MultiSelect / Combobox | Missing | Team member selection uses plain `<select>`, not searchable |
| FileUpload | Missing | No drag-and-drop file upload component |
| Tooltip | Missing | Using browser native `title` attribute, no styled tooltips |
| Tabs component | Missing | Each page implements its own tab logic (DaisyUI tabs, role="tablist", etc.) |
| DataTable | Missing | Each page builds its own table — no reusable sortable, filterable table |
| Pagination component | Missing | Each page implements its own pagination UI (copy-pasted join buttons) |
| Drawer / Sheet | Missing | Only the mobile sidebar uses a drawer pattern, no reusable component |
| Dropdown | Missing | Using DaisyUI dropdown directly, no reusable wrapper |
| Skeleton | Missing | No reusable skeleton components — each page builds its own shimmer blocks |
| StatusBadge | Missing | Status/priority badges are constructed inline everywhere, not standardized |

---

## Task Components

**Files:** `components/tasks/*`

### Components present:
- `task-list-view.tsx` — Full list view with drag-and-drop (dnd-kit), inline edit, context menu
- `task-tree-view.tsx` — Hierarchical tree with expand/collapse
- `task-columns.tsx` — Kanban board columns
- `task-preview-panel.tsx` — Side panel for quick task view
- `task-context-menu.tsx` — Right-click menu
- `global-filter-dropdown.tsx` — Filter by status, priority, assignee, labels
- `change-request-modal.tsx` — Review workflow modal
- `change-requests.tsx` — Review badges and toasts
- `csv-import-dialog.tsx` — Bulk import from CSV
- `recurrence-selector.tsx` — Recurring task schedule
- `time-tracker.tsx` — Time tracking widget

### Issues

| ID | Severity | Issue |
|----|----------|-------|
| TK1 | Medium | **Task list is a single 700+ line file** — should be decomposed |
| TK2 | Medium | **No bulk task actions bar** — can't multi-select and bulk change status/assignee/priority |
| TK3 | Low | **Context menu is custom-built** — should use a headless UI library for accessibility |
| TK4 | Low | **Time tracker component** — unclear if it's integrated into the task detail or standalone |

---

## Charts & Data Visualization

**Files:** `components/charts/*`

### Components present:
- `donut-chart.tsx` — Used on dashboard for status/priority
- `area-chart.tsx` — Velocity trends
- `bar-chart.tsx` — Workload distribution
- `line-chart.tsx` — Exists but unclear where used
- `stacked-area-chart.tsx` — Exists but unclear where used
- `health-ring.tsx` — SVG ring for org health score
- `chart-skeleton.tsx` — Loading state for charts

### Issues

| ID | Severity | Issue |
|----|----------|-------|
| CH1 | Low | **Two chart components (line, stacked-area) appear unused** — dead code |
| CH2 | Low | **Charts use dynamic import with `ssr: false`** — correct for recharts but causes layout shift on first load |
| CH3 | Low | **No chart responsiveness handling** — fixed heights may not work well on small screens |

---

## Typography, Colors & Theming

### Theme System
- **4 themes:** orbis-light (default), glass-light, glass-dark, orbis-dark
- All defined via CSS custom properties in `globals.css` using OKLCH color space
- Glass themes include background gradients and blur effects
- Org-level theme lock feature (admin can force a theme)
- User-level theme preference saved to DB

### Issues

| ID | Severity | Issue |
|----|----------|-------|
| TH1 | **High** | **No font loaded** — `preconnect` to Google Fonts but no actual font import. Product appears in system font |
| TH2 | Medium | **Font sizes inconsistent** — mix of `text-xs`, `text-sm`, `text-[10px]`, `text-[11px]` custom sizes throughout. No type scale |
| TH3 | Medium | **Color usage inconsistent** — some components use semantic tokens (`text-base-content/60`), others use hardcoded values (`#22c55e`, `#3b82f6`) especially in charts |
| TH4 | Low | **OKLCH color space** — modern and correct but may have rendering differences in older browsers |
| TH5 | Low | **Glass theme effects** (blur, transparency) may have performance issues on low-end hardware |
| TH6 | Low | **Theme customizer modal** exists (`color-picker-panel.tsx`, `theme-customizer-modal.tsx`) but unclear how users access it |

---

## Priority Action Items

### P0 — Critical (Must Fix)

1. **Load a custom font** (Inter/Geist) — the #1 thing that makes a SaaS look amateur is system fonts
2. **Add Project Edit** — users cannot edit projects after creation
3. **Add Team Edit** — users cannot edit teams after creation
4. **Add Template Edit** — users cannot edit templates after creation
5. **Add pagination to Activity, My Tasks, Notifications, Templates, Search** — all hardcoded limits with no paging
6. **Add search/filter to My Tasks, Activity, Templates** — no way to find specific items

### P1 — High Priority

7. **Add global search** (Cmd+K) in the TopBar — power users need instant search
8. **Move dark mode toggle** to an accessible location (topbar icon or sidebar footer toggle)
9. **Create a Tailwind config** with custom font, spacing scale, and extended theme
10. **Build a reusable DataTable component** — stop copy-pasting table/sort/pagination code
11. **Build a reusable Pagination component** — identical pagination UI duplicated across 4+ pages
12. **Add keyboard shortcuts** with a discoverable shortcut modal
13. **Add breadcrumb trail** to all inner pages
14. **Standardize loading states** — pick one pattern (skeletons) and use it everywhere

### P2 — Medium Priority

15. Add date range selectors to Dashboard and Performance analytics
16. Add search result highlighting on the Search page
17. Add filter chips to Activity page (by user, action, entity, date)
18. Add sortable columns to Team Dashboard member workload table
19. Add inline status change to My Tasks page
20. Replace `window.location.href` with Next.js router in Calendar and Team Dashboard
21. Add mobile bottom navigation bar
22. Create missing form components (DatePicker, Combobox, FileUpload)
23. Add bulk actions to Projects and Tasks
24. Make Activity entity IDs clickable links
25. Add export options to Analytics (CSV/PDF)

### P3 — Low Priority / Polish

26. Replace IDP text icons with SVG brand logos
27. Add password strength indicator on signup
28. Add "Remember me" on login
29. Add cookie consent banner to marketing pages
30. Add emoji picker to Messages
31. Add tooltips using a proper component instead of browser native `title`
32. Remove unused chart components (line-chart, stacked-area-chart)
33. Add `prefers-reduced-motion` check for auth blob animations
34. Split large files (Project Detail 16k, Task Detail 17k, Profile 16k, Landing 19k)

---

*End of audit. Total issues identified: 85+*
