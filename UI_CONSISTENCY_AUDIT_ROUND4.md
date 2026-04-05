# OrbisPM — UI Consistency Audit Round 4

## Focus: Viewport, Card Fill, Pagination, Server-Side Filtering

**Date:** 2026-04-05  
**Files audited:** 30 (all pages, list components, stores, API client, pagination component)  
**Backend handlers verified:** 5 key endpoints

---

## Severity Legend

| Severity    | Meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| 🔴 CRITICAL | Missing pagination or unbounded data fetch — blocks at scale  |
| 🟠 HIGH     | Client-side filtering on large dataset — degrades UX at scale |
| 🟡 MEDIUM   | Missing sort/filter params or card-fill issues                |
| 🟢 LOW      | Acceptable with minor improvement opportunity                 |

---

## Summary

| Category    | Issues |
| ----------- | ------ |
| 🔴 CRITICAL | 5      |
| 🟠 HIGH     | 7      |
| 🟡 MEDIUM   | 6      |
| 🟢 LOW      | 2      |
| **TOTAL**   | **20** |

---

## Compliant Pages (No Action Required)

| Page                          | Pagination                      | Search/Filter                               | Virtual Scroll       | Notes                        |
| ----------------------------- | ------------------------------- | ------------------------------------------- | -------------------- | ---------------------------- |
| Dashboard                     | N/A                             | ✅ Time range                               | ✅ VirtualScrollList | Analytics page, no lists     |
| Projects                      | ✅ Server-side (20/page)        | ✅ Server-side (status, team, search, sort) | N/A                  | Gold standard                |
| Teams                         | ✅ Server-side (20/page)        | ✅ Server-side (status, search, sort)       | N/A                  | Gold standard                |
| Search                        | ✅ Server-side (25/page)        | ✅ Server-side (query, debounced)           | N/A                  | Dual pagination              |
| Calendar                      | N/A (grid view)                 | ✅ Server-side (status, priority, assignee) | N/A                  | Date-range spatial           |
| Performance (all 4 sub-pages) | N/A                             | ✅ Time range                               | ✅ VirtualScrollList | Analytics pages              |
| Messages                      | Progressive                     | ✅ Channel filter                           | ✅ Infinite scroll   | Chat interface               |
| Settings (tabs container)     | N/A                             | N/A                                         | N/A                  | Tab navigation only          |
| API Keys Tab                  | N/A                             | N/A                                         | N/A                  | Always <20 items             |
| Webhooks Tab                  | N/A                             | N/A                                         | N/A                  | Always <20 items             |
| Permissions Tab               | N/A                             | ✅ Search                                   | N/A                  | Always <50 roles             |
| Email Templates Tab           | N/A                             | N/A                                         | N/A                  | Fixed 8 templates            |
| Profile                       | N/A                             | N/A                                         | N/A                  | Form page                    |
| Task List View                | ✅ Server-side (25/page via WS) | ✅ Server-side (sort, search, filters)      | N/A                  | WebSocket-based              |
| Task Tree View                | N/A (tree)                      | ✅ Global filter                            | N/A                  | Hierarchical expand/collapse |

---

## Issues

---

### ISSUE 1 — My Tasks: Client-Side Pagination of Hardcoded 200-Item Fetch

**Severity:** 🔴 CRITICAL  
**File:** `frontend/src/app/[orgSlug]/my-tasks/page.tsx`  
**Lines:** ~47, ~195

**Current behavior:**

```typescript
// Line ~47: Always fetches 200 items regardless of current page
const queryParams = {
  limit: 200,
  offset: 0,
  status: statusFilter || undefined,
  priority: priorityFilter || undefined,
  search: search.trim() || undefined,
};
```

- Fetches fixed batch of 200 tasks, applies client-side filtering + pagination (20/page)
- If user has >200 tasks, they are silently missing
- Grouped view has NO pagination at all

**Backend status:** `GET /api/v1/orgs/{orgId}/dashboard/my-tasks` already supports `limit`, `offset`, `status`, `priority`, `search` ✅

**Required fix:**

- Change to server-side pagination: `limit: PAGE_SIZE, offset: page * PAGE_SIZE`
- Pass status/priority/search filters to server (already supported)
- Add pagination to grouped view
- Add debounced search
- Add `sort_by`/`sort_order` support (backend has struct fields but unused — needs backend fix too)

---

### ISSUE 2 — My Tasks: Missing Viewport Fill

**Severity:** 🟡 MEDIUM  
**File:** `frontend/src/app/[orgSlug]/my-tasks/page.tsx`  
**Line:** ~195

**Current behavior:**

```typescript
return (
  <div>  // ← No height constraint, content collapses when few items
    <PageHeader ...
```

**Required fix:**

```typescript
return (
  <div className="flex h-full flex-col">
```

---

### ISSUE 3 — Notifications: Client-Side Pagination of Hardcoded 100-Item Fetch

**Severity:** 🔴 CRITICAL  
**File:** `frontend/src/app/[orgSlug]/notifications/page.tsx`  
**Lines:** ~90, ~115-122

**Current behavior:**

```typescript
// Line ~90: Always fetches exactly 100 notifications
queryFn: () => api.notifications.list(orgId, "limit=100"),

// Lines ~115-122: Client-side filter + paginate
const filtered = all.filter(n => filter === "all" || ...);
const totalNotifPages = Math.ceil(filtered.length / NOTIF_PAGE_SIZE);
const pagedNotifs = filtered.slice(page * NOTIF_PAGE_SIZE, (page + 1) * NOTIF_PAGE_SIZE);
```

- If user has >100 notifications, older ones are silently missing
- Read/unread filter applied client-side only

**Backend status:** `GET /api/v1/notifications` supports `limit`, `offset` only.  
**Backend gaps:** Missing `filter` (read/unread), `sort_by`, `sort_order` params.

**Required fix:**

- Frontend: Convert to server-side pagination with `limit=20&offset=${page*20}&filter=${filter}`
- Backend: Add `filter` (read/unread/all) param to handler + repository query
- Backend: Add `sort_by`, `sort_order` support

---

### ISSUE 4 — Activity: Client-Side Pagination of Hardcoded 200-Item Fetch

**Severity:** 🔴 CRITICAL  
**File:** `frontend/src/app/[orgSlug]/activity/page.tsx`  
**Lines:** ~78-85, ~158-160

**Current behavior:**

```typescript
// Line ~78: Always fetches 200 items
const FETCH_LIMIT = 200;
queryFn: () => api.activity.list(currentOrg!.id, `limit=${FETCH_LIMIT}&offset=0`),

// Lines ~95-130: All filtering done client-side
const filtered = useMemo(() => {
  return all.filter(a => {
    if (search && !a.description.includes(search)) return false;
    if (actionFilter && a.action !== actionFilter) return false;
    if (entityTypeFilter && a.entity_type !== entityTypeFilter) return false;
    return true;
  });
}, [...]);

// Lines ~158-160: Client-side pagination
const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
```

**Backend status:** `GET /api/v1/orgs/{orgId}/activity` supports `limit`, `offset`, `entity_type`, `entity_id`.  
**Backend gaps:** Missing `search`, `action`, `sort_by`, `sort_order` params.

**Required fix:**

- Frontend: Convert to server-side pagination `limit=50&offset=${page*50}`
- Frontend: Pass `entity_type` and `action` filters as query params
- Backend: Add `search`, `action`, `sort_by`, `sort_order` to handler + repository

---

### ISSUE 5 — Templates: No Pagination At All (Backend & Frontend)

**Severity:** 🔴 CRITICAL  
**File:** `frontend/src/app/[orgSlug]/templates/page.tsx`  
**Lines:** ~128, ~141-148

**Current behavior:**

```typescript
// Line ~128: Fetches ALL templates (no params)
queryFn: () => api.templates.list(currentOrg!.id),

// Lines ~141-148: Client-side filter + paginate
const filtered = useMemo(() => {
  const all = templates?.data || [];
  return all.filter(t => {
    if (search && !t.name.includes(search)) return false;
    if (sharedFilter === "shared" && !t.is_shared) return false;
    ...
  });
}, [...]);
```

**Backend status:** `GET /api/v1/orgs/{orgId}/templates` has **NO query params** at all.  
**Backend handler:** Returns all templates without pagination.

**Required fix:**

- Backend: Add `limit`, `offset`, `search`, `shared` params to template handler + repo
- Frontend: Convert to server-side pagination
- Frontend API client: Add params argument to `templates.list()`

---

### ISSUE 6 — Members Tab: No Pagination (Backend Ignores Declared Params)

**Severity:** 🔴 CRITICAL  
**File:** `frontend/src/app/[orgSlug]/settings/_components/members-tab.tsx`  
**Lines:** ~200, ~350

**Current behavior:**

```typescript
// Line ~200: Fetches ALL members
queryFn: () => api.members.list(currentOrg!.id),

// Line ~350: Renders all members in single table
{memberList.map((m: OrgMember) => (
  <tr key={m.id}>...
```

- No pagination controls
- No search filtering (just client-side via `searchQuery`)
- All members rendered in one table

**Backend status:** Swagger declares `limit`, `offset` but handler **ignores them**. Returns all members.

**Required fix:**

- Backend: Parse and use `limit`, `offset`, `search` params (handler + repo)
- Frontend: Add `page` state, pass params to API, add Pagination component
- Frontend API client: Add params to `members.list()`

---

### ISSUE 7 — Templates Page: Card Container Doesn't Fill Width

**Severity:** 🟡 MEDIUM  
**File:** `frontend/src/app/[orgSlug]/templates/page.tsx`  
**Line:** ~194

**Current behavior:** Card grid container doesn't ensure full-width fill with 1 item.

**Required fix:** Add `min-h-[...]` or flex-1 to ensure card area fills available space even with 1 template.

---

### ISSUE 8 — Activity Page: Missing Server-Side Search

**Severity:** 🟠 HIGH  
**File:** `frontend/src/app/[orgSlug]/activity/page.tsx`

Search, action filter, and entity type filter are all client-side only. With 200+ activity logs this creates poor UX and incomplete results.

**Required fix:** Pass `search`, `action`, `entity_type` as query params to API. Requires backend changes (see Issue 4).

---

### ISSUE 9 — My Tasks: Sort Not Server-Side

**Severity:** 🟠 HIGH  
**File:** `frontend/src/app/[orgSlug]/my-tasks/page.tsx`

No `sort_by`/`sort_order` params sent to server. Backend `TaskFilter` struct has `SortBy`/`SortOrder` fields but they're unused in `ListByOrgAndAssignee()`.

**Required fix:**

- Frontend: Add sort controls and pass `sort_by`, `sort_order` params
- Backend: Use `SortBy`/`SortOrder` fields in `ListByOrgAndAssignee()` query builder

---

### ISSUE 10 — Notifications: Missing Server-Side Read/Unread Filter

**Severity:** 🟠 HIGH  
**File:** `frontend/src/app/[orgSlug]/notifications/page.tsx`  
**Backend:** `notification_handler.go`, `notification_repo.go`

Read/unread filter applied client-side only. Backend doesn't support `filter` param.

**Required fix:**

- Backend: Add `filter` param (all/read/unread) to handler; add WHERE clause to repo query
- Frontend: Pass filter as query param instead of client-side `.filter()`

---

### ISSUE 11 — Task Columns (Kanban): No Virtual Scroll Per Column

**Severity:** 🟠 HIGH  
**File:** `frontend/src/components/tasks/task-columns.tsx`

**Current behavior:** Each kanban column renders all tasks in that status without virtualization. With 50+ tasks per column, DOM becomes heavy.

**Required fix:** Add `useVirtualizer` (TanStack Virtual) per column for vertical scrolling within each status column.

---

### ISSUE 12 — API Client: `templates.list()` Missing Params

**Severity:** 🟠 HIGH  
**File:** `frontend/src/lib/api.ts`

```typescript
templates: {
  list: (orgId: string) =>
    get<ListResponse<Template>>(`${V1}/orgs/${orgId}/templates`),
```

No support for `limit`, `offset`, `search`, `shared` params.

**Required fix:** Add params object argument with query string builder.

---

### ISSUE 13 — API Client: `members.list()` Missing Params

**Severity:** 🟠 HIGH  
**File:** `frontend/src/lib/api.ts`

```typescript
members: {
  list: (orgId: string) =>
    get<ListResponse<OrgMember>>(`${V1}/orgs/${orgId}/members`),
```

No support for `limit`, `offset`, `search` params.

**Required fix:** Add params object argument with query string builder.

---

### ISSUE 14 — API Client: `dashboard.myTasks()` Missing Sort Params

**Severity:** 🟡 MEDIUM  
**File:** `frontend/src/lib/api.ts`

Backend `TaskFilter` struct has `SortBy`/`SortOrder` but `myTasks` endpoint doesn't expose them.

**Required fix:** Add `sort_by`, `sort_order` to the params when backend is updated to use them.

---

### ISSUE 15 — Notifications Page: Missing Debounced Search

**Severity:** 🟡 MEDIUM  
**File:** `frontend/src/app/[orgSlug]/notifications/page.tsx`

No search input for notifications. Users can only filter by read/unread status.

**Required fix:** Add search input with debounce, send to server.

---

### ISSUE 16 — Activity Page: Missing Sort Controls

**Severity:** 🟡 MEDIUM  
**File:** `frontend/src/app/[orgSlug]/activity/page.tsx`

No sort controls. Activity logs are hard-sorted by `created_at DESC` in backend.

**Required fix:** Add sort dropdown (newest first / oldest first) and pass `sort_order` param.

---

### ISSUE 17 — My Tasks: Grouped View Has No Pagination

**Severity:** 🟠 HIGH  
**File:** `frontend/src/app/[orgSlug]/my-tasks/page.tsx`

When viewMode = "grouped", all tasks are rendered in groups without any pagination. If a group has 100+ tasks, the view becomes unusable.

**Required fix:** Add pagination per group or overall pagination for grouped view.

---

### ISSUE 18 — Members Tab: Missing Search Server-Side

**Severity:** 🟡 MEDIUM  
**File:** `frontend/src/app/[orgSlug]/settings/_components/members-tab.tsx`

Client-side search in members tab. Should be passed to backend as `search` param.

**Required fix:** Debounce search input, include in API query params.

---

### ISSUE 19 — Calendar: Large Multi-Project Fetch

**Severity:** 🟢 LOW  
**File:** `frontend/src/app/[orgSlug]/calendar/page.tsx`

Fetches tasks from ALL selected projects with `limit: 200` per project. If user has 10 projects × 200 tasks = 2000 tasks loaded into memory.

**Required fix:** Consider server-side aggregated calendar endpoint or limit visible projects.

---

### ISSUE 20 — Messages: Viewport Height Inconsistency

**Severity:** 🟢 LOW  
**File:** `frontend/src/app/[orgSlug]/messages/page.tsx`

Uses `h-[calc(100vh-5rem)]` while org layout provides `h-[calc(100vh-3.5rem)]`. The extra 1.5rem difference means 24px of the messages area is cut off.

**Required fix:** Use `h-full` instead, since the parent already constrains height.

---

## Backend Changes Required

| Endpoint                            | File                                               | Changes Needed                                                 |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `GET /notifications`                | `notification_handler.go` + `notification_repo.go` | Add `filter` (read/unread/all), `sort_by`, `sort_order` params |
| `GET /orgs/{id}/activity`           | `activity_handler.go` + `activity_repo.go`         | Add `search`, `action`, `sort_by`, `sort_order` params         |
| `GET /orgs/{id}/templates`          | `template_handler.go` + `template_repo.go`         | Add `limit`, `offset`, `search`, `shared` params               |
| `GET /orgs/{id}/members`            | `org_handler.go` + `org_member_repo.go`            | Parse & use `limit`, `offset`, `search` params                 |
| `GET /orgs/{id}/dashboard/my-tasks` | `dashboard_handler.go` + `task_repo.go`            | Use existing `SortBy`/`SortOrder` fields in query builder      |

---

## Implementation Priority

### Phase 1 — Backend Pagination (Must Do First)

1. **Templates endpoint** — Add limit/offset/search/shared
2. **Members endpoint** — Parse and use limit/offset/search
3. **Notifications endpoint** — Add filter param
4. **Activity endpoint** — Add search/action/sort params
5. **My Tasks endpoint** — Wire SortBy/SortOrder in query builder

### Phase 2 — Frontend Server-Side Pagination

6. **My Tasks page** — Convert to server-side pagination
7. **Notifications page** — Convert to server-side pagination + filter
8. **Activity page** — Convert to server-side pagination + filters
9. **Templates page** — Convert to server-side pagination
10. **Members tab** — Add pagination + search

### Phase 3 — Viewport & Card Fill

11. **My Tasks** — Add `h-full flex flex-col` wrapper
12. **Templates** — Ensure card fills viewport
13. **Messages** — Fix height calc inconsistency

### Phase 4 — Virtual Scroll

14. **Task Columns (Kanban)** — Add per-column virtualization

---

## Reference: Gold Standard Implementation

**Projects page** (`frontend/src/app/[orgSlug]/projects/page.tsx`) is the reference implementation for proper server-side pagination:

```typescript
const PAGE_SIZE = 20;
const [page, setPage] = useState(0);
const [search, setSearch] = useState("");
const [debouncedSearch] = useDebounce(search, 300);
const [sortBy, setSortBy] = useState("updated_at");
const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
const [statusFilter, setStatusFilter] = useState("");

const { data, isLoading } = useQuery({
  queryKey: ["projects", orgId, page, debouncedSearch, sortBy, sortOrder, statusFilter],
  queryFn: () => api.projects.list(orgId, {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
  }),
});

// Reset page on filter change
useEffect(() => setPage(0), [debouncedSearch, statusFilter]);

// Render with pagination
<Pagination
  page={page}
  totalPages={Math.ceil((data?.total || 0) / PAGE_SIZE)}
  total={data?.total || 0}
  pageSize={PAGE_SIZE}
  onPageChange={setPage}
/>
```

All pages with dynamic lists should follow this pattern.
