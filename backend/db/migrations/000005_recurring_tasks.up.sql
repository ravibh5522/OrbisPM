-- ============================================================
-- RECURRING TASKS (F14)
-- ============================================================

-- Add recurrence columns to tasks table (idempotent)
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS recurrence_rule TEXT,         -- RRULE string (RFC 5545) e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR"
    ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS next_occurrence TIMESTAMPTZ;

-- Index for efficient recurring task queries (idempotent)
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence ON tasks(org_id) WHERE recurrence_rule IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_next_occurrence ON tasks(next_occurrence) WHERE next_occurrence IS NOT NULL;

COMMENT ON COLUMN tasks.recurrence_rule IS 'RFC 5545 RRULE string for recurring tasks';
COMMENT ON COLUMN tasks.recurrence_parent_id IS 'Reference to the original recurring task template';
COMMENT ON COLUMN tasks.next_occurrence IS 'Next scheduled occurrence date for recurring tasks';
