-- ─── Auto-managed channel fields ──────────────────────
ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_auto_managed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS auto_source TEXT CHECK (auto_source IN ('team', 'project'));
ALTER TABLE channels ADD COLUMN IF NOT EXISTS auto_source_id UUID;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_channels_auto_source ON channels(auto_source, auto_source_id) WHERE auto_source IS NOT NULL;

-- ─── Entity mentions (structured) ─────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS entity_mentions JSONB DEFAULT '[]';

-- ─── Channel member notification prefs ────────────────
ALTER TABLE channel_members ADD COLUMN IF NOT EXISTS notification_pref TEXT NOT NULL DEFAULT 'all'
    CHECK (notification_pref IN ('all', 'mentions', 'nothing'));

-- ─── Presence tracking (in Redis, not SQL) ────────────
-- No SQL table needed — presence lives in Redis with TTL.

-- ─── Scheduled messages ───────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    body TEXT NOT NULL CHECK (char_length(body) <= 4000),
    body_format VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (body_format IN ('text', 'markdown')),
    parent_message_id UUID REFERENCES messages(id),
    scheduled_for TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY scheduled_msg_org_isolation ON scheduled_messages
    USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due ON scheduled_messages(scheduled_for) WHERE status = 'pending';
