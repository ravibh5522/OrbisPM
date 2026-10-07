-- ============================================================
-- Migration 000031 DOWN: Revert AFFiNE workspace/doc provisioning bridge
-- ============================================================

DROP POLICY IF EXISTS tenant_isolation_project_affine_docs ON project_affine_docs;
DROP POLICY IF EXISTS tenant_isolation_org_affine_workspaces ON org_affine_workspaces;
DROP TABLE IF EXISTS project_affine_docs;
DROP TABLE IF EXISTS org_affine_workspaces;
