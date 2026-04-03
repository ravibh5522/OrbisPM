-- ============================================================
-- Performance indexes for messaging-service
-- ============================================================

-- Messages: fast lookup for channel message listing (no org_id needed — RLS handles it)
CREATE INDEX IF NOT EXISTS idx_messages_channel_created
    ON messages(channel_id, created_at DESC)
    WHERE parent_message_id IS NULL AND is_deleted = false;

-- Message search: GIN trigram index for ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_messages_body_trgm
    ON messages USING GIN(body gin_trgm_ops);

-- Attachments: covering index for batch fetch by message IDs
CREATE INDEX IF NOT EXISTS idx_msg_attachments_message_id
    ON message_attachments(message_id, id);

-- Reactions: covering index for batch fetch by message IDs  
CREATE INDEX IF NOT EXISTS idx_reactions_message_user
    ON message_reactions(message_id, user_id, emoji);

-- Channels: fast lookup for sidebar user-channel membership join
CREATE INDEX IF NOT EXISTS idx_channel_members_channel_user
    ON channel_members(channel_id, user_id);
