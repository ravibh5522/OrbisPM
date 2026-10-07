-- ============================================================
-- Migration 000030: Project Canvases (Whiteboards)
-- ============================================================

CREATE TABLE IF NOT EXISTS project_canvases (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    state       JSONB       NOT NULL DEFAULT '{"version":1,"shapes":[],"connectors":[]}',
    version     INTEGER     NOT NULL DEFAULT 1,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_canvases_project_created
    ON project_canvases(project_id, created_at DESC);

-- ============================================================
-- RLS: standard tenant isolation on org_id
-- ============================================================
ALTER TABLE project_canvases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_project_canvases ON project_canvases;
CREATE POLICY tenant_isolation_project_canvases ON project_canvases FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

GRANT ALL ON project_canvases TO orbispm_api;
