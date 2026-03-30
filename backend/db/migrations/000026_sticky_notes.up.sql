-- Personal sticky notes (user-scoped, not org-scoped)
CREATE TABLE IF NOT EXISTS sticky_notes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    title       VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color       VARCHAR(20) NOT NULL DEFAULT 'yellow',
    priority    VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    start_date  TIMESTAMPTZ,
    due_date    TIMESTAMPTZ,
    completed   BOOLEAN NOT NULL DEFAULT false,
    checkpoints JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sticky_notes_user_id ON sticky_notes(user_id);
CREATE INDEX idx_sticky_notes_user_due ON sticky_notes(user_id, due_date);
CREATE INDEX idx_sticky_notes_user_completed ON sticky_notes(user_id, completed);
