-- Rollback migration 000024
DROP INDEX IF EXISTS public.idx_users_email;
DROP INDEX IF EXISTS public.idx_permissions_resource;
DROP INDEX IF EXISTS public.idx_tasks_updated;
DROP INDEX IF EXISTS public.idx_activity_user;
-- pg_stat_statements extension intentionally NOT dropped on rollback
-- (it may be needed by monitoring tools).
