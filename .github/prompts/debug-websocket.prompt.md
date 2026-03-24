---
description: "Guide for debugging WebSocket connection and real-time sync issues"
---

# Debug WebSocket Issues

## Architecture Overview
- **Single org-level WebSocket** per client at `ws://<host>/api/v1/orgs/{orgId}/ws?token=<jwt>`
- **Project rooms**: Client sends `{"action":"project:join","project_id":"..."}` to subscribe
- **Request-response**: Client sends action, server responds with matching `request_id`
- **Broadcasts**: Server pushes events to all clients in a room (e.g., `task.created`)

## Key Files
- `internal/handler/ws_handler.go` — HTTP upgrade + read/write pumps
- `internal/websocket/hub.go` — OrgHub manages connections + rooms
- `internal/websocket/client.go` — Client struct with Send channel
- `internal/eventbus/redis.go` — Redis Pub/Sub for cross-instance events
- `frontend/src/hooks/use-org-socket.ts` — Client-side WebSocket hook
- `frontend/src/hooks/use-project-socket.ts` — Project room management
- `frontend/src/stores/project-task-store.ts` — Zustand store with `setRawSend`

## Common Issues

### Connection fails
1. Check JWT token in query param: `?token=<valid_jwt>`
2. Auth middleware validates JWT for WebSocket via query param fallback
3. Check CORS/origin headers if behind Kong proxy
4. Check `middleware/auth.go` — it reads `r.URL.Query().Get("token")` for WS

### Messages not received
1. Verify client joined the project room: look for `project:join` action
2. Check `OrgHub.Broadcast()` — it sends to all clients in room
3. Check `eventbus.Publish()` after mutations in service layer
4. Redis Pub/Sub channel: `org:<orgId>` pattern

### Reconnection issues (frontend)
1. `useOrgSocket` has exponential backoff: 1s → 2s → 4s → ... → 30s max
2. On reconnect, it re-sends `project:join` for active project
3. Check `project-task-store.ts` `setRawSend` — called when socket reconnects

### State desync
1. Broadcasts invalidate TanStack Query caches via `queryClient.invalidateQueries`
2. Check that mutation events publish the correct event type
3. The store has `setTasks`, `updateTask`, etc. for granular updates from WS
