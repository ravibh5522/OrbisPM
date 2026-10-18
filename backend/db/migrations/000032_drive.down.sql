-- ============================================================
-- Migration 000032 DOWN: Revert Orbis Drive
-- ============================================================
-- pg_trgm is left installed: it is created IF NOT EXISTS and may be
-- relied on by objects outside this migration.

-- Restore seed_org_roles() exactly as defined in 000006.
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

DROP FUNCTION IF EXISTS drive_default_grants();

-- Cascades remove the matching role_permissions rows.
DELETE FROM permissions WHERE resource = 'drive';

-- Dropping drive_items also drops trg_drive_items_after_delete.
DROP TABLE IF EXISTS drive_purge_queue;
DROP TABLE IF EXISTS drive_usage;
DROP TABLE IF EXISTS drive_shares;
DROP TABLE IF EXISTS drive_items;
DROP FUNCTION IF EXISTS drive_items_after_delete();
