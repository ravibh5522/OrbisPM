-- ============================================================
-- Migration 000017: Announcements + Announcement Reads
-- ============================================================

-- ============================================================
-- 1. ANNOUNCEMENTS TABLE
-- ============================================================
CREATE TABLE announcements (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id   UUID        REFERENCES projects(id) ON DELETE CASCADE,
    author_id    UUID        NOT NULL,
    title        TEXT        NOT NULL,
    body         TEXT        NOT NULL,
    priority     TEXT        NOT NULL DEFAULT 'normal',
    pinned       BOOLEAN     NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT announcements_priority_check
        CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);

-- Index for org-wide announcement feeds (most-recent-first)
CREATE INDEX idx_announcements_org_created
    ON announcements(org_id, created_at DESC);

-- Index for project-scoped feeds (partial — only rows that have a project)
CREATE INDEX idx_announcements_project_created
    ON announcements(project_id, created_at DESC)
    WHERE project_id IS NOT NULL;

-- ============================================================
-- 2. ANNOUNCEMENT_READS TABLE
-- Tracks which users have read each announcement.
-- No org_id column — RLS is enforced via join to announcements.
-- ============================================================
CREATE TABLE announcement_reads (
    announcement_id UUID        NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL,
    read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (announcement_id, user_id)
);

-- ============================================================
-- 3. RLS POLICIES
-- ============================================================

-- announcements: standard tenant isolation on org_id
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_announcements ON announcements FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- announcement_reads: join through announcements to enforce org boundary
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_announcement_reads ON announcement_reads FOR ALL
    USING (
        announcement_id IN (
            SELECT id FROM announcements
            WHERE org_id = current_setting('app.current_org_id', true)::uuid
        )
    );

-- ============================================================
-- 4. GRANT TO API ROLE
-- ============================================================
GRANT ALL ON announcements      TO orbispm_api;
GRANT ALL ON announcement_reads TO orbispm_api;

-- ============================================================
-- 5. SEED NEW PERMISSIONS
-- ============================================================
INSERT INTO permissions (resource, action, scope, description) VALUES
    ('announcements', 'create', 'org', 'Create announcements'),
    ('announcements', 'read',   'org', 'Read announcements'),
    ('announcements', 'update', 'org', 'Update announcements'),
    ('announcements', 'delete', 'org', 'Delete announcements')
ON CONFLICT (resource, action, scope) DO NOTHING;

-- ============================================================
-- 6. GRANT NEW PERMISSIONS TO EXISTING ORG ROLES
--
-- The seed_org_roles() function already covers new orgs via the
-- trigger on org INSERT, because its predicates are broad enough
-- to include these permissions:
--   owner  → all org-scope permissions (picks up all four)
--   admin  → all org-scope except org.delete / org.transfer_ownership
--             (picks up all four)
--   member → action = 'read' OR resource IN (tasks, comments, …)
--             (picks up announcements:read)
--   viewer → action = 'read'
--             (picks up announcements:read)
--
-- For orgs that already exist we must backfill explicitly.
-- ============================================================
DO $$
DECLARE
    v_role   RECORD;
    v_perm   RECORD;
BEGIN
    -- owner: grant all four announcement permissions
    FOR v_role IN
        SELECT id FROM roles WHERE scope = 'org' AND slug = 'owner'
    LOOP
        FOR v_perm IN
            SELECT id FROM permissions
            WHERE resource = 'announcements' AND scope = 'org'
        LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_role.id, v_perm.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;

    -- admin: grant all four announcement permissions
    FOR v_role IN
        SELECT id FROM roles WHERE scope = 'org' AND slug = 'admin'
    LOOP
        FOR v_perm IN
            SELECT id FROM permissions
            WHERE resource = 'announcements' AND scope = 'org'
        LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_role.id, v_perm.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;

    -- member: read only
    FOR v_role IN
        SELECT id FROM roles WHERE scope = 'org' AND slug = 'member'
    LOOP
        FOR v_perm IN
            SELECT id FROM permissions
            WHERE resource = 'announcements' AND action = 'read' AND scope = 'org'
        LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_role.id, v_perm.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;

    -- viewer: read only
    FOR v_role IN
        SELECT id FROM roles WHERE scope = 'org' AND slug = 'viewer'
    LOOP
        FOR v_perm IN
            SELECT id FROM permissions
            WHERE resource = 'announcements' AND action = 'read' AND scope = 'org'
        LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_role.id, v_perm.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END;
$$;
