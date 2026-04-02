# OrbisPM — Comprehensive Improvement Plan

> **Goal:** Sub-30ms page loads (cache-hit), graceful sub-200ms renders on cache miss, zero regressions.  
> **Date:** 2026-04-02 | **Version:** 1.0  
> **Priority:** P0 = blocking, P1 = high, P2 = medium, P3 = nice-to-have

---

## Table of Contents

1. [Performance — Critical Path (P0)](#1-performance--critical-path-p0)
2. [Performance — Database & Backend (P1)](#2-performance--database--backend-p1)
3. [Performance — Frontend (P1)](#3-performance--frontend-p1)
4. [Bug Fixes (P0–P1)](#4-bug-fixes)
5. [Architecture Improvements (P2)](#5-architecture-improvements)
6. [Security Hardening (P1)](#6-security-hardening)
7. [New Features (P2–P3)](#7-new-features)
8. [Observability & DevEx (P2)](#8-observability--devex)
9. [Implementation Roadmap](#9-implementation-roadmap)

---

## 1. Performance — Critical Path (P0)

### 1.1 Frontend: All Pages Are Client Components — No Server-Side Rendering

**Problem:** Every page under `[orgSlug]/` is `"use client"`. The user sees a blank screen until JS hydrates + auth token is verified + API call completes. On a 100ms RTT connection this means **400–800ms TTFB** before any content.

**Target:** `< 30ms` to first paint using cached data, `< 200ms` on cache miss via RSC streaming.

**Fix Plan:**

- Convert dashboard, projects, teams, my-tasks pages to **React Server Components** that stream skeleton shells instantly.
- Move TanStack Query data fetching to **server-side `prefetchQuery`** in RSC layout, so the client receives pre-fetched data in the HTML dehydration payload.
- Pattern:

  ```tsx
  // app/[orgSlug]/projects/page.tsx  (RSC)
  import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
  } from "@tanstack/react-query";

  export default async function ProjectsPage({ params }) {
    const qc = new QueryClient();
    await qc.prefetchQuery({
      queryKey: ["projects", orgId],
      queryFn: () => serverFetchProjects(orgId),
    });
    return (
      <HydrationBoundary state={dehydrate(qc)}>
        <ProjectsClient />
      </HydrationBoundary>
    );
  }
  ```

- Auth token for server fetches: read from cookies (Next.js `cookies()` API), not `localStorage`.

**Files to change:** `src/app/[orgSlug]/page.tsx`, `src/app/[orgSlug]/projects/page.tsx`, `src/app/[orgSlug]/my-tasks/page.tsx`, `src/app/[orgSlug]/teams/page.tsx`, `src/app/layout.tsx`.

---

### 1.2 Frontend: `staleTime = 0` on Most Queries — Always Refetches

**Problem:** TanStack Query default `staleTime` is `0`, meaning every component mount triggers a background refetch. The DataPrefetcher uses custom `stale` values but individual page queries do not. Every route navigation → refetch all queries.

**Fix Plan:**

- Set a global default `staleTime` of `30_000` (30s) in `QueryClient` configuration:
  ```ts
  // src/lib/query-client.ts
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // 30 seconds — matches backend Cache-Control max-age
        gcTime: 24 * 60 * 60 * 1000, // 24h IDB persistence
        retry: 1,
      },
    },
  });
  ```
- This alone eliminates most redundant API calls.

**Files to change:** `src/app/providers.tsx` (or wherever `QueryClient` is created).

---

### 1.3 Frontend: My-Tasks Fetches 500 Tasks Client-Side — Move Filtering to Server

**Problem:** `my-tasks/page.tsx` fetches 500 tasks then client-side filters + paginates. On a large org this is a slow, large payload.

**Fix Plan:**

- Add server-side filtering params to `GET /orgs/{orgId}/dashboard/my-tasks`:
  ```
  ?status=todo&priority=high&search=fix+bug&limit=20&offset=0
  ```
- Backend already has `TaskFilter` and pagination support in `ListByOrgAndAssignee` — extend it.
- Frontend: pass filter state as query key params, use `keepPreviousData: true` for smooth pagination.

**Files to change:** `backend/internal/handler/dashboard_handler.go`, `backend/internal/service/task_service.go`, `frontend/src/app/[orgSlug]/my-tasks/page.tsx`.

---

### 1.4 Backend: Dashboard Stats Has No Redis Cache — Runs Aggregate SQL Every Request

**Problem:** `GET /orgs/{orgId}/dashboard/stats` executes multiple aggregate SQL queries on every call. It uses only HTTP Cache-Control (30s max-age) which the frontend API client bypasses with `cache: "no-store"`.

**Fix Plan:**

- Add Redis-backed caching in `DashboardService.GetStats()`:

  ```go
  const dashboardCacheTTL = 30 * time.Second
  key := fmt.Sprintf("dash:stats:%s:%s", orgID, userID)

  // Try cache first
  if cached, err := rdb.Get(ctx, key).Bytes(); err == nil {
      var stats DashboardStats
      json.Unmarshal(cached, &stats)
      return &stats, nil
  }
  // Compute then cache
  stats, err := s.computeStats(ctx, orgID, userID)
  data, _ := json.Marshal(stats)
  rdb.Set(ctx, key, data, dashboardCacheTTL)
  return stats, nil
  ```

- Invalidate dashboard cache on task create/update/delete (already publishing Redis events — add invalidation there).

**Files to change:** `backend/internal/service/billing_service.go` (DashboardService), `backend/cmd/api/main.go` (inject Redis into DashboardService).

---

### 1.5 Backend: Task Tree Fetch Via WebSocket Adds WS Round-Trip Latency

**Problem:** When opening a project, the frontend waits for:

1. WS connection handshake
2. WS `task:tree` message sent
3. DB query + cache load
4. Response routed back

This adds 100–400ms. On cache miss (first open) it triggers `PreloadProjectCache` synchronously.

**Fix Plan:**

- Serve the task tree via a regular HTTP REST endpoint (`GET /tasks/tree` already exists) for the **initial page load**. Use WebSocket only for real-time delta updates after initial load.
- Pre-warm the project cache asynchronously via an Asynq job triggered when a project is created or a user navigates to it — not on the hot request path.
- In the RSC server component, call `GET /tasks/tree` server-side so the tree arrives with the initial HTML.

---

### 1.6 Frontend: DataPrefetcher Fires 8+ Sequential Network Requests Post-Mount

**Problem:** `DataPrefetcher` calls `qc.prefetchQuery` 8+ times sequentially inside a single `useEffect`. While TanStack Query batches them at the browser level, `ensureValidToken()` called before each `fetch` in the `api` client adds serialization.

**Fix Plan:**

- Use `Promise.all` or `qc.prefetchInfiniteQuery` batching:
  ```ts
  await Promise.all([
    pf(["dashboard-stats", orgId], ...),
    pf(["projects", orgId], ...),
    pf(["teams", orgId], ...),
    // ...
  ]);
  ```
- Verify `ensureValidToken()` uses the shared `refreshPromise` guard (it does — but each parallel fetch should share one refresh, not queue).

---

## 2. Performance — Database & Backend (P1)

### 2.1 Missing Covering Index for Task Tree Queries

**Problem:** `ListTreeByProject` queries `WHERE project_id = $1 ORDER BY depth, position, created_at`. The index `idx_tasks_project` covers `(org_id, project_id)` — PostgreSQL can use it but must then heap-fetch every row to get `depth, position, created_at` for sorting (no index-only scan).

**Fix:**

```sql
-- Migration 000028
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_project_tree
    ON tasks (project_id, depth, position, created_at)
    INCLUDE (id, parent_task_id, title, status, priority, assignee_id, assignee_ids, due_date, labels, version);
```

This enables an index-only scan for tree queries — eliminates all heap fetches.

---

### 2.2 Missing Index for My-Tasks Query (ListByOrgAndAssignee)

**Problem:** `ListByOrgAndAssignee` uses `WHERE org_id=$1 AND ($2 = ANY(assignee_ids) OR assignee_id=$2)`. The `ANY(assignee_ids)` cannot use a standard B-tree index on `assignee_ids`.

**Fix:**

```sql
-- Add GIN index for multi-assignee lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_assignee_ids_gin
    ON tasks USING GIN(assignee_ids);

-- Add index for primary assignee column
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_assignee_org
    ON tasks (org_id, assignee_id) WHERE assignee_id IS NOT NULL;
```

---

### 2.3 N+1 Queries in Task Create — Multiple Sequential GetByID Calls

**Problem:** `TaskService.Create()` calls `s.taskRepo.GetByID()` for the parent task, then again `s.taskRepo.GetByID()` in the deadline-conflict loop, then `GetAncestors`. That's 3+ serial DB round-trips before the INSERT.

**Fix:**

- Fetch parent once, reuse in both the depth check and deadline-conflict check.
- Combine `GetAncestors` + the parent fetch into a single CTE query that returns the parent + all ancestors in one round-trip.

---

### 2.4 DB Constraint Mismatch: `depth <= 5` vs Domain `MaxTaskDepth = 3`

**Problem:** `000001_init_schema.up.sql` has `CHECK (depth >= 0 AND depth <= 5)` but `domain.MaxTaskDepth = 3` and migration `000004_task_depth_limit` presumably tightens it. If migration 000004 is not applied (new DB), tasks at depth 4–5 can be created, bypassing domain logic.

**Fix:**

```sql
-- Migration 000028 (or add to 000004)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_depth_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_depth_check CHECK (depth >= 0 AND depth <= 3);
```

---

### 2.5 Rate Limiter Has Unbounded Memory Growth

**Problem:** `middleware/rate_limit.go` stores one `*rate.Limiter` per IP in `map[string]*rate.Limiter` — never evicted. A high-traffic server with many unique IPs will leak memory indefinitely.

**Fix:**

- Use `golang.org/x/time/rate` with an LRU eviction map, or use `github.com/throttled/throttled` with Redis backend for distributed rate limiting that survives restarts.
- Simplest: add a background goroutine that prunes the map every 10 minutes.

```go
func (rl *RateLimiter) startEviction() {
    go func() {
        ticker := time.NewTicker(10 * time.Minute)
        for range ticker.C {
            rl.mu.Lock()
            // rebuild with only recently-used entries
            rl.limiters = make(map[string]*rate.Limiter)
            rl.mu.Unlock()
        }
    }()
}
```

---

### 2.6 PgBouncer Connection Pool: No PgBouncer in Local Dev / Docker

**Problem:** `docker-compose.yaml` connects the Go API directly to PostgreSQL. In production RDS is fronted by PgBouncer (confirmed by `poolCfg.MaxConns = 25` comment). Without PgBouncer in dev, `AfterConnect` SET statements are fine in dev but the pool behavior diverges significantly.

**Fix:**

- Add PgBouncer container to `docker-compose.yaml` profile so dev mirrors production connection routing.
- Set `server_reset_query = DISCARD ALL` in pgbouncer.ini for transaction mode.

---

### 2.7 No ETags / Conditional GET Support

**Problem:** Backend returns full JSON bodies on every GET, even if data hasn't changed. Clients always receive full payloads.

**Fix:**

- Add ETag middleware using MD5/CRC32 of response body:
  ```go
  // Add to middleware chain, after CacheControl
  func ETag(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          rec := newResponseRecorder(w)
          next.ServeHTTP(rec, r)
          hash := fmt.Sprintf("%x", crc32.ChecksumIEEE(rec.body))
          if r.Header.Get("If-None-Match") == hash {
              w.WriteHeader(http.StatusNotModified)
              return
          }
          w.Header().Set("ETag", hash)
          w.Write(rec.body)
      })
  }
  ```
- Priority endpoints: `/dashboard/stats`, `/projects`, `/teams`, `/members`.

---

### 2.8 Analytics Tables Grow Unbounded — No Time Partitioning

**Problem:** `task_state_transitions` and `analytics_events` are plain heap tables. After 6+ months of use they will have millions of rows, degrading any aggregation query.

**Fix:**

```sql
-- Convert to range-partitioned by month
CREATE TABLE task_state_transitions_2026_04
    PARTITION OF task_state_transitions
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- Or use pg_partman for automatic partition management
```

- Alternatively: add a rolling 90-day retention policy via Asynq scheduled job that DELETEs rows older than the window.

---

## 3. Performance — Frontend (P1)

### 3.1 No `prefetch` on Link Hover for Project/Team Pages

**Problem:** Next.js 15 disables automatic prefetch on hover by default (it was opt-in). Clicking a project link always incurs the full page load time.

**Fix:** Add `prefetch={true}` to high-frequence `<Link>` components in the sidebar and project list:

```tsx
<Link href={`/${orgSlug}/projects/${project.id}`} prefetch={true}>
```

Also: add `loading.tsx` files to all routes that don't have them for instant skeleton display.

---

### 3.2 Large Bundle: No `optimizePackageImports` in next.config.ts

**Problem:** Lucide-react, recharts, and tiptap are imported with named imports but not tree-shaken optimally.

**Fix:**

```ts
// next.config.ts
experimental: {
  optimizePackageImports: ["lucide-react", "recharts", "@tiptap/react"],
}
```

This converts named imports to barrel-optimized individual module imports, reducing bundle by ~30–50KB.

---

### 3.3 Dynamic Imports With Heavy Charting Libraries Not Preloaded

**Problem:** `DonutChart`, `AreaChartWidget`, `HealthRing` are all dynamically imported on Dashboard page. When the Dashboard is the first page a user sees (most common case), these all delay visible render.

**Fix:**

- Add `<link rel="modulepreload">` hints in the layout `<head>` for chart chunks.
- Or promote the most-used chart (DonutChart) back to static import if bundle allows.
- Use `priority` shimming with Suspense boundaries that show meaningful skeleton data.

---

### 3.4 Task Tree View Re-Fetches on Every Mount via WebSocket

**Problem:** `TaskTreeView` calls `fetchTree()` (→ `send("task:tree")`) on every mount, including:

- Switching tabs within a project (Dashboard → Tasks → back to Tasks)
- Any parent re-render that unmounts/remounts the tree

**Fix:**

- Store `taskTree` in Zustand with a `lastFetchedAt` timestamp.
- Only re-fetch if `Date.now() - lastFetchedAt > 30_000` (30s stale threshold).
- On WS reconnect, force full refresh.

---

### 3.5 Auth Layout Is a Client Component with Render-Blocking Auth Check

**Problem:** `[orgSlug]/layout.tsx` is `"use client"` and calls `useRequireAuth()` which redirects if not authenticated. This means:

1. Browser downloads and parses the JS bundle
2. Runs the auth check (reads localStorage)
3. If unauthenticated: redirects to `/login`

Users see blank screen while this happens.

**Fix:**

- Move the auth guard to `middleware.ts` (already exists!) using JWT verification via `jose` or a simple `Authorization` cookie check before serving the page:
  ```ts
  // middleware.ts
  export function middleware(req: NextRequest) {
    const token = req.cookies.get("access_token")?.value;
    if (!token && !req.nextUrl.pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }
  ```
- Store access_token in an `httpOnly` cookie (set by the backend `/auth/refresh` endpoint) in addition to localStorage for middleware access.

---

### 3.6 Sidebar `useOrgPolicies()` Called Inside Highly Re-Rendered Component

**Problem:** `Sidebar()` calls `useOrgPolicies()` which issues a query for permission roles. The Sidebar renders on every navigation. While TanStack Query deduplicates network requests, the selector logic runs on every render.

**Fix:**

- Hoist `useOrgPolicies()` to the layout level and pass as prop (or use a stable Zustand selector).
- Memoize `filteredSettings` with `useMemo`.

---

## 4. Bug Fixes

### BUG-01 (P0): `X-Forwarded-For` Trusted Without Validation in Rate Limiter

**File:** `backend/internal/middleware/rate_limit.go:57`

**Problem:**

```go
if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
    ip = forwarded
}
```

Any client can spoof `X-Forwarded-For: 1.2.3.4` to bypass per-IP rate limiting.

**Fix:**

- Only trust `X-Forwarded-For` if the request comes from a known trusted proxy (Kong/load balancer CIDR).
- Use only the **last** non-private IP in the chain:

```go
func getRealIP(r *http.Request) string {
    xff := r.Header.Get("X-Forwarded-For")
    if xff != "" {
        ips := strings.Split(xff, ",")
        for i := len(ips) - 1; i >= 0; i-- {
            ip := strings.TrimSpace(ips[i])
            if !isPrivateIP(ip) {
                return ip
            }
        }
    }
    host, _, _ := net.SplitHostPort(r.RemoteAddr)
    return host
}
```

---

### BUG-02 (P0): Rate Limiter Map Never Evicted — Memory Leak

**File:** `backend/internal/middleware/rate_limit.go`  
**Problem:** See §2.5 above. `limiters` map grows without bound.  
**Fix:** Add LRU eviction or periodic cleanup (see §2.5).

---

### BUG-03 (P1): Dashboard Stats Not Invalidated After Task Mutations

**File:** `frontend/src/app/[orgSlug]/projects/page.tsx` (and task mutations across the app)  
**Problem:** When a task is created/updated/deleted, `qc.invalidateQueries(["projects"])` is called but `["dashboard-stats", orgId]` is NOT always invalidated. The dashboard shows stale counts.  
**Fix:** Add `qc.invalidateQueries({ queryKey: ["dashboard-stats", orgId] })` to all task mutation `onSuccess` handlers.

---

### BUG-04 (P1): `depth CHECK` Constraint in DB Allows Depth 4–5

**File:** `backend/db/migrations/000001_init_schema.up.sql:78`  
**Problem:** `CHECK (depth >= 0 AND depth <= 5)` — if migration 000004 hasn't been run on a fresh DB, the constraint allows depth 4–5 bypassing domain enforcement.  
**Fix:** See §2.4.

---

### BUG-05 (P1): `staleTime` Unset in My-Tasks Query — Refetches on Every Route Visit

**File:** `frontend/src/app/[orgSlug]/my-tasks/page.tsx:60`  
**Problem:**

```ts
const { data: myTasks, isLoading } = useQuery({
  queryKey: ["my-tasks", orgId],
  queryFn: () => api.dashboard.myTasks(orgId, 500),
  enabled: !!orgId,
  // NO staleTime — defaults to 0 → refetches every mount
});
```

**Fix:** Add `staleTime: 30_000` or use the global default (§1.2).

---

### BUG-06 (P1): Project Detail Page Tasks Tab Always Re-Fetches Tree on Tab Switch

**File:** `frontend/src/components/tasks/task-tree-view.tsx`  
**Problem:** `fetchTree()` is called in `useEffect([fetchTree])` — every Sidebar tab switch that unmounts/remounts `TaskTreeView` fires a full WS tree request.  
**Fix:** Zustand `lastFetchedAt` guard (§3.4).

---

### BUG-07 (P2): `api.ts` Sends `X-Org-ID` Header Only for `/chat` Paths

**File:** `frontend/src/lib/api.ts:121`  
**Problem:**

```ts
if (orgId && path.startsWith(`${V1}/chat`)) {
  headers["X-Org-ID"] = orgId;
}
```

But backend RBAC middleware (`rls_tenant.go`) uses `X-Org-ID` to establish org context for RLS. If a non-chat endpoint is hit without this header and the JWT doesn't embed org, the RLS `app.current_org_id` may be unset — potentially allowing cross-tenant data leakage.  
**Fix:** Send `X-Org-ID` on **all** authenticated requests:

```ts
const orgId = localStorage.getItem("current_org_id");
if (orgId) headers["X-Org-ID"] = orgId;
```

---

### BUG-08 (P2): DataPrefetcher Runs for Every `orgRole` Change Including Initial Load

**File:** `frontend/src/components/data-prefetcher.tsx`  
**Problem:** `ranForKey.current` guard is keyed on `${orgId}:${orgRole}`. On initial load, `orgRole` may briefly be `undefined` then resolve to the real role — causing the prefetcher to run twice: once with `undefined` key then once with the real role.  
**Fix:** Add `if (!orgId || !orgRole || ...)` guard before running prefetches.

---

### BUG-09 (P2): `ListByOrg` (non-paginated) Used in Permission Resolver

**File:** `backend/internal/service/permission_resolver.go`  
**Problem:** Permission resolver calls un-paginated `ListByOrg` variants (teams, projects) to build membership maps. On a large org with 1000+ projects, this loads all projects into memory on every permission check.  
**Fix:** Replace with targeted queries:

- `IsProjectMember(ctx, projectID, userID) bool` — single indexed SELECT
- `IsTeamMember(ctx, teamID, userID) bool` — single indexed SELECT  
  These should already be cached via Redis `PermissionCacheTTL=5min` — verify the cache is actually populated in the hot path.

---

### BUG-10 (P2): WebSocket Hub Has No Heartbeat — Silent Disconnects

**File:** `backend/internal/websocket/project_hub.go`  
**Problem:** No explicit ping/pong frames sent. Mobile browsers and corporate proxies close idle WS connections after 30–60s. The client-side `useOrgSocket` / `useProjectSocket` hooks may not detect this, leaving stale connections.  
**Fix:** Add server-side ping every 30s:

```go
ticker := time.NewTicker(30 * time.Second)
for {
    select {
    case <-ticker.C:
        conn.Conn.Ping(ctx)
    case <-conn.done:
        return
    }
}
```

---

### BUG-11 (P2): `cache.go` Middleware Uses `strings.Contains` Path Matching

**File:** `backend/internal/middleware/cache.go`  
**Problem:** Every GET request runs 10+ `strings.Contains` checks in a switch. While fast, this is fragile and has ordering bugs (e.g., `/orgs/{id}/projects/{id}/tasks` matches both the `/tasks` case AND the `/orgs` org-data case depending on order).  
**Fix:** Use Chi's `RouteContext` pattern matching or a pre-built path prefix trie. Or map endpoints explicitly to their cache policy at route registration.

---

### BUG-12 (P3): `toasts.success` Not Shown on Task Status Update in Tree View

**File:** `frontend/src/components/tasks/task-tree-view.tsx`  
**Problem:** `handleUpdate()` calls `send("task:update")` and calls `fetchTree()` on success but no toast is shown. User gets no feedback that the update succeeded.  
**Fix:** Add `toast.success("Task updated")` in the success path.

---

## 5. Architecture Improvements

### 5.1 (P1) Add Redis-Backed Response Cache Layer for Hot Endpoints

For endpoints like `/dashboard/stats`, `/projects`, `/teams`, implement a generic Redis response cache middleware:

```go
// middleware/redis_cache.go
func RedisCache(rdb *redis.Client, ttl time.Duration, keyFn func(*http.Request) string) func(http.Handler) http.Handler
```

- Key: `rc:{orgID}:{path}:{queryHash}`
- Invalidation: publish a cache-bust event via Redis Pub/Sub when mutations happen
- This can achieve **true <30ms responses** for hot endpoints regardless of DB state

---

### 5.2 (P2) Replace Offset Pagination With Cursor-Based Pagination

Current offset pagination (`LIMIT $1 OFFSET $2`) degrades at high offsets (PostgreSQL scans all leading rows). Replace with keyset/cursor pagination:

```sql
WHERE (created_at, id) < ($cursor_ts, $cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT 20
```

Affects: tasks list, activity log, notifications, project members.

---

### 5.3 (P2) Background Cache Warm-Up via Asynq

Currently, project task cache is warmed on first WS connection (blocking the request). Move warm-up to a background Asynq job:

- On project creation: enqueue `TypeWarmProjectCache` job
- On cache miss: serve the DB result immediately AND enqueue the warm-up job asynchronously
- On scheduled basis: re-warm caches for projects with recent activity

---

### 5.4 (P2) Meilisearch Index for My-Tasks and Project Search

Currently, task search uses ILIKE pattern matching in SQL. For large orgs, this is slow.

- Index `tasks` in Meilisearch with `org_id`, `assignee_ids`, `project_id`, `status`, `priority`, `title`, `labels`.
- The search service already exists — extend it for task list search.

---

### 5.5 (P2) Separate Read/Write DB Pool

Add a PostgreSQL read replica connection pool for read-heavy operations:

- Dashboard stats: read replica
- Task tree listing: read replica
- Analytics queries: read replica
- All mutations: primary DB only

Configure via `DATABASE_URL_RO` env var and a second `pgxpool` instance.

---

### 5.6 (P3) Add `generateStaticParams` for Marketing Pages

`app/(marketing)/` pages are fully static content — they should use `export const dynamic = "force-static"` to generate at build time, reducing cold-start latency to zero for unauthenticated users.

---

## 6. Security Hardening

### 6.1 (P0) Fix IP Spoofing in Rate Limiter

See BUG-01 above. This is a security vulnerability — priority P0.

---

### 6.2 (P1) Access Token in localStorage — XSS Risk

**Problem:** Access tokens are stored in `localStorage` (`getToken()` in `api.ts`). XSS attacks can steal tokens.  
**Fix:**

- Store tokens in `httpOnly; SameSite=Strict` cookies set by the backend.
- API calls are same-origin via the Next.js `rewrites()` proxy in `next.config.ts` — cookies will be sent automatically.
- Remove localStorage token storage, update `getToken()` to rely on cookies.

---

### 6.3 (P1) Missing CSRF Protection

**Problem:** With cookie-based auth (§6.2), CSRF attacks become possible. The current `localStorage`-only auth avoids CSRF but is XSS-vulnerable trade-off.  
**Fix:**

- Add `X-CSRF-Token` header validation in Go middleware for all mutating requests.
- Generate CSRF token server-side, embed in Next.js app shell via a `<meta>` tag, include in all API calls.

---

### 6.4 (P2) Webhook Signature Verification Not Enforced

Check `backend/internal/handler/webhook_handler.go` — if Stripe webhook signature (`stripe.ConstructEvent`) is not verified on all Stripe webhook paths, replay attacks are possible.  
**Ensure:** All Stripe webhook handlers call `webhook.ConstructEvent(body, signature, webhookSecret)`.

---

### 6.5 (P2) No Request Size Limits on Upload Endpoints

Check `backend/internal/handler/upload_handler.go` — ensure `http.MaxBytesReader` is applied before parsing multipart form data to prevent DoS via large file uploads (in addition to Kong-level limits).

---

## 7. New Features

### 7.1 (P1) Realtime Dashboard via WebSocket Push

**Current state:** Dashboard stats are fetched via polling (30s stale-while-revalidate).  
**Proposed:** When any task in the org changes status, the org-level WebSocket hub pushes a lightweight `dashboard:updated` event. Frontend listening via `useOrgSocket` instantly updates the dashboard counters without re-fetching.

---

### 7.2 (P2) Bulk Task Operations API

**Current state:** All task updates are single-item.  
**Proposed:** `PATCH /orgs/{orgId}/projects/{projectId}/tasks/bulk`

```json
{
  "task_ids": ["uuid1", "uuid2"],
  "updates": { "status": "done", "assignee_id": "uuid3" }
}
```

Useful for "mark all as done", "reassign team", "archive sprint tasks".

---

### 7.3 (P2) Task Timeline / Gantt View

Add a Gantt chart view to the project page:

- Backend: tasks already have `start_date`, `due_date`, `depth` — no schema changes needed.
- Frontend: use `@dhtmlx/gantt` or `frappe-gantt` (MIT) rendered via dynamic import.
- Connect to Zustand task store for real-time updates.

---

### 7.4 (P2) Progressive Web App Improvements

- Add `manifest.ts` (already exists) and ensure all icons are correct sizes.
- Add push notification support via Web Push API + Asynq notification worker.
- Currently offline page exists but read-only. Add offline task creation queue that syncs on reconnect.

---

### 7.5 (P3) AI-Powered Task Suggestions (v0.3.0 Prep)

Following the planned MCP Server integration:

- `POST /orgs/{orgId}/projects/{projectId}/tasks/suggest` — LLM-generated subtask breakdown
- `POST /orgs/{orgId}/tasks/{taskId}/summarize` — Tiptap description summarization
- Frontend: "AI Suggest Subtasks" button in task create modal
- Use Asynq for all LLM calls (>500ms budget requirement)

---

### 7.6 (P3) Keyboard Shortcuts & Command Palette Enhancements

Current `CommandPalette` component exists. Extend with:

- `Ctrl+K` global search that queries Meilisearch
- `Ctrl+N` new task from anywhere
- `G D` → navigate to Dashboard
- `G P` → navigate to Projects

---

### 7.7 (P3) Webhook Event Log & Replay UI

Add `GET /orgs/{orgId}/webhooks/{id}/deliveries` endpoint + UI showing recent webhook delivery attempts, HTTP status codes, response bodies, and a "replay" button for failed deliveries.

---

## 8. Observability & DevEx

### 8.1 (P1) Add Structured Request Logging With Duration

**Problem:** `middleware/logger.go` may not log request duration. Without this, identifying slow endpoints in production is guesswork.  
**Fix:** Log `duration_ms`, `status_code`, `path`, `method`, `user_id`, `org_id` on every request using zerolog.

---

### 8.2 (P1) Add Performance Tracing (OpenTelemetry)

- Add `go.opentelemetry.io/otel` spans around:
  - DB queries (pgx instrumentation)
  - Redis operations
  - Asynq task processing
  - Meilisearch calls
- Export to Jaeger or Honeycomb for visualizing where the 500ms is going.

---

### 8.3 (P2) Add `pg_stat_statements` Dashboard

Migration 000024 enables `pg_stat_statements`. Add a protected admin endpoint `GET /admin/slow-queries` that returns top 20 slowest queries. Essential for ongoing performance tuning.

---

### 8.4 (P2) Frontend Web Vitals Tracking

Add `next/third-parties` to send Core Web Vitals (LCP, FID, CLS) to a Prometheus/analytics endpoint:

```ts
// app/layout.tsx
import { GoogleAnalytics } from "@next/third-parties/google"; // or custom endpoint
export function reportWebVitals(metric) {
  fetch("/api/vitals", { method: "POST", body: JSON.stringify(metric) });
}
```

---

### 8.5 (P3) API Documentation Portal

Swagger UI is configured (`/swagger/index.html`). Enhance with:

- Auto-generated Postman collection export
- API versioning strategy (v2 planning)
- OpenAPI spec linting in CI (`oasdiff`)

---

## 9. Implementation Roadmap

### Sprint 1 (Week 1–2) — Critical Performance & Security

| #   | Item                                           | Owner    |
| --- | ---------------------------------------------- | -------- |
| P0  | BUG-01: Fix IP spoofing in rate limiter        | Backend  |
| P0  | §1.1: Convert pages to RSC + HydrationBoundary | Frontend |
| P0  | §1.2: Set global `staleTime: 30_000`           | Frontend |
| P0  | §1.4: Redis cache for dashboard stats          | Backend  |
| P1  | BUG-07: Send `X-Org-ID` on all API requests    | Frontend |
| P1  | §2.1: Add covering index for task tree         | DB       |
| P1  | §2.2: Add GIN index for assignee_ids           | DB       |

### Sprint 2 (Week 3–4) — Performance Depth

| #   | Item                                                     |
| --- | -------------------------------------------------------- |
| P1  | §1.3: Server-side filtering for my-tasks                 |
| P1  | §1.5: HTTP REST for initial task tree (no WS dependency) |
| P1  | §2.5: Rate limiter LRU eviction                          |
| P1  | §3.1: Prefetch on link hover                             |
| P1  | §3.2: `optimizePackageImports` in next.config            |
| P1  | §3.5: Auth guard in middleware.ts                        |
| P1  | BUG-06: TaskTreeView stale-guard                         |

### Sprint 3 (Week 5–6) — Stability & Architecture

| #   | Item                                           |
| --- | ---------------------------------------------- |
| P2  | §5.1: Redis response cache middleware          |
| P2  | §5.2: Cursor-based pagination for task list    |
| P2  | §5.3: Background cache warm-up Asynq job       |
| P2  | §6.2: Move tokens to httpOnly cookies          |
| P2  | §8.1: Structured request logging with duration |
| P2  | §8.2: OpenTelemetry tracing                    |
| P2  | BUG-04: Fix depth CHECK constraint             |
| P2  | BUG-10: WS heartbeat ping/pong                 |

### Sprint 4 (Week 7–8) — New Features

| #   | Item                                    |
| --- | --------------------------------------- |
| P2  | §7.1: Realtime dashboard via WS push    |
| P2  | §7.2: Bulk task operations API + UI     |
| P2  | §7.3: Gantt/timeline view               |
| P2  | §7.4: PWA push notifications            |
| P3  | §7.5: AI task suggestions (v0.3.0 prep) |

---

## Appendix: Performance Benchmark Targets

| Metric                          | Current (estimated) | Target |
| ------------------------------- | ------------------- | ------ |
| Dashboard TTFB (warm cache)     | ~400ms              | <30ms  |
| Dashboard TTFB (cold cache)     | ~800ms              | <200ms |
| Project tasks list (cache hit)  | ~200ms              | <30ms  |
| Project tasks list (cache miss) | ~600ms              | <150ms |
| My-Tasks page load              | ~500ms              | <80ms  |
| API avg response (GET)          | ~150ms              | <50ms  |
| API p99 response (GET)          | ~800ms              | <300ms |
| Lighthouse Performance Score    | ~55                 | >90    |

---

_This document is the authoritative improvement backlog for OrbisPM. Review and reprioritize each sprint in the team standup._
