-- Migration 000028: Performance indexes + depth constraint correctness
-- All DDL statements are idempotent (IF NOT EXISTS safe).
-- Note: CONCURRENTLY is omitted — golang-migrate wraps migrations in a
-- transaction and CREATE INDEX CONCURRENTLY cannot run inside one.

-- ── Covering index for task tree queries ──────────────────────────────────────
-- ListTreeByProject: WHERE project_id = $1 ORDER BY depth, position, created_at
-- Without this index every project open does a full heap scan; this enables an
-- index-only scan for the hot path.
CREATE INDEX IF NOT EXISTS idx_tasks_tree_covering
    ON public.tasks (project_id, depth, position, created_at)
    INCLUDE (id, parent_task_id, title, status, priority,
             assignee_id, assignee_ids, due_date, labels, version);

-- ── GIN index for multi-assignee lookups ──────────────────────────────────────
-- ListByOrgAndAssignee: $2 = ANY(assignee_ids) cannot use a B-tree index.
-- A GIN index on the array column enables fast membership tests.
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_ids_gin
    ON public.tasks USING GIN (assignee_ids);

-- ── Composite index for org + assignee queries ────────────────────────────────
-- Speeds up the org_id + assignee_id filter for single-assignee my-tasks queries.
CREATE INDEX IF NOT EXISTS idx_tasks_org_assignee
    ON public.tasks (org_id, assignee_id)
    WHERE assignee_id IS NOT NULL;

-- ── Fix depth CHECK constraint to match domain constant MaxTaskDepth = 3 ──────
-- The initial schema had depth <= 5 which allowed invalid subtask depths.
-- This corrects the constraint to enforce the same limit as the application layer.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_depth_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_depth_check
    CHECK (depth >= 0 AND depth <= 3);

-- ── Covering index for org-scoped task status aggregations ───────────────────
-- Dashboard GetStats: GROUP BY status WHERE org_id = $1 AND project_id IN (...)
CREATE INDEX IF NOT EXISTS idx_tasks_org_project_status
    ON public.tasks (org_id, project_id, status)
    INCLUDE (priority, due_date, assignee_id);

-- ── Index for notifications unread lookup ─────────────────────────────────────
-- Fast unread count per user per org.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications (user_id, org_id)
    WHERE read_at IS NULL;
