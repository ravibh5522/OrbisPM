BEGIN;

-- Comprehensive dummy dataset for local development.
-- Safe to rerun: fixed IDs + ON CONFLICT DO NOTHING.

-- Core identities
INSERT INTO orgs (id, name, slug, plan, settings)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Orbis Dummy Org', 'orbis-dummy-org', 'pro', '{"timezone":"UTC","currency":"USD"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO users (id, email, display_name, department, job_title, timezone, language, theme, bio)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'alice.dummy@orbis.local', 'Alice Dummy', 'Engineering', 'Engineering Manager', 'UTC', 'en', 'orbis-light', 'Seeded admin user'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'bob.dummy@orbis.local', 'Bob Dummy', 'Engineering', 'Backend Engineer', 'UTC', 'en', 'orbis-light', 'Seeded member user'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'cara.dummy@orbis.local', 'Cara Dummy', 'Design', 'Product Designer', 'UTC', 'en', 'orbis-light', 'Seeded designer user'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'devon.dummy@orbis.local', 'Devon Dummy', 'QA', 'QA Engineer', 'UTC', 'en', 'orbis-light', 'Seeded QA user')
ON CONFLICT DO NOTHING;

INSERT INTO org_members (org_id, user_id, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'member'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'member'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'member')
ON CONFLICT DO NOTHING;

-- Billing and subscription
INSERT INTO billing_plans (id, name, stripe_price_id, limits)
VALUES
  ('dummy-pro', 'Dummy Pro', 'price_dummy_pro', '{"projects":50,"users":200,"storage_gb":500}'::jsonb),
  ('dummy-enterprise', 'Dummy Enterprise', 'price_dummy_ent', '{"projects":500,"users":5000,"storage_gb":5000}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO org_subscriptions (id, org_id, plan_id, stripe_sub_id, status, current_period_start, current_period_end)
VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'dummy-pro', 'sub_dummy_001', 'active', now() - interval '7 days', now() + interval '23 days')
ON CONFLICT DO NOTHING;

-- Org-level config and access tokens
INSERT INTO org_theme_configs (org_id, base_theme, custom_colors, locked, updated_by)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'orbis-light', '{"primary":"#0ea5e9","accent":"#22c55e"}'::jsonb, false, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
ON CONFLICT DO NOTHING;

INSERT INTO api_keys (id, org_id, user_id, name, key_hash, key_prefix, scopes, expires_at)
VALUES
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Dummy Integration Key', repeat('a', 64), 'dumkey01', ARRAY['tasks:read','tasks:write','projects:read'], now() + interval '180 days')
ON CONFLICT DO NOTHING;

-- Permissions and roles
INSERT INTO permissions (id, resource, action, scope, description)
VALUES
  ('44444444-4444-4444-4444-444444444441', 'project', 'approve', 'org', 'Approve project changes'),
  ('44444444-4444-4444-4444-444444444442', 'task', 'estimate', 'project', 'Estimate tasks')
ON CONFLICT DO NOTHING;

INSERT INTO roles (id, org_id, scope, slug, name, description, is_system)
VALUES
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'org', 'dummy_ops_admin', 'Dummy Ops Admin', 'Admin role for seed data', false)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
VALUES
  ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444441'),
  ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444442')
ON CONFLICT DO NOTHING;

INSERT INTO custom_roles (id, org_id, name, description, permissions)
VALUES
  ('66666666-6666-6666-6666-666666666661', '11111111-1111-1111-1111-111111111111', 'Dummy Reviewer', 'Custom reviewer role', '{"can_review":true,"can_comment":true,"can_assign":false}'::jsonb)
ON CONFLICT DO NOTHING;

-- Teams and projects
INSERT INTO teams (id, org_id, name, description, manager_id, status)
VALUES
  ('77777777-7777-7777-7777-777777777771', '11111111-1111-1111-1111-111111111111', 'Platform Team', 'Core backend and infra', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'active'),
  ('77777777-7777-7777-7777-777777777772', '11111111-1111-1111-1111-111111111111', 'Product Team', 'Frontend and product design', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO team_members (team_id, user_id, role)
VALUES
  ('77777777-7777-7777-7777-777777777771', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'manager'),
  ('77777777-7777-7777-7777-777777777771', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'member'),
  ('77777777-7777-7777-7777-777777777772', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'manager'),
  ('77777777-7777-7777-7777-777777777772', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'member')
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, org_id, team_id, name, description, status, settings, created_by)
VALUES
  ('88888888-8888-8888-8888-888888888881', '11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777771', 'Apollo Platform Revamp', 'Modernize API and queue architecture', 'active', '{"sprint_length_days":14}'::jsonb, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
  ('88888888-8888-8888-8888-888888888882', '11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777772', 'Orion UX Refresh', 'Revamp navigation and dashboards', 'active', '{"sprint_length_days":7}'::jsonb, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3')
ON CONFLICT DO NOTHING;

INSERT INTO project_members (project_id, user_id, role, source, source_team_id)
VALUES
  ('88888888-8888-8888-8888-888888888881', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'owner', 'team', '77777777-7777-7777-7777-777777777771'),
  ('88888888-8888-8888-8888-888888888881', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'contributor', 'team', '77777777-7777-7777-7777-777777777771'),
  ('88888888-8888-8888-8888-888888888882', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'owner', 'team', '77777777-7777-7777-7777-777777777772'),
  ('88888888-8888-8888-8888-888888888882', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'contributor', 'team', '77777777-7777-7777-7777-777777777772')
ON CONFLICT DO NOTHING;

INSERT INTO project_teams (project_id, team_id)
VALUES
  ('88888888-8888-8888-8888-888888888881', '77777777-7777-7777-7777-777777777771'),
  ('88888888-8888-8888-8888-888888888882', '77777777-7777-7777-7777-777777777772')
ON CONFLICT DO NOTHING;

-- Tasking
INSERT INTO tasks (id, org_id, project_id, parent_task_id, title, description, status, priority, assignee_id, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours, labels, metadata, review_status, assignee_ids)
VALUES
  ('99999999-9999-9999-9999-999999999901', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888881', NULL, 'Design API versioning strategy', 'Define backward compatibility and migration windows', 'in_progress', 'high', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 0, 1, now() + interval '10 days', now() - interval '2 days', 12, 3, ARRAY['api','architecture'], '{"epic":"Platform Core"}'::jsonb, 'pending', ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2']::uuid[]),
  ('99999999-9999-9999-9999-999999999902', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888881', '99999999-9999-9999-9999-999999999901', 'Write versioning ADR', 'Architecture decision record for API versions', 'todo', 'medium', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1, 2, now() + interval '6 days', now() + interval '1 day', 4, 0, ARRAY['documentation'], '{"doc":"ADR-012"}'::jsonb, 'pending', ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2']::uuid[]),
  ('99999999-9999-9999-9999-999999999903', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888881', NULL, 'Build event replay endpoint', 'Enable replay from selected offset', 'blocked', 'urgent', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 0, 3, now() + interval '14 days', now() - interval '1 day', 20, 4, ARRAY['backend','events'], '{"blocked_by":"schema review"}'::jsonb, 'changes_requested', ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2']::uuid[]),
  ('99999999-9999-9999-9999-999999999904', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888882', NULL, 'Redesign sidebar information architecture', 'Flatten top-level navigation and improve labels', 'in_progress', 'high', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 0, 1, now() + interval '8 days', now() - interval '1 day', 16, 5, ARRAY['ux','frontend'], '{"experiment":"nav-v2"}'::jsonb, 'approved', ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3']::uuid[]),
  ('99999999-9999-9999-9999-999999999905', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888882', NULL, 'Implement accessibility pass', 'Focus on keyboard navigation and ARIA landmarks', 'todo', 'medium', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 0, 2, now() + interval '12 days', now() + interval '2 days', 10, 0, ARRAY['a11y'], '{"wcag":"2.2"}'::jsonb, 'pending', ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4']::uuid[]),
  ('99999999-9999-9999-9999-999999999906', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888882', '99999999-9999-9999-9999-999999999905', 'Add focus states to components', 'Systematic focus ring for all controls', 'todo', 'low', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 1, 3, now() + interval '9 days', now() + interval '2 days', 6, 0, ARRAY['ui-kit'], '{"component_set":"v2"}'::jsonb, 'pending', ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4']::uuid[])
ON CONFLICT DO NOTHING;

INSERT INTO task_dependencies (task_id, depends_on_id, type)
VALUES
  ('99999999-9999-9999-9999-999999999903', '99999999-9999-9999-9999-999999999901', 'blocked_by'),
  ('99999999-9999-9999-9999-999999999906', '99999999-9999-9999-9999-999999999905', 'blocked_by')
ON CONFLICT DO NOTHING;

INSERT INTO task_watchers (task_id, user_id)
VALUES
  ('99999999-9999-9999-9999-999999999901', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
  ('99999999-9999-9999-9999-999999999901', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'),
  ('99999999-9999-9999-9999-999999999904', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2')
ON CONFLICT DO NOTHING;

INSERT INTO task_rules (id, org_id, task_id, rule_type, rule_config, is_required)
VALUES
  ('abababab-abab-abab-abab-ababababab01', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999901', 'approval_required', '{"min_approvers":1}'::jsonb, true),
  ('abababab-abab-abab-abab-ababababab02', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999904', 'checklist_required', '{"min_items":2}'::jsonb, true)
ON CONFLICT DO NOTHING;

INSERT INTO checklists (id, org_id, task_id, title, is_checked, position)
VALUES
  ('acacacac-acac-acac-acac-acacacacac01', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999901', 'Review compatibility matrix', true, 1),
  ('acacacac-acac-acac-acac-acacacacac02', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999901', 'Get architecture sign-off', false, 2),
  ('acacacac-acac-acac-acac-acacacacac03', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999904', 'Run usability review', false, 1)
ON CONFLICT DO NOTHING;

INSERT INTO comments (id, org_id, task_id, user_id, body, parent_id)
VALUES
  ('adadadad-adad-adad-adad-adadadadad01', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999901', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Please include deprecation windows per endpoint.', NULL),
  ('adadadad-adad-adad-adad-adadadadad02', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999901', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Added that to the ADR draft.', 'adadadad-adad-adad-adad-adadadadad01'),
  ('adadadad-adad-adad-adad-adadadadad03', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999904', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Need final icon library decision.', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO task_change_requests (id, org_id, task_id, proposer_id, reviewer_id, status, changes, reason, review_note, reviewed_at)
VALUES
  ('aeaeaeae-aeae-aeae-aeae-aeaeaeaeae01', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999903', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'pending', '{"priority":"high","status":"in_progress"}'::jsonb, 'Need to unblock QA demo', NULL, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO attachments (id, org_id, task_id, comment_id, uploaded_by, filename, storage_path, file_size, mime_type, change_request_id)
VALUES
  ('afafafaf-afaf-afaf-afaf-afafafafaf01', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999901', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'api-versioning-adr.md', 'dummy/org1/tasks/901/api-versioning-adr.md', 16384, 'text/markdown', NULL),
  ('afafafaf-afaf-afaf-afaf-afafafafaf02', '11111111-1111-1111-1111-111111111111', NULL, 'adadadad-adad-adad-adad-adadadadad03', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'sidebar-wireframe.png', 'dummy/org1/comments/03/sidebar-wireframe.png', 502400, 'image/png', NULL),
  ('afafafaf-afaf-afaf-afaf-afafafafaf03', '11111111-1111-1111-1111-111111111111', NULL, NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'change-request-notes.txt', 'dummy/org1/change-requests/01/notes.txt', 4096, 'text/plain', 'aeaeaeae-aeae-aeae-aeae-aeaeaeaeae01')
ON CONFLICT DO NOTHING;

INSERT INTO task_state_transitions (id, org_id, task_id, project_id, from_status, to_status, actor_id, transitioned_at)
VALUES
  ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b001', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999901', '88888888-8888-8888-8888-888888888881', 'todo', 'in_progress', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', now() - interval '2 days'),
  ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b002', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999904', '88888888-8888-8888-8888-888888888882', 'todo', 'in_progress', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', now() - interval '1 day')
ON CONFLICT DO NOTHING;

INSERT INTO task_status_snapshots (id, org_id, project_id, snapshot_date, todo_count, in_progress_count, blocked_count, done_count, total_count)
VALUES
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b101', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888881', current_date, 1, 1, 1, 0, 3),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b102', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888882', current_date, 2, 1, 0, 0, 3)
ON CONFLICT DO NOTHING;

INSERT INTO risk_scores (id, org_id, task_id, risk_level, risk_score, factors, predicted_completion)
VALUES
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b201', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999903', 'high', 0.82, '{"dependency_count":3,"late_history":true}'::jsonb, now() + interval '16 days'),
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b202', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999904', 'medium', 0.53, '{"scope_changes":2}'::jsonb, now() + interval '9 days')
ON CONFLICT DO NOTHING;

INSERT INTO task_templates (id, org_id, name, description, structure, is_shared, created_by)
VALUES
  ('b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b301', '11111111-1111-1111-1111-111111111111', 'Feature Delivery Template', 'Template for end-to-end delivery', '{"phases":["design","build","test","release"],"default_priority":"medium"}'::jsonb, true, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
ON CONFLICT DO NOTHING;

-- Communication and announcements
INSERT INTO announcements (id, org_id, project_id, author_id, title, body, priority, pinned, published_at, expires_at)
VALUES
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c101', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888881', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Platform Freeze Window', 'Deployment freeze this Friday 18:00-21:00 UTC.', 'high', true, now() - interval '1 day', now() + interval '10 days'),
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c102', '11111111-1111-1111-1111-111111111111', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Design Critique Session', 'Weekly critique moved to Thursday 14:00 UTC.', 'normal', false, now() - interval '2 days', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO announcement_reads (announcement_id, user_id)
VALUES
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c101', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c102', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4')
ON CONFLICT DO NOTHING;

INSERT INTO channel_categories (id, org_id, name, position)
VALUES
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c201', '11111111-1111-1111-1111-111111111111', 'Engineering', 1),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c202', '11111111-1111-1111-1111-111111111111', 'Product', 2)
ON CONFLICT DO NOTHING;

INSERT INTO channels (id, org_id, name, description, type, team_id, project_id, dm_pair, avatar_url, created_by, is_auto_managed, read_only, category_id, position)
VALUES
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c301', '11111111-1111-1111-1111-111111111111', 'platform-core', 'Backend architecture and APIs', 'team', '77777777-7777-7777-7777-777777777771', NULL, NULL, '', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', false, false, 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c201', 1),
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c302', '11111111-1111-1111-1111-111111111111', 'orion-ux', 'UX refresh stream', 'project', NULL, '88888888-8888-8888-8888-888888888882', NULL, '', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', false, false, 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c202', 1)
ON CONFLICT DO NOTHING;

INSERT INTO channel_members (channel_id, user_id, role, is_muted, is_pinned, notification_pref)
VALUES
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c301', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'owner', false, true, 'all'),
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c301', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'member', false, false, 'mentions'),
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c302', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'owner', false, true, 'all'),
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c302', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'member', false, false, 'all')
ON CONFLICT DO NOTHING;

INSERT INTO messages (id, org_id, channel_id, user_id, body, body_format, parent_message_id, thread_count, mentions, is_deleted, is_edited, sender_name, entity_mentions, is_system, system_type, system_metadata)
VALUES
  ('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c401', '11111111-1111-1111-1111-111111111111', 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c301', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Kickoff: API versioning strategy starts today.', 'text', NULL, 1, ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2']::uuid[], false, false, 'Alice Dummy', '[]'::jsonb, false, NULL, '{}'::jsonb),
  ('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c402', '11111111-1111-1111-1111-111111111111', 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c301', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Working on ADR now.', 'text', 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c401', 0, '{}'::uuid[], false, false, 'Bob Dummy', '[]'::jsonb, false, NULL, '{}'::jsonb),
  ('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c403', '11111111-1111-1111-1111-111111111111', 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c302', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Uploaded first navigation mockups.', 'markdown', NULL, 0, ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4']::uuid[], false, true, 'Cara Dummy', '[{"type":"project","id":"88888888-8888-8888-8888-888888888882"}]'::jsonb, false, NULL, '{}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO message_attachments (id, org_id, message_id, file_name, file_size, content_type, storage_key, metadata)
VALUES
  ('c5c5c5c5-c5c5-c5c5-c5c5-c5c5c5c5c501', '11111111-1111-1111-1111-111111111111', 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c403', 'nav-mockups.fig', 2048000, 'application/octet-stream', 'dummy/messages/nav-mockups.fig', '{"source":"figma"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO message_reactions (message_id, user_id, emoji)
VALUES
  ('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c401', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '🚀'),
  ('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c403', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '🔥')
ON CONFLICT DO NOTHING;

INSERT INTO message_bookmarks (user_id, message_id, note)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c403', 'Use this in next design review')
ON CONFLICT DO NOTHING;

INSERT INTO pinned_messages (channel_id, message_id, pinned_by)
VALUES
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c301', 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c401', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
ON CONFLICT DO NOTHING;

INSERT INTO scheduled_messages (id, org_id, channel_id, user_id, body, body_format, parent_message_id, scheduled_for, status)
VALUES
  ('c6c6c6c6-c6c6-c6c6-c6c6-c6c6c6c6c601', '11111111-1111-1111-1111-111111111111', 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c301', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Reminder: architecture review at 16:00 UTC.', 'text', NULL, now() + interval '1 day', 'pending')
ON CONFLICT DO NOTHING;

-- Notifications and activity
INSERT INTO notification_preferences (id, user_id, org_id, event_type, channel, enabled)
VALUES
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d101', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'task.assigned', 'in_app', true),
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d102', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '11111111-1111-1111-1111-111111111111', 'message.mention', 'email', true)
ON CONFLICT DO NOTHING;

INSERT INTO notifications (id, user_id, org_id, type, title, body, payload, read_at)
VALUES
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d201', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'task.assigned', 'New Task Assigned', 'You were assigned task 999...901', '{"task_id":"99999999-9999-9999-9999-999999999901"}'::jsonb, NULL),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d202', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '11111111-1111-1111-1111-111111111111', 'message.mention', 'You were mentioned', 'Cara mentioned you in #orion-ux', '{"message_id":"c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c403"}'::jsonb, now())
ON CONFLICT DO NOTHING;

INSERT INTO activity_log (id, org_id, entity_type, entity_id, action, actor_id, changes, metadata)
VALUES
  ('d3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d301', '11111111-1111-1111-1111-111111111111', 'task', '99999999-9999-9999-9999-999999999901', 'status_changed', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '{"from":"todo","to":"in_progress"}'::jsonb, '{"source":"ui"}'::jsonb),
  ('d3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d302', '11111111-1111-1111-1111-111111111111', 'project', '88888888-8888-8888-8888-888888888882', 'created', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', NULL, '{"imported":false}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO analytics_events (id, org_id, event_type, actor_id, entity_type, entity_id, project_id, team_id, data)
VALUES
  ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d401', '11111111-1111-1111-1111-111111111111', 'task.created', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'task', '99999999-9999-9999-9999-999999999901', '88888888-8888-8888-8888-888888888881', '77777777-7777-7777-7777-777777777771', '{"priority":"high"}'::jsonb),
  ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d402', '11111111-1111-1111-1111-111111111111', 'message.sent', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'message', 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c403', '88888888-8888-8888-8888-888888888882', '77777777-7777-7777-7777-777777777772', '{"body_format":"markdown"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO daily_metrics (id, org_id, metric_date, scope_type, scope_id, metrics)
VALUES
  ('d5d5d5d5-d5d5-d5d5-d5d5-d5d5d5d5d501', '11111111-1111-1111-1111-111111111111', current_date, 'project', '88888888-8888-8888-8888-888888888881', '{"tasks_created":3,"tasks_completed":0,"cycle_time_hours":18.5}'::jsonb),
  ('d5d5d5d5-d5d5-d5d5-d5d5-d5d5d5d5d502', '11111111-1111-1111-1111-111111111111', current_date, 'project', '88888888-8888-8888-8888-888888888882', '{"tasks_created":2,"messages_sent":14}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO weekly_metrics (id, org_id, metric_date, scope_type, scope_id, metrics)
VALUES
  ('d6d6d6d6-d6d6-d6d6-d6d6-d6d6d6d6d601', '11111111-1111-1111-1111-111111111111', current_date - interval '7 days', 'org', '11111111-1111-1111-1111-111111111111', '{"velocity":24,"incidents":1,"deployment_frequency":6}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO metric_alerts (id, org_id, alert_type, severity, scope_type, scope_id, title, description, data, acknowledged_at, acknowledged_by)
VALUES
  ('d7d7d7d7-d7d7-d7d7-d7d7-d7d7d7d7d701', '11111111-1111-1111-1111-111111111111', 'lead_time_spike', 'warning', 'project', '88888888-8888-8888-8888-888888888881', 'Lead time increased', 'Lead time increased by 34% this week.', '{"previous":22.4,"current":30.1}'::jsonb, NULL, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO performance_reports (id, org_id, report_type, scope_type, scope_id, parameters, status, storage_path, generated_by, generated_at, expires_at)
VALUES
  ('d8d8d8d8-d8d8-d8d8-d8d8-d8d8d8d8d801', '11111111-1111-1111-1111-111111111111', 'project_health', 'project', '88888888-8888-8888-8888-888888888881', '{"range":"last_30_days"}'::jsonb, 'completed', 'dummy/reports/project_health_888881.json', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '3 hours', now() + interval '27 days')
ON CONFLICT DO NOTHING;

-- Integrations and imports
INSERT INTO webhooks (id, org_id, url, events, secret, is_active)
VALUES
  ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e101', '11111111-1111-1111-1111-111111111111', 'https://example.invalid/orbispm/webhook', ARRAY['task.created','task.updated','message.sent'], 'dummy_webhook_secret_001', true)
ON CONFLICT DO NOTHING;

INSERT INTO import_jobs (id, org_id, project_id, user_id, status, file_path, file_name, column_mapping, total_rows, processed_rows, error_rows, errors, result, completed_at)
VALUES
  ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e201', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888881', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'completed', 'imports/dummy_tasks.csv', 'dummy_tasks.csv', '{"title":"Task","owner":"Assignee"}'::jsonb, 120, 118, 2, '[{"row":4,"error":"missing title"},{"row":89,"error":"invalid due date"}]'::jsonb, '{"created_tasks":118}'::jsonb, now() - interval '2 days')
ON CONFLICT DO NOTHING;

-- Miscellaneous UI-facing data
INSERT INTO sticky_notes (id, user_id, title, description, color, priority, start_date, due_date, completed, checkpoints)
VALUES
  ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f101', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Prepare stakeholder update', 'Summarize sprint outcomes and risks', 'blue', 'high', now() - interval '1 day', now() + interval '2 days', false, '[{"label":"Draft"},{"label":"Review"}]'::jsonb),
  ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f102', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Finalize navigation proposal', 'Ready for Tuesday design review', 'purple', 'medium', now() - interval '2 days', now() + interval '1 day', false, '[{"label":"Wireframes"},{"label":"Prototype"}]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO contact_submissions (id, name, email, company, message, ip_address)
VALUES
  ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f201', 'Demo Prospect', 'prospect@example.invalid', 'Example Corp', 'Interested in enterprise plan and SSO.', '127.0.0.1'),
  ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f202', 'QA User', 'qa@example.invalid', 'Internal', 'Testing contact form pipeline.', '127.0.0.1')
ON CONFLICT DO NOTHING;

COMMIT;
