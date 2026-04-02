-- Migration 000028 rollback
DROP INDEX CONCURRENTLY IF EXISTS idx_tasks_tree_covering;
DROP INDEX CONCURRENTLY IF EXISTS idx_tasks_assignee_ids_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_tasks_org_assignee;
DROP INDEX CONCURRENTLY IF EXISTS idx_tasks_org_project_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_notifications_user_unread;

-- Restore the original (looser) depth constraint
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_depth_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_depth_check
    CHECK (depth >= 0 AND depth <= 5);
