-- Change max task depth from 5 to 3 (4 levels: 0,1,2,3)
-- First remove tasks exceeding new depth limit (cascade deletes children)
DELETE FROM tasks WHERE depth > 3;

-- Drop old constraint and add new one
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_depth_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_depth_check CHECK (depth >= 0 AND depth <= 3);
