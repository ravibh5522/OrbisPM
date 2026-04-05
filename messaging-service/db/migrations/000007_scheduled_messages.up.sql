-- ============================================================
-- Scheduled messages support
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_messages (
    id                 UUID         NOT NULL DEFAULT gen_random_uuid(),
    org_id             UUID         NOT NULL,
    channel_id         UUID         NOT NULL,
    user_id            UUID         NOT NULL,
    body               TEXT         NOT NULL,
    body_format        VARCHAR(10)  NOT NULL DEFAULT 'text',
    parent_message_id  UUID,
    scheduled_for      TIMESTAMPTZ  NOT NULL,
    status             VARCHAR(20)  NOT NULL DEFAULT 'pending',
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT scheduled_messages_body_check       CHECK (char_length(body) <= 4000),
    CONSTRAINT scheduled_messages_body_format_check CHECK (body_format IN ('text', 'markdown')),
    CONSTRAINT scheduled_messages_status_check     CHECK (status IN ('pending', 'sent', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
    ON scheduled_messages(scheduled_for)
    WHERE status = 'pending';
