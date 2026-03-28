CREATE TABLE IF NOT EXISTS org_theme_configs (
    org_id      UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    base_theme  TEXT        NOT NULL DEFAULT 'orbis-light',
    custom_colors JSONB     NOT NULL DEFAULT '{}',
    locked      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID,
    PRIMARY KEY (org_id)
);
