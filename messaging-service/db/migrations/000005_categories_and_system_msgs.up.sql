-- ─── Channel Categories (Discord-style) ──────────────────
CREATE TABLE IF NOT EXISTS channel_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    auto_source TEXT CHECK (auto_source IN ('team', 'project')),
    auto_source_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE channel_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY category_org_isolation ON channel_categories
    USING (org_id = current_setting('app.current_org_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_channel_categories_org ON channel_categories(org_id, position);
CREATE INDEX IF NOT EXISTS idx_channel_categories_auto ON channel_categories(auto_source, auto_source_id) WHERE auto_source IS NOT NULL;

-- Add category reference and ordering to channels
ALTER TABLE channels ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES channel_categories(id) ON DELETE SET NULL;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category_id, position) WHERE category_id IS NOT NULL;

-- ─── User Category Collapse State ────────────────────────
CREATE TABLE IF NOT EXISTS user_category_states (
    user_id UUID NOT NULL,
    category_id UUID NOT NULL REFERENCES channel_categories(id) ON DELETE CASCADE,
    is_collapsed BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, category_id)
);

-- ─── System Messages ─────────────────────────────────────
-- Track system-generated messages (e.g. "X added Y to the channel")
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS system_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS system_metadata JSONB DEFAULT '{}';
