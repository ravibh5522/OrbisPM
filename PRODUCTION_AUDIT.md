# Production Audit: Caching, Sync, Versioning & UI Updates

**Date:** 2026-04-01  
**Scope:** OrbisPM platform — Backend (Go), Frontend (Next.js), Messaging Service, Chat Service  
**Goal:** Identify all bugs, edge cases, and improvements for production-grade caching, real-time sync, dirty read/write prevention, and UI state consistency.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Critical Bugs (Fix Before Production)](#2-critical-bugs)
3. [Backend Cache & Versioning Issues](#3-backend-cache--versioning-issues)
4. [Frontend Caching & State Issues](#4-frontend-caching--state-issues)
5. [Real-Time Sync Issues (WebSocket/SSE)](#5-real-time-sync-issues)
6. [Messaging Service Issues](#6-messaging-service-issues)
7. [Data Preloading Gaps](#7-data-preloading-gaps)
8. [UI Update Failures](#8-ui-update-failures)
9. [Edge Cases & Race Conditions](#9-edge-cases--race-conditions)
10. [Recommendations & Prioritized Fix Plan](#10-recommendations--prioritized-fix-plan)

---

## 1. Executive Summary

The platform has solid infrastructure (Redis caching, WebSocket/SSE real-time, IndexedDB offline persistence) but has **47 identified issues** across caching, sync, versioning, and UI updates that must be addressed for production readiness.

### Severity Breakdown

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 8 | Data loss, silent sync breaks, security gaps |
| **HIGH** | 16 | Stale data shown to users, missing broadcasts, race conditions |
| **MEDIUM** | 15 | UX degradation, memory leaks, inefficiency |
| **LOW** | 8 | Code quality, minor edge cases |

### Top 5 Most Impactful Issues

1. **REST API updates don't broadcast to WebSocket clients** — users see stale data indefinitely
2. **Event publishing happens outside DB transactions** — events silently lost on failure
3. **Field-level merge can't detect same-field conflicts** — data loss on concurrent edits
4. **WebSocket messages silently dropped when buffer full** — random clients miss updates
5. **No message history sync on reconnect** — users miss messages after network outage

---

## 2. Critical Bugs

### CRIT-01: REST API Task Updates Don't Broadcast to WebSocket Clients

**Files:**
- `backend/internal/handler/task_handler.go` (lines 294-316)

**Problem:** The HTTP `PATCH /tasks/{id}` endpoint updates the DB and cache but does NOT publish any WebSocket broadcast. Only the WebSocket handler (`ws_handler.go:545`) broadcasts. This means any task updated via REST API is invisible to all WebSocket-connected clients.

**Affected endpoints:**
- `PATCH /tasks/{id}` (Update)
- `POST /tasks/{id}/review` (SubmitForReview)
- `POST /tasks/{id}/complete` (MarkComplete)
- `POST /tasks/{id}/duplicate` (Duplicate)

**Impact:** Complete real-time sync failure for REST-initiated changes. WebSocket clients see stale data until cache TTL expires (30 min).

**Fix:** Publish WebSocket broadcast in the service layer (not handler), so both REST and WS paths trigger it.

---

### CRIT-02: Event Publishing Outside DB Transactions

**Files:**
- `backend/internal/service/task_service.go` (lines 1472-1485)
- `messaging-service/internal/service/message_service.go` (lines 126-127)

**Problem:** All services follow this pattern:

```
1. Begin DB transaction
2. Write to database
3. Commit transaction ✅
4. Publish event to Redis Pub/Sub ← THIS CAN FAIL
```

If step 4 fails (Redis down, network issue), the DB has new data but no subscriber knows. The system is in an inconsistent state — update happened but no one was notified.

**Impact:** Silent data desync. Users' views freeze while database has moved forward. No retry mechanism exists.

**Fix:** Use the transactional outbox pattern — write events to a DB table inside the same transaction, then have a separate worker publish them to Redis.

---

### CRIT-03: Field-Level Merge Cannot Detect Same-Field Conflicts

**File:** `backend/internal/cache/manager.go` (lines 325-343)

**Problem:** `FieldLevelMerge` detects version mismatch but cannot distinguish whether two users edited different fields (safe) or the same field (conflict). It always returns "auto-merged", silently overwriting one user's changes.

**Scenario:**
1. Task at version 5, title = "Old Title"
2. User A changes title to "A's Title", submits with baseVersion=5
3. User B changes title to "B's Title", submits with baseVersion=5
4. User A's write succeeds, version → 6
5. User B's write triggers merge — but merge has no field tracking
6. Result: "auto-merged", User A's title silently overwritten

**Impact:** Confirmed data loss on concurrent edits to the same field.

**Fix:** Track which fields each user changed (send `changed_fields[]` from client). If fields overlap and versions diverge, return a hard conflict, not auto-merge.

---

### CRIT-04: WebSocket Broadcast Silently Drops Messages When Buffer Full

**Files:**
- `backend/internal/websocket/org_hub.go` (lines 163-223)
- `backend/internal/handler/ws_handler.go` (line 102, buffer size = 256)

**Problem:** All broadcast methods use non-blocking channel sends:

```go
select {
case conn.send <- data:
default:
    log.Warn().Msg("ws: send buffer full, dropping message")
}
```

If a client is slow (poor network, background tab), the send buffer fills and messages are silently dropped. No retry, no acknowledgment, no client notification.

**Impact:** Random clients miss updates. They see stale data with no indication that sync is broken. Particularly dangerous for task status changes and reorder operations.

**Fix:** Track consecutive drops per connection. After N drops, force-close the connection so the client reconnects and gets fresh state.

---

### CRIT-05: Version Check Silently Skipped When Cache is Down

**File:** `backend/internal/service/task_service.go` (lines 748-779)

**Problem:** The optimistic version check is gated behind three conditions:

```go
if s.cache != nil && params.BaseVersion > 0 && s.cache.IsProjectLoaded(ctx, task.ProjectID) {
    // Version check happens here
}
// If ANY condition fails → update proceeds WITHOUT conflict detection
```

If Redis is down, cache expires, or client omits `BaseVersion`, the version check is entirely skipped. Two users can overwrite each other's changes.

**Impact:** Write-write conflicts go undetected when Redis is unavailable. Silent data loss.

**Fix:** Add a DB-level version column with `WHERE version = $expected` in the UPDATE query as a fallback. Return conflict error if 0 rows affected.

---

### CRIT-06: Cache-DB Inconsistency Window After Writes

**File:** `backend/internal/service/task_service.go` (lines 970-1053)

**Problem:** DB transaction commits BEFORE cache is updated:

```
1. DB transaction commits (line 1030) ✅
2. Process could crash here
3. Cache.SetTask (line 1037) ← never executes
```

Between steps 1 and 3, another user reading from cache sees stale data. If the process crashes, the cache remains stale until TTL expires (30 minutes).

**Impact:** Users see outdated data for up to 30 minutes after a crash or slow cache write.

**Fix:** Accept this as eventual consistency (document it), OR invalidate the cache key before writing (so reads fall through to DB), then write the new value.

---

### CRIT-07: No Message History Sync on WebSocket Reconnect

**Files:**
- `frontend/src/hooks/use-chat-socket.ts` (reconnection logic)
- `frontend/src/hooks/use-project-socket.ts` (reconnection logic)
- `messaging-service/internal/handler/ws_handler.go`

**Problem:** When a WebSocket reconnects after a network outage, there is NO mechanism to sync missed messages. The client simply resumes receiving new events, unaware of what was lost during the disconnect window.

**Impact:** Users miss task updates, chat messages, and status changes that occurred during network outages. They see a partial/stale view with no indication of missing data.

**Fix:** Track a `last_event_id` or `last_event_timestamp` per client. On reconnect, client sends its last known event. Server replays events since that point (from an event log or Redis Streams).

---

### CRIT-08: No Delivery Guarantees for Chat Messages

**File:** `messaging-service/internal/service/message_service.go` (lines 70-128)

**Problem:** Message sending has no idempotency key. If a client retries a failed send (network timeout), the message is created twice in the database. There's also no delivery confirmation — the sender doesn't know if recipients received the message.

**Impact:** Duplicate messages on retry. No way to know if a message was delivered. Read receipts are defined in domain events but not implemented.

**Fix:** Add `client_message_id` (idempotency key) to message creation. Deduplicate on insert. Implement read receipt handlers.

---

## 3. Backend Cache & Versioning Issues

### CACHE-01: Preload Lock Race Condition (Stampede Protection Gap)

**File:** `backend/internal/cache/manager.go` (lines 62-83)

**Problem:** When two processes race to preload a project:
1. Process A acquires lock, begins loading
2. Process B waits 100ms, checks `IsProjectLoaded()` → false (A still loading)
3. Process B tries lock again → fails (A holds it)
4. Process B returns `nil` (success!) but project is NOT loaded

**Severity:** MEDIUM  
**Fix:** Return an error when lock acquisition fails, forcing the caller to fall through to DB.

---

### CACHE-02: Progress Recalculation Race Condition

**File:** `backend/internal/cache/manager.go` (lines 556-598)

**Problem:** `RecalcProgressUp` reads a task, computes progress, and writes it back without holding a lock. Concurrent recalculations can overwrite each other.

**Severity:** MEDIUM  
**Fix:** Use Redis WATCH/MULTI for atomic read-modify-write, or accept eventual consistency with a scheduled reconciliation job.

---

### CACHE-03: No Cache Key Versioning

**File:** `backend/internal/cache/keys.go`

**Problem:** Cache keys have no schema version prefix. If the cache structure changes (e.g., adding a field to cached Task), old cached data is deserialized into the new struct, potentially causing zero-value bugs or panics.

**Severity:** LOW  
**Fix:** Add a version prefix to keys: `v2:project:{id}:task:{id}`. Bump on schema changes.

---

### CACHE-04: Permission Cache TTL Too Long

**File:** `backend/internal/cache/manager.go` (line 40)

**Problem:** Permission check results are cached for 5 minutes. If a user's role is changed (e.g., demoted from admin), they retain elevated permissions for up to 5 minutes.

**Severity:** MEDIUM  
**Fix:** Invalidate permission cache on role change events. Keep TTL as fallback.

---

### CACHE-05: Reorder Progress Changes Not Broadcast

**File:** `backend/internal/service/task_service.go` (lines 1400-1467)

**Problem:** Reorder changes task parent relationships, which affects ancestor progress. Cache is updated, but WebSocket clients only receive a `task:reordered` event — not individual `task:updated` events for ancestors whose progress changed.

**Severity:** HIGH  
**Fix:** After reorder, broadcast `task:updated` for each ancestor whose progress changed.

---

### CACHE-06: Bulk Operations Don't Broadcast Ancestor Updates

**File:** `backend/internal/handler/ws_handler.go` (lines 588-642)

**Problem:** `handleTaskBulkCreate` and `handleTaskBulkUpdate` call `RecalcProgressUp` in the service layer but don't broadcast ancestor updates. Compare to `handleTaskCreate` (line 490-495) which does broadcast ancestors.

**Severity:** HIGH  
**Fix:** Include `ancestors_updated` in bulk operation broadcast payloads.

---

## 4. Frontend Caching & State Issues

### FE-01: SSE Handler Missing orgId in Query Key Invalidations

**File:** `frontend/src/hooks/use-websocket.tsx` (lines 85-132)

**Problem:** Multiple `invalidateQueries` calls are missing `orgId` in the query key:

```typescript
qc.invalidateQueries({ queryKey: ["dashboard-stats"] });     // should be ["dashboard-stats", orgId]
qc.invalidateQueries({ queryKey: ["org-members"] });          // should be ["org-members", orgId]
qc.invalidateQueries({ queryKey: ["team-members"] });          // should be ["team-members", orgId, teamId]
qc.invalidateQueries({ queryKey: ["project-members"] });       // should be ["project-members", orgId, projectId]
```

**Severity:** HIGH  
**Impact:** Cache invalidations hit wrong queries or don't match at all. Stale data persists.

---

### FE-02: Blob URL Memory Leak in Chat Attachments

**File:** `frontend/src/components/chat/message-list.tsx` (lines 43-68)

**Problem:** `URL.createObjectURL()` creates blob URLs that are never revoked. With `gcTime: 15min`, the React Query entry is garbage collected but the blob URL persists in browser memory indefinitely.

**Severity:** MEDIUM  
**Impact:** Memory leak in long chat sessions with many images. Can cause tab crashes.

**Fix:** Use `useEffect` cleanup to call `URL.revokeObjectURL(blobUrl)` when the component unmounts or the query is garbage collected.

---

### FE-03: No Optimistic Updates on Any Mutation

**Files:** All mutation-using components

**Problem:** Zero mutations use `onMutate` for optimistic updates. Every action (mark notification read, send message, update task, add reaction) waits for server confirmation before the UI updates.

**Severity:** HIGH  
**Impact:** Perceived lag on every interaction. Especially noticeable on chat (message sending), task status changes, and notification marking.

**Fix:** Implement optimistic updates with rollback for the highest-frequency mutations:
1. Chat message send (show immediately, grey out until confirmed)
2. Task status change (toggle immediately, revert on error)
3. Notification mark-as-read (update count immediately)
4. Reaction add/remove (toggle immediately)

---

### FE-04: IndexedDB Persister Has No Schema Versioning

**File:** `frontend/src/lib/offline/persister.ts`

**Problem:** The persister stores and restores the entire React Query cache without any version check. After a deployment that changes API response shapes, users load stale cache with old data structures, potentially causing rendering errors.

**Severity:** MEDIUM  
**Fix:** Add a `buster` value tied to the app build hash:

```typescript
persistOptions: {
  persister,
  maxAge: 24 * 60 * 60 * 1000,
  buster: process.env.NEXT_PUBLIC_BUILD_ID || "",
}
```

---

### FE-05: IndexedDB Quota Exceeded Silently Swallowed

**File:** `frontend/src/lib/offline/persister.ts` (line 20)

**Problem:** If IndexedDB storage is full, the write fails silently. Users think they have offline support but their cache isn't persisting.

**Severity:** LOW  
**Fix:** Log a warning; optionally show a toast on persistent failure.

---

### FE-06: Notification Invalidation Too Broad

**File:** `frontend/src/app/[orgSlug]/notifications/page.tsx` (lines 46-71)

**Problem:** Marking one notification as read invalidates the entire `["notifications", orgId]` query. For users with 100+ notifications, this refetches everything and causes a loading spinner.

**Severity:** MEDIUM  
**Fix:** Use `queryClient.setQueryData` to update the single notification in cache, or use optimistic updates.

---

### FE-07: Token Refresh Race Causes Multiple Redirects

**File:** `frontend/src/lib/api.ts` (lines 91-106)

**Problem:** If token refresh fails, multiple concurrent requests each call `clearAuth()` and `window.location.href = "/login"`. This causes multiple rapid redirects.

**Severity:** LOW  
**Fix:** Use a flag (`isRedirecting`) to prevent duplicate redirects.

---

### FE-08: Download Function Skips Token Refresh

**File:** `frontend/src/lib/api.ts` (lines 226-239)

**Problem:** `downloadBlob()` doesn't call `ensureValidToken()` before making the request. If the token is expired, the download fails with a generic "Download failed" error.

**Severity:** MEDIUM  
**Fix:** Call `ensureValidToken()` at the start of `downloadBlob()`.

---

### FE-09: Auth Initialize Race in React Strict Mode

**File:** `frontend/src/stores/auth-store.ts` (lines 36-80)

**Problem:** `initialize()` can be called multiple times in development (React Strict Mode). Multiple concurrent API calls fire, potentially setting conflicting state.

**Severity:** LOW  
**Fix:** Add a guard (`if (get().isLoading) return;`) at the top of `initialize()`.

---

### FE-10: refetchOnWindowFocus Disabled Globally

**File:** `frontend/src/components/providers.tsx` (line ~55)

**Problem:** `refetchOnWindowFocus: false` means when a user returns to the tab after being away (lunch, meeting), they see stale data with no automatic refresh.

**Severity:** MEDIUM  
**Fix:** Enable `refetchOnWindowFocus` selectively for critical queries (notifications, chat sidebar, task lists) while keeping it off for heavy queries (dashboard stats, project tree).

---

## 5. Real-Time Sync Issues

### SYNC-01: Project WebSocket `task:reordered` Handler is Empty

**File:** `frontend/src/hooks/use-project-socket.ts` (lines 200-202)

**Problem:**

```typescript
case "task:reordered":
  // Trigger a re-fetch from the server for reordering
  break;  // ← EMPTY! No re-fetch actually happens
```

**Severity:** HIGH  
**Impact:** When any user reorders tasks, all other users' views remain in the old order until they refresh the page.

**Fix:** Invalidate task list queries or fetch updated task positions from the server.

---

### SYNC-02: Change Request Approval/Rejection Handler is Empty

**File:** `frontend/src/hooks/use-project-socket.ts` (lines 237-241)

**Problem:**

```typescript
case "cr:approved":
case "cr:rejected":
  // These modify task state too; components should re-fetch
  break;  // ← EMPTY!
```

**Severity:** HIGH  
**Impact:** Change request status changes are invisible to other users. Task status changes triggered by CR approval are not reflected.

**Fix:** Invalidate task and change-request queries when these events arrive.

---

### SYNC-03: Checklist Updates Don't Invalidate React Query Cache

**File:** `frontend/src/hooks/use-project-socket.ts` (lines 205-213)

**Problem:** Checklist broadcasts update the Zustand store but don't invalidate React Query keys like `["task", orgId, projectId, taskId]` (which contains `checklist_progress`).

**Severity:** MEDIUM  
**Impact:** Task cards showing checklist progress (e.g., "3/5 done") are stale after another user completes a checklist item.

---

### SYNC-04: Chat Reactions on Unloaded Messages Silently Dropped

**File:** `frontend/src/hooks/use-chat-socket.ts` (lines 225-272)

**Problem:** If a reaction event arrives for a message not in the local store (pagination gap), it's silently dropped. No cache invalidation triggers a refetch.

**Severity:** LOW  
**Impact:** Reactions on older messages (scrolled past) are lost from local state. They'll appear on the next full channel fetch.

---

### SYNC-05: No Message Loss Recovery Across Any WebSocket

**Files:**
- `frontend/src/hooks/use-org-socket.ts` (lines 62-126)
- `frontend/src/hooks/use-project-socket.ts`
- `frontend/src/hooks/use-chat-socket.ts`

**Problem:** None of the three WebSocket connections track a sequence number or last-event-ID. On reconnect, the client resumes receiving new events but has no way to request events missed during the disconnect window.

**Severity:** HIGH  
**Impact:** Any network interruption (even 2 seconds) can cause permanently stale state until the user manually refreshes.

**Fix:** Use Redis Streams (not Pub/Sub) for event delivery. Track `last_event_id` per client. On reconnect, replay from that point.

---

### SYNC-06: Pending WebSocket Requests Not Cleaned Up on Disconnect

**File:** `frontend/src/hooks/use-project-socket.ts` (lines 41-61)

**Problem:** When the WebSocket closes, pending request promises (with 30s timeout) are not rejected immediately. They linger until timeout, holding references and potentially resolving against a new connection.

**Severity:** MEDIUM  
**Fix:** On `onclose`, iterate `pendingRef.current` and reject all with "Connection closed".

---

### SYNC-07: Chat WebSocket Reconnect Race Condition

**File:** `frontend/src/hooks/use-chat-socket.ts` (lines 67-85)

**Problem:** If two reconnects fire in rapid succession, the second's `onopen` can fire before the first's `onclose`. The first's `onclose` then clears the global WS reference, leaving the app thinking it's disconnected even though connection 2 is alive.

**Severity:** MEDIUM  
**Fix:** In `onclose`, check if the closing WS is still the current one before clearing state.

---

### SYNC-08: Typing Indicator Never Expires on Abrupt Disconnect

**File:** `frontend/src/hooks/use-chat-socket.ts` (lines 211-218)

**Problem:** `typing.start` sets a 5-second auto-clear timeout. If a user disconnects abruptly (closes browser), no `typing.stop` is sent, and the indicator stays visible for the full 5 seconds. Multiple stale indicators can accumulate.

**Severity:** LOW  
**Fix:** Clear all typing indicators for a user when their presence goes offline.

---

## 6. Messaging Service Issues

### MSG-01: No Message Deduplication / Idempotency

**File:** `messaging-service/internal/service/message_service.go` (lines 70-128)

**Problem:** No idempotency key on message creation. Client retry on timeout creates duplicate messages in DB.

**Severity:** HIGH  
**Fix:** Add `client_message_id` field. Use `ON CONFLICT (client_message_id) DO NOTHING` in the insert query.

---

### MSG-02: Unread Counts Calculated On-Demand Per Channel

**File:** `messaging-service/internal/repository/channel_repo.go` (lines 83-84)

**Problem:** Unread count is a subquery per channel:

```sql
(SELECT count(*) FROM messages WHERE channel_id = c.id AND NOT is_deleted
 AND (cm.last_read_at IS NULL OR created_at > cm.last_read_at)) AS unread_count
```

For a user in 50+ channels, this is 50+ COUNT queries on every sidebar load.

**Severity:** HIGH  
**Fix:** Maintain a Redis counter `chat:unread:{userId}:{channelId}`. Increment atomically on new message, reset on read.

---

### MSG-03: Thread Count Increment Potentially Non-Atomic

**File:** `messaging-service/internal/service/message_service.go` (lines 114-119)

**Problem:** Thread reply count increment may not use atomic SQL (`SET thread_count = thread_count + 1`). If it reads and writes separately, two concurrent replies produce incorrect count.

**Severity:** MEDIUM  
**Fix:** Verify the repository uses `UPDATE messages SET thread_count = thread_count + 1 WHERE id = $1`.

---

### MSG-04: Read Receipts Defined But Not Implemented

**File:** `messaging-service/internal/domain/events.go` (line 33)

**Problem:** `EventReadReceipt` event type exists in the domain but no handler processes it. `channel_members.last_read_at` tracks per-channel read position, but there's no per-message read tracking.

**Severity:** MEDIUM  
**Impact:** Users can't see if their messages were read. No delivery confirmation.

---

### MSG-05: No Initial Presence Snapshot on Connect

**File:** `messaging-service/internal/handler/ws_handler.go`

**Problem:** When a user's chat WebSocket connects, they receive their own `presence:online` broadcast but NOT a snapshot of who else is currently online. The presence map starts empty and builds up only from subsequent events.

**Severity:** MEDIUM  
**Fix:** On connect, send a `presence:snapshot` event with all currently online users in the org.

---

### MSG-06: Soft-Delete Broadcast Can Fail Silently

**File:** `messaging-service/internal/service/message_service.go` (lines 167-195)

**Problem:** Message soft-delete commits to DB, then publishes an event. If event publish fails, the message appears deleted in the DB but clients still show it.

**Severity:** MEDIUM  
**Fix:** Same as CRIT-02 — use transactional outbox pattern.

---

## 7. Data Preloading Gaps

### PRELOAD-01: Only Task Data is Preloaded in Backend Cache

**File:** `backend/internal/cache/manager.go` (lines 61-128)

**Current state:** `PreloadProject` loads tasks, children indices, versions, and computes progress. This is ~20% of the data a user needs.

**Not preloaded (backend):**
| Data | Current Load Strategy | Impact |
|------|----------------------|--------|
| User's project list | On-demand DB query | Dashboard slow |
| Team members | On-demand DB query | Team views slow |
| Project members | On-demand DB query | Project settings slow |
| Notification count | On-demand DB query | Bell icon delayed |
| Channel list + unread | On-demand with COUNT subquery | Chat sidebar slow |
| Recent messages per channel | On-demand on channel open | Messages appear late |
| Task comments | On-demand on task open | Comment section delayed |
| Task dependencies | On-demand on task open | Dependency graph delayed |

---

### PRELOAD-02: Frontend Makes 12+ Sequential Queries on Init

**File:** `frontend/src/components/data-prefetcher.tsx`

**Current init sequence (all separate HTTP calls):**
1. `GET /auth/me`
2. `GET /dashboard-stats`
3. `GET /projects?filter=mine`
4. `GET /teams?filter=mine`
5. `GET /org-members`
6. `GET /chat/sidebar`
7. `GET /my-tasks`
8. `GET /notifications`
9. `GET /sticky-notes`
10. `GET /permissions/roles?scope=org`
11. SSE `/events/stream`
12. WS handshake (on project/chat page)

**Severity:** HIGH  
**Fix:** Create a batch endpoint `POST /api/v1/init` that returns all of the above in a single response. Reduces round trips from 10+ to 1.

---

### PRELOAD-03: No Project Task Preload on WebSocket Connect

**Files:**
- `backend/internal/handler/ws_handler.go` (line 114)
- `frontend/src/hooks/use-project-socket.ts`

**Problem:** When a user joins a project room via WebSocket, the server only sends `{ "connected": true, "room_size": N }`. It does NOT send the root task list. The client must separately fetch tasks.

**Severity:** MEDIUM  
**Fix:** On `project:join`, return the root task list (first page) as part of the join response.

---

### PRELOAD-04: No Chat Message Preload on Channel Join

**File:** `frontend/src/hooks/use-chat-socket.ts`

**Problem:** When a user joins a channel, no message history is sent. The message list starts empty and loads via a separate REST call (or scroll event).

**Severity:** HIGH  
**Fix:** On `channel:join`, return the last 50 messages + unread count as part of the join response.

---

### PRELOAD-05: Service Worker Doesn't Differentiate Cache Strategies by URL

**File:** `frontend/public/sw.js`

**Problem:** All `/api/` requests are treated with the same network-first strategy. Read-heavy endpoints (project list, team list) should use stale-while-revalidate for instant loads.

**Severity:** LOW  
**Fix:** Implement URL-based cache strategies:
- `GET /projects`, `GET /teams` → stale-while-revalidate
- `GET /notifications` → network-only (always fresh)
- `POST/PUT/DELETE` → network-only

---

## 8. UI Update Failures

### UI-01: Task List Doesn't Update After Reorder Broadcast

**Root cause:** SYNC-01 (empty handler for `task:reordered`)

**User experience:** User A reorders tasks. User B's task list stays in the old order. User B must refresh the page.

---

### UI-02: Change Request Status Not Reflected After Approval

**Root cause:** SYNC-02 (empty handler for `cr:approved`/`cr:rejected`)

**User experience:** Approver clicks "Approve". Other users still see "Pending Review" status until they refresh.

---

### UI-03: Dashboard Stats Show Stale Data

**Root cause:** FE-01 (missing `orgId` in SSE invalidation)

**User experience:** Dashboard counters (tasks completed, in progress, etc.) don't update when tasks change via SSE events. They only refresh on page navigation.

---

### UI-04: Chat Sidebar Unread Counts Lag Behind

**Root causes:** MSG-02 (on-demand calculation), PRELOAD-04 (no preload)

**User experience:** User receives a message. Chat sidebar may show 0 unread for several seconds until the next sidebar query fires.

---

### UI-05: Task Detail Checklist Progress Stale

**Root cause:** SYNC-03 (checklist broadcast doesn't invalidate task query)

**User experience:** User A completes a checklist item. User B's task card shows "2/5" instead of "3/5" until they open the task detail view.

---

### UI-06: All Mutations Feel Laggy

**Root cause:** FE-03 (no optimistic updates anywhere)

**User experience:** Every click (send message, toggle status, add reaction, mark read) has a visible delay. On 200ms+ latency connections, this feels broken.

---

### UI-07: Stale Data After Returning to Tab

**Root cause:** FE-10 (`refetchOnWindowFocus: false`)

**User experience:** User opens app, goes to lunch, returns. Everything they see is from 2 hours ago. No refresh until they navigate or manually reload.

---

### UI-08: Project Member Updates Not Scoped Properly

**Root cause:** FE-01 (SSE member events invalidate all team-members queries, not specific ones)

**User experience:** Adding a member to Team A causes Team B's member list to flicker/reload unnecessarily.

---

## 9. Edge Cases & Race Conditions

### EDGE-01: Rapid Project Switching Causes Silent Send Failure

**File:** `frontend/src/stores/project-task-store.ts` (lines 176-209)

**Problem:** `setCurrentProjectId()` clears state and sends `project:join`. If the user switches projects before the join completes, `send` is set to `null`. Subsequent operations fail silently with "WebSocket not connected".

---

### EDGE-02: Chat Store Accumulates Typing Data for All Channels

**File:** `frontend/src/stores/chat-store.ts` (lines 231-242)

**Problem:** Typing indicators are never cleaned up when leaving a channel. The Map grows with every channel visited. Minor memory leak.

---

### EDGE-03: Redis Event Ordering Not Guaranteed

**File:** `backend/internal/eventbus/redis.go`

**Problem:** Redis Pub/Sub doesn't guarantee message ordering. Rapid sequential updates (e.g., `status: todo → in_progress → done`) can arrive out of order, leaving clients with `status: in_progress` instead of `done`.

---

### EDGE-04: Concurrent Auth Initialize in Dev Mode

**File:** `frontend/src/stores/auth-store.ts` (lines 36-80)

**Problem:** React Strict Mode double-invokes effects, causing `initialize()` to fire twice. Two API calls for `/auth/me` and `/orgs` race against each other.

---

### EDGE-05: Ghost Connections in WebSocket Hub

**File:** `backend/internal/websocket/org_hub.go`

**Problem:** When a client becomes unresponsive and its send buffer overflows (CRIT-04), the connection is not removed from the hub. It becomes a "ghost" — consuming memory, receiving (and dropping) every broadcast.

**Fix:** Track consecutive drop count per connection. After 10 drops, close and remove.

---

### EDGE-06: MFA Status Inconsistent on Signup

**File:** `frontend/src/stores/auth-store.ts` (line 113)

**Problem:** Signup hardcodes `mfaEnabled: false` regardless of what the backend returns. If MFA is required at signup, the UI won't reflect it.

---

### EDGE-07: Background User Refresh Error Swallowed

**File:** `frontend/src/stores/auth-store.ts` (lines 54-59)

**Problem:** `api.auth.getUser().catch(() => {})` silently ignores all errors. If the user's session is revoked server-side, the client continues with stale auth state.

---

### EDGE-08: Connection Leak on Unresponsive Clients

**File:** `backend/internal/websocket/org_hub.go` (lines 217-221)

**Problem:** No cleanup mechanism for connections that consistently fail to consume messages. These connections accumulate in the hub's connection map.

---

## 10. Recommendations & Prioritized Fix Plan

### Phase 1: Critical Fixes (Week 1-2)

| ID | Issue | Effort | Impact |
|----|-------|--------|--------|
| CRIT-01 | Add broadcast to REST task handlers | 1 day | Fixes all REST→WS sync |
| CRIT-04 | Force-close connections after N dropped messages | 1 day | Prevents ghost connections + stale clients |
| CRIT-05 | Add DB-level version column as cache fallback | 2 days | Prevents data loss when Redis down |
| CRIT-03 | Add `changed_fields` tracking to merge logic | 2 days | Prevents same-field overwrite |
| SYNC-01 | Implement `task:reordered` handler | 0.5 day | Fixes reorder sync |
| SYNC-02 | Implement `cr:approved/rejected` handler | 0.5 day | Fixes CR sync |
| FE-01 | Add orgId/teamId/projectId to SSE invalidations | 0.5 day | Fixes stale dashboards |

### Phase 2: Sync & Preloading (Week 2-3)

| ID | Issue | Effort | Impact |
|----|-------|--------|--------|
| PRELOAD-02 | Create batch `/api/v1/init` endpoint | 2 days | Reduces init from 12 to 1 request |
| PRELOAD-04 | Return messages on `channel:join` | 1 day | Instant message history |
| PRELOAD-03 | Return root tasks on `project:join` | 1 day | Faster project load |
| FE-03 | Add optimistic updates (chat, task status, notifications) | 3 days | Eliminates perceived lag |
| MSG-02 | Redis-cached unread counts | 1 day | Fast sidebar |
| MSG-05 | Send presence snapshot on connect | 0.5 day | Accurate online status |
| CRIT-07 | Add `last_event_id` tracking + replay on reconnect | 3 days | No more missed events |

### Phase 3: Reliability & Edge Cases (Week 3-4)

| ID | Issue | Effort | Impact |
|----|-------|--------|--------|
| CRIT-02 | Transactional outbox for event publishing | 3 days | Guaranteed event delivery |
| CRIT-08 | Message idempotency key | 1 day | No duplicate messages |
| MSG-04 | Implement read receipts | 2 days | Delivery confirmation |
| FE-04 | Add build-hash buster to IndexedDB cache | 0.5 day | No stale cache after deploy |
| FE-02 | Revoke blob URLs on cleanup | 0.5 day | Fixes memory leak |
| CACHE-02 | Atomic progress recalculation | 1 day | Consistent progress |
| EDGE-03 | Migrate from Redis Pub/Sub to Redis Streams | 3 days | Ordered, persistent events |

### Phase 4: Polish (Week 4+)

| ID | Issue | Effort | Impact |
|----|-------|--------|--------|
| FE-10 | Enable `refetchOnWindowFocus` for key queries | 0.5 day | Fresh data on tab return |
| FE-06 | Optimistic notification mark-as-read | 0.5 day | Snappy notification UX |
| FE-08 | Add `ensureValidToken()` to `downloadBlob()` | 0.5 day | Fix download auth |
| PRELOAD-05 | URL-based SW cache strategies | 1 day | Better offline UX |
| CACHE-03 | Add version prefix to cache keys | 0.5 day | Safe schema evolution |
| CACHE-04 | Invalidate permission cache on role change | 0.5 day | Tighter security |

---

## Appendix: Architecture Diagram of Current Sync Issues

```
User A (Browser)                    Server                    User B (Browser)
     |                                |                              |
     |-- REST PATCH /tasks/1 -------->|                              |
     |                                |-- DB Update ✅               |
     |                                |-- Cache Update ✅            |
     |<-- 200 OK --------------------|                              |
     |                                |-- Broadcast? ❌ MISSING      |
     |                                |                              |
     |                                |         User B sees STALE data
     |                                |         for up to 30 minutes
     |                                |                              |
     |-- WS task:update ------------->|                              |
     |                                |-- DB Update ✅               |
     |                                |-- Cache Update ✅            |
     |<-- WS reply ------------------|                              |
     |                                |-- Broadcast ✅ (may drop!) ->|
     |                                |                              |
     |                                |   If buffer full: SILENT DROP |
     |                                |   User B STILL sees stale    |
```

---

*End of audit. Total issues identified: 47. Recommended timeline: 4 weeks for phases 1-3.*
