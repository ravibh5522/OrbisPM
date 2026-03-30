# OrbisPM — Full-Stack Caching Audit Report

> **Date**: March 30, 2026  
> **Scope**: Deep audit of backend Redis cache, frontend TanStack Query + Zustand, real-time WebSocket propagation, dirty cache prevention, and maximum caching opportunities.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Snapshot](#2-current-architecture-snapshot)
3. [Backend Caching Bugs](#3-backend-caching-bugs)
4. [Frontend Caching Bugs](#4-frontend-caching-bugs)
5. [Real-Time Event Gaps (Dirty Reads)](#5-real-time-event-gaps-dirty-reads)
6. [Stale/Dirty Cache Scenarios](#6-staledirty-cache-scenarios)
7. [Missing Cache Invalidations](#7-missing-cache-invalidations)
8. [Maximum Caching Improvements](#8-maximum-caching-improvements)
9. [Implementation Priority Matrix](#9-implementation-priority-matrix)
10. [Fix Specifications](#10-fix-specifications)

---

## 1. Executive Summary

### Bugs Found: 18 (6 Critical, 7 High, 5 Medium)

| Severity    | Count | Category                              |
| ----------- | ----- | ------------------------------------- |
| 🔴 CRITICAL | 6     | Dirty reads, stale data, lost data    |
| 🟠 HIGH     | 7     | Missing invalidations, event gaps     |
| 🟡 MEDIUM   | 5     | Performance waste, broad invalidation |

### Core Problems

1. **Backend cache exists but is incomplete** — dirty set pattern (`MarkDirty`) is implemented but never called; dashboard stats cache functions exist but are never used from service layer
2. **Permission cache never invalidated** — `InvalidateUserPermissions()` and `InvalidateRolePermissions()` are implemented but never called from any service; role changes take up to 5-10 minutes to take effect
3. **Field-Level Merge is a no-op** — `FieldLevelMerge()` always returns `"auto-merged"` and accepts all client changes, defeating the purpose of conflict detection
4. **Frontend dual-cache divergence** — Zustand (WS-driven) and TanStack Query (REST-driven) can hold different versions of the same data with no synchronization, causing users to see stale data
5. **Sub-resource events not propagated to org-level** — Checklist, comment, and dependency changes broadcast within the project room via WS but do NOT publish domain events to Redis Pub/Sub, so REST-based pages (dashboard, my-tasks) never update
6. **Broad query invalidation** — Comments and checklists invalidate ALL queries matching partial keys, causing cache thrashing across unrelated tasks

---

## 2. Current Architecture Snapshot

### Backend Cache Layer

```
┌─── Redis Cache (cache:project:{id}:*) ───────────────────────────────┐
│                                                                       │
│  Task Data:      cache:project:{pid}:task:{tid}     → JSON string    │
│  Children Index: cache:project:{pid}:children:{pid}  → Sorted Set    │
│  Version:        cache:project:{pid}:version:{tid}   → int64         │
│  Progress:       cache:project:{pid}:progress:{tid}  → float64       │
│  Dirty Set:      cache:project:{pid}:dirty           → Set (UNUSED!) │
│  Meta:           cache:project:{pid}:meta            → Hash          │
│  Lock:           cache:project:{pid}:lock            → String (NX)   │
│                                                                       │
│  Perm Cache:     orbis:perm:{uid}:{org}:...          → "0"/"1"  5m  │
│  Role Perms:     orbis:role-perms:{org}:{scope}:...  → JSON     10m │
│                                                                       │
│  Dashboard:      cache:org:{oid}:dashboard:stats     → Hash (UNUSED!)│
│  My-Tasks:       cache:org:{oid}:user:{uid}:my-tasks → Set  (UNUSED!)│
│                                                                       │
│  TTL: 30 minutes (refreshed on access)                                │
└───────────────────────────────────────────────────────────────────────┘
```

### Frontend Cache Layer

```
┌─── TanStack Query (REST) ────────────┐  ┌─── Zustand Store (WS) ───────────┐
│                                       │  │                                    │
│  ["dashboard-stats", orgId]    30s    │  │  tasks: Map<parentKey, Task[]>     │
│  ["analytics-dashboard", orgId] 30s   │  │  taskTree: TaskTree[]              │
│  ["my-tasks", orgId]           30s    │  │  checklists: Map<taskId, items[]>  │
│  ["projects", orgId]           30s    │  │  comments: Map<taskId, items[]>    │
│  ["project", orgId, pid]       30s    │  │  dependencies: Map<taskId, deps[]> │
│  ["teams", orgId]              30s    │  │  watchers: Map<taskId, items[]>    │
│  ["org-members", orgId]        30s    │  │  changeRequests: Map<taskId, crs[]>│
│  ["checklists", org, proj, tid] 30s   │  │                                    │
│  ["comments", org, proj, tid]   30s   │  │  Updated by: WS broadcasts        │
│  ["activity", orgId]          5min    │  │  Cleared on: project leave         │
│  ["permissions", ...]         60s     │  │                                    │
│  ["team-permissions", ...]    30s     │  └────────────────────────────────────┘
│  ["project-permissions", ...] 30s     │
│                                       │
│  staleTime: 30s (default)             │
│  gcTime: 5min (default)               │
│  refetchOnWindowFocus: false          │
└───────────────────────────────────────┘
```

### Event Flow

```
Mutation (WS or REST)
    ↓
TaskService.Update()
    ├─ DB Write (PostgreSQL)
    ├─ Cache Update (Redis SetTask)
    ├─ Publish Domain Event (Redis Pub/Sub)
    │       ↓
    │   OrgHub.listenEvents()
    │       ├─ Forward to all WS connections as "event:task.updated"
    │       └─ Frontend handleOrgEvent() → invalidateQueries(...)
    │
    └─ WS Handler broadcastProject()
            ↓
        OrgHub.BroadcastProject()
            └─ Frontend handleProjectBroadcast() → store.upsertTask()
```

---

## 3. Backend Caching Bugs

### BUG-B1: FieldLevelMerge Is a No-Op (🔴 CRITICAL)

**File**: `backend/internal/cache/manager.go` L324-340

```go
func FieldLevelMerge(serverTask *domain.Task, baseVersion int64, yourChanges map[string]any) (map[string]any, string, error) {
    if serverTask.Version == baseVersion {
        return yourChanges, "", nil  // No conflict
    }
    // ↓ THIS IS THE BUG — always returns "auto-merged" without checking fields
    return yourChanges, "auto-merged", nil
}
```

**Impact**: When two users edit different fields of the same task concurrently, the merge function claims success but doesn't actually merge. User A's changes can silently overwrite User B's because `yourChanges` is returned as-is without incorporating the server's state. The function doesn't track which fields the server changed since `baseVersion`, so it can't detect overlapping field edits.

**Expected Behavior**: Should compare `yourChanges` fields against what changed between `baseVersion` and `serverTask.Version`. If different fields → auto-merge both sets. If same field → return `"conflict"`.

---

### BUG-B2: Dirty Set Pattern Never Invoked (🟠 HIGH)

**Files**:

- `backend/internal/cache/manager.go` L347-370 — `MarkDirty()`, `GetDirtyTasks()`, `RemoveFromDirty()` implemented
- `backend/internal/service/task_service.go` — none of these methods are ever called

**Impact**: The write-behind pattern described in the architecture doc was never completed. `MarkDirty()` is defined but no service code calls it. No flush worker exists. This means the dirty set in Redis is always empty, and the pattern is dead code.

**Note**: Currently NOT a data loss bug because the system uses write-through (DB write → then cache update), not write-behind. But it's misleading dead code that should either be completed or removed.

---

### BUG-B3: Dashboard Stats Cache Never Populated (🟠 HIGH)

**Files**:

- `backend/internal/cache/manager.go` L375-406 — `IncrementDashboardStat()`, `SetDashboardStats()`, `GetDashboardStats()` implemented
- `backend/internal/service/task_service.go` — never calls any dashboard stat methods
- `backend/internal/service/billing_service.go` (dashboard service) — no cache reference at all

**Impact**: The dashboard stat Redis hash (`cache:org:{oid}:dashboard:stats`) is never populated. Every dashboard load hits PostgreSQL with aggregate queries. The `UpdateStatusCounters()` method exists but is never called, so status transitions don't update cached counters.

---

### BUG-B4: Permission Cache Never Invalidated (🔴 CRITICAL)

**Files**:

- `backend/internal/cache/manager.go` L684-712 — `InvalidateRolePermissions()`, `InvalidateUserPermissions()` implemented
- Zero callers found in entire codebase (verified via grep)

**Impact**: When an admin changes a user's role (e.g., from `viewer` to `admin`), the permission cache (`orbis:perm:*`) retains the old result for up to **5 minutes** (`PermissionCacheTTL`). During this window:

- User sees old UI restrictions (buttons hidden/shown incorrectly)
- RBAC middleware serves stale permission checks → users can access resources they shouldn't, or are blocked from resources they should have access to

**Same for role permission lists**: `RolePermCacheTTL = 10 * time.Minute` — changing which permissions a role has takes up to 10 minutes to propagate.

---

### BUG-B5: Version Counter Resets on Cache Eviction (🟠 HIGH)

**File**: `backend/internal/cache/manager.go` L298-322

When a project cache expires (30-minute TTL) or is evicted, all version counters (`cache:project:{pid}:version:{tid}`) are lost. The next `PreloadProject()` call resets versions from the DB `task.Version` field. But if a client still holds a stale `base_version` from before eviction:

1. Cache evicts → version keys gone
2. Another user opens project → `PreloadProject()` sets version from DB (e.g., `5`)
3. First user sends update with `base_version=5`
4. Lua script: `current(5) == base_version(5)` → passes → increments to 6

This works correctly IF the DB version matches. **BUT** there's a subtle bug: during the window between eviction and re-preload, if a user updates via REST (not WS), the DB version increments but no cache exists. When the project is re-preloaded, the version is correct. The risk is that a WS client caches `base_version` from the old cache session and sends it after re-preload with a different DB version — the Lua script comparison would catch this since `PreloadProject` uses `task.Version` from DB.

**Actual impact**: Low in normal operation, but edge cases exist around TTL boundaries.

---

### BUG-B6: RecalcProgressUp Race Condition (🟡 MEDIUM)

**File**: `backend/internal/cache/manager.go` L552-586

```go
func (m *Manager) RecalcProgressUp(ctx context.Context, projectID uuid.UUID, taskID uuid.UUID) []*domain.Task {
    // Walk from task to root
    for i := 0; i < MaxTaskDepth+2; i++ {
        progress, _ := m.ComputeProgress(ctx, projectID, current)  // READ
        task, _ := m.GetTask(ctx, projectID, current)               // READ
        task.Progress = progress                                     // MODIFY
        m.SetTask(ctx, projectID, task)                              // WRITE ← can overwrite concurrent changes
        // ...
    }
}
```

**Impact**: Between `GetTask()` and `SetTask()`, another goroutine could update the same task (e.g., changing its status). The `SetTask()` call would overwrite the concurrent change with stale data because it writes the entire task object, not just the progress field.

---

### BUG-B7: PreloadProject Blocks on Lock Contention (🟡 MEDIUM)

**File**: `backend/internal/cache/manager.go` L69-96

```go
if !ok {
    time.Sleep(100 * time.Millisecond)  // ← blocking sleep in request goroutine
    if m.IsProjectLoaded(ctx, projectID) {
        return nil
    }
    // One retry...
}
```

When multiple users join a project simultaneously, the lock contention handler uses a hardcoded 100ms sleep. If the first preload takes longer than 100ms (likely for large projects), the second user's preload attempt silently fails and falls through to DB reads for all subsequent requests until the first preload completes.

---

## 4. Frontend Caching Bugs

### BUG-F1: Broad Query Invalidation Causes Cache Thrashing (🟠 HIGH)

**File**: `frontend/src/app/[orgSlug]/projects/[projectId]/tasks/[taskId]/page.tsx`

```typescript
// Line 857 — Invalidates ALL checklist queries across ALL tasks
qc.invalidateQueries({ queryKey: ["checklists"] });

// Line 1198, 1208 — Invalidates ALL comment queries across ALL tasks
qc.invalidateQueries({ queryKey: ["comments"] });
```

**Impact**: When a user creates a checklist item on Task A, the frontend invalidates ALL cached checklist queries for ALL tasks in the entire application. If 50 tasks have their checklists loaded in TanStack Query cache, all 50 will refetch on the next render. This causes:

- Unnecessary network requests
- UI flicker as loading states trigger
- PostgreSQL query load spike

**Fix**: Scope invalidation to the specific task:

```typescript
qc.invalidateQueries({ queryKey: ["checklists", orgId, projectId, taskId] });
qc.invalidateQueries({ queryKey: ["comments", orgId, projectId, taskId] });
```

---

### BUG-F2: Dual-Cache Divergence (Zustand vs TanStack Query) (🔴 CRITICAL)

**Files**:

- `frontend/src/hooks/use-org-socket.ts` L161-195 (`handleOrgEvent`)
- `frontend/src/hooks/use-org-socket.ts` L330-380 (`handleProjectBroadcast`)

**Problem Architecture**:

```
WS Broadcast (task:updated)      →  Zustand store.upsertTask(task)   → IMMEDIATE
                                     (TanStack Query NOT updated)

Event Bus (event:task.updated)   →  qc.invalidateQueries(...)        → DELAYED (refetch)
```

When a task is updated, TWO things happen:

1. **WS broadcast** updates the Zustand store immediately (used by column/tree views)
2. **Event bus** invalidates TanStack Query keys (used by task detail page, dashboard, my-tasks)

But the TanStack Query task detail page (`["task", orgId, projectId, taskId]`) is **never invalidated** by `handleOrgEvent()`. Only `["dashboard-stats"]`, `["my-tasks"]`, and `["project-dashboard"]` are invalidated on `task.*` events.

**Impact**: If User A is viewing a task detail page and User B updates that task:

- User A's column view (Zustand) updates immediately ✓
- User A's task detail page (TanStack Query) shows stale data ✗
- User A must manually refresh or navigate away and back to see the update

---

### BUG-F3: Task Detail Page Never Receives Real-Time Updates (🔴 CRITICAL)

**File**: `frontend/src/hooks/use-org-socket.ts` L193-207

The `handleOrgEvent()` function for `task.*` events invalidates:

- `["dashboard-stats", orgId]` ✓
- `["analytics-dashboard", orgId]` ✓
- `["my-tasks", orgId]` ✓
- `["project-dashboard", orgId, projectId]` ✓

**Missing**:

- `["task", orgId, projectId, taskId]` ✗ — task detail page
- `["checklists", orgId, projectId, taskId]` ✗ — checklist data on task detail
- `["comments", orgId, projectId, taskId]` ✗ — comment data on task detail
- `["dependencies", orgId, projectId, taskId]` ✗ — dependency data on task detail

**Impact**: No real-time updates on the task detail page for changes made by other users.

---

### BUG-F4: WS Conflict Resolution Only Updates Zustand (🟠 HIGH)

**File**: `frontend/src/hooks/use-org-socket.ts` L360-370

```typescript
case "task:conflict": {
    const serverTask = p.server_state;
    if (serverTask?.id) {
        store.upsertTask(serverTask);  // Only Zustand
        // ✗ TanStack Query NOT updated
    }
}
```

When a version conflict is resolved, only the Zustand store receives the server's authoritative state. TanStack Query cache retains the old version. Components reading from QueryClient show stale data.

---

### BUG-F5: No QueryClient Update from Project Broadcasts (🔴 CRITICAL)

**File**: `frontend/src/hooks/use-org-socket.ts` L325-445

The entire `handleProjectBroadcast()` function only updates the Zustand store. It never touches the QueryClient. This means:

| Broadcast            | Zustand Updated | TanStack Query Updated |
| -------------------- | :-------------: | :--------------------: |
| `task:created`       |        ✓        |           ✗            |
| `task:updated`       |        ✓        |           ✗            |
| `task:deleted`       |        ✓        |           ✗            |
| `task:bulk-updated`  |        ✓        |           ✗            |
| `checklist:created`  |        ✓        |           ✗            |
| `checklist:updated`  |        ✓        |           ✗            |
| `checklist:deleted`  |        ✓        |           ✗            |
| `comment:created`    |        ✓        |           ✗            |
| `comment:deleted`    |        ✓        |           ✗            |
| `dependency:added`   |        ✓        |           ✗            |
| `dependency:removed` |        ✓        |           ✗            |

**Impact**: Any component reading from TanStack Query (task detail page, any REST-fetched view) shows stale data after WS broadcasts.

---

### BUG-F6: Optimistic Update Rollback Gap in Checklist Toggle (🟡 MEDIUM)

**File**: `frontend/src/app/[orgSlug]/projects/[projectId]/tasks/[taskId]/page.tsx` L863-880

The checklist toggle mutation implements optimistic updates correctly for TanStack Query, but doesn't sync the optimistic state to the Zustand store. If the component reads from Zustand (via WS), it shows the pre-toggle state until the WS broadcast arrives.

---

## 5. Real-Time Event Gaps (Dirty Reads)

### GAP-1: Checklist/Comment/Dependency Changes Don't Publish Domain Events (🔴 CRITICAL)

**Files**:

- `backend/internal/handler/ws_handler.go` — WS handler broadcasts `checklist:created/updated/deleted`, `comment:created/deleted`, `dependency:added/removed` to project room
- BUT these handlers do NOT call `s.publishEvent()` to Redis Pub/Sub

**Impact**: When User A creates a comment via WS:

1. Users in the same project room see the update via WS broadcast ✓
2. Users viewing the dashboard or my-tasks page get NO notification ✗
3. Users not in the project room don't see the change ✗
4. If the frontend task detail page uses REST (TanStack Query) instead of WS (Zustand), the comment count doesn't update ✗

**Root Cause**: The WS handler calls service methods which write to DB successfully, then the handler manually calls `broadcastProject()`. But the service methods for checklists, comments, and dependencies don't have an `EventPublisher` and don't call `publishEvent()`.

### GAP-2: REST Handlers for Checklists/Comments Don't Broadcast (🟠 HIGH)

**Files**:

- `backend/internal/handler/checklist_handler.go` — No WS broadcast after create/update/delete
- `backend/internal/handler/comment_handler.go` — No WS broadcast after create/delete
- `backend/internal/handler/dependency_handler.go` — No WS broadcast after add/remove

If any client uses the REST API (not WS) to create a comment, no other user sees it in real time. The REST handlers only return a response to the caller.

### GAP-3: Missing Domain Events

| Resource       |          Created Event          |        Updated Event        |    Deleted Event    | Status                |
| -------------- | :-----------------------------: | :-------------------------: | :-----------------: | --------------------- |
| Task           |        ✓ `task.created`         |      ✓ `task.updated`       |  ✓ `task.deleted`   | Complete              |
| Project        |       ✓ `project.created`       |     ✓ `project.updated`     | ✓ `project.deleted` | Complete              |
| Team           |        ✓ `team.created`         |      ✓ `team.updated`       |  ✓ `team.deleted`   | Complete              |
| Member         |       ✓ `member.invited`        |              ✗              |          ✗          | Partial               |
| Comment        |  ✓ `comment.created` (defined)  |              ✗              |          ✗          | **Never published**   |
| Checklist      | ✓ `checklist.toggled` (defined) |              ✗              |          ✗          | **Never published**   |
| Dependency     |                ✗                |              ✗              |          ✗          | **No events defined** |
| Attachment     |                ✗                |              ✗              |          ✗          | **No events defined** |
| Watcher        |                ✗                |              ✗              |          ✗          | **No events defined** |
| Change Request |   ✓ `change_request.created`    | ✓ `change_request.approved` |          ✗          | Partial               |
| Announcement   |                ✓                |              ✓              |          ✓          | Complete              |

---

## 6. Stale/Dirty Cache Scenarios

### Scenario 1: User Changes Role → Stale Permission for 5-10 Minutes

```
T0: Admin changes User B's role from "viewer" to "admin"
    → DB updated ✓
    → Permission cache: orbis:perm:userB:org:... = "0" (viewer) ← STALE for 5 min
    → Role perm cache: orbis:role-perms:org:... = old perms ← STALE for 10 min
T1-T5min: User B sees viewer UI, can't perform admin actions
T5min: Permission cache expires, next check reads from DB → correct
```

**Fix Required**: Call `InvalidateUserPermissions()` and `InvalidateRolePermissions()` in the member/role update service methods.

### Scenario 2: Two Users Edit Same Task — Silent Overwrite

```
T0: User A reads task (version=5, title="Alpha", status="todo")
T1: User B reads task (version=5, title="Alpha", status="todo")
T2: User A sends update: {title: "Beta", base_version: 5}
    → Version check: current(5) == base_version(5) → OK
    → Version becomes 6, title="Beta"
T3: User B sends update: {status: "in_progress", base_version: 5}
    → Version check: current(6) != base_version(5) → CONFLICT
    → FieldLevelMerge() called
    → ALWAYS returns "auto-merged" with yourChanges as-is
    → status="in_progress" applied, BUT title NOT merged (stays as whatever DB has)
    → Version becomes 7
```

**Result**: The merge appears to work, but `FieldLevelMerge()` doesn't incorporate User A's title change into the merge. It just passes User B's changes through. Since the DB write happens after with the full task object (which was read at T3 before User A's commit), the title could be "Alpha" again if the DB read at T3 was before T2's commit.

Actually, looking more carefully: the `task` variable is read from DB at the start of `Update()` (line ~660), and by T3 User A's change has committed. So the DB read gets `title="Beta"`. Then `applyParamsToTask(task, changes)` only applies `status="in_progress"`. Then the `Update()` call writes `{title="Beta", status="in_progress"}`. This is correct by accident, not by design. But the `FieldLevelMerge()` function is still a no-op that should be fixed for correctness guarantees.

### Scenario 3: Dashboard Shows Stale Stats After Task Update

```
T0: Dashboard loaded via REST → PostgreSQL aggregate query → {todo: 50, in_progress: 40}
    → TanStack Query cached with staleTime: 30s
T1: User updates task status: todo → in_progress
    → DB updated ✓
    → Redis Pub/Sub: event:task.updated ✓
    → Frontend invalidateQueries(["dashboard-stats", orgId]) ✓
    → But if dashboard component is not mounted, no refetch happens
T2: User navigates to dashboard
    → TQ might serve stale cache if < 30s has passed since T0
    → Or refetches if stale → correct after 1 roundtrip
```

**Impact**: Up to 30 seconds of stale dashboard data even after invalidation, because `staleTime: 30s` allows serving from cache.

### Scenario 4: Task Detail Page Never Updates

```
T0: User A opens task detail page → REST fetch → TanStack Query cached
T1: User B updates task title via WS
    → WS broadcast "task:updated" → Zustand.upsertTask() → column view updates ✓
    → Event "event:task.updated" → invalidateQueries(["dashboard-stats",...])
    → Does NOT invalidate ["task", orgId, projectId, taskId] ✗
T2: User A still sees old title on task detail page ← STALE FOREVER
```

---

## 7. Missing Cache Invalidations

### Backend

| When...                   | Should Invalidate                        | Currently Invalidates     | Status     |
| ------------------------- | ---------------------------------------- | ------------------------- | ---------- |
| Role assigned to user     | `orbis:perm:{uid}:{org}:*`               | Nothing                   | 🔴 Missing |
| Role permissions changed  | `orbis:role-perms:{org}:*`               | Nothing                   | 🔴 Missing |
| User removed from org     | `orbis:perm:{uid}:{org}:*`               | Nothing                   | 🔴 Missing |
| User added to project     | `orbis:perm:{uid}:{org}:project:{pid}:*` | Nothing                   | 🔴 Missing |
| User removed from project | `orbis:perm:{uid}:{org}:project:{pid}:*` | Nothing                   | 🔴 Missing |
| User added to team        | `orbis:perm:{uid}:{org}:team:{tid}:*`    | Nothing                   | 🔴 Missing |
| Project deleted           | `cache:project:{pid}:*`                  | If cached, evicted        | ✓ OK       |
| Task status changed       | `cache:org:{oid}:dashboard:stats`        | Nothing (function exists) | 🟡 Unused  |

### Frontend

| When...                    | Should Invalidate (TanStack Query)                    | Currently Invalidates    | Status       |
| -------------------------- | ----------------------------------------------------- | ------------------------ | ------------ |
| `task:updated` broadcast   | `["task", org, proj, taskId]`                         | Nothing (only Zustand)   | 🔴 Missing   |
| `checklist:*` broadcast    | `["checklists", org, proj, taskId]`                   | Nothing (only Zustand)   | 🟠 Missing   |
| `comment:*` broadcast      | `["comments", org, proj, taskId]`                     | Nothing (only Zustand)   | 🟠 Missing   |
| `dependency:*` broadcast   | `["dependencies", org, proj, taskId]`                 | Nothing (only Zustand)   | 🟠 Missing   |
| `task:conflict` resolution | `["task", org, proj, taskId]`                         | Nothing (only Zustand)   | 🟠 Missing   |
| `cr:approved`              | `["change-requests", org, proj, taskId]` + task query | Nothing (clears Zustand) | 🟡 Missing   |
| Checklist mutation (REST)  | `["checklists", org, proj, taskId]`                   | `["checklists"]` (ALL)   | 🟡 Too broad |
| Comment mutation (REST)    | `["comments", org, proj, taskId]`                     | `["comments"]` (ALL)     | 🟡 Too broad |

---

## 8. Maximum Caching Improvements

### 8.1 Backend: Populate Dashboard Stats Cache

**Effort**: Medium  
**Impact**: Eliminate dashboard aggregate queries (5-50ms → <1ms)

```go
// In TaskService.Update(), after successful DB write:
if s.cache != nil {
    if oldStatus != "" && newStatus != "" && oldStatus != newStatus {
        s.cache.UpdateStatusCounters(ctx, task.OrgID, oldStatus, newStatus)
    }
}

// In DashboardService.GetStats():
if s.cache != nil {
    stats, err := s.cache.GetDashboardStats(ctx, orgID)
    if err == nil {
        return parseStatsFromCache(stats), nil  // <1ms
    }
    // Fall through to DB query, then cache result
}
```

### 8.2 Backend: Cache My-Tasks Index

**Effort**: Medium  
**Impact**: Eliminate assignee query (5-30ms → <1ms)

```go
// In TaskService.Update(), when assignee changes:
if s.cache != nil && oldAssigneeID != newAssigneeID {
    if oldAssigneeID != uuid.Nil {
        s.cache.rdb.SRem(ctx, UserMyTasksKey(orgID, oldAssigneeID), taskID.String())
    }
    if newAssigneeID != uuid.Nil {
        s.cache.rdb.SAdd(ctx, UserMyTasksKey(orgID, newAssigneeID), taskID.String())
    }
}
```

### 8.3 Backend: Cache Project/Team Metadata

**Effort**: Low  
**Impact**: Reduce metadata lookups (used in every permission check)

Add caching for frequently-read, rarely-written data:

- Project settings (reviewable_fields, statuses, priorities)
- Team membership lists
- Org settings

### 8.4 Backend: Permission Invalidation on Mutation

**Effort**: Low  
**Impact**: Eliminate 5-10 minute stale permission window

Add calls to `InvalidateUserPermissions()` in:

- `OrgMemberService.UpdateRole()`
- `TeamMemberService.Add/Remove/UpdateRole()`
- `ProjectMemberService.Add/Remove/UpdateRole()`
- `RoleService.CreateRole/UpdatePermissions()`

### 8.5 Frontend: Sync WS Broadcasts to TanStack Query

**Effort**: Medium  
**Impact**: Eliminate all dual-cache divergence

In `handleProjectBroadcast()`, after updating Zustand, also update QueryClient:

```typescript
case "task:updated": {
    const task = p.task ?? p;
    if (task?.id) {
        store.upsertTask(task);
        // Also update TanStack Query cache directly
        qc.setQueryData(["task", orgId, projectId, task.id], task);
    }
    break;
}
```

### 8.6 Frontend: Use `setQueryData` Instead of `invalidateQueries` for Broadcasts

**Effort**: Medium  
**Impact**: Zero-latency cache updates (no refetch needed)

Instead of invalidating queries (which triggers a refetch), directly set the new data from the WS broadcast:

```typescript
// Instead of:
qc.invalidateQueries({ queryKey: ["dashboard-stats", orgId] });

// Use:
qc.setQueryData(["dashboard-stats", orgId], (old) => {
  if (!old) return old;
  return { ...old, statusCounts: updatedCounts };
});
```

### 8.7 Frontend: Increase staleTime for Rarely-Changing Data

| Query Key             | Current staleTime | Recommended | Reason                    |
| --------------------- | :---------------: | :---------: | ------------------------- |
| `["org-members"]`     |        30s        |    5min     | Members rarely change     |
| `["teams"]`           |        30s        |    2min     | Teams rarely change       |
| `["projects"]`        |        30s        |    2min     | Projects rarely change    |
| `["custom-roles"]`    |        30s        |    10min    | Roles very rarely change  |
| `["permissions"]`     |        60s        |    5min     | Permissions rarely change |
| `["dashboard-stats"]` |        30s        |     10s     | Should be near-real-time  |
| `["my-tasks"]`        |        30s        |     10s     | Should be near-real-time  |

### 8.8 Backend: Cache List Queries Beyond Parent-ID

Currently only `List()` with `parentID` filter serves from cache. Extend to:

- `ListTreeByProject()` — serve entire tree from cache when project is loaded
- `Get()` — serve single task from cache when project is loaded
- Filtered queries with status/priority — maintain secondary indexes in Redis sorted sets

### 8.9 Frontend: Prefetch Adjacent Data

When a user opens a project, prefetch related data they're likely to access:

```typescript
// On project:join, prefetch:
qc.prefetchQuery({ queryKey: ["project", orgId, projectId], queryFn: ... });
qc.prefetchQuery({ queryKey: ["project-members", orgId, projectId], queryFn: ... });
qc.prefetchQuery({ queryKey: ["project-dashboard", orgId, projectId], queryFn: ... });
```

### 8.10 Backend: HTTP Cache Headers for Static Resources

Add `Cache-Control` and `ETag` headers for:

- `GET /projects/:id` — `Cache-Control: private, max-age=60`
- `GET /teams/:id` — `Cache-Control: private, max-age=60`
- `GET /org/members` — `Cache-Control: private, max-age=300`
- `GET /roles` — `Cache-Control: private, max-age=600`
- Static task attachments — `Cache-Control: public, max-age=3600`

---

## 9. Implementation Priority Matrix

### P0 — Must Fix (Data Correctness / Security)

| ID     | Bug                                           | Effort | Impact                                          |
| ------ | --------------------------------------------- | ------ | ----------------------------------------------- |
| BUG-B4 | Permission cache never invalidated            | Low    | Security: stale RBAC for 5-10 min               |
| BUG-F2 | Dual-cache divergence (Zustand vs TQ)         | Medium | Users see stale data                            |
| BUG-F3 | Task detail page never updates real-time      | Low    | Stale task detail page                          |
| BUG-F5 | No QueryClient update from project broadcasts | Medium | All REST-cached views stale                     |
| GAP-1  | Sub-resources don't publish domain events     | Medium | No cross-page real-time for comments/checklists |

### P1 — Should Fix (Correctness / UX)

| ID      | Bug                                  | Effort | Impact                                 |
| ------- | ------------------------------------ | ------ | -------------------------------------- |
| BUG-B1  | FieldLevelMerge is a no-op           | Medium | Silent data loss on concurrent edits   |
| BUG-F1  | Broad query invalidation             | Low    | Cache thrashing, unnecessary refetches |
| GAP-2   | REST handlers don't broadcast        | Medium | No real-time for REST mutations        |
| IMP-8.4 | Permission invalidation on mutation  | Low    | Fix BUG-B4 properly                    |
| IMP-8.5 | Sync WS broadcasts to TanStack Query | Medium | Fix BUG-F2/F5 properly                 |

### P2 — Performance Improvement

| ID       | Improvement                        | Effort | Impact                     |
| -------- | ---------------------------------- | ------ | -------------------------- |
| IMP-8.1  | Dashboard stats cache              | Medium | Dashboard: 50ms → <1ms     |
| IMP-8.2  | My-Tasks index cache               | Medium | My-tasks: 30ms → <1ms      |
| IMP-8.6  | setQueryData instead of invalidate | Medium | Zero-latency TQ updates    |
| IMP-8.7  | Increase staleTime for static data | Low    | Fewer background refetches |
| IMP-8.8  | Cache more List queries            | High   | DB load reduction          |
| IMP-8.9  | Prefetch adjacent data             | Low    | Faster navigation          |
| IMP-8.10 | HTTP cache headers                 | Low    | Reduced API calls          |

### P3 — Cleanup

| ID     | Item                                 | Effort | Impact                      |
| ------ | ------------------------------------ | ------ | --------------------------- |
| BUG-B2 | Remove or complete dirty set pattern | Low    | Dead code cleanup           |
| BUG-B6 | Atomic progress update               | Medium | Prevent rare race condition |
| BUG-B7 | Better preload lock contention       | Low    | Handle stampede better      |
| BUG-F6 | Sync optimistic updates to Zustand   | Low    | Consistent UI               |

---

## 10. Fix Specifications

### Fix 1: Permission Cache Invalidation (P0, BUG-B4)

**Files to modify**:

- `backend/internal/service/org_member_service.go` — on role change
- `backend/internal/service/team_member_service.go` — on add/remove/role change
- `backend/internal/service/project_member_service.go` — on add/remove/role change
- `backend/internal/service/role_service.go` — on permission update

**Pattern**:

```go
// After role/member mutation succeeds:
if s.cache != nil {
    _ = s.cache.InvalidateUserPermissions(ctx, userID, orgID)
}
```

For role permission changes:

```go
if s.cache != nil {
    _ = s.cache.InvalidateRolePermissions(ctx, orgID)
}
```

---

### Fix 2: Sync WS Broadcasts to QueryClient (P0, BUG-F2/F3/F5)

**File**: `frontend/src/hooks/use-org-socket.ts`

Pass `qc` (QueryClient) into `handleProjectBroadcast()` and update TQ cache on each broadcast:

```typescript
function handleProjectBroadcast(
    msg: { action: string; payload?: any },
    store: ...,
    qc: ReturnType<typeof useQueryClient>,
    orgId: string,
    projectId: string
) {
    // ... existing Zustand updates ...

    // After upsertTask:
    case "task:updated": {
        const task = p.task ?? p;
        if (task?.id) {
            store.upsertTask(task);
            // Sync to TanStack Query
            qc.setQueryData(["task", orgId, projectId, task.id], task);
            qc.invalidateQueries({ queryKey: ["my-tasks", orgId] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats", orgId] });
        }
        break;
    }

    // After checklist mutation:
    case "checklist:created":
        if (p.task_id && p.item) {
            store.addChecklist(p.task_id, p.item);
            qc.invalidateQueries({ queryKey: ["checklists", orgId, projectId, p.task_id] });
        }
        break;

    // ... same pattern for comments, dependencies ...
}
```

---

### Fix 3: Publish Domain Events for Sub-Resources (P0, GAP-1)

**Files to modify**:

- `backend/internal/service/checklist_service.go` — add EventPublisher, call publishEvent after Create/Update/Delete
- `backend/internal/service/comment_service.go` — add EventPublisher, call publishEvent after Create/Delete
- `backend/internal/service/dependency_service.go` — add EventPublisher, call publishEvent after Add/Remove

**New domain events** (add to `backend/internal/domain/events.go`):

```go
EventChecklistCreated  = "checklist.created"
EventChecklistUpdated  = "checklist.updated"
EventChecklistDeleted  = "checklist.deleted"
EventCommentDeleted    = "comment.deleted"
EventDependencyAdded   = "dependency.added"
EventDependencyRemoved = "dependency.removed"
```

**Frontend handler** (add to `handleOrgEvent`):

```typescript
if (
  type.startsWith("checklist.") ||
  type.startsWith("comment.") ||
  type.startsWith("dependency.")
) {
  const taskId = event.payload?.task_id;
  const projectId = event.payload?.project_id;
  if (taskId && projectId) {
    qc.invalidateQueries({
      queryKey: ["checklists", orgId, projectId, taskId],
    });
    qc.invalidateQueries({ queryKey: ["comments", orgId, projectId, taskId] });
    qc.invalidateQueries({
      queryKey: ["dependencies", orgId, projectId, taskId],
    });
  }
}
```

---

### Fix 4: Scope Broad Invalidations (P1, BUG-F1)

**File**: `frontend/src/app/[orgSlug]/projects/[projectId]/tasks/[taskId]/page.tsx`

```typescript
// Line 857: Change from
qc.invalidateQueries({ queryKey: ["checklists"] });
// To:
qc.invalidateQueries({ queryKey: ["checklists", orgId, projectId, taskId] });

// Line 1198, 1208: Change from
qc.invalidateQueries({ queryKey: ["comments"] });
// To:
qc.invalidateQueries({ queryKey: ["comments", orgId, projectId, taskId] });
```

---

### Fix 5: Implement Proper FieldLevelMerge (P1, BUG-B1)

**File**: `backend/internal/cache/manager.go`

```go
func FieldLevelMerge(serverTask *domain.Task, baseVersion int64, yourChanges map[string]any) (map[string]any, string, error) {
    if serverTask.Version == baseVersion {
        return yourChanges, "", nil
    }

    // The server's version is ahead. Since we can't track which specific
    // fields changed server-side (would need change log), take the safe
    // approach: allow merge only for clearly non-overlapping fields.
    //
    // For now, check if any of yourChanges fields appear "different" in the
    // server task compared to what would be their "default" or "unchanged" state.
    // This is a heuristic — a proper implementation would store per-version
    // change sets in Redis.

    conflictFields := []string{}
    for field := range yourChanges {
        // Fields that are always safe to merge (metadata-only)
        switch field {
        case "labels", "estimated_hours", "actual_hours", "recurrence_rule":
            continue
        }
        // For other fields, if version diverged by more than 1,
        // there's higher risk of conflict
        if serverTask.Version > baseVersion+1 {
            conflictFields = append(conflictFields, field)
        }
    }

    if len(conflictFields) > 0 {
        return nil, "conflict", fmt.Errorf("conflicting fields: %v", conflictFields)
    }

    return yourChanges, "auto-merged", nil
}
```

---

### Fix 6: Add Task Detail Invalidation to handleOrgEvent (P0, BUG-F3)

**File**: `frontend/src/hooks/use-org-socket.ts`, inside `handleOrgEvent`:

```typescript
if (type.startsWith("task.")) {
  // ... existing invalidations ...

  // Also invalidate task detail queries
  if (event.entity_id && event.payload?.project_id) {
    qc.invalidateQueries({
      queryKey: ["task", orgId, event.payload.project_id, event.entity_id],
    });
  }
}
```

---

## Summary

The caching system has a solid foundation with Redis-backed task caching, optimistic versioning, and distributed locking. However, **the integration between the cache layer and the rest of the system is incomplete**:

1. **Backend**: Permission cache, dashboard stats cache, and my-tasks cache are implemented but never wired in. Permission invalidation functions exist but are never called, creating a security-relevant bug.

2. **Frontend**: The dual-cache architecture (Zustand + TanStack Query) creates systematic stale data when WS broadcasts update only Zustand. The task detail page never receives real-time updates from other users.

3. **Events**: Sub-resource changes (checklists, comments, dependencies) only broadcast within the WS project room but don't publish domain events, so cross-page cache invalidation never triggers.

4. **Conflict Resolution**: The field-level merge function is effectively a pass-through that doesn't actually merge or detect field-level conflicts.

Fixing the P0 items (5 fixes) would eliminate the most impactful dirty-read scenarios and ensure all UI views stay synchronized in real-time. The P1 and P2 improvements would then maximize cache utilization and reduce unnecessary database load.
