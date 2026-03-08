-- Rollback recurring tasks migration
DROP INDEX IF EXISTS idx_tasks_next_occurrence;
DROP INDEX IF EXISTS idx_tasks_recurrence;

ALTER TABLE tasks
    DROP COLUMN IF EXISTS next_occurrence,
    DROP COLUMN IF EXISTS recurrence_parent_id,
    DROP COLUMN IF EXISTS recurrence_rule;
