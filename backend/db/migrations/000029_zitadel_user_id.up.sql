-- Migration 000029: Store a stable Zitadel user ID instead of deriving it live.
--
-- users.id has always been uuid5(NAMESPACE_URL, <Zitadel numeric user ID>),
-- computed on every request by middleware/auth.go and used as the FK across
-- org_members/team_members/project_members/tasks. That's fine as long as
-- the same Zitadel instance keeps issuing the same numeric ID forever, but
-- breaks the moment identity moves to a different Zitadel instance (a new
-- instance assigns new numeric IDs, so the derived UUID no longer matches
-- any existing row). This column lets auth resolve existing users by a
-- stored mapping instead, preserving every existing foreign key across an
-- identity-provider migration. See research/orbispm-integration-plan.md in
-- the Research_g repo for the full design.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS zitadel_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_zitadel_user_id
    ON public.users (zitadel_user_id)
    WHERE zitadel_user_id IS NOT NULL;
