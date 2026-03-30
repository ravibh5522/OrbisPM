-- Add version column to tasks for optimistic concurrency control
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

-- Trigger to auto-increment version on update
CREATE OR REPLACE FUNCTION increment_task_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_version ON tasks;
CREATE TRIGGER trg_tasks_version
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION increment_task_version();
