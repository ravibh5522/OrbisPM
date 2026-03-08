# OrbisPM Offline-Friendly Architecture Plan

## Executive Summary

OrbisPM currently has **zero offline infrastructure**. All data lives in-memory (Zustand store + React Query cache) and vanishes on page reload or WebSocket disconnect. This plan transforms OrbisPM into an offline-first capable application in **5 phases**, allowing users to view, create, and edit tasks without an internet connection, then seamlessly sync when back online.

---

## Current State Assessment

| Aspect | Status |
|---|---|
| Service Worker / PWA | None |
| IndexedDB / local persistence | None |
| React Query persistence | None (30s stale, 5min GC) |
| Zustand persistence | None (reset on WS disconnect) |
| Offline detection | None |
| Mutation queue / sync | None |
| Conflict resolution | None |
| Optimistic UI | None (all mutations await server response) |

---

## Phase 1: Foundation — PWA Shell + Asset Caching

**Goal**: Make the app installable, cache static assets so the shell loads instantly, even offline.

### 1.1 Add Web App Manifest

Create `frontend/public/manifest.json`:
```json
{
  "name": "OrbisPM",
  "short_name": "OrbisPM",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1d232a",
  "theme_color": "#6419e6",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 1.2 Integrate Serwist (Next.js Service Worker Toolbox)

```bash
npm install @serwist/next serwist
```

Configure in `next.config.ts`:
```ts
import withSerwist from "@serwist/next";
export default withSerwist({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
})({ /* existing next config */ });
```

Create `frontend/src/sw.ts`:
```ts
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST, // auto-generated from build
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

### 1.3 Runtime Caching Strategy

| Resource Pattern | Strategy | Max Age |
|---|---|---|
| `/_next/static/**` | CacheFirst | 1 year |
| `/api/**` (GET) | NetworkFirst | 5 min |
| `/api/**` (POST/PUT) | NetworkOnly | — |
| `/storage/**` (images) | CacheFirst | 30 days |
| Page navigations | NetworkFirst | 1 hour |
| Google Fonts / CDN | CacheFirst | 1 year |

### 1.4 Offline Fallback Page

Create a lightweight offline page at `frontend/public/offline.html` that shows "You're offline. Cached data is available below." The service worker serves this when a navigation request fails.

### Deliverable
- App is installable (PWA)
- Static assets cached — shell loads in 0ms on revisits
- Images/avatars cached for offline display
- API GET responses cached for short-term offline reads

---

## Phase 2: Data Persistence Layer — IndexedDB + Zustand

**Goal**: Persist all viewed data locally so it survives page reloads and network outages.

### 2.1 Add Dexie.js (IndexedDB Wrapper)

```bash
npm install dexie
```

Create `frontend/src/lib/offline-db.ts`:
```ts
import Dexie, { type Table } from "dexie";

export class OrbisPMDB extends Dexie {
  orgs!: Table;
  projects!: Table;
  tasks!: Table; // Indexed: [projectId+parentTaskId], [projectId+status]
  taskTree!: Table; // Indexed: [projectId]
  checklists!: Table; // Indexed: [taskId]
  comments!: Table; // Indexed: [taskId]
  dependencies!: Table; // Indexed: [taskId]
  watchers!: Table; // Indexed: [taskId]
  changeRequests!: Table; // Indexed: [taskId], [projectId]
  notifications!: Table; // Indexed: [userId]
  members!: Table; // Indexed: [orgId], [projectId]
  activity!: Table; // Indexed: [orgId]
  pendingMutations!: Table; // Offline mutation queue
  syncMeta!: Table; // Last-sync timestamps per entity

  constructor() {
    super("orbispm");
    this.version(1).stores({
      orgs: "id, slug",
      projects: "id, orgId, [orgId+status]",
      tasks: "id, projectId, [projectId+parentTaskId], [projectId+status], [projectId+assigneeId]",
      taskTree: "projectId",
      checklists: "id, taskId",
      comments: "id, taskId",
      dependencies: "[taskId+dependsOnId], taskId",
      watchers: "[taskId+userId], taskId",
      changeRequests: "id, taskId, [projectId+status]",
      notifications: "id, userId, [userId+readAt]",
      members: "++, [orgId+userId], [projectId+userId]",
      activity: "id, orgId",
      pendingMutations: "++id, status, createdAt",
      syncMeta: "entityType",
    });
  }
}

export const db = new OrbisPMDB();
```

### 2.2 Write-Through Caching Pattern

Every time data is received (from WS response, REST API, or broadcast), write it to both the Zustand store AND IndexedDB:

```ts
// In use-project-socket.ts handleMessage or in the store actions:
async function cacheTasksToIDB(projectId: string, parentKey: string, tasks: Task[]) {
  const tx = db.transaction("rw", db.tasks, async () => {
    for (const task of tasks) {
      await db.tasks.put({ ...task, projectId, _cachedAt: Date.now() });
    }
  });
  await tx;
}
```

### 2.3 Hydration on Mount

When a task view mounts and WS is not yet connected, read from IndexedDB:

```ts
const fetchColumn = useCallback(async (depth, parentId) => {
  // Try WS first
  if (send) {
    const res = await send("task:list", { parent_id: parentId ?? "root" });
    setColumnData(depth, res.data);
    cacheTasksToIDB(projectId, parentId ?? "root", res.data); // persist
    return;
  }
  // Fallback: load from IndexedDB
  const cached = await db.tasks
    .where({ projectId, parentTaskId: parentId ?? null })
    .toArray();
  if (cached.length) setColumnData(depth, cached);
}, [send, projectId]);
```

### 2.4 Zustand Store Persistence (Selective)

Don't persist the entire store (Maps with live data). Instead:
- On WS disconnect: **DON'T** call `reset()` — keep data in memory
- On page unload: IndexedDB already has the data
- On page load: Hydrate from IndexedDB before WS connects

### 2.5 Cache Invalidation

| Strategy | When |
|---|---|
| **Write-through** | Every API/WS response updates IDB |
| **TTL-based** | `_cachedAt` field, show stale indicator after 5 min |
| **On-sync** | After reconnect, WS fetches override IDB data |
| **Max cache size** | Per-project: keep last 1000 tasks, 500 comments |

### Deliverable
- All viewed data persists across page reloads
- Task views load instantly from IndexedDB, then refresh from WS
- "Stale data" indicator shows when offline data is >5 minutes old
- No more blank page on load

---

## Phase 3: Offline Mutations — Queue + Optimistic UI

**Goal**: Allow creating and editing tasks offline. Queue mutations and sync when back online.

### 3.1 Offline Mutation Queue

Each mutation stores a queue entry in IndexedDB:

```ts
interface PendingMutation {
  id: number; // auto-increment
  action: string; // "task:create", "task:update", etc.
  payload: Record<string, any>;
  projectId: string;
  orgId: string;
  tempId?: string; // client-generated UUID for creates
  status: "pending" | "syncing" | "failed" | "synced";
  createdAt: number;
  retryCount: number;
  error?: string;
}
```

### 3.2 Optimistic UI Pattern

```ts
async function createTaskOffline(params: CreateTaskParams) {
  const tempId = crypto.randomUUID();
  const optimisticTask = {
    id: tempId,
    ...params,
    status: "todo",
    _offline: true, // visual indicator
    created_at: new Date().toISOString(),
  };

  // 1. Update local state immediately
  store.addTask(optimisticTask);
  await db.tasks.put(optimisticTask);

  // 2. Queue mutation
  await db.pendingMutations.add({
    action: "task:create",
    payload: params,
    projectId: params.projectId,
    orgId: params.orgId,
    tempId,
    status: "pending",
    createdAt: Date.now(),
    retryCount: 0,
  });

  // 3. Try to sync immediately if online
  if (store.connected && store.send) {
    await syncPendingMutations();
  }
}
```

### 3.3 Sync Engine

```ts
async function syncPendingMutations() {
  const pending = await db.pendingMutations
    .where("status").equals("pending")
    .sortBy("createdAt");

  for (const mutation of pending) {
    try {
      await db.pendingMutations.update(mutation.id, { status: "syncing" });
      const result = await send(mutation.action, mutation.payload);

      // Replace temp ID with server ID
      if (mutation.tempId && result?.id) {
        await db.tasks.delete(mutation.tempId);
        await db.tasks.put(result);
        store.replaceTask(mutation.tempId, result);
      }

      await db.pendingMutations.update(mutation.id, { status: "synced" });
    } catch (err) {
      const retryCount = mutation.retryCount + 1;
      await db.pendingMutations.update(mutation.id, {
        status: retryCount >= 5 ? "failed" : "pending",
        retryCount,
        error: err.message,
      });

      if (retryCount >= 5) break; // Stop on permanent failure
    }
  }
}
```

### 3.4 Supported Offline Mutations (Priority Order)

| Mutation | Complexity | Strategy |
|---|---|---|
| **Create task** | Medium | Client-generated temp UUID, replace on sync |
| **Update task** (title, description, status, priority, assignee, dates) | Medium | Last-write-wins per field |
| **Toggle checklist** | Low | Append to queue |
| **Create comment** | Low | Append-only, no conflicts |
| **Delete task** | Medium | Soft-delete locally, queue server delete |
| **Reorder tasks** | High | Store new positions, apply on sync |
| **Watch/unwatch** | Low | Toggle locally, queue |
| **Mark notification read** | Low | Optimistic + queue |

### 3.5 Visual Indicators

- Tasks created offline show a cloud-offline icon badge
- Pending sync count in toolbar: "3 changes pending sync"
- Failed mutations show error with retry button
- Toast notification on successful sync: "All changes synced"

### Deliverable
- Users can create/edit/delete tasks while offline
- Changes queue automatically and sync on reconnect
- Clear visual feedback for offline state and sync status
- Failed mutations surface to user with retry option

---

## Phase 4: Conflict Resolution + Sync Protocol

**Goal**: Handle the case where multiple users edit the same task while one was offline.

### 4.1 Vector Clocks / Version Numbers

Add a `version` (integer) column to the `tasks` table:
```sql
ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
```

Every update increments the version. The WS `task:update` response includes the new version. Offline mutations store the `baseVersion` they were created against.

### 4.2 Conflict Detection

When syncing an offline mutation:
1. Send `{ task_id, version: baseVersion, ...changes }` to server
2. Server checks: `current_version == baseVersion`?
   - **Yes**: Apply changes, increment version, return success
   - **No**: Return `{ error: "conflict", server_version: N, server_data: {...} }`

### 4.3 Conflict Resolution Strategies

| Strategy | When to Use |
|---|---|
| **Last-Write-Wins (per field)** | Non-critical fields: title, description, due_date |
| **Server-Wins** | Status transitions, review decisions, dependencies |
| **Client-Wins (with confirmation)** | Priority, assignee (show "Your change was overridden by X") |
| **Manual merge** | Description text (show diff dialog) |

### 4.4 Implementation

```ts
async function resolveConflict(mutation: PendingMutation, serverData: Task) {
  const strategy = getConflictStrategy(mutation.action, mutation.payload);

  switch (strategy) {
    case "last-write-wins":
      // Re-apply only changed fields on top of server version
      const merged = { ...serverData };
      for (const [key, value] of Object.entries(mutation.payload)) {
        if (key !== "task_id" && key !== "version") {
          merged[key] = value;
        }
      }
      merged.version = serverData.version; // base on server version
      return send("task:update", merged);

    case "server-wins":
      // Accept server version, discard local changes
      store.upsertTask(serverData);
      await db.tasks.put(serverData);
      return;

    case "manual":
      // Show conflict dialog to user
      store.addConflict({ mutation, serverData });
      return;
  }
}
```

### 4.5 Broadcast Reconciliation

When receiving a broadcast while having pending offline mutations for the same entity:
- Don't apply the broadcast (it would overwrite local optimistic changes)
- Store it in a "deferred broadcasts" queue
- Apply after local mutations are synced

### Deliverable
- Offline edits don't lose data when conflicting with other users' changes
- Clear conflict resolution for each field type
- Manual merge UI for complex conflicts (description text)
- Deferred broadcast handling prevents data ping-pong

---

## Phase 5: Advanced Offline Features

### 5.1 Background Sync API

Register sync events for offline mutations:
```ts
// In service worker
self.addEventListener("sync", async (event) => {
  if (event.tag === "sync-mutations") {
    event.waitUntil(syncPendingMutations());
  }
});

// When queueing offline mutation
if ("serviceWorker" in navigator && "SyncManager" in window) {
  const reg = await navigator.serviceWorker.ready;
  await reg.sync.register("sync-mutations");
}
```

This allows sync to happen even if the app tab is closed, as long as the browser is open.

### 5.2 Periodic Background Sync

Request periodic sync to keep offline data fresh:
```ts
const reg = await navigator.serviceWorker.ready;
await reg.periodicSync.register("refresh-data", {
  minInterval: 15 * 60 * 1000, // 15 minutes
});
```

In the service worker, fetch updated data for the user's active projects and store in IndexedDB.

### 5.3 Offline File Caching

For attachments that users have viewed:
1. Cache downloaded files in the Cache API
2. Show cached files offline with a "cached" badge
3. Allow queueing file uploads for sync (store File blobs in IndexedDB)

### 5.4 Push Notifications (Replace SSE for Critical Alerts)

When offline, SSE can't deliver notifications. Use Web Push:
```ts
// Request permission + subscribe
const subscription = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: VAPID_PUBLIC_KEY,
});
// Send subscription to backend
await api.notifications.subscribePush(subscription);
```

Backend sends push for critical events:
- Task assigned to you
- Change request approved/rejected
- Upcoming due dates

### 5.5 Selective Offline Data

Let users choose which projects to keep offline:
```
Settings → Offline Data → [✓] Project Alpha  [✓] Project Beta  [ ] Project Gamma
```

Selected projects have their full task tree + sub-resources cached in IndexedDB. Unselected ones only cache what's been viewed.

### 5.6 Storage Quota Management

Monitor IndexedDB usage and warn users:
```ts
const estimate = await navigator.storage.estimate();
const usagePercent = (estimate.usage / estimate.quota) * 100;
if (usagePercent > 80) {
  // Trim old cached data (LRU by _cachedAt)
  await pruneOldCache();
}
```

### Deliverable
- Background sync when app is closed
- Periodic data refresh for active projects
- Offline attachment viewing
- Push notifications for critical events
- User-controlled offline data management

---

## Implementation Roadmap

| Phase | Scope | Effort | Dependencies |
|---|---|---|---|
| **Phase 1** | PWA + Asset Caching | 1 sprint | None |
| **Phase 2** | IndexedDB + Hydration | 2 sprints | Phase 1 |
| **Phase 3** | Offline Mutations + Sync | 3 sprints | Phase 2 |
| **Phase 4** | Conflict Resolution | 2 sprints | Phase 3, DB migration |
| **Phase 5** | Advanced (Push, BG Sync, File Cache) | 2-3 sprints | Phase 3 |

**Recommended start**: Phase 1 + 2 together — gives massive perceived performance improvement (instant load, data persists) with moderate effort.

---

## Technology Choices

| Need | Recommendation | Why |
|---|---|---|
| Service Worker | **Serwist** (for Next.js) | Built for Next.js 15, replaces deprecated next-pwa |
| IndexedDB | **Dexie.js v4** | Best DX, observable queries, versioned schemas |
| Mutation Queue | Custom (Dexie table) | Simpler than a full CRDT library for our use case |
| Conflict Resolution | Custom (version-based) | CRDT is overkill for task management |
| Push Notifications | **web-push** (npm) + backend VAPID | Standard Web Push API |
| State Persistence | Dexie → Zustand hydration | Don't use zustand/persist (Maps don't serialize well) |

---

## Database Changes Required

### Phase 4 Migration
```sql
-- Add version tracking for optimistic concurrency
ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE checklists ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Add updated_at index for delta sync
CREATE INDEX idx_tasks_updated_at ON tasks (project_id, updated_at);
CREATE INDEX idx_checklists_updated_at ON checklists (task_id, updated_at);
CREATE INDEX idx_comments_updated_at ON comments (task_id, updated_at);
```

### Backend API Changes
- Add `version` field to Task update response
- Add `If-Match` header / `base_version` field to update requests
- Add `GET /api/v1/orgs/{orgId}/projects/{projectId}/tasks/delta?since=TIMESTAMP` endpoint for delta sync
- Add WS action `task:delta` for incremental sync after reconnect

---

## Key Architecture Decisions

### 1. Why NOT CRDTs?
CRDTs (Conflict-free Replicated Data Types) are powerful but add significant complexity. Our task management data has:
- Relatively low write frequency per entity
- Clear ownership (assignee)
- Server-authoritative status transitions
- Simple field-level conflicts (not collaborative text editing)

A version-based last-write-wins approach with per-field merge is simpler and sufficient.

### 2. Why Dexie over Raw IndexedDB?
- Observable queries (Dexie Live Query) — auto-update UI when IDB changes
- Versioned schema migrations
- Transaction support
- Much simpler API than raw IDB

### 3. Why NOT React Query Persistence?
React Query's `persistQueryClient` works well for simple cases but:
- Our task data lives in Zustand Maps, not React Query cache
- We need fine-grained control over what's cached (per-project)
- Mutation queue needs custom logic (not just replaying queries)
- IndexedDB gives us more control than opaque serialized cache

### 4. Sync Strategy: Delta vs Full
- **On reconnect**: Fetch only changes since last known timestamp (`delta sync`)
- **On first project open**: Full fetch → cache in IDB
- **Periodic background**: Delta sync every 15 minutes for pinned projects

---

## Offline UX Guidelines

### Visual States
| State | Indicator |
|---|---|
| **Online** | Green dot in status bar |
| **Offline** | Yellow banner: "You're offline. Changes will sync when reconnected." |
| **Syncing** | Spinning sync icon + count: "Syncing 3 changes..." |
| **Sync failed** | Red badge: "2 changes failed to sync" + retry button |
| **Stale data** | Subtle timestamp: "Last updated 15 min ago" |

### Disabled Features When Offline
- File upload/download (show cached files only)
- Search (show "search unavailable offline")
- Import/Export
- Billing
- Member invite
- Change request approve/reject (queue for sync)

### Enabled Features When Offline
- Browse all cached tasks, projects, teams
- Create new tasks (queued)
- Edit task fields (queued)
- Toggle checklists (queued)
- Add comments (queued)
- View cached attachments
- Full navigation
- Theme switching
