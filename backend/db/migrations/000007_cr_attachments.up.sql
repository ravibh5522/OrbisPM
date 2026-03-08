-- 000007: add change_request_id to attachments
-- Extends the generic attachments table to support files attached to change requests.

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS change_request_id UUID REFERENCES task_change_requests(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_attachments_change_request_id ON attachments(change_request_id) WHERE change_request_id IS NOT NULL;
