BEGIN;

-- Anima dataset for user: gaurav.12bhindwar@gmail.com
-- Goal: create a realistic MERN product dataset with ~1000 tasks and related records.

-- Ensure the target org exists (slug has unique constraint).
INSERT INTO orgs (id, name, slug, plan, settings)
VALUES (
  '126b6ef6-bd75-43ee-ac1f-f514fb8a188a',
  'Anima',
  'anima',
  'pro',
  '{"product":"Anima","description":"A full stack website built using the MERN stack","stack":["MongoDB","Express","React","Node.js"]}'::jsonb
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  plan = EXCLUDED.plan,
  settings = orgs.settings || EXCLUDED.settings,
  updated_at = now();

-- Ensure the target user exists with the provided email.
INSERT INTO users (id, email, display_name, department, job_title, timezone, language, theme, bio)
VALUES (
  'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77',
  'gaurav.12bhindwar@gmail.com',
  'Gaurav Bhindwar',
  'Engineering',
  'Founder',
  'Asia/Kolkata',
  'en',
  'orbis-light',
  'Owner of Anima MERN platform'
)
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  department = EXCLUDED.department,
  job_title = EXCLUDED.job_title,
  timezone = EXCLUDED.timezone,
  language = EXCLUDED.language,
  bio = EXCLUDED.bio,
  updated_at = now();

-- Add a few teammates for assignment distribution.
INSERT INTO users (id, email, display_name, department, job_title, timezone, language, theme, bio)
VALUES
  ('2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b11', 'riya.anima@orbis.local', 'Riya Sharma', 'Engineering', 'MERN Developer', 'Asia/Kolkata', 'en', 'orbis-light', 'Backend and API work'),
  ('2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b12', 'arjun.anima@orbis.local', 'Arjun Verma', 'Frontend', 'React Engineer', 'Asia/Kolkata', 'en', 'orbis-light', 'Frontend architecture'),
  ('2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b13', 'meera.anima@orbis.local', 'Meera Patel', 'QA', 'QA Engineer', 'Asia/Kolkata', 'en', 'orbis-light', 'Quality and testing')
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  department = EXCLUDED.department,
  job_title = EXCLUDED.job_title,
  timezone = EXCLUDED.timezone,
  language = EXCLUDED.language,
  bio = EXCLUDED.bio,
  updated_at = now();

INSERT INTO org_members (org_id, user_id, role)
VALUES
  ('126b6ef6-bd75-43ee-ac1f-f514fb8a188a', 'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77', 'owner'),
  ('126b6ef6-bd75-43ee-ac1f-f514fb8a188a', '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b11', 'member'),
  ('126b6ef6-bd75-43ee-ac1f-f514fb8a188a', '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b12', 'member'),
  ('126b6ef6-bd75-43ee-ac1f-f514fb8a188a', '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b13', 'member')
ON CONFLICT DO NOTHING;

-- Team and project for Anima.
INSERT INTO teams (id, org_id, name, description, manager_id, is_auto_managed, status)
VALUES (
  '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31',
  '126b6ef6-bd75-43ee-ac1f-f514fb8a188a',
  'Anima Product Team',
  'Core team building the Anima MERN website',
  'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77',
  false,
  'active'
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  manager_id = EXCLUDED.manager_id,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO team_members (team_id, user_id, role)
VALUES
  ('3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31', 'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77', 'manager'),
  ('3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31', '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b11', 'member'),
  ('3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31', '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b12', 'member'),
  ('3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31', '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b13', 'member')
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, org_id, team_id, name, description, status, settings, created_by)
VALUES (
  '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32',
  '126b6ef6-bd75-43ee-ac1f-f514fb8a188a',
  '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31',
  'Anima MERN Website',
  'Anima is a full stack website built with MongoDB, Express, React, and Node.js.',
  'active',
  '{"framework":"MERN","frontend":"React","backend":"Node+Express","database":"MongoDB","deployment":"Docker"}'::jsonb,
  'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77'
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  settings = projects.settings || EXCLUDED.settings,
  updated_at = now();

INSERT INTO project_teams (project_id, team_id)
VALUES ('3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32', '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31')
ON CONFLICT DO NOTHING;

INSERT INTO project_members (project_id, user_id, role, source, source_team_id)
VALUES
  ('3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32', 'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77', 'owner', 'team', '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31'),
  ('3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32', '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b11', 'contributor', 'team', '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31'),
  ('3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32', '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b12', 'contributor', 'team', '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31'),
  ('3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32', '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b13', 'contributor', 'team', '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31')
ON CONFLICT DO NOTHING;

-- 1000 tasks with mixed completion states and rich fields.
WITH assignees AS (
  SELECT ARRAY[
    'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77'::uuid,
    '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b11'::uuid,
    '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b12'::uuid,
    '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b13'::uuid
  ] AS arr
), seed AS (
  SELECT
    gs,
    (
      substr(h.m,1,8) || '-' || substr(h.m,9,4) || '-' || substr(h.m,13,4) || '-' || substr(h.m,17,4) || '-' || substr(h.m,21,12)
    )::uuid AS task_id,
    a.arr[1 + (gs % array_length(a.arr, 1))] AS assignee_id,
    CASE
      WHEN gs % 5 = 0 THEN 'done'
      WHEN gs % 7 = 0 THEN 'blocked'
      WHEN gs % 3 = 0 THEN 'in_progress'
      ELSE 'todo'
    END AS status,
    CASE
      WHEN gs % 11 = 0 THEN 'urgent'
      WHEN gs % 4 = 0 THEN 'high'
      WHEN gs % 2 = 0 THEN 'medium'
      ELSE 'low'
    END AS priority,
    CASE (gs % 6)
      WHEN 0 THEN 'Authentication'
      WHEN 1 THEN 'Dashboard'
      WHEN 2 THEN 'API'
      WHEN 3 THEN 'UI/UX'
      WHEN 4 THEN 'Performance'
      ELSE 'Testing'
    END AS module_name,
    2 + (gs % 16) AS estimated_hours_num,
    now() - make_interval(days => (gs % 120)) AS created_ts,
    now() - make_interval(days => (gs % 60)) AS start_ts,
    now() + make_interval(days => ((gs % 45) - 10)) AS due_ts
  FROM generate_series(1, 1000) AS gs
  CROSS JOIN assignees a
  CROSS JOIN LATERAL (SELECT md5('anima-task-' || gs::text) AS m) h
)
INSERT INTO tasks (
  id,
  org_id,
  project_id,
  parent_task_id,
  title,
  description,
  status,
  priority,
  assignee_id,
  reporter_id,
  depth,
  position,
  due_date,
  start_date,
  estimated_hours,
  actual_hours,
  labels,
  metadata,
  review_status,
  created_at,
  updated_at,
  version,
  assignee_ids
)
SELECT
  s.task_id,
  '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'::uuid,
  '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32'::uuid,
  NULL,
  format('Anima MERN Task #%s - %s', s.gs, s.module_name),
  format('Work item %s for Anima MERN website: %s improvements on MongoDB/Express/React/Node pipeline.', s.gs, s.module_name),
  s.status,
  s.priority,
  s.assignee_id,
  'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77'::uuid,
  0,
  s.gs,
  s.due_ts,
  s.start_ts,
  s.estimated_hours_num::numeric,
  CASE WHEN s.status = 'done' THEN (s.estimated_hours_num * 0.9)::numeric ELSE NULL END,
  ARRAY[
    lower(replace(s.module_name,'/','_')),
    'mern',
    CASE WHEN s.status='done' THEN 'completed' ELSE 'active' END
  ]::text[],
  jsonb_build_object(
    'project', 'Anima',
    'stack', jsonb_build_array('MongoDB','Express','React','Node.js'),
    'module', s.module_name,
    'sprint', ((s.gs - 1) / 20) + 1,
    'story_points', (s.gs % 13) + 1
  ),
  CASE
    WHEN s.status = 'done' THEN 'approved'
    WHEN s.status = 'blocked' THEN 'changes_requested'
    ELSE 'pending'
  END,
  s.created_ts,
  now(),
  1 + (s.gs % 3),
  ARRAY[s.assignee_id]::uuid[]
FROM seed s
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  assignee_id = EXCLUDED.assignee_id,
  reporter_id = EXCLUDED.reporter_id,
  due_date = EXCLUDED.due_date,
  start_date = EXCLUDED.start_date,
  estimated_hours = EXCLUDED.estimated_hours,
  actual_hours = EXCLUDED.actual_hours,
  labels = EXCLUDED.labels,
  metadata = EXCLUDED.metadata,
  review_status = EXCLUDED.review_status,
  updated_at = now(),
  assignee_ids = EXCLUDED.assignee_ids;

-- Watchers for first 450 tasks.
WITH t AS (
  SELECT id, row_number() OVER (ORDER BY position) AS rn
  FROM tasks
  WHERE org_id = '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'
    AND project_id = '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32'
  ORDER BY position
  LIMIT 450
)
INSERT INTO task_watchers (task_id, user_id)
SELECT id, 'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77'::uuid FROM t
UNION ALL
SELECT id,
       CASE WHEN rn % 2 = 0
            THEN '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b12'::uuid
            ELSE '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b13'::uuid
       END
FROM t
ON CONFLICT DO NOTHING;

-- Dependency edges for selected tasks.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY position) AS rn
  FROM tasks
  WHERE org_id = '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'
    AND project_id = '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32'
)
INSERT INTO task_dependencies (task_id, depends_on_id, type)
SELECT o.id, p.id, 'blocked_by'
FROM ordered o
JOIN ordered p ON p.rn = o.rn - 1
WHERE o.rn % 6 = 0
ON CONFLICT DO NOTHING;

-- Checklist coverage for first 300 tasks.
WITH t AS (
  SELECT id, row_number() OVER (ORDER BY position) AS rn
  FROM tasks
  WHERE org_id = '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'
    AND project_id = '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32'
  ORDER BY position
  LIMIT 300
)
INSERT INTO checklists (id, org_id, task_id, title, is_checked, position)
SELECT
  (
    substr(h.m,1,8) || '-' || substr(h.m,9,4) || '-' || substr(h.m,13,4) || '-' || substr(h.m,17,4) || '-' || substr(h.m,21,12)
  )::uuid,
  '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'::uuid,
  t.id,
  format('Checklist %s for MERN task', t.rn),
  (t.rn % 3 = 0),
  1
FROM t
CROSS JOIN LATERAL (SELECT md5('anima-checklist-' || t.rn::text) AS m) h
ON CONFLICT (id) DO NOTHING;

-- Comments for first 240 tasks.
WITH t AS (
  SELECT id, row_number() OVER (ORDER BY position) AS rn
  FROM tasks
  WHERE org_id = '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'
    AND project_id = '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32'
  ORDER BY position
  LIMIT 240
)
INSERT INTO comments (id, org_id, task_id, user_id, body, parent_id, created_at, updated_at)
SELECT
  (
    substr(h.m,1,8) || '-' || substr(h.m,9,4) || '-' || substr(h.m,13,4) || '-' || substr(h.m,17,4) || '-' || substr(h.m,21,12)
  )::uuid,
  '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'::uuid,
  t.id,
  CASE
    WHEN t.rn % 4 = 0 THEN '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b11'::uuid
    WHEN t.rn % 4 = 1 THEN '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b12'::uuid
    WHEN t.rn % 4 = 2 THEN '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b13'::uuid
    ELSE 'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77'::uuid
  END,
  format('Update on task %s: progressing MERN module delivery.', t.rn),
  NULL,
  now() - make_interval(days => ((t.rn % 45)::int)),
  now()
FROM t
CROSS JOIN LATERAL (SELECT md5('anima-comment-' || t.rn::text) AS m) h
ON CONFLICT (id) DO NOTHING;

-- Transition records for done/in_progress tasks.
INSERT INTO task_state_transitions (id, org_id, task_id, project_id, from_status, to_status, actor_id, transitioned_at)
SELECT
  (
    substr(h.m,1,8) || '-' || substr(h.m,9,4) || '-' || substr(h.m,13,4) || '-' || substr(h.m,17,4) || '-' || substr(h.m,21,12)
  )::uuid,
  t.org_id,
  t.id,
  t.project_id,
  CASE WHEN t.status = 'done' THEN 'in_progress' ELSE 'todo' END,
  t.status,
  COALESCE(t.assignee_id, 'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77'::uuid),
  t.updated_at
FROM tasks t
CROSS JOIN LATERAL (SELECT md5('anima-transition-' || t.id::text) AS m) h
WHERE t.org_id = '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'
  AND t.project_id = '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32'
  AND t.status IN ('done', 'in_progress')
ON CONFLICT (id) DO NOTHING;

-- Risk scores for blocked and urgent tasks.
INSERT INTO risk_scores (id, org_id, task_id, risk_level, risk_score, factors, predicted_completion, updated_at)
SELECT
  (
    substr(h.m,1,8) || '-' || substr(h.m,9,4) || '-' || substr(h.m,13,4) || '-' || substr(h.m,17,4) || '-' || substr(h.m,21,12)
  )::uuid,
  t.org_id,
  t.id,
  CASE
    WHEN t.priority = 'urgent' THEN 'critical'
    WHEN t.status = 'blocked' THEN 'high'
    ELSE 'medium'
  END,
  CASE
    WHEN t.priority = 'urgent' THEN 0.92
    WHEN t.status = 'blocked' THEN 0.76
    ELSE 0.52
  END,
  jsonb_build_object(
    'status', t.status,
    'priority', t.priority,
    'module', COALESCE(t.metadata->>'module','general')
  ),
  now() + interval '15 days',
  now()
FROM tasks t
CROSS JOIN LATERAL (SELECT md5('anima-risk-' || t.id::text) AS m) h
WHERE t.org_id = '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'
  AND t.project_id = '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32'
  AND (t.status = 'blocked' OR t.priority = 'urgent')
ON CONFLICT (id) DO NOTHING;

-- Add snapshots and metrics for recent trend visualization.
INSERT INTO task_status_snapshots (id, org_id, project_id, snapshot_date, todo_count, in_progress_count, blocked_count, done_count, total_count)
SELECT
  (
    substr(h.m,1,8) || '-' || substr(h.m,9,4) || '-' || substr(h.m,13,4) || '-' || substr(h.m,17,4) || '-' || substr(h.m,21,12)
  )::uuid,
  '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'::uuid,
  '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32'::uuid,
  d::date,
  250 + ((extract(day from d)::int * 3) % 80),
  210 + ((extract(day from d)::int * 5) % 70),
  80 + ((extract(day from d)::int * 2) % 30),
  300 + ((extract(day from d)::int * 7) % 90),
  1000
FROM generate_series(current_date - interval '9 days', current_date, interval '1 day') d
CROSS JOIN LATERAL (SELECT md5('anima-snapshot-' || d::date::text) AS m) h
ON CONFLICT (id) DO NOTHING;

INSERT INTO daily_metrics (id, org_id, metric_date, scope_type, scope_id, metrics)
SELECT
  (
    substr(h.m,1,8) || '-' || substr(h.m,9,4) || '-' || substr(h.m,13,4) || '-' || substr(h.m,17,4) || '-' || substr(h.m,21,12)
  )::uuid,
  '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'::uuid,
  d::date,
  'project',
  '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32'::uuid,
  jsonb_build_object(
    'tasks_total', 1000,
    'tasks_completed', 180 + (extract(day from d)::int % 60),
    'deployments', 1 + (extract(day from d)::int % 3),
    'bugs_reported', 3 + (extract(day from d)::int % 8)
  )
FROM generate_series(current_date - interval '14 days', current_date, interval '1 day') d
CROSS JOIN LATERAL (SELECT md5('anima-daily-' || d::date::text) AS m) h
ON CONFLICT (id) DO NOTHING;

INSERT INTO weekly_metrics (id, org_id, metric_date, scope_type, scope_id, metrics)
SELECT
  (
    substr(h.m,1,8) || '-' || substr(h.m,9,4) || '-' || substr(h.m,13,4) || '-' || substr(h.m,17,4) || '-' || substr(h.m,21,12)
  )::uuid,
  '126b6ef6-bd75-43ee-ac1f-f514fb8a188a'::uuid,
  d::date,
  'project',
  '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32'::uuid,
  jsonb_build_object(
    'velocity', 42 + (extract(day from d)::int % 12),
    'cycle_time_hours', 26 + (extract(day from d)::int % 7),
    'throughput', 120 + (extract(day from d)::int % 40)
  )
FROM generate_series(current_date - interval '28 days', current_date, interval '7 days') d
CROSS JOIN LATERAL (SELECT md5('anima-weekly-' || d::date::text) AS m) h
ON CONFLICT (id) DO NOTHING;

INSERT INTO metric_alerts (id, org_id, alert_type, severity, scope_type, scope_id, title, description, data)
VALUES
  (
    '4d4d4d4d-4d4d-4d4d-4d4d-4d4d4d4d4d41',
    '126b6ef6-bd75-43ee-ac1f-f514fb8a188a',
    'blocked_tasks_spike',
    'warning',
    'project',
    '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32',
    'Blocked tasks increased',
    'Blocked tasks crossed the warning threshold for Anima MERN project.',
    '{"threshold":70,"current":82}'::jsonb
  )
ON CONFLICT DO NOTHING;

INSERT INTO performance_reports (id, org_id, report_type, scope_type, scope_id, parameters, status, storage_path, generated_by, generated_at, expires_at)
VALUES
  (
    '4d4d4d4d-4d4d-4d4d-4d4d-4d4d4d4d4d42',
    '126b6ef6-bd75-43ee-ac1f-f514fb8a188a',
    'project_health',
    'project',
    '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32',
    '{"window":"last_30_days","stack":"MERN"}'::jsonb,
    'completed',
    'reports/anima_mern_project_health.json',
    'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77',
    now() - interval '2 hours',
    now() + interval '29 days'
  )
ON CONFLICT DO NOTHING;

INSERT INTO analytics_events (id, org_id, event_type, actor_id, entity_type, entity_id, project_id, team_id, data)
VALUES
  (
    '4d4d4d4d-4d4d-4d4d-4d4d-4d4d4d4d4d43',
    '126b6ef6-bd75-43ee-ac1f-f514fb8a188a',
    'project.seeded',
    'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77',
    'project',
    '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32',
    '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32',
    '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c31',
    '{"tasks_seeded":1000,"stack":"MERN"}'::jsonb
  )
ON CONFLICT DO NOTHING;

INSERT INTO activity_log (id, org_id, entity_type, entity_id, action, actor_id, changes, metadata)
VALUES
  (
    '4d4d4d4d-4d4d-4d4d-4d4d-4d4d4d4d4d44',
    '126b6ef6-bd75-43ee-ac1f-f514fb8a188a',
    'project',
    '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c32',
    'seed_import',
    'c27f0e80-b2b1-58c7-b59d-c8e12b3aec77',
    '{"inserted_tasks":1000}'::jsonb,
    '{"note":"Anima MERN dataset"}'::jsonb
  )
ON CONFLICT DO NOTHING;

COMMIT;
