-- Seeds 3 real projects + tasks into the real "REY@#" org (slug rey121) for
-- manual billing_admin testing. Owner (skbytb@gmail.com) becomes project
-- lead on each, matching normal app behavior. bill (billing_admin) is
-- deliberately NOT added as a project member, so you can test whether the
-- Projects list shows these via org-scope projects:read (visible, read-only)
-- or hides them entirely (no project membership) - that's the real question
-- this data lets you answer by just looking at bill's screen.

DO $$
DECLARE
  v_org_id uuid := '68b1d38d-2460-4e99-b0ef-8d304e2d731b';
  v_owner_id uuid := '7fe0dfe2-295a-5837-9340-20312a410682';
  v_proj1 uuid;
  v_proj2 uuid;
  v_proj3 uuid;
BEGIN
  INSERT INTO projects (org_id, name, description, status, created_by)
  VALUES (v_org_id, 'Website Redesign', 'Q3 marketing site refresh', 'active', v_owner_id)
  RETURNING id INTO v_proj1;

  INSERT INTO projects (org_id, name, description, status, created_by)
  VALUES (v_org_id, 'Mobile App v2', 'Native app rewrite', 'active', v_owner_id)
  RETURNING id INTO v_proj2;

  INSERT INTO projects (org_id, name, description, status, created_by)
  VALUES (v_org_id, 'Internal Tooling', 'Admin dashboard improvements', 'active', v_owner_id)
  RETURNING id INTO v_proj3;

  INSERT INTO project_members (project_id, user_id, role, source)
  VALUES
    (v_proj1, v_owner_id, 'lead', 'direct'),
    (v_proj2, v_owner_id, 'lead', 'direct'),
    (v_proj3, v_owner_id, 'lead', 'direct');

  INSERT INTO tasks (org_id, project_id, title, description, status, priority, reporter_id)
  VALUES
    (v_org_id, v_proj1, 'Wireframe homepage', 'Initial low-fi wireframes', 'todo', 'high', v_owner_id),
    (v_org_id, v_proj1, 'Set up design system', 'Tokens, components, Figma library', 'in_progress', 'medium', v_owner_id),
    (v_org_id, v_proj1, 'Launch to staging', 'Deploy for internal review', 'done', 'high', v_owner_id),

    (v_org_id, v_proj2, 'Auth flow rebuild', 'Migrate to new SSO', 'in_progress', 'critical', v_owner_id),
    (v_org_id, v_proj2, 'Offline sync', 'Local-first data layer', 'todo', 'medium', v_owner_id),
    (v_org_id, v_proj2, 'App store submission', 'iOS + Android review prep', 'todo', 'low', v_owner_id),

    (v_org_id, v_proj3, 'RBAC audit dashboard', 'Visualize role/permission matrix', 'in_progress', 'high', v_owner_id),
    (v_org_id, v_proj3, 'Usage analytics export', 'CSV export for finance', 'todo', 'medium', v_owner_id);

  RAISE NOTICE 'Seeded projects: %, %, %', v_proj1, v_proj2, v_proj3;
END $$;
