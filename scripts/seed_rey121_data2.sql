-- Round 2 seed for the real REY@# org (rey121): task templates + assignees
-- on existing tasks, so billing_admin (bill) can be tested against the
-- Templates tab (should see them read-only, no create/edit/delete) and so
-- "My Tasks" has real data for the owner.

DO $$
DECLARE
  v_org_id uuid := '68b1d38d-2460-4e99-b0ef-8d304e2d731b';
  v_owner_id uuid := '7fe0dfe2-295a-5837-9340-20312a410682';
BEGIN
  INSERT INTO task_templates (org_id, name, description, structure, is_shared, created_by)
  VALUES
    (v_org_id, 'Bug Report', 'Standard bug intake template',
     '{"tasks":[{"title":"Reproduce issue","priority":"high"},{"title":"Root cause analysis","priority":"medium"},{"title":"Fix + test","priority":"high"}]}'::jsonb,
     true, v_owner_id),
    (v_org_id, 'Feature Rollout', 'Checklist for shipping a new feature',
     '{"tasks":[{"title":"Design review","priority":"medium"},{"title":"Implementation","priority":"high"},{"title":"QA pass","priority":"medium"},{"title":"Release notes","priority":"low"}]}'::jsonb,
     true, v_owner_id),
    (v_org_id, 'Onboarding Checklist', 'New team member onboarding',
     '{"tasks":[{"title":"Provision accounts","priority":"high"},{"title":"Intro meetings","priority":"medium"},{"title":"First task assigned","priority":"low"}]}'::jsonb,
     true, v_owner_id);

  -- Assign existing tasks to the owner so "My Tasks" has real data.
  UPDATE tasks SET assignee_id = v_owner_id
  WHERE org_id = v_org_id AND assignee_id IS NULL;
END $$;
