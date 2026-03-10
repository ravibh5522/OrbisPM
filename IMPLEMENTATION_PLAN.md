# Implementation Plan: Task Card Redesign + Progress Bar

## Requirements Summary

1. **Reset DB** — Clean database reset
2. **Multi-assignee avatars on cards** — Show up to 3 overlapping avatars (50% overlap), "+N" for more
3. **Preview panel assignee UI** — Horizontal avatar row with "+" button to add (dropdown), replace checkbox list
4. **Start/due date on task cards** — Show dates in compact format below title
5. **Progress bar** — Very thin bar at bottom of card, computed as average completion of children recursively
   - Backend calculates & caches `progress` (0.0–1.0) per task
   - Parent progress = avg of children's progress (recursive)
   - Leaf task with status=done → 1.0, in_progress → 0.5, todo → 0.0
   - Stored in Redis cache, updated atomically on task status/progress change
6. **Remove bottom padding** on column task cards for more space
7. **Task card layout** — Modern compact card matching reference design

## Architecture

### Backend Changes

#### A. Domain: Add `Progress` field to Task struct
- `Progress float64 json:"progress"` — 0.0 to 1.0
- Not stored in DB — computed on the fly and cached in Redis
- Becomes part of the JSON response from cache/API

#### B. Cache Manager: Progress computation
- New method `ComputeAndCacheProgress(ctx, projectID, taskID)` — recursive
- On task create/update/delete, bubble up progress recalculation to all ancestors
- Uses Redis Lua script for atomic read-compute-write to avoid dirty reads
- New cache key: `cache:project:PROJECT_ID:progress:TASK_ID` → float64
- `PreloadProject` pre-computes all progress values after loading tasks
- `SetTask` triggers progress recalculation for the task and its ancestors

#### C. Service: Integrate progress updates
- After Create/Update/Delete — call `RecalcProgress` for affected task + ancestors
- `List` — attach progress values from cache before returning

### Frontend Changes

#### D. Task Card Redesign
- Increase virtualizer `estimateSize` from 52 → 72 to fit extra row
- New layout:
  ```
  [Status dot] [Title]                    [Avatars(stacked)] [Chevron]
               [Priority] [Start → Due]   [Thin progress bar full width]
  ```
- Remove py-2 bottom padding → py-1.5 (tighter)

#### E. Assignee Avatars Component
- New `<AvatarStack>` inline component
- Shows up to 3 avatars overlapping (negative margin)
- If >3, shows 3 + "+N" circle
- Size: xs (w-5 h-5) for cards

#### F. Preview Panel Assignees
- Replace checkbox list with horizontal avatar row
- Each assigned member shown as avatar
- "+" button at end opens dropdown to add more members
- Click existing avatar → remove (with confirmation or toggle)

#### G. Progress Bar on Card
- Full-width thin bar (2px) at very bottom of card
- Color: success for >80%, info for >40%, warning for >20%, error for <20%
- Width = task.progress * 100%

## Execution Order

1. Reset DB
2. Backend: Add progress field + cache computation
3. Backend: Integrate progress into task service lifecycle
4. Frontend: AvatarStack component + card redesign
5. Frontend: Preview panel assignee UI
6. Frontend: Progress bar + dates on card
7. Build & deploy & test
