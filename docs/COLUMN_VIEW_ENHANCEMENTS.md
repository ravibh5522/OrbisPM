# Column View Enhancements — Implementation Plan

> **Goal:** Sub-10ms column navigation, Excel-like filters, context menus, drag-drop reparenting, undo-redo, and split view.

---

## Phase 1: Cache-First Reads (~10ms Column Navigation)

### Problem
`task:list` WS handler calls `taskService.List()` → `taskRepo.List()` → **two PostgreSQL queries** (COUNT + SELECT) every time. Redis cache exists but is NEVER used for reads. Result: **~600ms per column click**.

### Root Cause Chain
```
Frontend: fetchColumn(depth, parentId)
  → send("task:list", { parent_id })
  → WS handler: handleTaskList()
    → taskSvc.List(ctx, projectID, filter)  ← NO CACHE CHECK
      → taskRepo.List(ctx, projectID, filter)
        → SELECT COUNT(*) ...    ← ~200ms
        → SELECT ... LIMIT 100   ← ~300ms
```

### Fix (Backend — `task_service.go`)
Add cache-first path in `TaskService.List()`:
```go
func (s *TaskService) List(ctx, projectID, filter) {
    // Cache-first for simple parent-ID lookups (column view pattern)
    if s.cache != nil && s.cache.IsProjectLoaded(ctx, projectID) &&
       isSimpleParentFilter(filter) {
        tasks, err := s.cache.ListTasks(ctx, projectID, *filter.ParentID)
        if err == nil {
            return tasks, len(tasks), nil
        }
        // Fall through to DB on cache miss
    }
    return s.taskRepo.List(ctx, projectID, filter)
}

func isSimpleParentFilter(f TaskFilter) bool {
    return f.ParentID != nil &&
           f.Status == nil && f.Priority == nil &&
           f.AssigneeID == nil && f.Search == nil
}
```

**Expected improvement:** 600ms → ~5-10ms (Redis ZRANGEBYSCORE + pipeline GET)

### Fix (Backend — Also add `task:get` cache)
```go
func (s *TaskService) Get(ctx, id) (*domain.Task, error) {
    // Try cache first if any project is loaded
    if s.cache != nil {
        // We don't know projectID here, so we can't use cache for Get
        // unless we add a global task-id→project-id index
    }
    return s.taskRepo.GetByID(ctx, id)
}
```

### Fix (Frontend — Instant display, background refresh)
Current `fetchColumn` already shows cached data from Zustand store instantly, then awaits WS response. With backend returning from Redis in ~5ms, the total roundtrip drops to ~10-20ms. No frontend changes needed for Phase 1.

### Files to Change
| File | Change |
|------|--------|
| `backend/internal/service/task_service.go` | Add cache-first path in `List()` |
| `backend/internal/cache/manager.go` | Ensure `ListTasks` returns proper count |

---

## Phase 2: Advanced Column Filters (Excel-like)

### Design
Each column header gets a filter icon. Clicking opens a dropdown with:
- **Status filter:** Multi-select checkboxes (todo, in_progress, done, blocked)
- **Priority filter:** Multi-select checkboxes (critical, high, medium, low)
- **Assignee filter:** Searchable dropdown with member avatars
- **Labels filter:** Tag input with autocomplete from project labels
- **Date range:** Due date from/to picker
- **Text search:** Title/description pattern match (regex or contains)

### Architecture
Filters are applied **locally** on already-loaded column data (since cache has full children for each parent). This avoids additional WS calls entirely.

### Backend Changes
Extend `TaskFilter` with new fields for when server-side filtering is needed (pagination, search):
```go
type TaskFilter struct {
    ListFilter
    Status      *string    // Keep existing
    Statuses    []string   // NEW: multi-status filter
    Priority    *string    // Keep existing
    Priorities  []string   // NEW: multi-priority filter
    AssigneeID  *uuid.UUID // Keep existing
    AssigneeIDs []uuid.UUID // NEW: multi-assignee filter
    Labels      []string   // NEW: filter by labels (ANY match)
    DueDateFrom *time.Time // NEW
    DueDateTo   *time.Time // NEW
    Search      *string    // Keep existing
}
```

### Frontend Changes
New component: `ColumnFilter` dropdown per column header.

```
task-columns.tsx
├── TaskColumn
│   ├── ColumnFilterButton (filter icon in header)
│   │   └── ColumnFilterDropdown
│   │       ├── StatusFilter (checkboxes)
│   │       ├── PriorityFilter (checkboxes)
│   │       ├── AssigneeFilter (searchable list)
│   │       ├── LabelsFilter (tag input)
│   │       ├── DateRangeFilter (from/to)
│   │       └── SearchFilter (text input)
│   └── TaskList (filtered)
```

Filter state per column: `Map<number, ColumnFilterState>` in TaskColumns parent.
Filtering is done client-side via `useMemo`:
```ts
const filteredTasks = useMemo(() => {
    const filter = filters.get(depth);
    if (!filter) return tasks;
    return tasks.filter(t => {
        if (filter.statuses?.length && !filter.statuses.includes(t.status)) return false;
        if (filter.priorities?.length && !filter.priorities.includes(t.priority)) return false;
        if (filter.assigneeIds?.length && !filter.assigneeIds.includes(t.assignee_id)) return false;
        if (filter.labels?.length && !t.labels?.some(l => filter.labels.includes(l))) return false;
        if (filter.dueDateFrom && (!t.due_date || new Date(t.due_date) < filter.dueDateFrom)) return false;
        if (filter.dueDateTo && (!t.due_date || new Date(t.due_date) > filter.dueDateTo)) return false;
        if (filter.search && !t.title.toLowerCase().includes(filter.search.toLowerCase())) return false;
        return true;
    });
}, [tasks, filters, depth]);
```

### Files to Change
| File | Change |
|------|--------|
| `frontend/src/components/tasks/task-columns.tsx` | Add filter state, ColumnFilter component, filter logic |
| `backend/internal/repository/interfaces.go` | Extend TaskFilter |
| `backend/internal/repository/task_repo.go` | Support new filter fields in SQL |

---

## Phase 3: Right-Click Context Menu

### Design
Right-clicking any task row shows a context menu with:
- **Edit** (opens preview panel)
- **Quick Status** → submenu: Todo, In Progress, Done, Blocked
- **Quick Priority** → submenu: Critical, High, Medium, Low
- **Assign To** → submenu: member list
- **Duplicate**
- **Add Subtask** (if depth < 3)
- **Move To** → opens parent picker (future: drag-drop)
- **Labels** → submenu with add/remove
- **Copy Link**
- **Delete**

### Implementation
Custom `<ContextMenu>` component using a portal. Positioned at cursor coordinates.

State:
```ts
const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; task: Task; depth: number;
} | null>(null);
```

On task row: `onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, task, depth }); }}`

Close on click outside, Escape, scroll.

### Files to Change
| File | Change |
|------|--------|
| `frontend/src/components/tasks/task-columns.tsx` | Add context menu state, event handlers |
| `frontend/src/components/tasks/task-context-menu.tsx` | NEW: Context menu component |

---

## Phase 4: Drag-and-Drop Reparenting

### Design
Users can drag a task from any column and drop it:
- **Within same column** = reorder (already exists via `task:reorder`)
- **Onto a task in an adjacent column** = change parent

### Implementation
Use HTML5 Drag API (no library needed for this pattern):
- `draggable` on each task row
- `onDragStart`: store dragged task ID + source depth
- `onDragOver`/`onDragEnter`: highlight drop target
- `onDrop`: call new `task:reparent` WS action

### Backend - New `task:reparent` WS action
```go
case "task:reparent":
    h.handleTaskReparent(ctx, conn, msg)
```

Service method:
```go
func (s *TaskService) Reparent(ctx, taskID, newParentID *uuid.UUID, newPosition int) (*domain.Task, error) {
    // 1. Get task
    // 2. Validate depth (new parent depth + 1 <= MaxTaskDepth, recursively check subtree)
    // 3. Update parent_task_id + depth + position in transaction
    // 4. Update cache
    // 5. Return updated task
}
```

### Files to Change
| File | Change |
|------|--------|
| `frontend/src/components/tasks/task-columns.tsx` | Add drag handlers to TaskColumn items |
| `backend/internal/handler/ws_handler.go` | Add `task:reparent` dispatch + handler |
| `backend/internal/service/task_service.go` | Add `Reparent()` method |
| `backend/internal/repository/task_repo.go` | Add `Reparent()` method |

---

## Phase 5: Undo/Redo (Ctrl+Z / Ctrl+Y)

### Design
Command pattern with an undo stack. Each mutation creates a reversible command:

```ts
interface UndoCommand {
    type: 'update' | 'create' | 'delete' | 'reparent' | 'bulk-update';
    undo: () => Promise<void>;  // reverse the operation
    redo: () => Promise<void>;  // re-apply the operation
    description: string;        // for toast: "Undo: changed status to done"
}
```

### State
```ts
const undoStack: UndoCommand[] = [];  // max 50 items
const redoStack: UndoCommand[] = [];
```

### Key bindings
```ts
useEffect(() => {
    const handler = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault(); undo();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault(); redo();
        }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
}, []);
```

### Command Examples
**Update task:**
```ts
{
    type: 'update',
    undo: () => send("task:update", { task_id, ...oldValues }),
    redo: () => send("task:update", { task_id, ...newValues }),
    description: `Changed status to "${newValues.status}"`
}
```

**Delete task:**
```ts
{
    type: 'delete',
    undo: () => send("task:create", { ...deletedTaskData }),
    redo: () => send("task:delete", { task_id }),
    description: `Deleted "${task.title}"`
}
```

### Files to Change
| File | Change |
|------|--------|
| `frontend/src/hooks/use-undo-redo.ts` | NEW: Undo/redo hook with command stack |
| `frontend/src/components/tasks/task-columns.tsx` | Integrate undo/redo into all mutations |

---

## Phase 6: Split Column View

### Design
Right-click on a column header → "Split View" option. This duplicates the column layout into two horizontal rows, allowing side-by-side comparison and easy drag-drop between different branches.

### Layout
```
Normal view:        Split view:
┌──┬──┬──┬──┐      ┌──┬──┬──┬──┐  (row 1)
│L1│L2│L3│L4│      │L1│L2│L3│L4│
└──┴──┴──┴──┘      ├──┼──┼──┼──┤
                    │L1│L2│L3│L4│  (row 2, independent selection)
                    └──┴──┴──┴──┘
```

### Implementation
State: `splitView: boolean`, `splitSelected: (string|null)[]`, `splitColumnData: Task[][]`

When split, render `<TaskColumns>` twice in a flex-col container, each with independent selection state but sharing the same WS connection and Zustand store.

### Files to Change
| File | Change |
|------|--------|
| `frontend/src/components/tasks/task-columns.tsx` | Add split view state + dual render |
| `frontend/src/components/tasks/task-context-menu.tsx` | Add "Split View" option to column header context |

---

## Implementation Order

| # | Phase | Effort | Impact |
|---|-------|--------|--------|
| 1 | Cache-first reads | Small | Critical — fixes 600ms → <10ms |
| 2 | Advanced filters | Medium | High — Excel-like UX |
| 3 | Right-click context menu | Medium | High — power user UX |
| 4 | Drag-drop reparenting | Medium | High — restructuring UX |
| 5 | Undo/redo | Medium | Medium — safety net |
| 6 | Split view | Small | Medium — comparison UX |

---

## Dependency Graph
```
Phase 1 (cache-first) ─── independent, do first
Phase 2 (filters) ─────── depends on Phase 1 (client-side filter on cached data)
Phase 3 (context menu) ── independent, can parallel with Phase 2
Phase 4 (drag-drop) ───── depends on Phase 3 (reparent action shared)
Phase 5 (undo-redo) ───── depends on Phase 3+4 (wraps all mutations)
Phase 6 (split view) ──── depends on Phase 4 (drag between rows)
```
