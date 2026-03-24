-- Migration 000016: Project creator tracking + backfill project members for RBAC V2
-- This adds created_by column and backfills project_members so route-level permission
-- checks can be enforced without locking out existing users.

-- 1. Track who created each project
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by UUID;

-- 2. Backfill created_by to the org owner (best guess for existing data)
UPDATE projects p SET created_by = (
    SELECT om.user_id FROM org_members om
    WHERE om.org_id = p.org_id AND om.role = 'owner'
    LIMIT 1
) WHERE p.created_by IS NULL;

-- 3. Backfill project_members from team_members for already-linked projects
--    (team-inherited membership)
INSERT INTO project_members (project_id, user_id, role, source, source_team_id)
SELECT pt.project_id, tm.user_id,
       CASE tm.role
           WHEN 'team_lead' THEN 'lead'
           WHEN 'member' THEN 'contributor'
           WHEN 'viewer' THEN 'observer'
           ELSE 'observer'
       END,
       'team', pt.team_id
FROM project_teams pt
JOIN team_members tm ON tm.team_id = pt.team_id
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 4. Ensure org owners/admins are project leads in all projects
INSERT INTO project_members (project_id, user_id, role, source)
SELECT p.id, om.user_id,
       CASE om.role
           WHEN 'owner' THEN 'lead'
           WHEN 'admin' THEN 'lead'
           ELSE 'contributor'
       END,
       'direct'
FROM projects p
JOIN org_members om ON om.org_id = p.org_id
WHERE om.role IN ('owner', 'admin')
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 5. For created_by users that aren't already members, add them as leads
INSERT INTO project_members (project_id, user_id, role, source)
SELECT p.id, p.created_by, 'lead', 'direct'
FROM projects p
WHERE p.created_by IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;
