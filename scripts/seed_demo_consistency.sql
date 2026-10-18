-- =============================================================================
-- Demo data consistency pass — run after scripts/seed_demo_prod.sql.
-- Safe to rerun (every statement is idempotent).
--
-- The demo seed spreads task assignees, reporters, commenters and watchers
-- across the whole org without making them members of the task's project, but
-- the API refuses an assignee who isn't a project member ("<name> is not a
-- member of this project"). That made editing or creating tasks fail at random.
-- This pass makes the data satisfy the rules the app enforces, without
-- removing any seeded assignment:
--   1. everyone referenced on a project's tasks/comments/watchers/change
--      requests becomes a project member (role: contributor)
--   2. members of teams linked to a project are project members (source=team)
--   3. project members are in the project's channel
--   4. a parent task's dates cover its subtasks (no "deadline conflict" rows)
-- =============================================================================
BEGIN;

-- 1. Referenced people -> project members (org members only).
WITH needed AS (
  SELECT t.project_id, a AS user_id FROM tasks t, unnest(t.assignee_ids) a
  UNION SELECT project_id, reporter_id FROM tasks WHERE reporter_id IS NOT NULL
  UNION SELECT t.project_id, c.user_id FROM comments c JOIN tasks t ON t.id = c.task_id
  UNION SELECT t.project_id, w.user_id FROM task_watchers w JOIN tasks t ON t.id = w.task_id
  UNION SELECT t.project_id, cr.proposer_id FROM task_change_requests cr JOIN tasks t ON t.id = cr.task_id
)
INSERT INTO project_members (project_id, user_id, role, source)
SELECT n.project_id, n.user_id, 'contributor', 'direct'
FROM needed n
JOIN projects p ON p.id = n.project_id
WHERE EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = p.org_id AND om.user_id = n.user_id)
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 2. Members of teams linked to a project.
INSERT INTO project_members (project_id, user_id, role, source, source_team_id)
SELECT pt.project_id, tm.user_id, 'contributor', 'team', pt.team_id
FROM project_teams pt
JOIN team_members tm ON tm.team_id = pt.team_id
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 3. Project members belong to the project channel.
INSERT INTO channel_members (channel_id, user_id, role)
SELECT c.id, pm.user_id, 'member'
FROM project_members pm
JOIN channels c ON c.project_id = pm.project_id AND c.type = 'project'
ON CONFLICT (channel_id, user_id) DO NOTHING;

-- 4. Widen parents bottom-up so each parent's dates cover its children.
DO $$
DECLARE d int;
BEGIN
  FOR d IN REVERSE 3..1 LOOP
    UPDATE tasks p
       SET due_date   = GREATEST(p.due_date, c.max_due),
           start_date = LEAST(p.start_date, c.min_start)
      FROM (SELECT parent_task_id, max(due_date) AS max_due, min(start_date) AS min_start
              FROM tasks
             WHERE depth = d AND parent_task_id IS NOT NULL
             GROUP BY parent_task_id) c
     WHERE p.id = c.parent_task_id
       AND (p.due_date < c.max_due OR p.start_date > c.min_start);
  END LOOP;
END $$;

COMMIT;
