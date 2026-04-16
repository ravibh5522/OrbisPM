-- =============================================================================
-- OrbisPM Production Demo Seed Script
-- Creates: 1 org, 20 users, 5 teams, 4 projects, 200 tasks (depth 0-3)
-- Dates span past 6 months; assignments spread over 6 months
-- Safe to rerun: fixed IDs + ON CONFLICT DO NOTHING
-- =============================================================================
BEGIN;

-- ─── ORG ────────────────────────────────────────────────────────────────────
INSERT INTO orgs (id, name, slug, plan, settings, created_at)
VALUES (
  'dd000000-0000-4000-a000-000000000001',
  'Acme Corp',
  'acme-corp',
  'enterprise',
  '{"timezone":"UTC","currency":"USD","reviewable_fields":["status","priority","assignee_id"]}'::jsonb,
  now() - interval '7 months'
) ON CONFLICT DO NOTHING;

-- Subscription (enterprise)
INSERT INTO org_subscriptions (id, org_id, plan_id, status, current_period_start, current_period_end)
VALUES (
  'dd000000-0000-4000-a000-00000000ee01',
  'dd000000-0000-4000-a000-000000000001',
  'enterprise',
  'active',
  now() - interval '30 days',
  now() + interval '335 days'
) ON CONFLICT DO NOTHING;

-- ─── 20 USERS ───────────────────────────────────────────────────────────────
INSERT INTO users (id, email, display_name, department, job_title, timezone, language, theme, bio) VALUES
  ('dd000000-0000-4000-a000-000000000101', 'sarah.chen@acme.demo',     'Sarah Chen',       'Engineering',  'VP of Engineering',      'America/New_York', 'en', 'orbis-light', 'Org owner and engineering lead'),
  ('dd000000-0000-4000-a000-000000000102', 'marcus.johnson@acme.demo', 'Marcus Johnson',    'Engineering',  'Engineering Manager',    'America/Chicago',  'en', 'orbis-dark',  'Backend platform lead'),
  ('dd000000-0000-4000-a000-000000000103', 'priya.patel@acme.demo',    'Priya Patel',       'Engineering',  'Senior Backend Engineer','Asia/Kolkata',     'en', 'orbis-light', 'Go and PostgreSQL expert'),
  ('dd000000-0000-4000-a000-000000000104', 'james.wilson@acme.demo',   'James Wilson',      'Engineering',  'Backend Engineer',       'America/New_York', 'en', 'orbis-light', 'API specialist'),
  ('dd000000-0000-4000-a000-000000000105', 'emma.garcia@acme.demo',    'Emma Garcia',       'Engineering',  'DevOps Engineer',        'America/Los_Angeles','en','orbis-dark',  'Infrastructure and CI/CD'),
  ('dd000000-0000-4000-a000-000000000106', 'alex.kim@acme.demo',       'Alex Kim',          'Product',      'Product Manager',        'America/New_York', 'en', 'orbis-light', 'Product strategy and roadmap'),
  ('dd000000-0000-4000-a000-000000000107', 'olivia.brown@acme.demo',   'Olivia Brown',      'Design',       'Lead Designer',          'Europe/London',    'en', 'orbis-light', 'UX and design systems'),
  ('dd000000-0000-4000-a000-000000000108', 'david.martinez@acme.demo', 'David Martinez',    'Design',       'UI Designer',            'America/Chicago',  'en', 'orbis-dark',  'Visual design and prototyping'),
  ('dd000000-0000-4000-a000-000000000109', 'sophia.lee@acme.demo',     'Sophia Lee',        'Engineering',  'Frontend Engineer',      'Asia/Seoul',       'en', 'orbis-light', 'React and TypeScript'),
  ('dd000000-0000-4000-a000-000000000110', 'ryan.taylor@acme.demo',    'Ryan Taylor',       'Engineering',  'Frontend Engineer',      'America/New_York', 'en', 'orbis-dark',  'Next.js and performance'),
  ('dd000000-0000-4000-a000-000000000111', 'mia.anderson@acme.demo',   'Mia Anderson',      'QA',           'QA Lead',                'America/Chicago',  'en', 'orbis-light', 'Test strategy and automation'),
  ('dd000000-0000-4000-a000-000000000112', 'noah.thomas@acme.demo',    'Noah Thomas',       'QA',           'QA Engineer',            'Europe/Berlin',    'en', 'orbis-light', 'Integration and E2E testing'),
  ('dd000000-0000-4000-a000-000000000113', 'ava.jackson@acme.demo',    'Ava Jackson',       'Engineering',  'Full Stack Engineer',    'America/New_York', 'en', 'orbis-dark',  'Cross-functional delivery'),
  ('dd000000-0000-4000-a000-000000000114', 'liam.white@acme.demo',     'Liam White',        'Engineering',  'Junior Developer',       'America/Chicago',  'en', 'orbis-light', 'Learning and growing'),
  ('dd000000-0000-4000-a000-000000000115', 'isabella.harris@acme.demo','Isabella Harris',   'Engineering',  'Security Engineer',      'America/New_York', 'en', 'orbis-light', 'AppSec and compliance'),
  ('dd000000-0000-4000-a000-000000000116', 'ethan.clark@acme.demo',    'Ethan Clark',       'Data',         'Data Engineer',          'Europe/London',    'en', 'orbis-dark',  'Pipelines and analytics'),
  ('dd000000-0000-4000-a000-000000000117', 'charlotte.lewis@acme.demo','Charlotte Lewis',   'Product',      'Technical Writer',       'America/New_York', 'en', 'orbis-light', 'Documentation and specs'),
  ('dd000000-0000-4000-a000-000000000118', 'mason.walker@acme.demo',   'Mason Walker',      'Finance',      'Billing Admin',          'America/Chicago',  'en', 'orbis-light', 'Billing and subscriptions'),
  ('dd000000-0000-4000-a000-000000000119', 'amelia.hall@acme.demo',    'Amelia Hall',       'Engineering',  'SRE Engineer',           'Asia/Tokyo',       'en', 'orbis-dark',  'Reliability and observability'),
  ('dd000000-0000-4000-a000-000000000120', 'lucas.young@acme.demo',    'Lucas Young',       'Engineering',  'Intern',                 'America/New_York', 'en', 'orbis-light', 'Eager to learn')
ON CONFLICT (id) DO NOTHING;

-- ─── ORG MEMBERS (all 20 users, multiple roles) ────────────────────────────
INSERT INTO org_members (org_id, user_id, role) VALUES
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000101', 'owner'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000102', 'admin'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000103', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000104', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000105', 'admin'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000106', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000107', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000108', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000109', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000110', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000111', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000112', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000113', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000114', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000115', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000116', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000117', 'viewer'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000118', 'billing_admin'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000119', 'member'),
  ('dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000120', 'viewer')
ON CONFLICT DO NOTHING;

-- ─── 5 TEAMS ────────────────────────────────────────────────────────────────
INSERT INTO teams (id, org_id, name, description, manager_id, status, created_at) VALUES
  ('dd000000-0000-4000-a000-000000000201', 'dd000000-0000-4000-a000-000000000001', 'Backend Platform',   'Core APIs, services, and infrastructure',        'dd000000-0000-4000-a000-000000000102', 'active', now() - interval '6 months'),
  ('dd000000-0000-4000-a000-000000000202', 'dd000000-0000-4000-a000-000000000001', 'Frontend Experience', 'UI, UX, and client-side applications',            'dd000000-0000-4000-a000-000000000107', 'active', now() - interval '6 months'),
  ('dd000000-0000-4000-a000-000000000203', 'dd000000-0000-4000-a000-000000000001', 'Quality Assurance',   'Testing, automation, and quality processes',      'dd000000-0000-4000-a000-000000000111', 'active', now() - interval '5 months'),
  ('dd000000-0000-4000-a000-000000000204', 'dd000000-0000-4000-a000-000000000001', 'Data & Analytics',    'Data pipelines, analytics, and reporting',        'dd000000-0000-4000-a000-000000000116', 'active', now() - interval '4 months'),
  ('dd000000-0000-4000-a000-000000000205', 'dd000000-0000-4000-a000-000000000001', 'DevOps & SRE',        'Infrastructure, reliability, and deployments',    'dd000000-0000-4000-a000-000000000105', 'active', now() - interval '5 months')
ON CONFLICT DO NOTHING;

-- ─── TEAM MEMBERS ───────────────────────────────────────────────────────────
INSERT INTO team_members (team_id, user_id, role) VALUES
  -- Backend Platform (7 members)
  ('dd000000-0000-4000-a000-000000000201', 'dd000000-0000-4000-a000-000000000102', 'team_lead'),
  ('dd000000-0000-4000-a000-000000000201', 'dd000000-0000-4000-a000-000000000103', 'member'),
  ('dd000000-0000-4000-a000-000000000201', 'dd000000-0000-4000-a000-000000000104', 'member'),
  ('dd000000-0000-4000-a000-000000000201', 'dd000000-0000-4000-a000-000000000113', 'member'),
  ('dd000000-0000-4000-a000-000000000201', 'dd000000-0000-4000-a000-000000000114', 'member'),
  ('dd000000-0000-4000-a000-000000000201', 'dd000000-0000-4000-a000-000000000115', 'member'),
  ('dd000000-0000-4000-a000-000000000201', 'dd000000-0000-4000-a000-000000000101', 'member'),
  -- Frontend Experience (6 members)
  ('dd000000-0000-4000-a000-000000000202', 'dd000000-0000-4000-a000-000000000107', 'team_lead'),
  ('dd000000-0000-4000-a000-000000000202', 'dd000000-0000-4000-a000-000000000108', 'member'),
  ('dd000000-0000-4000-a000-000000000202', 'dd000000-0000-4000-a000-000000000109', 'member'),
  ('dd000000-0000-4000-a000-000000000202', 'dd000000-0000-4000-a000-000000000110', 'member'),
  ('dd000000-0000-4000-a000-000000000202', 'dd000000-0000-4000-a000-000000000106', 'member'),
  ('dd000000-0000-4000-a000-000000000202', 'dd000000-0000-4000-a000-000000000117', 'member'),
  -- Quality Assurance (4 members)
  ('dd000000-0000-4000-a000-000000000203', 'dd000000-0000-4000-a000-000000000111', 'team_lead'),
  ('dd000000-0000-4000-a000-000000000203', 'dd000000-0000-4000-a000-000000000112', 'member'),
  ('dd000000-0000-4000-a000-000000000203', 'dd000000-0000-4000-a000-000000000114', 'member'),
  ('dd000000-0000-4000-a000-000000000203', 'dd000000-0000-4000-a000-000000000120', 'member'),
  -- Data & Analytics (3 members)
  ('dd000000-0000-4000-a000-000000000204', 'dd000000-0000-4000-a000-000000000116', 'team_lead'),
  ('dd000000-0000-4000-a000-000000000204', 'dd000000-0000-4000-a000-000000000103', 'member'),
  ('dd000000-0000-4000-a000-000000000204', 'dd000000-0000-4000-a000-000000000113', 'member'),
  -- DevOps & SRE (4 members)
  ('dd000000-0000-4000-a000-000000000205', 'dd000000-0000-4000-a000-000000000105', 'team_lead'),
  ('dd000000-0000-4000-a000-000000000205', 'dd000000-0000-4000-a000-000000000119', 'member'),
  ('dd000000-0000-4000-a000-000000000205', 'dd000000-0000-4000-a000-000000000104', 'member'),
  ('dd000000-0000-4000-a000-000000000205', 'dd000000-0000-4000-a000-000000000115', 'member')
ON CONFLICT DO NOTHING;

-- ─── 4 PROJECTS ─────────────────────────────────────────────────────────────
INSERT INTO projects (id, org_id, team_id, name, description, status, settings, created_by, created_at) VALUES
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000201',
   'Project Phoenix', 'Complete API platform rewrite with microservices architecture',
   'active', '{"sprint_length_days":14,"reviewable_fields":["status","priority","assignee_id"]}'::jsonb,
   'dd000000-0000-4000-a000-000000000101', now() - interval '6 months'),

  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000202',
   'Project Aurora', 'Next-gen dashboard and analytics UI redesign',
   'active', '{"sprint_length_days":7,"reviewable_fields":["status","priority"]}'::jsonb,
   'dd000000-0000-4000-a000-000000000107', now() - interval '5 months'),

  ('dd000000-0000-4000-a000-000000000303', 'dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000204',
   'Project Nebula', 'Real-time analytics pipeline and data warehouse',
   'active', '{"sprint_length_days":14,"reviewable_fields":["status"]}'::jsonb,
   'dd000000-0000-4000-a000-000000000116', now() - interval '4 months'),

  ('dd000000-0000-4000-a000-000000000304', 'dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000205',
   'Project Sentinel', 'Infrastructure hardening, monitoring, and zero-trust security',
   'active', '{"sprint_length_days":14,"reviewable_fields":["status","priority","assignee_id"]}'::jsonb,
   'dd000000-0000-4000-a000-000000000105', now() - interval '5 months')
ON CONFLICT DO NOTHING;

-- ─── PROJECT TEAMS ──────────────────────────────────────────────────────────
INSERT INTO project_teams (project_id, team_id) VALUES
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000203'),
  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000202'),
  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000203'),
  ('dd000000-0000-4000-a000-000000000303', 'dd000000-0000-4000-a000-000000000204'),
  ('dd000000-0000-4000-a000-000000000303', 'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000304', 'dd000000-0000-4000-a000-000000000205'),
  ('dd000000-0000-4000-a000-000000000304', 'dd000000-0000-4000-a000-000000000201')
ON CONFLICT DO NOTHING;

-- ─── PROJECT MEMBERS ────────────────────────────────────────────────────────
INSERT INTO project_members (project_id, user_id, role, source, source_team_id) VALUES
  -- Phoenix (backend-heavy): 10 members
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000101', 'lead',        'direct', NULL),
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000102', 'lead',        'team',   'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000103', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000104', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000113', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000114', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000115', 'reviewer',    'team',   'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000111', 'reviewer',    'team',   'dd000000-0000-4000-a000-000000000203'),
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000112', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000203'),
  ('dd000000-0000-4000-a000-000000000301', 'dd000000-0000-4000-a000-000000000120', 'observer',    'direct', NULL),
  -- Aurora (frontend-heavy): 8 members
  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000107', 'lead',        'team',   'dd000000-0000-4000-a000-000000000202'),
  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000108', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000202'),
  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000109', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000202'),
  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000110', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000202'),
  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000106', 'lead',        'team',   'dd000000-0000-4000-a000-000000000202'),
  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000117', 'observer',    'team',   'dd000000-0000-4000-a000-000000000202'),
  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000111', 'reviewer',    'team',   'dd000000-0000-4000-a000-000000000203'),
  ('dd000000-0000-4000-a000-000000000302', 'dd000000-0000-4000-a000-000000000112', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000203'),
  -- Nebula (data-heavy): 6 members
  ('dd000000-0000-4000-a000-000000000303', 'dd000000-0000-4000-a000-000000000116', 'lead',        'team',   'dd000000-0000-4000-a000-000000000204'),
  ('dd000000-0000-4000-a000-000000000303', 'dd000000-0000-4000-a000-000000000103', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000204'),
  ('dd000000-0000-4000-a000-000000000303', 'dd000000-0000-4000-a000-000000000113', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000204'),
  ('dd000000-0000-4000-a000-000000000303', 'dd000000-0000-4000-a000-000000000104', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000303', 'dd000000-0000-4000-a000-000000000119', 'reviewer',    'direct', NULL),
  ('dd000000-0000-4000-a000-000000000303', 'dd000000-0000-4000-a000-000000000105', 'observer',    'direct', NULL),
  -- Sentinel (devops/security): 7 members
  ('dd000000-0000-4000-a000-000000000304', 'dd000000-0000-4000-a000-000000000105', 'lead',        'team',   'dd000000-0000-4000-a000-000000000205'),
  ('dd000000-0000-4000-a000-000000000304', 'dd000000-0000-4000-a000-000000000119', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000205'),
  ('dd000000-0000-4000-a000-000000000304', 'dd000000-0000-4000-a000-000000000115', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000205'),
  ('dd000000-0000-4000-a000-000000000304', 'dd000000-0000-4000-a000-000000000104', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000205'),
  ('dd000000-0000-4000-a000-000000000304', 'dd000000-0000-4000-a000-000000000102', 'reviewer',    'team',   'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000304', 'dd000000-0000-4000-a000-000000000103', 'contributor', 'team',   'dd000000-0000-4000-a000-000000000201'),
  ('dd000000-0000-4000-a000-000000000304', 'dd000000-0000-4000-a000-000000000120', 'observer',    'direct', NULL)
ON CONFLICT DO NOTHING;

-- ─── GENERATE 200 TASKS (via PL/pgSQL) ─────────────────────────────────────
DO $$
DECLARE
  v_org_id    UUID := 'dd000000-0000-4000-a000-000000000001';
  v_projects  UUID[] := ARRAY[
    'dd000000-0000-4000-a000-000000000301',
    'dd000000-0000-4000-a000-000000000302',
    'dd000000-0000-4000-a000-000000000303',
    'dd000000-0000-4000-a000-000000000304'
  ];
  v_users     UUID[] := ARRAY[
    'dd000000-0000-4000-a000-000000000101','dd000000-0000-4000-a000-000000000102',
    'dd000000-0000-4000-a000-000000000103','dd000000-0000-4000-a000-000000000104',
    'dd000000-0000-4000-a000-000000000105','dd000000-0000-4000-a000-000000000106',
    'dd000000-0000-4000-a000-000000000107','dd000000-0000-4000-a000-000000000108',
    'dd000000-0000-4000-a000-000000000109','dd000000-0000-4000-a000-000000000110',
    'dd000000-0000-4000-a000-000000000111','dd000000-0000-4000-a000-000000000112',
    'dd000000-0000-4000-a000-000000000113','dd000000-0000-4000-a000-000000000114',
    'dd000000-0000-4000-a000-000000000115','dd000000-0000-4000-a000-000000000116',
    'dd000000-0000-4000-a000-000000000117','dd000000-0000-4000-a000-000000000118',
    'dd000000-0000-4000-a000-000000000119','dd000000-0000-4000-a000-000000000120'
  ];
  v_statuses  TEXT[] := ARRAY['todo','in_progress','done','blocked'];
  v_priorities TEXT[] := ARRAY['low','medium','high','critical'];
  v_labels_flat TEXT[] := ARRAY[
    'api','backend','frontend','ui','bug','regression',
    'feature','enhancement','documentation','security','compliance',
    'performance','optimization','infrastructure','devops',
    'testing','qa','database','migration','design','ux',
    'refactor','ci-cd','automation','monitoring','observability',
    'architecture','accessibility','a11y'
  ];

  -- Task title pools per project theme
  v_phoenix_titles TEXT[] := ARRAY[
    'Implement REST API gateway routing','Design microservice communication protocol',
    'Build user authentication service','Create rate limiting middleware',
    'Implement event sourcing for orders','Design database sharding strategy',
    'Build service mesh with Envoy','Implement circuit breaker pattern',
    'Create API versioning system','Build distributed cache layer',
    'Implement message queue consumers','Design retry and dead letter policies',
    'Build health check aggregator','Create service discovery mechanism',
    'Implement distributed tracing','Build API documentation generator',
    'Create load testing framework','Implement data migration tool',
    'Build configuration management service','Design fault injection testing'
  ];
  v_aurora_titles TEXT[] := ARRAY[
    'Redesign navigation sidebar','Build real-time notification center',
    'Create dashboard widget system','Implement drag-and-drop board view',
    'Design dark mode color system','Build responsive table component',
    'Create chart visualization library','Implement infinite scroll list',
    'Build form builder component','Design onboarding flow wizard',
    'Create accessibility audit tool','Build keyboard shortcut system',
    'Implement WebSocket status indicators','Design mobile-first layouts',
    'Build skeleton loading states','Create animation system with Framer',
    'Implement command palette (Cmd+K)','Build collaborative cursor presence',
    'Create component documentation site','Design error boundary pages'
  ];
  v_nebula_titles TEXT[] := ARRAY[
    'Build Kafka ingestion pipeline','Design star schema for analytics',
    'Implement real-time stream processing','Create ETL job scheduler',
    'Build data quality monitors','Design metric aggregation service',
    'Implement anomaly detection engine','Create custom report builder',
    'Build data lake partitioning strategy','Design CDC pipeline from PostgreSQL',
    'Implement materialized view refresh','Create data lineage tracker',
    'Build A/B testing analytics module','Design funnel analysis queries',
    'Implement cohort retention calculator','Create real-time KPI dashboard API',
    'Build data archival automation','Design time-series compression',
    'Implement batch export service','Create data governance policies'
  ];
  v_sentinel_titles TEXT[] := ARRAY[
    'Implement zero-trust network policies','Build secret rotation automation',
    'Create vulnerability scanning pipeline','Design incident response playbook',
    'Implement RBAC policy enforcement','Build container security scanner',
    'Create audit log compliance reports','Design disaster recovery runbook',
    'Implement SSL certificate automation','Build infrastructure as code modules',
    'Create deployment rollback mechanism','Design multi-region failover',
    'Implement pod autoscaling policies','Build Prometheus alerting rules',
    'Create Grafana dashboard templates','Design backup and restore procedures',
    'Implement WAF rule management','Build chaos engineering framework',
    'Create security header middleware','Design compliance monitoring system'
  ];

  -- Subtask title templates
  v_subtask_d1 TEXT[] := ARRAY[
    'Research and design approach','Implement core logic','Write unit tests',
    'Create integration tests','Update documentation','Code review and refactor',
    'Performance benchmarking','Security review','Add error handling',
    'Configure CI pipeline steps','Create database migrations','Build API endpoints',
    'Implement validation rules','Add logging and monitoring','Create mock data fixtures',
    'Design data model schema','Write acceptance criteria','Setup development environment'
  ];
  v_subtask_d2 TEXT[] := ARRAY[
    'Write helper functions','Add input validation','Create test fixtures',
    'Write edge case tests','Add error boundaries','Implement retry logic',
    'Create mock services','Write seed data','Setup test database',
    'Add TypeScript types','Create API client wrapper','Write migration rollback',
    'Add request validation','Create response mappers','Implement caching layer'
  ];
  v_subtask_d3 TEXT[] := ARRAY[
    'Fix linting issues','Add code comments','Update README section',
    'Fix edge case bug','Add null checks','Update test assertions',
    'Fix import ordering','Add timeout handling','Update error messages',
    'Fix type annotations','Add boundary checks','Update config defaults'
  ];

  v_project_id   UUID;
  v_task_id      UUID;
  v_parent_d0    UUID;
  v_parent_d1    UUID;
  v_parent_d2    UUID;
  v_title        TEXT;
  v_titles       TEXT[];
  v_status       TEXT;
  v_priority     TEXT;
  v_assignee     UUID;
  v_reporter     UUID;
  v_created      TIMESTAMPTZ;
  v_due          TIMESTAMPTZ;
  v_start        TIMESTAMPTZ;
  v_labels       TEXT[];
  v_est_hours    DECIMAL;
  v_act_hours    DECIMAL;
  v_task_count   INT := 0;
  v_p_idx        INT;
  v_d0_count     INT;  -- top-level tasks per project
  v_d1_per_d0    INT;  -- depth-1 children per d0
  v_d2_per_d1    INT;
  v_d3_per_d2    INT;
  v_i            INT;
  v_j            INT;
  v_k            INT;
  v_l            INT;
  v_pos          INT;
  v_day_offset   INT;
  v_metadata     JSONB;
  v_assignee_ids UUID[];
  v_num_assignees INT;
BEGIN
  -- Distribution: 4 projects
  -- Project 1 (Phoenix):  14 d0 * (varied children) ≈ 65 tasks
  -- Project 2 (Aurora):   12 d0 * (varied children) ≈ 55 tasks
  -- Project 3 (Nebula):   10 d0 * (varied children) ≈ 45 tasks
  -- Project 4 (Sentinel): 10 d0 * (varied children) ≈ 35 tasks
  -- Total ≈ 200

  FOR v_p_idx IN 1..4 LOOP
    v_project_id := v_projects[v_p_idx];
    v_pos := 0;

    CASE v_p_idx
      WHEN 1 THEN v_titles := v_phoenix_titles;  v_d0_count := 14;
      WHEN 2 THEN v_titles := v_aurora_titles;    v_d0_count := 12;
      WHEN 3 THEN v_titles := v_nebula_titles;    v_d0_count := 10;
      WHEN 4 THEN v_titles := v_sentinel_titles;  v_d0_count := 10;
    END CASE;

    FOR v_i IN 1..v_d0_count LOOP
      EXIT WHEN v_task_count >= 200;

      v_pos := v_pos + 1;
      v_task_id := gen_random_uuid();
      v_parent_d0 := v_task_id;

      -- Spread creation dates over 6 months
      v_day_offset := (random() * 180)::int;
      v_created := now() - (v_day_offset || ' days')::interval
                   - (random() * 12)::int * interval '1 hour';
      v_start := v_created + (random() * 7)::int * interval '1 day';
      v_due := v_start + ((7 + random() * 60)::int || ' days')::interval;

      v_status := v_statuses[1 + (random() * 3)::int];
      v_priority := v_priorities[1 + (random() * 3)::int];
      v_assignee := v_users[1 + (random() * 19)::int];
      v_reporter := v_users[1 + (random() * 19)::int];
      v_est_hours := (4 + random() * 36)::decimal(8,2);
      v_act_hours := CASE WHEN v_status IN ('done','in_progress')
                          THEN (random() * v_est_hours * 1.3)::decimal(8,2) ELSE 0 END;
      v_labels := ARRAY[
        v_labels_flat[1 + (random() * 27)::int],
        v_labels_flat[1 + (random() * 27)::int]
      ];

      -- Multi-assignee: 1-3 assignees
      v_num_assignees := 1 + (random() * 2)::int;
      v_assignee_ids := ARRAY[v_assignee];
      IF v_num_assignees >= 2 THEN
        v_assignee_ids := v_assignee_ids || v_users[1 + (random() * 19)::int];
      END IF;
      IF v_num_assignees >= 3 THEN
        v_assignee_ids := v_assignee_ids || v_users[1 + (random() * 19)::int];
      END IF;

      v_title := v_titles[((v_i - 1) % array_length(v_titles, 1)) + 1];
      v_metadata := jsonb_build_object(
        'epic', CASE v_p_idx
          WHEN 1 THEN 'Platform Core'
          WHEN 2 THEN 'Dashboard Revamp'
          WHEN 3 THEN 'Data Pipeline'
          WHEN 4 THEN 'Security Hardening'
        END,
        'sprint', 'Sprint ' || (1 + (v_day_offset / 14))::text,
        'story_points', (1 + (random() * 12)::int)
      );

      INSERT INTO tasks (
        id, org_id, project_id, parent_task_id, title, description,
        status, priority, assignee_id, reporter_id, depth, position,
        due_date, start_date, estimated_hours, actual_hours,
        labels, metadata, assignee_ids, created_at, updated_at
      ) VALUES (
        v_task_id, v_org_id, v_project_id, NULL, v_title,
        'Detailed description for: ' || v_title || '. This task involves planning, implementation, testing, and documentation.',
        v_status, v_priority, v_assignee, v_reporter, 0, v_pos,
        v_due, v_start, v_est_hours, v_act_hours,
        v_labels, v_metadata, v_assignee_ids, v_created, v_created + interval '1 minute'
      ) ON CONFLICT DO NOTHING;
      v_task_count := v_task_count + 1;

      -- Depth-1 children (2-4 per top-level, fewer for later projects)
      v_d1_per_d0 := CASE
        WHEN v_p_idx = 1 THEN 2 + (random() * 2)::int  -- 2-4
        WHEN v_p_idx = 2 THEN 2 + (random() * 1)::int  -- 2-3
        WHEN v_p_idx = 3 THEN 1 + (random() * 2)::int  -- 1-3
        WHEN v_p_idx = 4 THEN 1 + (random() * 1)::int  -- 1-2
      END;

      FOR v_j IN 1..v_d1_per_d0 LOOP
        EXIT WHEN v_task_count >= 200;

        v_task_id := gen_random_uuid();
        v_parent_d1 := v_task_id;

        v_created := v_created + (1 + random() * 5)::int * interval '1 day';
        v_start := v_created + (random() * 3)::int * interval '1 day';
        v_due := v_start + ((3 + random() * 21)::int || ' days')::interval;

        v_status := v_statuses[1 + (random() * 3)::int];
        v_priority := v_priorities[1 + (random() * 3)::int];
        v_assignee := v_users[1 + (random() * 19)::int];
        v_reporter := v_users[1 + (random() * 19)::int];
        v_est_hours := (2 + random() * 16)::decimal(8,2);
        v_act_hours := CASE WHEN v_status IN ('done','in_progress')
                            THEN (random() * v_est_hours * 1.2)::decimal(8,2) ELSE 0 END;

        v_title := v_subtask_d1[((v_j - 1 + v_i * 3) % array_length(v_subtask_d1, 1)) + 1];
        v_assignee_ids := ARRAY[v_assignee];

        INSERT INTO tasks (
          id, org_id, project_id, parent_task_id, title, description,
          status, priority, assignee_id, reporter_id, depth, position,
          due_date, start_date, estimated_hours, actual_hours,
          labels, metadata, assignee_ids, created_at, updated_at
        ) VALUES (
          v_task_id, v_org_id, v_project_id, v_parent_d0, v_title,
          'Subtask: ' || v_title || ' for parent task.',
          v_status, v_priority, v_assignee, v_reporter, 1, v_j,
          v_due, v_start, v_est_hours, v_act_hours,
          v_labels, '{}'::jsonb, v_assignee_ids, v_created, v_created + interval '1 minute'
        ) ON CONFLICT DO NOTHING;
        v_task_count := v_task_count + 1;

        -- Depth-2 children (0-2 per depth-1, only for some)
        v_d2_per_d1 := CASE WHEN random() > 0.4 THEN 1 + (random() * 1)::int ELSE 0 END;

        FOR v_k IN 1..v_d2_per_d1 LOOP
          EXIT WHEN v_task_count >= 200;

          v_task_id := gen_random_uuid();
          v_parent_d2 := v_task_id;

          v_created := v_created + (1 + random() * 3)::int * interval '1 day';
          v_start := v_created + (random() * 2)::int * interval '1 day';
          v_due := v_start + ((2 + random() * 14)::int || ' days')::interval;

          v_status := v_statuses[1 + (random() * 3)::int];
          v_priority := v_priorities[1 + (random() * 3)::int];
          v_assignee := v_users[1 + (random() * 19)::int];
          v_est_hours := (1 + random() * 8)::decimal(8,2);
          v_act_hours := CASE WHEN v_status IN ('done','in_progress')
                              THEN (random() * v_est_hours)::decimal(8,2) ELSE 0 END;

          v_title := v_subtask_d2[((v_k - 1 + v_j * 2) % array_length(v_subtask_d2, 1)) + 1];
          v_assignee_ids := ARRAY[v_assignee];

          INSERT INTO tasks (
            id, org_id, project_id, parent_task_id, title, description,
            status, priority, assignee_id, reporter_id, depth, position,
            due_date, start_date, estimated_hours, actual_hours,
            labels, metadata, assignee_ids, created_at, updated_at
          ) VALUES (
            v_task_id, v_org_id, v_project_id, v_parent_d1, v_title,
            'Sub-subtask: ' || v_title,
            v_status, v_priority, v_assignee, v_reporter, 2, v_k,
            v_due, v_start, v_est_hours, v_act_hours,
            v_labels, '{}'::jsonb, v_assignee_ids, v_created, v_created + interval '1 minute'
          ) ON CONFLICT DO NOTHING;
          v_task_count := v_task_count + 1;

          -- Depth-3 children (0-1 per depth-2, ~30% chance)
          v_d3_per_d2 := CASE WHEN random() > 0.65 THEN 1 ELSE 0 END;

          FOR v_l IN 1..v_d3_per_d2 LOOP
            EXIT WHEN v_task_count >= 200;

            v_task_id := gen_random_uuid();

            v_created := v_created + (1 + random() * 2)::int * interval '1 day';
            v_start := v_created;
            v_due := v_start + ((1 + random() * 7)::int || ' days')::interval;

            v_status := v_statuses[1 + (random() * 3)::int];
            v_priority := v_priorities[1 + (random() * 3)::int];
            v_assignee := v_users[1 + (random() * 19)::int];
            v_est_hours := (0.5 + random() * 4)::decimal(8,2);
            v_act_hours := CASE WHEN v_status IN ('done','in_progress')
                                THEN (random() * v_est_hours)::decimal(8,2) ELSE 0 END;

            v_title := v_subtask_d3[((v_l + v_k * 3) % array_length(v_subtask_d3, 1)) + 1];
            v_assignee_ids := ARRAY[v_assignee];

            INSERT INTO tasks (
              id, org_id, project_id, parent_task_id, title, description,
              status, priority, assignee_id, reporter_id, depth, position,
              due_date, start_date, estimated_hours, actual_hours,
              labels, metadata, assignee_ids, created_at, updated_at
            ) VALUES (
              v_task_id, v_org_id, v_project_id, v_parent_d2, v_title,
              'Leaf task: ' || v_title,
              v_status, v_priority, v_assignee, v_assignee, 3, v_l,
              v_due, v_start, v_est_hours, v_act_hours,
              v_labels, '{}'::jsonb, v_assignee_ids, v_created, v_created + interval '1 minute'
            ) ON CONFLICT DO NOTHING;
            v_task_count := v_task_count + 1;
          END LOOP; -- depth 3
        END LOOP; -- depth 2
      END LOOP; -- depth 1
    END LOOP; -- depth 0
  END LOOP; -- projects

  RAISE NOTICE 'Seeded % tasks across 4 projects', v_task_count;
END;
$$;

-- ─── TASK WATCHERS (random watchers for ~40 tasks) ──────────────────────────
INSERT INTO task_watchers (task_id, user_id)
SELECT t.id, u.uid
FROM (SELECT id FROM tasks WHERE org_id = 'dd000000-0000-4000-a000-000000000001' ORDER BY random() LIMIT 40) t
CROSS JOIN LATERAL (
  SELECT unnest(ARRAY[
    'dd000000-0000-4000-a000-000000000101','dd000000-0000-4000-a000-000000000102',
    'dd000000-0000-4000-a000-000000000103','dd000000-0000-4000-a000-000000000106',
    'dd000000-0000-4000-a000-000000000107','dd000000-0000-4000-a000-000000000111'
  ]::uuid[]) AS uid ORDER BY random() LIMIT (1 + (random() * 2)::int)
) u
ON CONFLICT DO NOTHING;

-- ─── COMMENTS (2-3 comments per ~30 tasks) ──────────────────────────────────
DO $$
DECLARE
  v_org_id UUID := 'dd000000-0000-4000-a000-000000000001';
  v_users  UUID[] := ARRAY[
    'dd000000-0000-4000-a000-000000000101','dd000000-0000-4000-a000-000000000102',
    'dd000000-0000-4000-a000-000000000103','dd000000-0000-4000-a000-000000000104',
    'dd000000-0000-4000-a000-000000000106','dd000000-0000-4000-a000-000000000107',
    'dd000000-0000-4000-a000-000000000111','dd000000-0000-4000-a000-000000000112',
    'dd000000-0000-4000-a000-000000000113','dd000000-0000-4000-a000-000000000115'
  ];
  v_bodies TEXT[] := ARRAY[
    'Can we discuss the approach for this during standup?',
    'I''ve started working on this. Should be ready for review by EOD.',
    'Blocked - waiting for the dependency to be resolved first.',
    'Tested locally, looks good. Pushing to staging now.',
    'Added some edge case tests. Found a minor issue.',
    'Updated the implementation based on review feedback.',
    'This needs a design review before we proceed.',
    'Documentation is updated. Ready for merge.',
    'Found a regression - investigating the root cause.',
    'Performance benchmarks look good. 30% improvement.',
    'Security scan passed. No critical vulnerabilities.',
    'Deployed to staging. Please verify.',
    'Refactored the error handling as suggested.',
    'Added monitoring dashboards for this feature.',
    'Rollback plan is documented in the runbook.'
  ];
  v_task RECORD;
  v_parent_comment_id UUID;
  v_count INT;
BEGIN
  FOR v_task IN
    SELECT id, created_at FROM tasks
    WHERE org_id = v_org_id
    ORDER BY random() LIMIT 30
  LOOP
    v_count := 2 + (random() * 1)::int;
    v_parent_comment_id := NULL;

    FOR i IN 1..v_count LOOP
      INSERT INTO comments (id, org_id, task_id, user_id, body, parent_id, created_at)
      VALUES (
        gen_random_uuid(), v_org_id, v_task.id,
        v_users[1 + (random() * 9)::int],
        v_bodies[1 + (random() * 14)::int],
        v_parent_comment_id,
        v_task.created_at + (i * (random() * 48 + 1))::int * interval '1 hour'
      );
      -- Make 2nd comment a reply to 1st
      IF i = 1 THEN
        SELECT id INTO v_parent_comment_id FROM comments
        WHERE task_id = v_task.id AND org_id = v_org_id
        ORDER BY created_at DESC LIMIT 1;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- ─── CHECKLISTS (for ~25 tasks, 2-4 items each) ────────────────────────────
DO $$
DECLARE
  v_org_id UUID := 'dd000000-0000-4000-a000-000000000001';
  v_items TEXT[] := ARRAY[
    'Review requirements','Write acceptance tests','Update documentation',
    'Run security scan','Performance test','Code review complete',
    'Design approved','Database migration tested','Rollback plan ready',
    'Staging verified','Load test passed','Error handling verified',
    'Logging configured','Monitoring setup','API docs updated'
  ];
  v_task RECORD;
  v_count INT;
BEGIN
  FOR v_task IN
    SELECT id FROM tasks
    WHERE org_id = v_org_id AND depth = 0
    ORDER BY random() LIMIT 25
  LOOP
    v_count := 2 + (random() * 2)::int;
    FOR i IN 1..v_count LOOP
      INSERT INTO checklists (id, org_id, task_id, title, is_checked, position)
      VALUES (
        gen_random_uuid(), v_org_id, v_task.id,
        v_items[((i - 1) % array_length(v_items, 1)) + 1],
        random() > 0.4,
        i
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

-- ─── TASK STATE TRANSITIONS (for tasks not in todo) ─────────────────────────
INSERT INTO task_state_transitions (id, org_id, task_id, project_id, from_status, to_status, actor_id, transitioned_at)
SELECT
  gen_random_uuid(), t.org_id, t.id, t.project_id,
  'todo', t.status,
  t.assignee_id, t.created_at + ((random() * 72 + 1)::int || ' hours')::interval
FROM tasks t
WHERE t.org_id = 'dd000000-0000-4000-a000-000000000001'
  AND t.status != 'todo'
ON CONFLICT DO NOTHING;

-- Add second transition for 'done' tasks (in_progress → done)
INSERT INTO task_state_transitions (id, org_id, task_id, project_id, from_status, to_status, actor_id, transitioned_at)
SELECT
  gen_random_uuid(), t.org_id, t.id, t.project_id,
  'in_progress', 'done',
  t.assignee_id, t.created_at + ((random() * 168 + 72)::int || ' hours')::interval
FROM tasks t
WHERE t.org_id = 'dd000000-0000-4000-a000-000000000001'
  AND t.status = 'done'
ON CONFLICT DO NOTHING;

-- ─── TASK STATUS SNAPSHOTS (daily for past 30 days, per project) ────────────
INSERT INTO task_status_snapshots (id, org_id, project_id, snapshot_date, todo_count, in_progress_count, blocked_count, done_count, total_count)
SELECT
  gen_random_uuid(),
  'dd000000-0000-4000-a000-000000000001',
  p.id,
  d.dt::date,
  greatest(0, (10 + (random() * 8 - 4))::int),
  greatest(0, (8 + (random() * 6 - 3))::int),
  greatest(0, (2 + (random() * 3 - 1))::int),
  greatest(0, (row_number() OVER (PARTITION BY p.id ORDER BY d.dt) * 1.5 + random() * 3)::int),
  50 -- approximate per project
FROM unnest(ARRAY[
  'dd000000-0000-4000-a000-000000000301',
  'dd000000-0000-4000-a000-000000000302',
  'dd000000-0000-4000-a000-000000000303',
  'dd000000-0000-4000-a000-000000000304'
]::uuid[]) AS p(id)
CROSS JOIN generate_series(current_date - 30, current_date, '1 day'::interval) AS d(dt)
ON CONFLICT (org_id, project_id, snapshot_date) DO NOTHING;

-- ─── ACTIVITY LOG (recent activity) ─────────────────────────────────────────
INSERT INTO activity_log (id, org_id, entity_type, entity_id, action, actor_id, changes, created_at)
SELECT
  gen_random_uuid(),
  'dd000000-0000-4000-a000-000000000001',
  'task',
  t.id,
  CASE (random() * 3)::int
    WHEN 0 THEN 'created'
    WHEN 1 THEN 'updated'
    WHEN 2 THEN 'status_changed'
    ELSE 'assigned'
  END,
  t.assignee_id,
  jsonb_build_object('status', t.status, 'priority', t.priority),
  t.created_at + (random() * 24)::int * interval '1 hour'
FROM tasks t
WHERE t.org_id = 'dd000000-0000-4000-a000-000000000001'
ORDER BY random()
LIMIT 100
ON CONFLICT DO NOTHING;

-- ─── NOTIFICATIONS (for recent task activities) ─────────────────────────────
INSERT INTO notifications (id, user_id, org_id, type, title, body, payload, created_at)
SELECT
  gen_random_uuid(),
  t.assignee_id,
  'dd000000-0000-4000-a000-000000000001',
  CASE (random() * 3)::int
    WHEN 0 THEN 'task_assigned'
    WHEN 1 THEN 'comment_mention'
    WHEN 2 THEN 'task_updated'
    ELSE 'task_assigned'
  END,
  'Task: ' || t.title,
  CASE (random() * 2)::int
    WHEN 0 THEN 'You have been assigned to this task'
    WHEN 1 THEN 'Someone commented on your task'
    ELSE 'Task status has been updated'
  END,
  jsonb_build_object('task_id', t.id, 'project_id', t.project_id),
  t.created_at + (random() * 48)::int * interval '1 hour'
FROM tasks t
WHERE t.org_id = 'dd000000-0000-4000-a000-000000000001'
  AND t.depth = 0
ORDER BY random()
LIMIT 50
ON CONFLICT DO NOTHING;

-- ─── ANNOUNCEMENTS ──────────────────────────────────────────────────────────
INSERT INTO announcements (id, org_id, project_id, author_id, title, body, priority, pinned, published_at, expires_at) VALUES
  (gen_random_uuid(), 'dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000301',
   'dd000000-0000-4000-a000-000000000101', 'Phoenix Sprint 12 Kickoff',
   'Starting the API gateway routing sprint. Focus on performance and reliability. Stand-up at 9:30 AM EST daily.',
   'high', true, now() - interval '3 days', now() + interval '14 days'),
  (gen_random_uuid(), 'dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000302',
   'dd000000-0000-4000-a000-000000000107', 'Aurora Design Review Friday',
   'Weekly design critique moving to Friday 2PM UTC. Bring wireframes for dashboard widgets.',
   'normal', false, now() - interval '1 day', now() + interval '7 days'),
  (gen_random_uuid(), 'dd000000-0000-4000-a000-000000000001', NULL,
   'dd000000-0000-4000-a000-000000000105', 'Scheduled Maintenance Window',
   'Database maintenance scheduled for Saturday 2-4 AM UTC. Expect brief downtime.',
   'urgent', true, now(), now() + interval '5 days'),
  (gen_random_uuid(), 'dd000000-0000-4000-a000-000000000001', 'dd000000-0000-4000-a000-000000000304',
   'dd000000-0000-4000-a000-000000000115', 'Security Audit Completed',
   'All critical findings from the Q1 security audit have been addressed. Full report available in Confluence.',
   'normal', false, now() - interval '7 days', NULL)
ON CONFLICT DO NOTHING;

-- ─── TASK TEMPLATES ─────────────────────────────────────────────────────────
INSERT INTO task_templates (id, org_id, name, description, structure, is_shared, created_by) VALUES
  (gen_random_uuid(), 'dd000000-0000-4000-a000-000000000001',
   'Feature Delivery', 'Standard feature delivery workflow',
   '{"phases":["design","implement","test","deploy"],"default_priority":"medium","checklist":["Requirements reviewed","Tests written","Docs updated","Deployed to staging"]}'::jsonb,
   true, 'dd000000-0000-4000-a000-000000000101'),
  (gen_random_uuid(), 'dd000000-0000-4000-a000-000000000001',
   'Bug Fix', 'Bug investigation and fix template',
   '{"phases":["reproduce","investigate","fix","verify"],"default_priority":"high","checklist":["Bug reproduced","Root cause identified","Fix implemented","Regression test added"]}'::jsonb,
   true, 'dd000000-0000-4000-a000-000000000102'),
  (gen_random_uuid(), 'dd000000-0000-4000-a000-000000000001',
   'Infrastructure Change', 'Infra change with rollback plan',
   '{"phases":["plan","implement","test","rollout"],"default_priority":"high","checklist":["Change documented","Rollback plan ready","Tested in staging","Monitoring configured"]}'::jsonb,
   true, 'dd000000-0000-4000-a000-000000000105')
ON CONFLICT DO NOTHING;

-- ─── CHANGE REQUESTS (a few pending reviews) ────────────────────────────────
INSERT INTO task_change_requests (id, org_id, task_id, proposer_id, reviewer_id, status, changes, reason)
SELECT
  gen_random_uuid(),
  'dd000000-0000-4000-a000-000000000001',
  t.id,
  'dd000000-0000-4000-a000-000000000114',   -- junior dev proposing
  'dd000000-0000-4000-a000-000000000102',   -- manager reviewing
  CASE (row_number() OVER ())::int % 3
    WHEN 0 THEN 'pending'
    WHEN 1 THEN 'approved'
    ELSE 'rejected'
  END,
  jsonb_build_object('status', 'done', 'priority', 'high'),
  'Requesting status change to mark as complete.'
FROM tasks t
WHERE t.org_id = 'dd000000-0000-4000-a000-000000000001'
  AND t.depth = 0
  AND t.status = 'in_progress'
ORDER BY random()
LIMIT 6
ON CONFLICT DO NOTHING;

-- ─── DAILY METRICS (past 30 days) ──────────────────────────────────────────
INSERT INTO daily_metrics (id, org_id, metric_date, scope_type, scope_id, metrics)
SELECT
  gen_random_uuid(),
  'dd000000-0000-4000-a000-000000000001',
  d.dt::date,
  'project',
  p.id,
  jsonb_build_object(
    'tasks_created', (random() * 5)::int,
    'tasks_completed', (random() * 4)::int,
    'avg_cycle_time_hours', (24 + random() * 72)::decimal(5,1),
    'throughput', (random() * 3)::int
  )
FROM unnest(ARRAY[
  'dd000000-0000-4000-a000-000000000301',
  'dd000000-0000-4000-a000-000000000302',
  'dd000000-0000-4000-a000-000000000303',
  'dd000000-0000-4000-a000-000000000304'
]::uuid[]) AS p(id)
CROSS JOIN generate_series(current_date - 30, current_date, '1 day'::interval) AS d(dt)
ON CONFLICT (org_id, metric_date, scope_type, scope_id) DO NOTHING;

-- ─── ORG THEME CONFIG ───────────────────────────────────────────────────────
INSERT INTO org_theme_configs (org_id, base_theme, custom_colors, locked, updated_by) VALUES
  ('dd000000-0000-4000-a000-000000000001', 'orbis-dark',
   '{"primary":"#6366f1","accent":"#8b5cf6","secondary":"#ec4899"}'::jsonb,
   false, 'dd000000-0000-4000-a000-000000000101')
ON CONFLICT DO NOTHING;

COMMIT;

-- Summary report
SELECT 'SEED COMPLETE' AS status,
  (SELECT count(*) FROM users WHERE id::text LIKE 'dd000000-0000-4000-a000-0000000001%') AS users,
  (SELECT count(*) FROM org_members WHERE org_id = 'dd000000-0000-4000-a000-000000000001') AS org_members,
  (SELECT count(*) FROM teams WHERE org_id = 'dd000000-0000-4000-a000-000000000001') AS teams,
  (SELECT count(*) FROM projects WHERE org_id = 'dd000000-0000-4000-a000-000000000001') AS projects,
  (SELECT count(*) FROM tasks WHERE org_id = 'dd000000-0000-4000-a000-000000000001') AS tasks,
  (SELECT count(*) FROM tasks WHERE org_id = 'dd000000-0000-4000-a000-000000000001' AND depth = 0) AS d0_tasks,
  (SELECT count(*) FROM tasks WHERE org_id = 'dd000000-0000-4000-a000-000000000001' AND depth = 1) AS d1_tasks,
  (SELECT count(*) FROM tasks WHERE org_id = 'dd000000-0000-4000-a000-000000000001' AND depth = 2) AS d2_tasks,
  (SELECT count(*) FROM tasks WHERE org_id = 'dd000000-0000-4000-a000-000000000001' AND depth = 3) AS d3_tasks,
  (SELECT count(*) FROM comments WHERE org_id = 'dd000000-0000-4000-a000-000000000001') AS comments,
  (SELECT count(*) FROM checklists WHERE org_id = 'dd000000-0000-4000-a000-000000000001') AS checklists;
