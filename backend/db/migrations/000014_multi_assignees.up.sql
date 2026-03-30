-- Add multi-assignee support: assignee_ids array column
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_ids UUID[] NOT NULL DEFAULT '{}';

-- Migrate existing single assignee_id to array (safe: only updates rows with no existing values)
UPDATE tasks SET assignee_ids = ARRAY[assignee_id] WHERE assignee_id IS NOT NULL AND assignee_ids = '{}';

-- Index for filtering tasks by any assignee
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_ids ON tasks USING GIN(assignee_ids);
