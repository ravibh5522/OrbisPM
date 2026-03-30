-- ─── Team Manager Support ───────────────────────────────
-- Add manager_id to teams for team lead/manager tracking
ALTER TABLE teams ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Auto-management tracking
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_auto_managed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS auto_source TEXT CHECK (auto_source IN ('department', 'project', 'manual'));
ALTER TABLE teams ADD COLUMN IF NOT EXISTS auto_source_id TEXT;

CREATE INDEX IF NOT EXISTS idx_teams_manager ON teams(manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_teams_auto_source ON teams(org_id, auto_source, auto_source_id) WHERE is_auto_managed = true;

-- ─── Manager Change History ─────────────────────────────
CREATE TABLE IF NOT EXISTS team_manager_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    previous_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    new_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_manager_history_team ON team_manager_history(team_id);

-- RLS for team_manager_history
ALTER TABLE team_manager_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_manager_history_org_isolation ON team_manager_history;
CREATE POLICY team_manager_history_org_isolation ON team_manager_history
    USING (org_id = current_setting('app.current_org_id')::uuid);
