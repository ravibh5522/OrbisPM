-- ============================================================
-- Rollback: Channel Roles & RBAC
-- ============================================================

DROP TABLE IF EXISTS channel_role_permissions;
DROP TABLE IF EXISTS channel_permissions;

-- Restore original constraint
ALTER TABLE channel_members DROP CONSTRAINT IF EXISTS channel_members_role_check;
ALTER TABLE channel_members
    ADD CONSTRAINT channel_members_role_check
    CHECK (role IN ('owner', 'admin', 'member'));
