-- ============================================================
-- Migration 000017 DOWN: Revert Announcements
-- ============================================================

-- Remove seeded permissions (cascades automatically remove role_permissions rows)
DELETE FROM permissions
WHERE resource = 'announcements' AND scope = 'org';

-- Drop RLS policies
DROP POLICY IF EXISTS tenant_isolation_announcement_reads ON announcement_reads;
DROP POLICY IF EXISTS tenant_isolation_announcements ON announcements;

-- Drop tables in dependency order (reads before announcements)
DROP TABLE IF EXISTS announcement_reads;
DROP TABLE IF EXISTS announcements;
