-- Rollback: Remove created_by column and backfilled project_members
-- Note: We cannot easily identify which project_members were backfilled,
-- so we only remove the column. Manually clean up if needed.

ALTER TABLE projects DROP COLUMN IF EXISTS created_by;
