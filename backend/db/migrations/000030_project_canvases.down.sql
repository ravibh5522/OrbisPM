-- ============================================================
-- Migration 000030 DOWN: Revert Project Canvases
-- ============================================================

DROP POLICY IF EXISTS tenant_isolation_project_canvases ON project_canvases;
DROP TABLE IF EXISTS project_canvases;
