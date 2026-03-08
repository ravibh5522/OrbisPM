-- ============================================================
-- Migration 000006 DOWN: Revert Permission System
-- ============================================================

-- Drop trigger
DROP TRIGGER IF EXISTS trg_seed_org_roles ON orgs;
DROP FUNCTION IF EXISTS trigger_seed_org_roles();
DROP FUNCTION IF EXISTS seed_org_roles(UUID);

-- Restore projects.team_id from project_teams (pick first team)
UPDATE projects p
SET team_id = pt.team_id
FROM (
    SELECT DISTINCT ON (project_id) project_id, team_id
    FROM project_teams
    ORDER BY project_id, added_at
) pt
WHERE p.id = pt.project_id AND p.team_id IS NULL;

-- Make team_id NOT NULL again
ALTER TABLE projects ALTER COLUMN team_id SET NOT NULL;

-- Remove reviewable_fields from project settings
UPDATE projects SET settings = settings - 'reviewable_fields';

-- Drop RLS policies
DROP POLICY IF EXISTS tenant_isolation_role_permissions ON role_permissions;
DROP POLICY IF EXISTS tenant_isolation_project_teams ON project_teams;
DROP POLICY IF EXISTS tenant_isolation_change_requests ON task_change_requests;
DROP POLICY IF EXISTS tenant_isolation_roles ON roles;

-- Drop tables in dependency order
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS task_change_requests CASCADE;
DROP TABLE IF EXISTS project_teams CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
