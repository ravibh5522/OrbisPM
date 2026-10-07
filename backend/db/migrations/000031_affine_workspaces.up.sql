-- ============================================================
-- Migration 000031: AFFiNE workspace/doc provisioning bridge
-- ============================================================
-- One AFFiNE workspace per org, one AFFiNE doc per project inside it
-- (confirmed tradeoff: no per-project permission layer inside AFFiNE
-- itself in this pass). Both tables just store references to resources
-- that live in AFFiNE's own database — created lazily on first access
-- via the AffineClient, not by this migration.

CREATE TABLE IF NOT EXISTS org_affine_workspaces (
    org_id             UUID        PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    affine_workspace_id TEXT       NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_affine_docs (
    project_id     UUID        PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    org_id         UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    affine_doc_id  TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_affine_docs_org
    ON project_affine_docs(org_id);

ALTER TABLE org_affine_workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_org_affine_workspaces ON org_affine_workspaces;
CREATE POLICY tenant_isolation_org_affine_workspaces ON org_affine_workspaces FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE project_affine_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_project_affine_docs ON project_affine_docs;
CREATE POLICY tenant_isolation_project_affine_docs ON project_affine_docs FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

GRANT ALL ON org_affine_workspaces TO orbispm_api;
GRANT ALL ON project_affine_docs TO orbispm_api;
