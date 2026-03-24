-- project_members: queried on every project request, joined with users/teams
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_source_team ON project_members(source_team_id);

-- team_members: queried in permission resolver loops
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- org_members: queried on every auth/permission check
CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON org_members(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);

-- project_teams: queried in permission resolver for team inheritance
CREATE INDEX IF NOT EXISTS idx_project_teams_project ON project_teams(project_id);
CREATE INDEX IF NOT EXISTS idx_project_teams_team ON project_teams(team_id);

-- announcement_reads: used in COUNT/NOT EXISTS subqueries
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON announcement_reads(user_id, announcement_id);

-- task_dependencies: queried by depends_on_id for reverse lookups
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_id);

-- task_watchers: queried by user_id
CREATE INDEX IF NOT EXISTS idx_task_watchers_user ON task_watchers(user_id);
