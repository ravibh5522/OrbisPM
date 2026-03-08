-- Drop all RLS policies
DROP POLICY IF EXISTS tenant_isolation_teams ON teams;
DROP POLICY IF EXISTS tenant_isolation_projects ON projects;
DROP POLICY IF EXISTS tenant_isolation_tasks ON tasks;
DROP POLICY IF EXISTS tenant_isolation_checklists ON checklists;
DROP POLICY IF EXISTS tenant_isolation_task_rules ON task_rules;
DROP POLICY IF EXISTS tenant_isolation_templates ON task_templates;
DROP POLICY IF EXISTS tenant_isolation_comments ON comments;
DROP POLICY IF EXISTS tenant_isolation_attachments ON attachments;
DROP POLICY IF EXISTS tenant_isolation_activity ON activity_log;
DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
DROP POLICY IF EXISTS tenant_isolation_webhooks ON webhooks;
DROP POLICY IF EXISTS tenant_isolation_api_keys ON api_keys;
DROP POLICY IF EXISTS tenant_isolation_import_jobs ON import_jobs;
DROP POLICY IF EXISTS tenant_isolation_custom_roles ON custom_roles;
DROP POLICY IF EXISTS tenant_isolation_org_members ON org_members;
DROP POLICY IF EXISTS tenant_isolation_team_members ON team_members;
DROP POLICY IF EXISTS tenant_isolation_project_members ON project_members;
DROP POLICY IF EXISTS tenant_isolation_subscriptions ON org_subscriptions;

-- Disable RLS
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE checklists DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE attachments DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE custom_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE org_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE org_subscriptions DISABLE ROW LEVEL SECURITY;

DROP ROLE IF EXISTS orbispm_api;
