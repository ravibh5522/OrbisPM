DROP INDEX IF EXISTS idx_tasks_assignee_ids;
ALTER TABLE tasks DROP COLUMN IF EXISTS assignee_ids;
