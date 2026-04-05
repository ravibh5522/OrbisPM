-- ============================================================
-- Migration 000007: Channel Roles & RBAC
-- Adds moderator and viewer roles with a permission-based system.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. Expand allowed roles on channel_members
-- ════════════════════════════════════════════════════════════

ALTER TABLE channel_members DROP CONSTRAINT IF EXISTS channel_members_role_check;
ALTER TABLE channel_members
    ADD CONSTRAINT channel_members_role_check
    CHECK (role IN ('owner', 'admin', 'moderator', 'member', 'viewer'));

-- ════════════════════════════════════════════════════════════
-- 2. Channel permissions registry
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS channel_permissions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    resource    TEXT        NOT NULL,
    action      TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    UNIQUE(resource, action)
);

-- Seed canonical permissions
INSERT INTO channel_permissions (resource, action, description) VALUES
    -- Channel management
    ('channel', 'update',          'Update channel name, description, avatar'),
    ('channel', 'archive',         'Archive a channel'),
    ('channel', 'delete',          'Delete a channel permanently'),
    ('channel', 'manage_settings', 'Change channel-level settings'),
    -- Member management
    ('member', 'add',              'Add members to the channel'),
    ('member', 'remove',           'Remove members from the channel'),
    ('member', 'update_role',      'Change a member''s role'),
    -- Message operations
    ('message', 'send',            'Send messages in the channel'),
    ('message', 'edit_own',        'Edit own messages'),
    ('message', 'delete_own',      'Delete own messages'),
    ('message', 'delete_any',      'Delete any member''s messages'),
    ('message', 'pin',             'Pin or unpin messages'),
    ('message', 'react',           'Add or remove reactions'),
    ('message', 'upload',          'Upload file attachments'),
    ('message', 'forward',         'Forward messages to other channels'),
    -- Read
    ('message', 'read',            'View messages in the channel'),
    ('message', 'search',          'Search messages in the channel'),
    -- Bookmarks
    ('bookmark', 'manage',         'Add or remove personal bookmarks'),
    -- Categories
    ('category', 'manage',         'Manage channel categories')
ON CONFLICT (resource, action) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 3. Role-permission mapping table
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS channel_role_permissions (
    role            TEXT        NOT NULL CHECK (role IN ('owner', 'admin', 'moderator', 'member', 'viewer')),
    permission_id   UUID        NOT NULL REFERENCES channel_permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_id)
);

-- ════════════════════════════════════════════════════════════
-- 4. Seed default role → permission mappings
-- ════════════════════════════════════════════════════════════

-- OWNER: all permissions
INSERT INTO channel_role_permissions (role, permission_id)
SELECT 'owner', id FROM channel_permissions
ON CONFLICT DO NOTHING;

-- ADMIN: everything except delete channel
INSERT INTO channel_role_permissions (role, permission_id)
SELECT 'admin', id FROM channel_permissions
WHERE NOT (resource = 'channel' AND action = 'delete')
ON CONFLICT DO NOTHING;

-- MODERATOR: message moderation + read + limited member management
INSERT INTO channel_role_permissions (role, permission_id)
SELECT 'moderator', id FROM channel_permissions
WHERE (resource, action) IN (
    ('message', 'send'),
    ('message', 'edit_own'),
    ('message', 'delete_own'),
    ('message', 'delete_any'),
    ('message', 'pin'),
    ('message', 'react'),
    ('message', 'upload'),
    ('message', 'forward'),
    ('message', 'read'),
    ('message', 'search'),
    ('member', 'add'),
    ('member', 'remove'),
    ('bookmark', 'manage'),
    ('category', 'manage')
)
ON CONFLICT DO NOTHING;

-- MEMBER: standard messaging
INSERT INTO channel_role_permissions (role, permission_id)
SELECT 'member', id FROM channel_permissions
WHERE (resource, action) IN (
    ('message', 'send'),
    ('message', 'edit_own'),
    ('message', 'delete_own'),
    ('message', 'react'),
    ('message', 'upload'),
    ('message', 'forward'),
    ('message', 'read'),
    ('message', 'search'),
    ('bookmark', 'manage')
)
ON CONFLICT DO NOTHING;

-- VIEWER: read-only + bookmarks
INSERT INTO channel_role_permissions (role, permission_id)
SELECT 'viewer', id FROM channel_permissions
WHERE (resource, action) IN (
    ('message', 'read'),
    ('message', 'search'),
    ('bookmark', 'manage')
)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 5. Index for fast permission lookups
-- ════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_channel_role_permissions_role
    ON channel_role_permissions(role);

CREATE INDEX IF NOT EXISTS idx_channel_permissions_resource_action
    ON channel_permissions(resource, action);
