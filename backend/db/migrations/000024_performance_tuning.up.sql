-- Migration 000024: Performance tuning — missing indexes and pg_stat_statements
-- All statements are idempotent (IF NOT EXISTS / CONCURRENTLY safe).

-- Enable query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ── users table ──────────────────────────────────────────────────────────────
-- FindUserByEmail: SELECT id FROM users WHERE email = $1
-- Without this index every invite/member-lookup does a full sequential scan.
CREATE INDEX IF NOT EXISTS idx_users_email
    ON public.users (email);

-- ── permissions table ─────────────────────────────────────────────────────────
-- RBAC queries JOIN role_permissions → permissions via permission_id.
-- The existing unique index on (resource, action, scope) covers equality lookups,
-- but permission lookups filtered by resource alone (e.g. 'task', 'org') benefit
-- from a leading-column index.
CREATE INDEX IF NOT EXISTS idx_permissions_resource
    ON public.permissions (resource, action);

-- ── org_members role lookup ───────────────────────────────────────────────────
-- RBAC middleware: SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2
-- The existing composite PK (org_id, user_id) already covers this; no change needed.

-- ── tasks table ── extra coverage ────────────────────────────────────────────
-- Queries filtering by reporter_id (if any) or updated_at ordering.
CREATE INDEX IF NOT EXISTS idx_tasks_updated
    ON public.tasks (org_id, updated_at DESC);

-- ── notifications: unread count lookup ───────────────────────────────────────
-- The existing idx_notifications_user covers (user_id, read_at NULLS FIRST, created_at DESC)
-- which handles the most common unread-count query. No change needed.

-- ── channels: unindexed position queries ─────────────────────────────────────
-- idx_channels_org_type already covers (org_id, type). Good.

-- ── activity_log: user-scoped lookups ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activity_user
    ON public.activity_log (org_id, actor_id, created_at DESC);
