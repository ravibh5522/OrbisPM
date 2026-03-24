-- Add multi-assignee support: assignee_ids array column
ALTER TABLE tasks ADD COLUMN assignee_ids UUID[] NOT NULL DEFAULT '{}';

-- Migrate existing single assignee_id to array
UPDATE tasks SET assignee_ids = ARRAY[assignee_id] WHERE assignee_id IS NOT NULL;

-- Index for filtering tasks by any assignee
CREATE INDEX idx_tasks_assignee_ids ON tasks USING GIN(assignee_ids);
