-- ============================================================
-- Simplify Projects Messaging Service — Schema Migration
-- ============================================================
-- Uses the SAME PostgreSQL instance as the main backend.
-- RLS policies enforce org-level tenant isolation.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- CHANNELS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS channels (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID        NOT NULL,
    name            TEXT        NOT NULL DEFAULT '',
    description     TEXT        NOT NULL DEFAULT '',
    type            TEXT        NOT NULL CHECK (type IN ('dm', 'group', 'team', 'project')),
    team_id         UUID,
    project_id      UUID,
    is_archived     BOOLEAN     NOT NULL DEFAULT false,
    dm_pair         TEXT,               -- canonical sorted pair "uuid_a:uuid_b" for DMs
    avatar_url      TEXT        NOT NULL DEFAULT '',
    created_by      UUID        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channels_org_id ON channels(org_id);
CREATE INDEX IF NOT EXISTS idx_channels_org_type ON channels(org_id, type);
CREATE INDEX IF NOT EXISTS idx_channels_team ON channels(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channels_project ON channels(project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_dm_pair ON channels(org_id, dm_pair) WHERE type = 'dm' AND dm_pair IS NOT NULL;

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channels_org_isolation ON channels;
CREATE POLICY channels_org_isolation ON channels FOR ALL
    USING (org_id::text = current_setting('app.current_org_id', true))
    WITH CHECK (org_id::text = current_setting('app.current_org_id', true));

-- ════════════════════════════════════════════════════════════
-- CHANNEL MEMBERS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS channel_members (
    channel_id      UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL,
    role            TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    last_read_at    TIMESTAMPTZ,
    is_muted        BOOLEAN     NOT NULL DEFAULT false,
    is_pinned       BOOLEAN     NOT NULL DEFAULT false,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);

-- ════════════════════════════════════════════════════════════
-- MESSAGES
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS messages (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID        NOT NULL,
    channel_id          UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id             UUID        NOT NULL,
    body                TEXT        NOT NULL,
    body_format         TEXT        NOT NULL DEFAULT 'text' CHECK (body_format IN ('text', 'markdown')),
    parent_message_id   UUID        REFERENCES messages(id) ON DELETE SET NULL,
    thread_count        INT         NOT NULL DEFAULT 0,
    forwarded_from_id   UUID        REFERENCES messages(id) ON DELETE SET NULL,
    mentions            UUID[]      DEFAULT '{}',
    is_deleted          BOOLEAN     NOT NULL DEFAULT false,
    deleted_at          TIMESTAMPTZ,
    is_edited           BOOLEAN     NOT NULL DEFAULT false,
    edited_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(org_id, channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_mentions ON messages USING GIN(mentions);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_org_isolation ON messages;
CREATE POLICY messages_org_isolation ON messages FOR ALL
    USING (org_id::text = current_setting('app.current_org_id', true))
    WITH CHECK (org_id::text = current_setting('app.current_org_id', true));

-- ════════════════════════════════════════════════════════════
-- MESSAGE REACTIONS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS message_reactions (
    message_id      UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL,
    emoji           TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);

-- ════════════════════════════════════════════════════════════
-- MESSAGE ATTACHMENTS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS message_attachments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID        NOT NULL,
    message_id      UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name       TEXT        NOT NULL,
    file_size       BIGINT      NOT NULL,
    content_type    TEXT        NOT NULL,
    storage_key     TEXT        NOT NULL,
    metadata        JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_attachments_message ON message_attachments(message_id);

ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS msg_attachments_org_isolation ON message_attachments;
CREATE POLICY msg_attachments_org_isolation ON message_attachments FOR ALL
    USING (org_id::text = current_setting('app.current_org_id', true))
    WITH CHECK (org_id::text = current_setting('app.current_org_id', true));

-- ════════════════════════════════════════════════════════════
-- PINNED MESSAGES
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pinned_messages (
    channel_id      UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    message_id      UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    pinned_by       UUID        NOT NULL,
    pinned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, message_id)
);

-- ════════════════════════════════════════════════════════════
-- BOOKMARKS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS message_bookmarks (
    user_id         UUID        NOT NULL,
    message_id      UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    note            TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, message_id)
);

-- ════════════════════════════════════════════════════════════
-- HELPER: Get or create DM channel
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_or_create_dm_channel(
    p_org_id UUID,
    p_user_a UUID,
    p_user_b UUID
) RETURNS UUID AS $$
DECLARE
    v_dm_pair TEXT;
    v_channel_id UUID;
BEGIN
    -- Canonical pair: always sorted so A→B and B→A produce same key
    v_dm_pair := CASE
        WHEN p_user_a < p_user_b THEN p_user_a::text || ':' || p_user_b::text
        ELSE p_user_b::text || ':' || p_user_a::text
    END;

    -- Try find existing
    SELECT id INTO v_channel_id
    FROM channels
    WHERE org_id = p_org_id
      AND type = 'dm'
      AND dm_pair = v_dm_pair;

    IF v_channel_id IS NOT NULL THEN
        RETURN v_channel_id;
    END IF;

    -- Create new DM channel
    INSERT INTO channels (org_id, name, type, dm_pair, created_by)
    VALUES (p_org_id, '', 'dm', v_dm_pair, p_user_a)
    RETURNING id INTO v_channel_id;

    -- Add both members
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (v_channel_id, p_user_a, 'member'),
           (v_channel_id, p_user_b, 'member');

    RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql;
