DROP TRIGGER IF EXISTS trg_tasks_version ON tasks;
DROP FUNCTION IF EXISTS increment_task_version();
ALTER TABLE tasks DROP COLUMN IF EXISTS version;
