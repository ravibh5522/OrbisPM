# OrbisPM — Backend Caching Architecture Analysis & Production-Grade Cache Design

> **Date**: March 9, 2026  
> **Scope**: Full-stack deep analysis — backend data flow, Redis usage, WS real-time layer, worker subsystem, frontend state, and proposed write-through cache with conflict resolution.

---

## Table of Contents

1. [Current Architecture — As-Is Analysis](#1-current-architecture--as-is-analysis)
2. [Identified Bottlenecks & Latency Sources](#2-identified-bottlenecks--latency-sources)
3. [Proposed Architecture — Write-Through Redis Cache](#3-proposed-architecture--write-through-redis-cache)
4. [Conflict Resolution Strategy (Multi-User)](#4-conflict-resolution-strategy-multi-user)
5. [Technology Assessment — Workers, Queues, Brokers](#5-technology-assessment--workers-queues-brokers)
6. [Cross-Page Cache Connectivity (Dashboard, Settings, etc.)](#6-cross-page-cache-connectivity)
7. [Implementation Blueprint](#7-implementation-blueprint)
8. [Risk Matrix & Tradeoffs](#8-risk-matrix--tradeoffs)
9. [Migration Plan — Phased Rollout](#9-migration-plan--phased-rollout)

---

## 1. Current Architecture — As-Is Analysis

### 1.1 Data Flow (Current)

```
Client (Browser)
    │
    ├── WebSocket ──→ WSHandler.dispatch() ──→ TaskService ──→ TxManager.WithTx() ──→ PostgreSQL
    │                      │                        │                                      │
    │                      │                        ├── enqueueActivity() ──→ Asynq/Redis  │
    │                      │                        ├── enqueueSearchIndex() ──→ Asynq     │
    │                      │                        └── publishEvent() ──→ Redis Pub/Sub   │
    │                      │                                                               │
    │                      ├── reply(conn, task) ←──────── DB RETURNING ←─────────────────┘
    │                      └── broadcastProject(task:updated) ──→ OrgHub ──→ all other WS conns
    │
    └── REST API ──→ TaskHandler.Create() ──→ TaskService ──→ same flow as above
```

### 1.2 Redis Usage (Current)

| Component | Usage | Redis Feature | Data Stored |
|-----------|-------|---------------|-------------|
| **EventBus** | Real-time domain events | Pub/Sub | Ephemeral event JSON on channels `orbispm:events:{type}` |
| **Asynq Worker** | Background job queues | Lists + Sorted Sets | Job payloads for `activity:log`, `search:index`, `notification:send`, `webhook:deliver`, `recurring:generate` |
| **Rate Limiter** | Per-IP throttling | **In-memory** (not Redis) | `map[string]*rate.Limiter` in Go process |

**Key Finding: Zero application data caching exists.** Redis is used exclusively for pub/sub messaging and job queues. Every read operation (task list, task get, tree, dashboard stats, etc.) hits PostgreSQL directly.

### 1.3 Read Path (Every Request)

```
task:list WS message
    → service.List()
        → taskRepo.List(ctx, projectID, filter)
            → pool.Query(ctx, "SELECT ... FROM tasks WHERE ... ORDER BY ... LIMIT $N OFFSET $M")
                → PostgreSQL (RLS enforces org_id filter)
                    → Scan rows → []domain.Task
                        → JSON marshal → WS reply
```

**Latency breakdown per task:list call:**
- WS message parse: ~0.1ms
- Service logic: ~0.1ms
- **DB round-trip: 5-50ms** (depending on dataset, indexes, connection pool)
- JSON marshal + WS send: ~0.5ms
- **Total: ~6-51ms per request**

### 1.4 Write Path (Every Mutation)

```
task:update WS message
    → service.Update()
        → taskRepo.GetByID()         ← DB read (5-20ms)
        → build changes map
        → txm.WithTx()
            → SET LOCAL RLS context    ← DB round-trip (1ms)
            → taskRepo.Update()        ← DB write (5-20ms)
            → tx.Commit()             ← DB round-trip (1-5ms)
        → enqueueActivity()           ← Redis LPUSH (0.5ms)
        → enqueueSearchIndex()        ← Redis LPUSH (0.5ms)
        → publishEvent()              ← Redis PUBLISH (0.5ms)
    → reply(conn, updated_task)
    → broadcastProject(task:updated)
```

**Total write latency: ~15-50ms** (dominated by DB round-trips)

### 1.5 Concurrency Model

- **No optimistic concurrency control**: UPDATE overwrites all fields unconditionally (`WHERE id=$20` only)
- **No version column**: `updated_at` is set by DB trigger but never checked before write
- **Last-write-wins**: If User A and User B both update task title simultaneously, whichever commit happens last wins silently
- **No conflict detection or notification**: User A sees their own update immediately, but User B's change may overwrite it without either user knowing

### 1.6 Frontend State Model

| Page | Data Source | Cache Layer | Real-time Updates |
|------|------------|-------------|-------------------|
| **Project Tasks (Columns)** | WS `task:list` | Zustand `Map<parentKey, Task[]>` | WS broadcast `task:updated` → `upsertTask()` |
| **Project Tasks (Tree)** | WS `task:tree` | Zustand `taskTree[]` | WS broadcast (events → refetch) |
| **Project Tasks (List)** | WS `task:list` with pagination | Component local state | No live updates (manual refresh) |
| **My Tasks** | REST `GET /dashboard/my-tasks` | TanStack Query (30s stale) | WS org event → TQ invalidation → refetch |
| **Dashboard** | REST `GET /dashboard/stats` | TanStack Query (30s stale) | WS org event → TQ invalidation → refetch |
| **Sub-resources** (checklists, comments) | WS per-task fetch | Zustand `Map<taskId, items[]>` | WS broadcast per action |
| **Project/Team metadata** | REST `GET /projects/:id` | TanStack Query (30s stale) | WS org event → TQ invalidation |
| **Org Members** | REST `GET /members` | TanStack Query (5min stale) | WS org event → TQ invalidation |

---

## 2. Identified Bottlenecks & Latency Sources

### 2.1 Critical Bottlenecks

| # | Bottleneck | Impact | Current Latency | Frequency |
|---|-----------|--------|-----------------|-----------|
| **B1** | Every `task:list` hits DB | Redundant reads for same project | 5-50ms/call | Every column expand, every page load |
| **B2** | Every `task:update` does GetByID + Update (2 DB RTTs) | Double the write latency | 10-40ms | Every field change |
| **B3** | No write coalescing | Typing fast in title field sends N updates | 10-40ms × N | Per-keystroke (if debounce is insufficient) |
| **B4** | No optimistic locking | Silent data loss on concurrent edits | N/A | When 2+ users edit same task |
| **B5** | Dashboard/My-Tasks refetch entire dataset | TQ invalidation triggers full REST call | 50-200ms | On every task mutation in the org |
| **B6** | BulkUpdate loops through tasks sequentially | N × (GetByID + Update) in single tx | 50ms × N | On bulk operations |
| **B7** | project:join triggers no preload | User waits for task:list after joining | 0ms saved (no preload) | Every project navigation |

### 2.2 Latency Perception by User Action

| Action | Current Flow | Perceived Latency | Target |
|--------|-------------|-------------------|--------|
| Open project (workbook) | Join room → wait → task:list → wait → render | **200-500ms** | <50ms |
| Update task field | WS → DB read → DB write → reply → render | **30-80ms** | <10ms |
| Bulk update 20 tasks | 20 × (read + write) in tx | **400-800ms** | <50ms |
| Switch between task columns | task:list per depth level | **50-200ms** | <10ms (from cache) |
| Dashboard after task change | WS event → TQ invalidation → REST stats call | **200-500ms** | <50ms |

---

## 3. Proposed Architecture — Write-Through Redis Cache

### 3.1 Core Concept: Project-Scoped Task Cache

When a user opens a project (workbook), we **preload ALL tasks + subtasks for that project into Redis** as a structured cache. All reads serve from cache. Writes update Redis immediately (microseconds) and flush to PostgreSQL asynchronously.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          NEW ARCHITECTURE                                        │
│                                                                                  │
│  Client ──WS──→ WSHandler ──→ TaskService ──→ CacheManager ──→ Redis (cache)    │
│                                                    │                             │
│                                                    ├──→ Reply to sender (<1ms)   │
│                                                    ├──→ Broadcast to others       │
│                                                    └──→ Enqueue DB flush (async) │
│                                                         │                        │
│                                               Asynq Worker ──→ PostgreSQL        │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Redis Data Model

```
# Project task cache — Hash per task
cache:project:{projectId}:task:{taskId}  = {JSON serialized Task}

# Project task index — Sorted Set per parent
cache:project:{projectId}:children:{parentId}  = {taskId → position score}
cache:project:{projectId}:children:root        = {taskId → position score}

# Project metadata
cache:project:{projectId}:meta  = {loaded_at, task_count, version}

# Task version counter (for conflict detection)
cache:project:{projectId}:version:{taskId}  = {int64 monotonic counter}

# Dirty set — tasks modified in cache but not yet flushed to DB
cache:project:{projectId}:dirty  = Set<taskId>

# Project lock — for preload atomicity
cache:project:{projectId}:lock  = {holder, expires_at}

# TTL: All project keys expire after 30 min of no access
# Refreshed on every read/write
```

### 3.3 Read Path (New)

```
task:list { parent_id: "root" }
    │
    ├── CacheManager.ListTasks(ctx, projectId, parentId)
    │       │
    │       ├── SMEMBERS cache:project:{pid}:children:{parentId}   ← 0.1ms
    │       ├── For each taskId: HGETALL cache:project:{pid}:task:{taskId}  ← 0.1ms × N
    │       │   (Or pipeline all: 0.2ms total for 100 tasks)
    │       │
    │       ├── Cache HIT? → Return immediately (<1ms total)
    │       │
    │       └── Cache MISS? → Fall through to PostgreSQL
    │               → taskRepo.List(ctx, projectId, filter)
    │               → Populate cache
    │               → Return result
    │
    └── Reply to client
```

**Latency: <1ms (cache hit) vs 5-50ms (current DB call)**

### 3.4 Write Path (New — Write-Through + Async Flush)

```
task:update { task_id: "abc", title: "New Title" }
    │
    ├── CacheManager.UpdateTask(ctx, projectId, taskId, changes)
    │       │
    │       ├── 1. Read current from cache:
    │       │      HGETALL cache:project:{pid}:task:{taskId}     ← 0.1ms
    │       │
    │       ├── 2. Conflict check (optimistic versioning):
    │       │      INCR cache:project:{pid}:version:{taskId}     ← 0.1ms
    │       │      Compare client's base_version with current
    │       │      If mismatch → return ConflictError with server state
    │       │
    │       ├── 3. Apply changes to cached task:
    │       │      HSET cache:project:{pid}:task:{taskId} {...}  ← 0.1ms
    │       │
    │       ├── 4. Mark dirty:
    │       │      SADD cache:project:{pid}:dirty {taskId}       ← 0.1ms
    │       │
    │       ├── 5. Refresh TTL:
    │       │      EXPIRE cache:project:{pid}:* 1800             ← batch
    │       │
    │       └── 6. Enqueue async DB flush:
    │              Asynq task: "db:flush-task" { projectId, taskId, version }
    │
    ├── Reply to client with updated task (<1ms)
    │
    ├── Broadcast to other users in project room
    │
    └── (Async, ~50-100ms later) Asynq worker:
            → Read from cache → Write to PostgreSQL
            → Remove from dirty set
            → On conflict (version mismatch): re-read DB, merge, update cache
```

**Latency: <1ms (immediate) vs 15-50ms (current synchronous DB)**

### 3.5 Project Preload (Workbook Open)

When the first user joins a project room:

```
project:join { project_id: "xyz" }
    │
    ├── Check cache:project:{pid}:meta exists?
    │
    ├── Cache COLD (first load or expired):
    │       │
    │       ├── Acquire distributed lock: SET cache:project:{pid}:lock {holder} NX EX 30
    │       │
    │       ├── Load ALL tasks: SELECT * FROM tasks WHERE project_id = $1
    │       │   (Single query, no pagination, full project load)
    │       │
    │       ├── Pipeline insert into Redis:
    │       │   For each task:
    │       │       HSET cache:project:{pid}:task:{tid} {full JSON}
    │       │       ZADD cache:project:{pid}:children:{parentId} {position} {tid}
    │       │       SET  cache:project:{pid}:version:{tid} 0
    │       │
    │       ├── Set metadata:
    │       │   HSET cache:project:{pid}:meta loaded_at {now} task_count {N}
    │       │
    │       ├── Release lock
    │       │
    │       └── Send preload complete event to client
    │
    └── Cache WARM (already loaded):
            → Refresh TTL
            → Send preload complete event immediately
```

### 3.6 Cache Eviction Strategy

| Trigger | Action |
|---------|--------|
| **TTL expiry (30 min idle)** | Redis auto-deletes all project keys |
| **Last user leaves project room** | Flush all dirty tasks → DB, then let TTL handle cleanup |
| **Memory pressure (Redis maxmemory)** | LRU eviction of oldest project caches |
| **Explicit invalidation** | On project delete, clear all keys with `SCAN` + `DEL` |
| **Dirty task flush** | Asynq worker: read dirty set, batch-write to DB every 5 seconds |

---

## 4. Conflict Resolution Strategy (Multi-User)

### 4.1 Current State: No Conflict Detection

```
Time  User A                   Server DB              User B
 T0   Read task (v=updated_at=10:00)                  Read task (v=10:00)
 T1   Edit title="Foo"
 T2                            UPDATE title="Foo"
 T3                                                    Edit title="Bar"
 T4                            UPDATE title="Bar"     ← SILENTLY OVERWRITES "Foo"
 T5   Sees "Foo"               DB has "Bar"           Sees "Bar"
      ↑ STALE! User A never                           ↑ Winner (last-write)
        knows they were overwritten
```

### 4.2 Proposed: Optimistic Versioning with Field-Level Merge

#### Version Counter Per Task

Each task gets a monotonically increasing version counter in Redis:

```
cache:project:{pid}:version:{taskId} = 42
```

#### Client Sends Base Version

```json
{
  "action": "task:update",
  "payload": {
    "task_id": "abc",
    "base_version": 41,
    "title": "New Title"
  }
}
```

#### Server Conflict Detection

```go
func (cm *CacheManager) UpdateTask(ctx context.Context, projectID, taskID uuid.UUID, changes map[string]any, baseVersion int64) (*domain.Task, error) {
    // 1. Atomically increment version and get new value
    newVersion, _ := cm.rdb.Incr(ctx, versionKey(projectID, taskID)).Result()

    // 2. Expected new version = baseVersion + 1
    if newVersion != baseVersion + 1 {
        // CONFLICT: someone else updated between our read and write
        // Read current state from cache
        current := cm.getFromCache(ctx, projectID, taskID)
        return nil, &ConflictError{
            ServerVersion: newVersion - 1,
            ServerState:   current,
            YourChanges:   changes,
        }
    }

    // 3. No conflict: apply changes
    // ... update cache ...
}
```

#### Conflict Resolution Strategies (configurable)

| Strategy | When to Use | How It Works |
|----------|-------------|--------------|
| **Auto-merge (field-level)** | Different fields changed | User A changes title, User B changes status → both apply |
| **Last-write-wins** | Same field changed, low-stakes | Keep the latest write, notify the other user |
| **Server-reject** | Same field changed, high-stakes | Return 409 with both versions, client shows merge UI |
| **CRDT-style** | Collaborative text editing | For description/rich-text fields (future) |

#### Field-Level Auto-Merge Algorithm

```
Server has:     { title: "Original", status: "todo",        priority: "high", version: 5 }
User A sends:   { title: "Foo",                              base_version: 5 }
User B sends:   {                    status: "in_progress",  base_version: 5 }

Step 1: User A's update arrives first
  → version becomes 6, title="Foo"

Step 2: User B's update arrives
  → base_version=5, current=6 → CONFLICT detected
  → But User B only changed "status", User A only changed "title"
  → Fields don't overlap → AUTO-MERGE
  → Apply status="in_progress" on top of version 6
  → version becomes 7: { title: "Foo", status: "in_progress", priority: "high" }
  → Reply to User B: success (merged)
  → Broadcast to User A: task:updated with merged state
```

#### Conflict Notification via WS

When a conflict is detected and resolved:

```json
{
  "action": "task:conflict-resolved",
  "payload": {
    "task_id": "abc",
    "resolution": "auto-merged",
    "your_changes": { "status": "in_progress" },
    "other_changes": { "title": "Foo" },
    "merged_state": { "title": "Foo", "status": "in_progress", "version": 7 }
  }
}
```

### 4.3 Special Case: Concurrent Structural Changes

For operations that can't be auto-merged (reparent, delete, reorder):

```
If User A deletes task T and User B updates task T:
  → User B's update fails with TaskDeletedError
  → Client shows "This task was deleted by another user"
  → Client removes task from local state

If User A moves task T to parent P1 and User B moves task T to parent P2:
  → First write wins
  → Second write gets ConflictError with current parent info
  → Client shows "Task was moved by another user"
```

---

## 5. Technology Assessment — Workers, Queues, Brokers

### 5.1 Current Stack

| Component | Technology | Version | Role |
|-----------|-----------|---------|------|
| Message Broker | Redis Pub/Sub | 7 | Domain events (ephemeral) |
| Job Queue | Asynq (Redis-backed) | 0.26.0 | Background tasks (persistent, retryable) |
| WS Broadcaster | Custom OrgHub | - | In-process broadcast to WS connections |
| DB | PostgreSQL | 16+ | Primary data store with RLS |
| Search | Meilisearch | 1.7 | Full-text search index |

### 5.2 Modern Alternatives Assessed

#### Message Brokers

| Technology | Pros | Cons | Verdict |
|-----------|------|------|---------|
| **Redis Streams** | Already have Redis, persistent, consumer groups, replay | Limited routing, not full broker | **RECOMMENDED for cache flush queue** |
| **NATS JetStream** | Ultra-fast, lightweight, exactly-once, built-in KV store | Another dependency | Good for future scale (>100K concurrent) |
| **Apache Kafka** | Ultimate throughput, partitioning, replay | Massive overhead for <1K users | Overkill |
| **RabbitMQ** | Feature-rich, routing, dead-letter | Another process to manage | Unnecessary — Redis covers needs |

**Recommendation**: Keep Redis. Add **Redis Streams** for the DB flush queue (replaces Asynq for cache-DB sync because Streams support consumer groups with exactly-once processing).

#### Background Workers

| Technology | Pros | Cons | Verdict |
|-----------|------|------|---------|
| **Asynq** (current) | Already integrated, Redis-backed, retries, priorities | No consumer groups, at-least-once only | **Keep for existing jobs** |
| **River** (Go + PostgreSQL) | Transactional job enqueue (same tx as data), no Redis needed for jobs | Ties jobs to PostgreSQL load | Consider for DB-flush jobs |
| **Temporal** | Workflow orchestration, long-running, durable | For complex workflows, overkill for cache flush | Future: import/export workflows |
| **Machinery** | Feature-rich, Redis/AMQP backends | Less maintained than Asynq | No advantage over current |

**Recommendation**: Keep Asynq for activity logs, notifications, search indexing. Add a new **dedicated cache-flush worker** using either Asynq with a new queue or Redis Streams consumer.

#### Cache Patterns

| Pattern | Description | Fit for OrbisPM |
|---------|-------------|-----------------|
| **Cache-Aside (Lazy)** | App checks cache, falls back to DB | Works but doesn't preload |
| **Write-Through** | Write to cache → sync write to DB | Too slow (defeats purpose) |
| **Write-Behind (Write-Back)** | Write to cache → async write to DB | **BEST FIT** — sub-ms writes, async durability |
| **Read-Through** | Cache loads from DB transparently | Good for reads, doesn't help writes |
| **Refresh-Ahead** | Cache proactively refreshes before expiry | Good complement to Write-Behind |

**Recommendation**: **Write-Behind** for task mutations + **Read-Through with Preload** for task reads.

#### Real-Time Broadcast Improvements

| Approach | Description | Fit |
|----------|-------------|-----|
| **Current OrgHub** | Single-process, in-memory conn map | Works for single API instance |
| **Redis Pub/Sub broadcast** | Already exists via EventBus → OrgHub | **Already done** — multi-instance ready |
| **Server-Sent Events** | One-way server→client | Less capable than WS |
| **WebTransport** | HTTP/3 based, unreliable + reliable streams | Bleeding edge, low browser support |

**Recommendation**: Current WS + Redis Pub/Sub approach is production-ready for multi-instance deployment. No change needed.

### 5.3 Recommended Technology Stack (Incremental)

```
KEEP:
  ├── Redis 7 (Pub/Sub + Asynq + NEW: cache store + Streams)
  ├── Asynq (activity logs, notifications, search, webhooks)
  ├── OrgHub + WS (real-time broadcast)
  ├── PostgreSQL 16+ (source of truth, RLS)
  └── Meilisearch (search index)

ADD:
  ├── Redis Hash/Set/SortedSet (task cache per project)
  ├── Redis Streams (cache-flush queue with consumer groups)
  ├── CacheManager (new Go service layer component)
  ├── CacheFlushWorker (new Asynq handler or Streams consumer)
  └── Version counters in Redis (conflict detection)

FUTURE (when needed):
  ├── NATS JetStream (if >100K concurrent connections)
  ├── Temporal (for complex workflow orchestration)
  └── CRDTs (for collaborative rich-text editing)
```

---

## 6. Cross-Page Cache Connectivity

### 6.1 Problem: Siloed Data Between Pages

Currently:
- **Project page** uses Zustand store (WS-driven) — real-time but project-scoped
- **Dashboard** uses TanStack Query (REST) — 30s stale, invalidated by org events
- **My-Tasks** uses TanStack Query (REST) — 30s stale, invalidated by org events
- **Settings** uses TanStack Query (REST) — 30s stale

When a task is updated in the project view, the dashboard stats can be up to **30 seconds stale** (TQ staleTime). The org-level WS event invalidates the query key, but the component must be mounted to refetch.

### 6.2 Solution: Event-Driven Cache Invalidation + Materialized Aggregates

#### Layer 1: Redis-Cached Aggregates

```
# Dashboard stats cached per org (computed from task cache)
cache:org:{orgId}:dashboard:stats = {
  total_tasks: 142,
  by_status: { todo: 50, in_progress: 40, done: 45, blocked: 7 },
  by_priority: { critical: 5, high: 30, medium: 80, low: 27 },
  overdue: 3,
  due_this_week: 12,
  updated_at: "2026-03-09T07:23:00Z"
}

# My-tasks cached per user per org
cache:org:{orgId}:user:{userId}:my-tasks = [taskId1, taskId2, ...]
# Individual tasks served from project cache
```

#### Layer 2: Atomic Counter Updates

When a task status changes from `todo` → `in_progress`:

```go
// In CacheManager.UpdateTask(), after successful cache write:
pipe := cm.rdb.Pipeline()
pipe.HIncrBy(ctx, statsKey(orgID), "todo", -1)
pipe.HIncrBy(ctx, statsKey(orgID), "in_progress", 1)
pipe.Exec(ctx)
```

This means dashboard stats are **always up-to-date** without re-querying the DB.

#### Layer 3: Cross-Page Event Propagation

```
Task updated in Project A
    │
    ├── Update project cache (Redis)           ← <1ms
    ├── Update org dashboard counters (Redis)  ← <1ms
    ├── Update user my-tasks index (Redis)     ← <1ms
    │
    ├── Broadcast to project room (WS)         ← <1ms
    │   → All users in project see update instantly
    │
    └── Broadcast org event (WS)               ← <1ms
        → Dashboard page: Read from cached stats (not DB!)
        → My-Tasks page: Read from cached index → task cache (not DB!)
        → Notification panel: New notification appears
```

### 6.3 Page ↔ Cache Mapping

| Page | Cache Source | Invalidation Trigger | Latency |
|------|-------------|---------------------|---------|
| **Project Tasks** | `cache:project:{pid}:task:*` | Direct write to cache | <1ms |
| **Dashboard Stats** | `cache:org:{oid}:dashboard:stats` | Counter INCR on task mutation | <1ms |
| **My Tasks** | `cache:org:{oid}:user:{uid}:my-tasks` + project task cache | SADD/SREM on assignee change | <1ms |
| **Activity Feed** | Asynq → DB (unchanged) | Async insert after cache write | ~100ms |
| **Notifications** | Asynq → DB (unchanged) | Async insert after cache write | ~100ms |
| **Search** | Meilisearch (unchanged) | Async index after cache write | ~200ms |
| **Settings** | DB-direct (no cache needed) | Rare writes, REST+TQ sufficient | N/A |
| **Team/Project Metadata** | TanStack Query (30s stale, sufficient) | WS event invalidation | N/A |

---

## 7. Implementation Blueprint

### 7.1 New Components

```
backend/internal/cache/
    ├── manager.go          # CacheManager — orchestrates all cache operations
    ├── task_cache.go       # Task-specific cache operations (CRUD)
    ├── project_loader.go   # Full project preload into Redis
    ├── aggregates.go       # Dashboard stats, my-tasks counters
    ├── conflict.go         # Version checks, field-level merge
    ├── keys.go             # Redis key builders (type-safe)
    └── flush_worker.go     # Asynq handler for DB flush

backend/internal/cache/keys.go:
    func ProjectTaskKey(projectID, taskID uuid.UUID) string
    func ProjectChildrenKey(projectID uuid.UUID, parentID string) string
    func ProjectVersionKey(projectID, taskID uuid.UUID) string
    func ProjectDirtyKey(projectID uuid.UUID) string
    func ProjectMetaKey(projectID uuid.UUID) string
    func OrgDashboardStatsKey(orgID uuid.UUID) string
    func UserMyTasksKey(orgID, userID uuid.UUID) string
```

### 7.2 CacheManager Interface

```go
type CacheManager interface {
    // Project lifecycle
    PreloadProject(ctx context.Context, projectID uuid.UUID) error
    IsProjectLoaded(ctx context.Context, projectID uuid.UUID) bool
    EvictProject(ctx context.Context, projectID uuid.UUID) error

    // Task CRUD (cache-first, async DB flush)
    GetTask(ctx context.Context, projectID, taskID uuid.UUID) (*domain.Task, error)
    ListTasks(ctx context.Context, projectID uuid.UUID, parentID string, filter TaskFilter) ([]*domain.Task, int, error)
    CreateTask(ctx context.Context, projectID uuid.UUID, task *domain.Task) (*domain.Task, error)
    UpdateTask(ctx context.Context, projectID, taskID uuid.UUID, changes map[string]any, baseVersion int64) (*domain.Task, error)
    DeleteTask(ctx context.Context, projectID, taskID uuid.UUID) error

    // Aggregates
    GetDashboardStats(ctx context.Context, orgID uuid.UUID) (*DashboardStats, error)
    GetUserTasks(ctx context.Context, orgID, userID uuid.UUID) ([]*domain.Task, error)

    // Flush
    FlushDirtyTasks(ctx context.Context, projectID uuid.UUID) error
    FlushAll(ctx context.Context) error
}
```

### 7.3 Modified Service Layer

```go
// TaskService with cache support
type TaskService struct {
    taskRepo      repository.TaskRepository    // DB access (fallback + flush target)
    cache         cache.CacheManager           // NEW: Redis cache
    txm           *repository.TxManager
    workerSrv     *worker.Server
    publisher     EventPublisher
}

func (s *TaskService) Update(ctx context.Context, id uuid.UUID, params UpdateTaskParams) (*domain.TaskUpdateResult, error) {
    // 1. Try cache-first update
    if s.cache != nil && s.cache.IsProjectLoaded(ctx, projectID) {
        updated, err := s.cache.UpdateTask(ctx, projectID, id, params.ToChangesMap(), params.BaseVersion)
        if err != nil {
            if errors.Is(err, cache.ErrConflict) {
                return nil, err  // Let handler convert to 409
            }
            // Cache error → fall through to DB
            log.Warn().Err(err).Msg("cache update failed, falling back to DB")
        } else {
            // Cache success → enqueue async DB flush
            s.enqueueDBFlush(projectID, id)
            s.enqueueActivity(...)
            s.enqueueSearchIndex(...)
            s.publishEvent(...)
            return &domain.TaskUpdateResult{Task: updated, Changes: params.ToChangesMap()}, nil
        }
    }

    // 2. Fallback: direct DB update (unchanged from current code)
    return s.updateViaDB(ctx, id, params)
}
```

### 7.4 Modified WS Handler

```go
func (h *WSHandler) handleTaskUpdate(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
    // ... existing parse logic ...

    result, err := h.taskSvc.Update(ctx, id, req.UpdateTaskParams)
    if err != nil {
        var conflictErr *cache.ConflictError
        if errors.As(err, &conflictErr) {
            // Send conflict details to client
            h.reply(conn, msg.ID, "task:conflict", map[string]any{
                "task_id":        id,
                "server_version": conflictErr.ServerVersion,
                "server_state":   conflictErr.ServerState,
                "your_changes":   conflictErr.YourChanges,
                "resolution":     conflictErr.Resolution,
            }, "")
            return
        }
        h.reply(conn, msg.ID, msg.Action, nil, err.Error())
        return
    }

    h.reply(conn, msg.ID, msg.Action, result, "")
    h.broadcastProject(conn.OrgID, projectID, "task:updated", result, conn.UserID.String(), conn)
}
```

### 7.5 DB Flush Worker

```go
// TypeDBFlushTask is the Asynq task type for flushing cached task to DB.
const TypeDBFlushTask = "db:flush-task"

type DBFlushPayload struct {
    ProjectID string `json:"project_id"`
    TaskID    string `json:"task_id"`
    Version   int64  `json:"version"`
}

func (h *Handlers) HandleDBFlush(ctx context.Context, t *asynq.Task) error {
    var p DBFlushPayload
    if err := json.Unmarshal(t.Payload(), &p); err != nil {
        return err
    }

    projectID, _ := uuid.Parse(p.ProjectID)
    taskID, _ := uuid.Parse(p.TaskID)

    // Read from cache
    task, err := h.cache.GetTask(ctx, projectID, taskID)
    if err != nil {
        return fmt.Errorf("read cache for flush: %w", err)
    }

    // Write to DB within transaction (with RLS)
    err = h.txm.WithTx(ctx, func(tx pgx.Tx) error {
        _, err := h.taskRepo.Update(ctx, tx, task)
        return err
    })
    if err != nil {
        return fmt.Errorf("flush to db: %w", err)
    }

    // Remove from dirty set
    h.cache.RemoveFromDirty(ctx, projectID, taskID)
    return nil
}
```

### 7.6 Frontend Changes

#### Add `base_version` to update payloads:

```typescript
// task-columns.tsx — handleUpdate
const handleUpdate = useCallback(async (taskId: string, data: Partial<Task>) => {
    if (!send) return;
    const currentTask = columnData.flat().find(t => t.id === taskId);
    setUpdatePending(true);
    try {
        const updated = await send("task:update", {
            task_id: taskId,
            base_version: currentTask?.version ?? 0,   // NEW
            ...data,
        });
        if (updated?.id) useProjectTaskStore.getState().upsertTask(updated);
    } catch { refetchAll(); }
    finally { setUpdatePending(false); }
}, [send, refetchAll, columnData]);
```

#### Handle conflict responses:

```typescript
// use-org-socket.ts — handleProjectBroadcast
case "task:conflict": {
    const { task_id, server_state, your_changes, resolution } = p;
    // Auto-merge resolved: just update local state
    if (resolution === "auto-merged") {
        store.upsertTask(server_state);
        toast.info("Your changes were auto-merged with another user's edit");
    }
    // Manual resolution needed: show diff UI
    else if (resolution === "conflict") {
        store.setConflict(task_id, { server: server_state, yours: your_changes });
    }
    break;
}
```

---

## 8. Risk Matrix & Tradeoffs

### 8.1 Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Cache-DB divergence** (power failure before flush) | HIGH | Periodic full reconciliation job (compare cache vs DB hashes). WAL-like dirty log in Redis Stream. On API restart, flush all dirty tasks. |
| **Redis memory pressure** | MEDIUM | Set `maxmemory-policy allkeys-lru`. Monitor with Prometheus. Each task ≈ 1KB JSON → 10K tasks ≈ 10MB. |
| **Cache stampede** (many users open same cold project) | MEDIUM | Distributed lock on project preload. Single-flight pattern. |
| **Stale cache after non-WS mutation** (REST API, DB admin) | LOW | Webhook on DB trigger `NOTIFY`. Or periodic cache refresh (every 5 min). |
| **RLS bypass** (cache doesn't have RLS) | HIGH | CacheManager MUST verify org_id on every cache read. Never serve cross-org data. Key structure includes projectID (which is org-scoped). Every cache read must verify the user has project membership. |
| **Complexity increase** | MEDIUM | Feature-flag cache layer. Fallback to direct DB on any cache error. Gradual rollout. |

### 8.2 Tradeoffs

| Dimension | Current (DB-Direct) | Proposed (Write-Behind Cache) |
|-----------|-------------------|-------------------------------|
| **Read latency** | 5-50ms (DB) | <1ms (Redis) |
| **Write latency** | 15-50ms (DB sync) | <1ms (cache) + ~100ms (async DB) |
| **Consistency** | Strong (read-after-write) | Eventual (100ms window for DB) |
| **Durability** | Immediate (DB commit) | Redis persistence + async flush (small loss window) |
| **Complexity** | Simple (direct DB) | Moderate (cache layer + flush + conflict) |
| **Memory usage** | Low (no cache) | Moderate (~10MB per 10K tasks) |
| **Multi-instance** | Works (each reads from DB) | Works (shared Redis cache) |
| **Failure mode** | DB down = app down | Redis down = fallback to DB (graceful degradation) |

---

## 9. Migration Plan — Phased Rollout

### Phase 1: Read-Through Cache (Low Risk)
**Scope**: Cache task reads, serve from Redis if available, fall through to DB on miss.

```
Week 1-2:
  ├── Implement CacheManager with read-through for task:list, task:get
  ├── Implement project preload on project:join
  ├── Add cache:project:* Redis key structure
  ├── Feature flag: CACHE_ENABLED=true/false
  ├── Pass-through mode: reads hit cache first, writes go to DB then update cache
  └── Test: Cache hit ratio, latency improvement, correctness
```

### Phase 2: Write-Behind + Async Flush (Medium Risk)
**Scope**: Writes go to cache first, async flush to DB.

```
Week 3-4:
  ├── Implement write-behind for task:update, task:create, task:delete
  ├── Implement dirty set + Asynq flush worker
  ├── Add periodic reconciliation job (compare cache vs DB)
  ├── Add cache health metrics to Prometheus
  ├── Test: Write latency, flush reliability, crash recovery
  └── Test: Multi-user concurrent edits on same project
```

### Phase 3: Conflict Resolution (Medium Risk)
**Scope**: Version counters, field-level merge, conflict notification.

```
Week 5-6:
  ├── Add version counter per task in Redis
  ├── Add base_version to frontend update payloads
  ├── Implement field-level auto-merge in CacheManager
  ├── Add task:conflict WS action
  ├── Frontend: handle conflict responses (toast + merge UI)
  └── Test: Concurrent updates to same field, different fields, structural changes
```

### Phase 4: Cross-Page Aggregates (Low Risk)
**Scope**: Dashboard stats, my-tasks from cache.

```
Week 7-8:
  ├── Implement org-level dashboard stats in Redis (counters)
  ├── Implement per-user task index in Redis
  ├── Update dashboard REST handler to read from cache
  ├── Update my-tasks REST handler to read from cache
  └── Test: Stats accuracy, counter drift, cross-page consistency
```

### Phase 5: Hardening (Ongoing)
```
Week 9+:
  ├── Redis Sentinel/Cluster for HA
  ├── Cache warming on API startup (preload active projects)
  ├── Cache bypass header for debugging (X-Cache-Bypass: true)
  ├── Grafana dashboards: cache hit ratio, flush latency, dirty set size
  ├── Load testing: 100 concurrent users on same project
  └── Chaos testing: Redis crash during writes, network partition
```

---

## Appendix A: Estimated Performance Impact

| Metric | Current | After Phase 1 | After Phase 2 | After Phase 4 |
|--------|---------|---------------|---------------|---------------|
| Task list (100 tasks) | 20-50ms | **<2ms** | <2ms | <2ms |
| Task update | 15-50ms | 15-50ms | **<1ms** | <1ms |
| Dashboard stats | 50-200ms | 50-200ms | 50-200ms | **<2ms** |
| My-tasks page | 50-200ms | 50-200ms | 50-200ms | **<5ms** |
| Project open (cold) | 200-500ms | **100-300ms** (preload) | 100-300ms | 100-300ms |
| Project open (warm) | 200-500ms | **<5ms** | <5ms | <5ms |
| Concurrent edit conflict | Silent data loss | Silent data loss | **Detected + merged** | Detected + merged |

## Appendix B: Redis Memory Estimation

| Project Size | Tasks | Redis Memory | Notes |
|-------------|-------|-------------|-------|
| Small | 100 tasks | ~100KB | Hash + SortedSet + Versions |
| Medium | 1,000 tasks | ~1MB | Typical active project |
| Large | 10,000 tasks | ~10MB | Enterprise project |
| Org-wide (10 active projects) | 10,000 tasks | ~10MB | All concurrently loaded |
| Org-wide (100 active projects) | 100,000 tasks | ~100MB | Peak load scenario |

Redis default maxmemory: 256MB+ is sufficient for most deployments.

## Appendix C: Key Redis Commands Per Operation

| Operation | Redis Commands | Cost |
|-----------|---------------|------|
| **Get task** | 1 × HGETALL | O(N fields) ≈ 0.1ms |
| **List tasks** (N children) | 1 × ZRANGE + N × HGETALL (pipelined) | O(N) ≈ 0.2ms |
| **Update task** | 1 × INCR + 1 × HSET + 1 × SADD + 1 × EXPIRE | O(1) × 4 ≈ 0.1ms |
| **Create task** | 1 × HSET + 1 × ZADD + 1 × SET + 1 × SADD | O(1) × 4 ≈ 0.1ms |
| **Delete task** | 1 × DEL + 1 × ZREM + 1 × DEL + 1 × SREM | O(1) × 4 ≈ 0.1ms |
| **Preload project** (1000 tasks) | Pipeline: 1000 × HSET + 1000 × ZADD + 1000 × SET | ~5ms |
| **Flush dirty** (batch 50) | 1 × SMEMBERS + 50 × HGETALL (pipelined) | ~1ms (Redis) + 50ms (DB) |

---

## Appendix D: Implementation Status (Completed)

> **Implemented**: March 9, 2026

### Files Created

| File | Purpose |
|------|---------|
| `backend/internal/cache/keys.go` | Redis key builders (project tasks, children, versions, dirty sets, dashboard, user tasks) |
| `backend/internal/cache/manager.go` | Full cache Manager (~450 lines): preload, CRUD, Lua CAS version check, field merge, dirty tracking, dashboard aggregates |
| `backend/internal/cache/manager_test.go` | 31 unit tests covering all cache operations |
| `backend/internal/cache/integration_test.go` | 12 end-to-end integration tests: preload→mutate→flush, conflict resolution, concurrent access, multi-project isolation, serialization round-trip |
| `backend/db/migrations/000013_task_version.up.sql` | Adds `version BIGINT DEFAULT 1` column + auto-increment trigger |
| `backend/db/migrations/000013_task_version.down.sql` | Rollback migration |

### Files Modified

| File | Changes |
|------|---------|
| `backend/internal/domain/task.go` | Added `Version int64` field |
| `backend/internal/repository/task_repo.go` | All 9 SQL queries updated to include `version` column; scan functions updated |
| `backend/internal/service/task_service.go` | Cache integration in Create/Update/Delete/BulkCreate/BulkUpdate; `PreloadProjectCache()` method; `SetCache()` injection; optimistic version conflict detection with field-level auto-merge |
| `backend/internal/handler/ws_handler.go` | Cache preload on `project:join`; `task:conflict` action on version mismatch |
| `backend/internal/worker/worker.go` | Added `db:flush-task` and `db:flush-project` job types with payloads |
| `backend/internal/worker/handlers.go` | Added `HandleDBFlushTask` and `HandleDBFlushProject` methods; conditional registration |
| `backend/internal/config/config.go` | Added `CacheEnabled` bool (default: true) |
| `backend/cmd/api/main.go` | Cache manager creation, service injection, worker wiring |
| `frontend/src/types/domain.ts` | Added `version` to Task interface; new `TaskConflict` interface |
| `frontend/src/hooks/use-org-socket.ts` | `task:conflict` handler that upserts server state into store |
| `frontend/src/components/tasks/task-columns.tsx` | Sends `base_version` with task updates |
| `frontend/src/components/tasks/task-list-view.tsx` | Sends `base_version` with task updates |
| `frontend/src/components/tasks/task-tree-view.tsx` | Sends `base_version` with task updates |
| `frontend/src/components/tasks/time-tracker.tsx` | Sends `base_version` with task updates |

### Test Coverage

| Test Suite | Tests | Status |
|-----------|-------|--------|
| Cache unit tests (`manager_test.go`) | 31 | All passing |
| Cache integration tests (`integration_test.go`) | 12 | All passing |
| Existing service tests | 32 | No regressions |

### Architecture Implemented

- **Phase 1**: Project-level task cache with preload on WebSocket join
- **Phase 2**: Optimistic concurrency with Lua CAS scripts + field-level auto-merge
- **Phase 3**: Async DB flush via Asynq workers (`db:flush-task`, `db:flush-project`)
- **Phase 6 (partial)**: Dashboard aggregate counters in Redis

### Configuration

```env
CACHE_ENABLED=true  # default, set to false to disable cache layer entirely
```

### How It Works

1. When a user opens a project (WebSocket `project:join`), `PreloadProjectCache()` loads all tasks from DB into Redis
2. Task mutations (create/update/delete) write to both DB and Redis cache
3. Updates include `base_version` for optimistic concurrency; version conflicts trigger field-level auto-merge or return `task:conflict` to the client
4. Dirty tasks are tracked in Redis sets; Asynq workers flush them to DB asynchronously
5. Cache TTL is 30 minutes; refreshed on each project interaction
6. Frontend receives `task:conflict` events and updates store with server state
