-- Rollback 000008: Enhanced access control permissions

DELETE FROM role_permissions WHERE permission_id IN (
    SELECT id FROM permissions WHERE 
    (resource = 'projects' AND action = 'view_all') OR
    (resource = 'teams' AND action = 'view_all') OR
    (resource = 'tasks' AND action = 'view_all') OR
    (resource = 'dashboard' AND action IN ('view_org', 'view_team', 'view_personal'))
);

DELETE FROM permissions WHERE 
(resource = 'projects' AND action = 'view_all') OR
(resource = 'teams' AND action = 'view_all') OR
(resource = 'tasks' AND action = 'view_all') OR
(resource = 'dashboard' AND action IN ('view_org', 'view_team', 'view_personal'));
