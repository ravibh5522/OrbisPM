-- ============================================================
-- Migration 000032: Orbis Drive (Phase 1)
-- ============================================================
-- Spaces are implicit (scope_type + FK); items form a tree per space;
-- shares are explicit item-level grants that apply to the whole subtree.
-- See docs/ORBIS_DRIVE_DESIGN.md §3-§4.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. DRIVE_ITEMS — folders and files
-- ============================================================
CREATE TABLE IF NOT EXISTS drive_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    scope_type    TEXT NOT NULL CHECK (scope_type IN ('org', 'team', 'project', 'user')),
    team_id       UUID REFERENCES teams(id)    ON DELETE CASCADE,
    project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
    owner_user_id UUID,
    parent_id     UUID REFERENCES drive_items(id) ON DELETE CASCADE,
    ancestor_ids  UUID[] NOT NULL DEFAULT '{}',
    kind          TEXT NOT NULL CHECK (kind IN ('folder', 'file')),
    name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 255 AND name !~ '[/\\]'),
    mime_type     TEXT,
    size_bytes    BIGINT,
    storage_key   TEXT,
    sha256        TEXT,
    created_by    UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    trashed_at    TIMESTAMPTZ,
    trashed_by    UUID,

    CHECK (
        (scope_type = 'org'     AND team_id IS NULL AND project_id IS NULL AND owner_user_id IS NULL) OR
        (scope_type = 'team'    AND team_id IS NOT NULL AND project_id IS NULL AND owner_user_id IS NULL) OR
        (scope_type = 'project' AND project_id IS NOT NULL AND team_id IS NULL AND owner_user_id IS NULL) OR
        (scope_type = 'user'    AND owner_user_id IS NOT NULL AND team_id IS NULL AND project_id IS NULL)
    ),
    CHECK ((kind = 'folder') = (storage_key IS NULL)),
    CHECK (kind = 'folder' OR (size_bytes IS NOT NULL AND mime_type IS NOT NULL))
);

-- One live name per folder (case-insensitive); the service auto-renames on create.
CREATE UNIQUE INDEX IF NOT EXISTS ux_drive_items_name ON drive_items (
    org_id, scope_type,
    COALESCE(team_id, project_id, owner_user_id, org_id),
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
) WHERE trashed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drive_items_children  ON drive_items (parent_id) WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drive_items_ancestors ON drive_items USING gin (ancestor_ids);
CREATE INDEX IF NOT EXISTS idx_drive_items_team      ON drive_items (team_id)       WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_items_project   ON drive_items (project_id)    WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_items_owner     ON drive_items (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_items_recent    ON drive_items (org_id, created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_items_trash     ON drive_items (org_id, trashed_at) WHERE trashed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_items_name_trgm ON drive_items USING gin (lower(name) gin_trgm_ops);

-- ============================================================
-- 2. DRIVE_SHARES — explicit grants (item + descendants)
-- ============================================================
CREATE TABLE IF NOT EXISTS drive_shares (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    item_id       UUID NOT NULL REFERENCES drive_items(id) ON DELETE CASCADE,
    grantee_type  TEXT NOT NULL CHECK (grantee_type IN ('user', 'team', 'project', 'org')),
    grantee_id    UUID NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'manager')),
    created_by    UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ,
    UNIQUE (item_id, grantee_type, grantee_id)
);
CREATE INDEX IF NOT EXISTS idx_drive_shares_grantee ON drive_shares (org_id, grantee_type, grantee_id);

-- ============================================================
-- 3. DRIVE_USAGE + DRIVE_PURGE_QUEUE
-- ============================================================
CREATE TABLE IF NOT EXISTS drive_usage (
    org_id      UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    bytes_used  BIGINT NOT NULL DEFAULT 0 CHECK (bytes_used >= 0)
);

-- Objects whose rows are gone (trash purge or FK cascade from team/project/org
-- delete). Filled by trigger so cascades can never orphan S3 objects.
CREATE TABLE IF NOT EXISTS drive_purge_queue (
    storage_key TEXT PRIMARY KEY,
    org_id      UUID NOT NULL,
    size_bytes  BIGINT NOT NULL,
    queued_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION drive_items_after_delete() RETURNS trigger AS $$
BEGIN
    IF OLD.kind = 'file' THEN
        INSERT INTO drive_purge_queue (storage_key, org_id, size_bytes)
        VALUES (OLD.storage_key, OLD.org_id, OLD.size_bytes)
        ON CONFLICT DO NOTHING;
        -- GREATEST: a drifted counter must never block a delete via the CHECK.
        UPDATE drive_usage SET bytes_used = GREATEST(bytes_used - OLD.size_bytes, 0)
        WHERE org_id = OLD.org_id;
    END IF;
    RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_drive_items_after_delete ON drive_items;
CREATE TRIGGER trg_drive_items_after_delete
    AFTER DELETE ON drive_items FOR EACH ROW EXECUTE FUNCTION drive_items_after_delete();

-- ============================================================
-- 4. RLS POLICIES (defense in depth; repos also filter org_id)
-- ============================================================
ALTER TABLE drive_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_drive_items ON drive_items;
CREATE POLICY tenant_isolation_drive_items ON drive_items FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE drive_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_drive_shares ON drive_shares;
CREATE POLICY tenant_isolation_drive_shares ON drive_shares FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE drive_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_drive_usage ON drive_usage;
CREATE POLICY tenant_isolation_drive_usage ON drive_usage FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE drive_purge_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_drive_purge_queue ON drive_purge_queue;
CREATE POLICY tenant_isolation_drive_purge_queue ON drive_purge_queue FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================
-- 5. GRANT TO API ROLE
-- ============================================================
GRANT ALL ON drive_items       TO orbispm_api;
GRANT ALL ON drive_shares      TO orbispm_api;
GRANT ALL ON drive_usage       TO orbispm_api;
GRANT ALL ON drive_purge_queue TO orbispm_api;

-- ============================================================
-- 6. SEED PERMISSIONS
-- ============================================================
INSERT INTO permissions (resource, action, scope, description) VALUES
    ('drive', 'read',   'org',     'View and download org drive files'),
    ('drive', 'upload', 'org',     'Upload, rename and move org drive files'),
    ('drive', 'manage', 'org',     'Share and delete any org drive file'),
    ('drive', 'read',   'team',    'View and download team drive files'),
    ('drive', 'upload', 'team',    'Upload, rename and move team drive files'),
    ('drive', 'manage', 'team',    'Share and delete any team drive file'),
    ('drive', 'read',   'project', 'View and download project drive files'),
    ('drive', 'upload', 'project', 'Upload, rename and move project drive files'),
    ('drive', 'manage', 'project', 'Share and delete any project drive file')
ON CONFLICT (resource, action, scope) DO NOTHING;

-- ============================================================
-- 7. DEFAULT DRIVE GRANTS (§4.2) — single source for new + existing orgs
-- ============================================================
CREATE OR REPLACE FUNCTION drive_default_grants()
RETURNS TABLE (scope TEXT, slug TEXT, action TEXT) AS $$
    VALUES
        ('org',     'owner',         'read'), ('org', 'owner', 'upload'), ('org', 'owner', 'manage'),
        ('org',     'admin',         'read'), ('org', 'admin', 'upload'), ('org', 'admin', 'manage'),
        ('org',     'member',        'read'),
        ('org',     'viewer',        'read'),
        ('org',     'billing_admin', 'read'),
        ('team',    'team_lead',     'read'), ('team', 'team_lead', 'upload'), ('team', 'team_lead', 'manage'),
        ('team',    'member',        'read'), ('team', 'member',    'upload'),
        ('team',    'viewer',        'read'),
        ('project', 'lead',          'read'), ('project', 'lead',        'upload'), ('project', 'lead', 'manage'),
        ('project', 'contributor',   'read'), ('project', 'contributor', 'upload'),
        ('project', 'reviewer',      'read'), ('project', 'reviewer',    'upload'),
        ('project', 'observer',      'read')
$$ LANGUAGE sql IMMUTABLE;

-- ============================================================
-- 8. seed_org_roles(): explicit drive grants for NEW orgs
--
-- The 000006 predicates would give team 'member', project 'contributor'
-- and project 'reviewer' only drive:read (their filters are
-- action IN ('read','create','update') / action = 'read'), but §4.2
-- wants drive:upload for them. So every predicate below excludes
-- resource 'drive' and the grants come from the explicit matrix at the
-- end. Body is otherwise identical to 000006.
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
        SELECT v_role_id, id FROM permissions WHERE scope = 'org' AND resource <> 'drive'
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
        WHERE scope = 'org' AND resource <> 'drive'
          AND NOT (resource = 'org' AND action IN ('delete', 'transfer_ownership'))
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
        WHERE scope = 'org' AND resource <> 'drive' AND (
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
        WHERE scope = 'org' AND resource <> 'drive' AND action = 'read'
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
        WHERE scope = 'org' AND resource <> 'drive' AND (action = 'read' OR resource = 'billing')
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
        SELECT v_role_id, id FROM permissions WHERE scope = 'team' AND resource <> 'drive'
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
        WHERE scope = 'team' AND resource <> 'drive' AND (
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
        WHERE scope = 'team' AND resource <> 'drive' AND action = 'read'
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
        SELECT v_role_id, id FROM permissions WHERE scope = 'project' AND resource <> 'drive'
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
        WHERE scope = 'project' AND resource <> 'drive' AND (
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
        WHERE scope = 'project' AND resource <> 'drive' AND (
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
        WHERE scope = 'project' AND resource <> 'drive' AND (
            action = 'read'
            OR (resource = 'comments' AND action = 'create')
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- ==================== DRIVE (explicit §4.2 matrix) ====================
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM drive_default_grants() g
    JOIN roles r ON r.org_id = p_org_id AND r.scope = g.scope AND r.slug = g.slug AND r.is_system
    JOIN permissions p ON p.resource = 'drive' AND p.scope = g.scope AND p.action = g.action
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. BACKFILL EXISTING ORGS (same matrix as new orgs)
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM drive_default_grants() g
JOIN roles r ON r.scope = g.scope AND r.slug = g.slug AND r.is_system
JOIN permissions p ON p.resource = 'drive' AND p.scope = g.scope AND p.action = g.action
ON CONFLICT DO NOTHING;
