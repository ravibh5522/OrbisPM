-- Drop manager change history
DROP TABLE IF EXISTS team_manager_history;

-- Drop indexes
DROP INDEX IF EXISTS idx_teams_auto_source;
DROP INDEX IF EXISTS idx_teams_manager;

-- Remove columns from teams
ALTER TABLE teams DROP COLUMN IF EXISTS auto_source_id;
ALTER TABLE teams DROP COLUMN IF EXISTS auto_source;
ALTER TABLE teams DROP COLUMN IF EXISTS is_auto_managed;
ALTER TABLE teams DROP COLUMN IF EXISTS manager_id;
