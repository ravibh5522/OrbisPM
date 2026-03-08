-- Revert max task depth back to 5
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_depth_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_depth_check CHECK (depth >= 0 AND depth <= 5);
