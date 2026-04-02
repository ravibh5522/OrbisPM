-- Add status column to teams table (mirrors project status pattern)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams (status);
