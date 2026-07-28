-- Migration 000029 rollback
DROP INDEX IF EXISTS idx_users_zitadel_user_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS zitadel_user_id;
