-- 000008: Enhanced access control permissions
-- Adds projects.view_all, teams.view_all, tasks.view_all permissions and updates role assignments

-- Add projects.view_all permission (allows seeing all projects vs only memberships)
INSERT INTO permissions (resource, action, scope, description) 
VALUES ('projects', 'view_all', 'org', 'View all projects in the organization regardless of membership')
ON CONFLICT (resource, action, scope) DO NOTHING;

-- Grant projects.view_all to owner and admin roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug IN ('owner', 'admin') 
  AND r.scope = 'org'
  AND p.resource = 'projects' 
  AND p.action = 'view_all'
  AND p.scope = 'org'
ON CONFLICT DO NOTHING;

-- Add teams.view_all permission (allows seeing all teams vs only memberships)
INSERT INTO permissions (resource, action, scope, description) 
VALUES ('teams', 'view_all', 'org', 'View all teams in the organization regardless of membership')
ON CONFLICT (resource, action, scope) DO NOTHING;

-- Grant teams.view_all to owner and admin roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug IN ('owner', 'admin') 
  AND r.scope = 'org'
  AND p.resource = 'teams' 
  AND p.action = 'view_all'
  AND p.scope = 'org'
ON CONFLICT DO NOTHING;

-- Add tasks.view_all permission (allows seeing all tasks vs only assigned/project-member tasks)
INSERT INTO permissions (resource, action, scope, description) 
VALUES ('tasks', 'view_all', 'org', 'View all tasks in the organization regardless of assignment')
ON CONFLICT (resource, action, scope) DO NOTHING;

-- Grant tasks.view_all to owner and admin roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug IN ('owner', 'admin') 
  AND r.scope = 'org'
  AND p.resource = 'tasks' 
  AND p.action = 'view_all'
  AND p.scope = 'org'
ON CONFLICT DO NOTHING;

-- Add dashboard scope permissions
INSERT INTO permissions (resource, action, scope, description) VALUES 
('dashboard', 'view_org', 'org', 'View organization-wide dashboard statistics'),
('dashboard', 'view_team', 'team', 'View team-level dashboard statistics'),
('dashboard', 'view_personal', 'org', 'View personal dashboard statistics')
ON CONFLICT (resource, action, scope) DO NOTHING;

-- Grant dashboard.view_org to owner/admin only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug IN ('owner', 'admin') 
  AND r.scope = 'org'
  AND p.resource = 'dashboard' 
  AND p.action = 'view_org'
ON CONFLICT DO NOTHING;

-- Grant dashboard.view_team to team_lead
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'team_lead' 
  AND r.scope = 'team'
  AND p.resource = 'dashboard' 
  AND p.action = 'view_team'
ON CONFLICT DO NOTHING;

-- Grant dashboard.view_personal to all org-level roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.scope = 'org'
  AND p.resource = 'dashboard' 
  AND p.action = 'view_personal'
ON CONFLICT DO NOTHING;
