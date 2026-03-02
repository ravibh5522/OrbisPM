DROP INDEX IF EXISTS idx_attachments_change_request_id;
ALTER TABLE attachments DROP COLUMN IF EXISTS change_request_id;
