-- Add source tracking to project_members for explicit member management.
-- source: 'direct' (external/org member) or 'team' (from a linked team).
-- source_team_id: references the team the member was added from (NULL for direct).
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS source_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
