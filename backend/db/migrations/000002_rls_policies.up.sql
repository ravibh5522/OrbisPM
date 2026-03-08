-- ============================================================
-- Row-Level Security Policies
-- ============================================================

-- Create an application role for the API to use
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'orbispm_api') THEN
        CREATE ROLE orbispm_api;
    END IF;
END
$$;

-- Grant permissions to the API role
GRANT ALL ON ALL TABLES IN SCHEMA public TO orbispm_api;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO orbispm_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO orbispm_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO orbispm_api;

-- Enable RLS on all tenant-scoped tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_subscriptions ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation_teams ON teams FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_projects ON projects FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_tasks ON tasks FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_checklists ON checklists FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_task_rules ON task_rules FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_templates ON task_templates FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_comments ON comments FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_attachments ON attachments FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_activity ON activity_log FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_notifications ON notifications FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_webhooks ON webhooks FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_api_keys ON api_keys FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_import_jobs ON import_jobs FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_custom_roles ON custom_roles FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_org_members ON org_members FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- team_members needs a join through teams to check org_id
CREATE POLICY tenant_isolation_team_members ON team_members FOR ALL
    USING (team_id IN (SELECT id FROM teams WHERE org_id = current_setting('app.current_org_id', true)::uuid));

-- project_members needs a join through projects to check org_id
CREATE POLICY tenant_isolation_project_members ON project_members FOR ALL
    USING (project_id IN (SELECT id FROM projects WHERE org_id = current_setting('app.current_org_id', true)::uuid));

CREATE POLICY tenant_isolation_subscriptions ON org_subscriptions FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Allow the table owner (superuser) to bypass RLS
-- The orbispm user (superuser) bypasses RLS by default.
-- The orbispm_api role will be subject to RLS.
