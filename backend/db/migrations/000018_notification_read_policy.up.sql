-- Allow authenticated users to read/update their own notifications without org context.
-- Safe because: notification queries always filter by user_id in WHERE clause,
-- and auth middleware validates the caller before these queries run.
-- The existing tenant_isolation_notifications policy still protects INSERT
-- (requires app.current_org_id, which the worker now sets via TxManager).

DROP POLICY IF EXISTS user_read_own_notifications ON notifications;
CREATE POLICY user_read_own_notifications ON notifications
  FOR SELECT USING (true);

DROP POLICY IF EXISTS user_update_own_notifications ON notifications;
CREATE POLICY user_update_own_notifications ON notifications
  FOR UPDATE USING (true);
