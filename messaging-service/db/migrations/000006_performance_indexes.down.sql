-- Rollback performance indexes
DROP INDEX IF EXISTS idx_messages_channel_created;
DROP INDEX IF EXISTS idx_messages_body_trgm;
DROP INDEX IF EXISTS idx_msg_attachments_message_id;
DROP INDEX IF EXISTS idx_reactions_message_user;
DROP INDEX IF EXISTS idx_channel_members_channel_user;
