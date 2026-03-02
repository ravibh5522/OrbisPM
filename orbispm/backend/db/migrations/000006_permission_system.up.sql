-- ============================================================
-- Migration 000006: Permission System, Review Pipeline, Multi-Team Projects
-- ============================================================

-- ============================================================
-- 1. PERMISSIONS TABLE — Canonical permission registry
-- ============================================================
CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource    TEXT NOT NULL,
    action      TEXT NOT NULL,
    scope       TEXT NOT NULL DEFAULT 'org' CHECK (scope IN ('org', 'team', 'project')),
    description TEXT,
    UNIQUE(resource, action, scope)
);

-- ============================================================
-- 2. ROLES TABLE — DB-driven role definitions
-- ============================================================
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    scope       TEXT NOT NULL CHECK (scope IN ('org', 'team', 'project')),
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, scope, slug)
);
CREATE INDEX idx_roles_org ON roles(org_id);
CREATE INDEX idx_roles_org_scope ON roles(org_id, scope);

-- ============================================================
-- 3. ROLE_PERMISSIONS TABLE — Many-to-many
-- ============================================================
CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY(role_id, permission_id)
);
CREATE INDEX idx_role_permissions_perm ON role_permissions(permission_id);

-- ============================================================
-- 4. PROJECT_TEAMS TABLE — Multi-team projects
-- ============================================================
CREATE TABLE project_teams (
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, team_id)
);
CREATE INDEX idx_project_teams_team ON project_teams(team_id);

-- ============================================================
-- 5. TASK_CHANGE_REQUESTS TABLE — Review pipeline
-- ============================================================
CREATE TABLE task_change_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    proposer_id  UUID NOT NULL,
    reviewer_id  UUID,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    changes      JSONB NOT NULL,
    reason       TEXT,
    review_note  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at  TIMESTAMPTZ
);
CREATE INDEX idx_change_requests_task ON task_change_requests(task_id, status);
CREATE INDEX idx_change_requests_org ON task_change_requests(org_id, status);
CREATE INDEX idx_change_requests_reviewer ON task_change_requests(reviewer_id) WHERE status = 'pending';

-- ============================================================
-- 6. RLS POLICIES for new tables
-- ============================================================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_roles ON roles FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE task_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_change_requests ON task_change_requests FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- role_permissions and project_teams don't have org_id directly,
-- they are accessed via JOINs through RLS-protected parent tables.
ALTER TABLE project_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_project_teams ON project_teams FOR ALL
    USING (project_id IN (SELECT id FROM projects WHERE org_id = current_setting('app.current_org_id', true)::uuid));

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_role_permissions ON role_permissions FOR ALL
    USING (role_id IN (SELECT id FROM roles WHERE org_id = current_setting('app.current_org_id', true)::uuid));

-- Grant permissions to API role
GRANT ALL ON permissions TO orbispm_api;
GRANT ALL ON roles TO orbispm_api;
GRANT ALL ON role_permissions TO orbispm_api;
GRANT ALL ON project_teams TO orbispm_api;
GRANT ALL ON task_change_requests TO orbispm_api;

-- ============================================================
-- 7. SEED CANONICAL PERMISSIONS
-- ============================================================

-- Org-scope permissions
INSERT INTO permissions (resource, action, scope, description) VALUES
    -- Org management
    ('org', 'read', 'org', 'View organization details'),
    ('org', 'update', 'org', 'Update organization settings'),
    ('org', 'delete', 'org', 'Delete the organization'),
    ('org', 'transfer_ownership', 'org', 'Transfer org ownership'),
    ('org', 'manage_members', 'org', 'Invite/remove org members'),
    -- Team management (org-level)
    ('teams', 'create', 'org', 'Create teams'),
    ('teams', 'read', 'org', 'View teams'),
    ('teams', 'update', 'org', 'Update any team'),
    ('teams', 'delete', 'org', 'Delete teams'),
    -- Project management (org-level)
    ('projects', 'create', 'org', 'Create projects'),
    ('projects', 'read', 'org', 'View projects'),
    ('projects', 'update', 'org', 'Update any project'),
    ('projects', 'delete', 'org', 'Delete projects'),
    -- Task management (org-level)
    ('tasks', 'create', 'org', 'Create tasks'),
    ('tasks', 'read', 'org', 'View tasks'),
    ('tasks', 'update', 'org', 'Update tasks'),
    ('tasks', 'delete', 'org', 'Delete tasks'),
    ('tasks', 'review', 'org', 'Review task change requests'),
    ('tasks', 'direct_update', 'org', 'Update tasks without review'),
    -- Comments
    ('comments', 'create', 'org', 'Create comments'),
    ('comments', 'read', 'org', 'View comments'),
    ('comments', 'update', 'org', 'Update own comments'),
    ('comments', 'delete', 'org', 'Delete comments'),
    -- Checklists
    ('checklists', 'create', 'org', 'Create checklist items'),
    ('checklists', 'read', 'org', 'View checklists'),
    ('checklists', 'update', 'org', 'Toggle/update checklists'),
    ('checklists', 'delete', 'org', 'Delete checklist items'),
    -- Billing
    ('billing', 'read', 'org', 'View billing info'),
    ('billing', 'manage', 'org', 'Manage billing/subscriptions'),
    -- Roles & Permissions
    ('roles', 'create', 'org', 'Create custom roles'),
    ('roles', 'read', 'org', 'View roles'),
    ('roles', 'update', 'org', 'Update role permissions'),
    ('roles', 'delete', 'org', 'Delete custom roles'),
    -- Webhooks & API keys
    ('webhooks', 'manage', 'org', 'Manage webhooks'),
    ('api_keys', 'manage', 'org', 'Manage API keys'),
    -- Templates
    ('templates', 'create', 'org', 'Create task templates'),
    ('templates', 'read', 'org', 'View templates'),
    ('templates', 'update', 'org', 'Update templates'),
    ('templates', 'delete', 'org', 'Delete templates'),
    -- Imports
    ('imports', 'manage', 'org', 'Import/export data'),
    -- Attachments
    ('attachments', 'create', 'org', 'Upload attachments'),
    ('attachments', 'read', 'org', 'View attachments'),
    ('attachments', 'delete', 'org', 'Delete attachments');

-- Team-scope permissions
INSERT INTO permissions (resource, action, scope, description) VALUES
    ('team', 'read', 'team', 'View team details'),
    ('team', 'update', 'team', 'Update team settings'),
    ('team', 'manage_members', 'team', 'Manage team members'),
    ('projects', 'create', 'team', 'Create projects in team'),
    ('projects', 'read', 'team', 'View team projects'),
    ('tasks', 'create', 'team', 'Create tasks in team projects'),
    ('tasks', 'read', 'team', 'View tasks in team projects'),
    ('tasks', 'update', 'team', 'Update tasks in team projects'),
    ('tasks', 'delete', 'team', 'Delete tasks in team projects'),
    ('tasks', 'review', 'team', 'Review change requests in team'),
    ('tasks', 'direct_update', 'team', 'Bypass review in team projects'),
    ('comments', 'create', 'team', 'Create comments in team'),
    ('comments', 'read', 'team', 'View comments in team');

-- Project-scope permissions
INSERT INTO permissions (resource, action, scope, description) VALUES
    ('project', 'read', 'project', 'View project details'),
    ('project', 'update', 'project', 'Update project settings'),
    ('project', 'delete', 'project', 'Delete the project'),
    ('members', 'manage', 'project', 'Manage project members'),
    ('tasks', 'create', 'project', 'Create tasks'),
    ('tasks', 'read', 'project', 'View tasks'),
    ('tasks', 'update', 'project', 'Update tasks'),
    ('tasks', 'delete', 'project', 'Delete tasks'),
    ('tasks', 'review', 'project', 'Review task change requests'),
    ('tasks', 'direct_update', 'project', 'Update tasks without review'),
    ('comments', 'create', 'project', 'Create comments'),
    ('comments', 'read', 'project', 'View comments'),
    ('comments', 'update', 'project', 'Update own comments'),
    ('comments', 'delete', 'project', 'Delete comments'),
    ('checklists', 'create', 'project', 'Create checklist items'),
    ('checklists', 'read', 'project', 'View checklists'),
    ('checklists', 'update', 'project', 'Toggle/update checklists'),
    ('checklists', 'delete', 'project', 'Delete checklist items'),
    ('attachments', 'create', 'project', 'Upload attachments'),
    ('attachments', 'read', 'project', 'View attachments'),
    ('attachments', 'delete', 'project', 'Delete attachments');

-- ============================================================
-- 8. FUNCTION: Seed system roles for an org
-- ============================================================
CREATE OR REPLACE FUNCTION seed_org_roles(p_org_id UUID) RETURNS void AS $$
DECLARE
    v_role_id UUID;
    v_perm_id UUID;
BEGIN
    -- ==================== ORG-SCOPE ROLES ====================

    -- Owner (all org-scope permissions)
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'org', 'owner', 'Owner', 'Organization owner with full access', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions WHERE scope = 'org'
        ON CONFLICT DO NOTHING;
    END IF;

    -- Admin (all org-scope except org.delete, org.transfer_ownership)
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'org', 'admin', 'Admin', 'Organization administrator', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE scope = 'org' AND NOT (resource = 'org' AND action IN ('delete', 'transfer_ownership'))
        ON CONFLICT DO NOTHING;
    END IF;

    -- Member (read + tasks/comments/checklists CRUD)
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'org', 'member', 'Member', 'Standard organization member', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE scope = 'org' AND (
            action = 'read'
            OR resource IN ('tasks', 'comments', 'checklists', 'attachments')
            OR (resource = 'templates' AND action = 'read')
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Viewer (read-only)
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'org', 'viewer', 'Viewer', 'Read-only access', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE scope = 'org' AND action = 'read'
        ON CONFLICT DO NOTHING;
    END IF;

    -- Billing Admin (billing + read)
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'org', 'billing_admin', 'Billing Admin', 'Manages billing and subscriptions', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE scope = 'org' AND (action = 'read' OR resource = 'billing')
        ON CONFLICT DO NOTHING;
    END IF;

    -- ==================== TEAM-SCOPE ROLES ====================

    -- Team Lead
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'team', 'team_lead', 'Team Lead', 'Team leader with full team access', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions WHERE scope = 'team'
        ON CONFLICT DO NOTHING;
    END IF;

    -- Team Member
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'team', 'member', 'Member', 'Standard team member', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE scope = 'team' AND (
            action IN ('read', 'create', 'update')
            OR (resource IN ('comments') AND action IN ('create', 'read'))
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Team Viewer
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'team', 'viewer', 'Viewer', 'Read-only team access', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE scope = 'team' AND action = 'read'
        ON CONFLICT DO NOTHING;
    END IF;

    -- ==================== PROJECT-SCOPE ROLES ====================

    -- Project Lead (all project permissions)
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'project', 'lead', 'Project Lead', 'Project leader with full project access', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions WHERE scope = 'project'
        ON CONFLICT DO NOTHING;
    END IF;

    -- Contributor
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'project', 'contributor', 'Contributor', 'Can create and update tasks', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE scope = 'project' AND (
            action IN ('read', 'create', 'update')
            OR resource IN ('comments', 'checklists', 'attachments')
        ) AND NOT (resource IN ('project') AND action IN ('update', 'delete'))
          AND NOT (resource = 'members')
          AND NOT (resource = 'tasks' AND action IN ('review', 'direct_update'))
        ON CONFLICT DO NOTHING;
    END IF;

    -- Reviewer
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'project', 'reviewer', 'Reviewer', 'Can review task changes', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE scope = 'project' AND (
            action = 'read'
            OR (resource = 'tasks' AND action IN ('review', 'direct_update'))
            OR (resource = 'comments' AND action IN ('create', 'read'))
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Observer (read-only + can comment)
    INSERT INTO roles (org_id, scope, slug, name, description, is_system)
    VALUES (p_org_id, 'project', 'observer', 'Observer', 'Read-only with commenting', true)
    ON CONFLICT (org_id, scope, slug) DO NOTHING
    RETURNING id INTO v_role_id;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT v_role_id, id FROM permissions
        WHERE scope = 'project' AND (
            action = 'read'
            OR (resource = 'comments' AND action = 'create')
        )
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. TRIGGER: Auto-seed roles on org creation
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_seed_org_roles() RETURNS TRIGGER AS $$
BEGIN
    PERFORM seed_org_roles(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_seed_org_roles
    AFTER INSERT ON orgs
    FOR EACH ROW
    EXECUTE FUNCTION trigger_seed_org_roles();

-- ============================================================
-- 10. SEED ROLES FOR ALL EXISTING ORGS
-- ============================================================
DO $$
DECLARE
    org_rec RECORD;
BEGIN
    FOR org_rec IN SELECT id FROM orgs LOOP
        PERFORM seed_org_roles(org_rec.id);
    END LOOP;
END;
$$;

-- ============================================================
-- 11. MIGRATE project_teams FROM projects.team_id
-- ============================================================
INSERT INTO project_teams (project_id, team_id, added_at)
SELECT id, team_id, created_at FROM projects WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- 12. MAKE projects.team_id NULLABLE (backward compat)
-- ============================================================
ALTER TABLE projects ALTER COLUMN team_id DROP NOT NULL;

-- ============================================================
-- 13. ADD reviewable_fields DEFAULT TO ALL EXISTING PROJECTS
-- ============================================================
UPDATE projects
SET settings = settings || '{"reviewable_fields": []}'::jsonb
WHERE NOT (settings ? 'reviewable_fields');
