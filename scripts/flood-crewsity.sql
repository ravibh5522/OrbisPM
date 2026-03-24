-- ============================================================
-- FLOOD DATA FOR b@b.com IN CREWSITY ORG
-- ============================================================

-- Step 1: Create 200 users and add to org
DO $$
DECLARE
    v_org_id   UUID := '07a6ab28-6aa3-428f-825b-4b144ffeba57';
    uid        UUID;
BEGIN
    FOR i IN 1..200 LOOP
        uid := gen_random_uuid();
        INSERT INTO users (id, email, display_name)
        VALUES (uid, 'crew_user_' || i || '@test.com', 'Crew User ' || i);

        INSERT INTO org_members (org_id, user_id, role)
        VALUES (v_org_id, uid, CASE WHEN i <= 5 THEN 'admin' ELSE 'member' END);
    END LOOP;
    RAISE NOTICE 'Created 200 users';
END $$;

-- Step 2: Create 100 teams with members
DO $$
DECLARE
    v_org_id   UUID := '07a6ab28-6aa3-428f-825b-4b144ffeba57';
    v_owner_id UUID := '59e51e51-da38-58a8-8c29-d485f8b35883';
    v_tid      UUID;
BEGIN
    FOR i IN 1..100 LOOP
        INSERT INTO teams (org_id, name, description)
        VALUES (v_org_id, 'Crew Team ' || i, 'Performance test team ' || i)
        RETURNING id INTO v_tid;

        -- Add 10-20 members from org
        INSERT INTO team_members (team_id, user_id, role)
        SELECT v_tid, om.user_id,
               CASE WHEN row_number() OVER (ORDER BY random()) = 1 THEN 'lead' ELSE 'member' END
        FROM org_members om
        WHERE om.org_id = v_org_id AND om.user_id != v_owner_id
        ORDER BY random()
        LIMIT 10 + (i % 11);

        -- Always add owner as lead
        INSERT INTO team_members (team_id, user_id, role)
        VALUES (v_tid, v_owner_id, 'lead')
        ON CONFLICT DO NOTHING;
    END LOOP;
    RAISE NOTICE 'Created 100 teams';
END $$;

-- Step 3: Create 50 projects with members
DO $$
DECLARE
    v_org_id   UUID := '07a6ab28-6aa3-428f-825b-4b144ffeba57';
    v_owner_id UUID := '59e51e51-da38-58a8-8c29-d485f8b35883';
    v_pid      UUID;
    v_tid      UUID;
    v_tid2     UUID;
BEGIN
    FOR i IN 1..50 LOOP
        SELECT id INTO v_tid FROM teams WHERE teams.org_id = v_org_id AND teams.name = 'Crew Team ' || i LIMIT 1;

        INSERT INTO projects (org_id, team_id, name, description, status, created_by)
        VALUES (v_org_id, v_tid, 'Crew Project ' || i, 'Performance test project ' || i, 'active', v_owner_id)
        RETURNING id INTO v_pid;

        -- Link primary team
        IF v_tid IS NOT NULL THEN
            INSERT INTO project_teams (project_id, team_id) VALUES (v_pid, v_tid) ON CONFLICT DO NOTHING;
        END IF;

        -- Link second team
        SELECT id INTO v_tid2 FROM teams WHERE teams.org_id = v_org_id AND teams.name = 'Crew Team ' || (i + 50) LIMIT 1;
        IF v_tid2 IS NOT NULL THEN
            INSERT INTO project_teams (project_id, team_id) VALUES (v_pid, v_tid2) ON CONFLICT DO NOTHING;
        END IF;

        -- Add owner as project lead
        INSERT INTO project_members (project_id, user_id, role, source)
        VALUES (v_pid, v_owner_id, 'project_lead', 'direct')
        ON CONFLICT DO NOTHING;

        -- Add 15-25 other members
        INSERT INTO project_members (project_id, user_id, role, source)
        SELECT v_pid, om.user_id,
               CASE
                   WHEN row_number() OVER (ORDER BY random()) <= 3 THEN 'project_lead'
                   WHEN row_number() OVER (ORDER BY random()) <= 8 THEN 'contributor'
                   ELSE 'observer'
               END,
               'direct'
        FROM org_members om
        WHERE om.org_id = v_org_id AND om.user_id != v_owner_id
        ORDER BY random()
        LIMIT 15 + (i % 11)
        ON CONFLICT DO NOTHING;
    END LOOP;
    RAISE NOTICE 'Created 50 projects';
END $$;

-- Step 4: Create 10,000 tasks across 4 depth levels (200 per project × 50 projects)
DO $$
DECLARE
    v_org_id   UUID := '07a6ab28-6aa3-428f-825b-4b144ffeba57';
    v_owner_id UUID := '59e51e51-da38-58a8-8c29-d485f8b35883';
    v_pid      UUID;
    v_tid      UUID;
    v_user_ids UUID[];
    v_root_ids UUID[];
    v_l1_ids   UUID[];
    v_l2_ids   UUID[];
    v_statuses TEXT[] := ARRAY['todo', 'in_progress', 'in_review', 'done'];
    v_priorities TEXT[] := ARRAY['low', 'medium', 'high', 'critical'];
    v_labels   TEXT[] := ARRAY['bug', 'feature', 'docs', 'refactor', 'critical', 'frontend', 'backend', 'api', 'enhancement', 'testing'];
    v_proj_ids UUID[];
BEGIN
    -- Get all user IDs in this org
    SELECT array_agg(om.user_id) INTO v_user_ids FROM org_members om WHERE om.org_id = v_org_id;
    -- Get all project IDs
    SELECT array_agg(p.id ORDER BY p.name) INTO v_proj_ids FROM projects p WHERE p.org_id = v_org_id AND p.name LIKE 'Crew Project%';

    FOR p_idx IN 1..array_length(v_proj_ids, 1) LOOP
        v_pid := v_proj_ids[p_idx];
        v_root_ids := ARRAY[]::UUID[];
        v_l1_ids := ARRAY[]::UUID[];
        v_l2_ids := ARRAY[]::UUID[];

        -- Depth 0: 50 root tasks per project
        FOR i IN 1..50 LOOP
            v_tid := gen_random_uuid();
            INSERT INTO tasks (id, org_id, project_id, parent_task_id, title, description, status, priority,
                assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date,
                estimated_hours, labels, metadata)
            VALUES (
                v_tid, v_org_id, v_pid, NULL,
                'P' || p_idx || ' Task ' || i,
                'Description for task ' || i || ' in project ' || p_idx,
                v_statuses[(i % 4) + 1],
                v_priorities[(i % 4) + 1],
                v_user_ids[(i % array_length(v_user_ids, 1)) + 1],
                ARRAY[v_user_ids[(i % array_length(v_user_ids, 1)) + 1]],
                v_user_ids[((i + 3) % array_length(v_user_ids, 1)) + 1],
                0, i,
                CASE WHEN i % 3 = 0 THEN now() + (i || ' days')::interval ELSE NULL END,
                CASE WHEN i % 4 = 0 THEN now() - (i || ' days')::interval ELSE NULL END,
                (random() * 40)::decimal(8,2),
                ARRAY[v_labels[(i % 10) + 1]],
                jsonb_build_object('source', 'perf-seed', 'idx', i)
            );
            v_root_ids := array_append(v_root_ids, v_tid);
        END LOOP;

        -- Depth 1: 60 tasks (first 30 roots × 2 children)
        FOR i IN 1..30 LOOP
            FOR c IN 1..2 LOOP
                v_tid := gen_random_uuid();
                INSERT INTO tasks (id, org_id, project_id, parent_task_id, title, description, status, priority,
                    assignee_id, assignee_ids, depth, position, labels, metadata)
                VALUES (
                    v_tid, v_org_id, v_pid, v_root_ids[i],
                    'P' || p_idx || ' T' || i || ' Sub-' || c,
                    'Subtask ' || c || ' of task ' || i,
                    v_statuses[((i + c) % 4) + 1],
                    v_priorities[((i + c) % 4) + 1],
                    v_user_ids[((i * 3 + c) % array_length(v_user_ids, 1)) + 1],
                    ARRAY[v_user_ids[((i * 3 + c) % array_length(v_user_ids, 1)) + 1]],
                    1, c,
                    ARRAY[v_labels[((i + c) % 10) + 1]],
                    '{}'::jsonb
                );
                v_l1_ids := array_append(v_l1_ids, v_tid);
            END LOOP;
        END LOOP;

        -- Depth 2: 50 tasks (first 25 L1 × 2 children)
        FOR i IN 1..25 LOOP
            FOR c IN 1..2 LOOP
                v_tid := gen_random_uuid();
                INSERT INTO tasks (id, org_id, project_id, parent_task_id, title, description, status, priority,
                    assignee_id, assignee_ids, depth, position, labels, metadata)
                VALUES (
                    v_tid, v_org_id, v_pid, v_l1_ids[i],
                    'P' || p_idx || ' L2-' || i || '-' || c,
                    'Level 2 subtask',
                    v_statuses[((i + c + 1) % 4) + 1],
                    v_priorities[((i + c + 1) % 4) + 1],
                    v_user_ids[((i * 5 + c) % array_length(v_user_ids, 1)) + 1],
                    ARRAY[v_user_ids[((i * 5 + c) % array_length(v_user_ids, 1)) + 1]],
                    2, c,
                    ARRAY[]::TEXT[],
                    '{}'::jsonb
                );
                v_l2_ids := array_append(v_l2_ids, v_tid);
            END LOOP;
        END LOOP;

        -- Depth 3: 40 tasks (first 20 L2 × 2 children)
        FOR i IN 1..20 LOOP
            FOR c IN 1..2 LOOP
                INSERT INTO tasks (org_id, project_id, parent_task_id, title, description, status, priority,
                    assignee_id, assignee_ids, depth, position, labels, metadata)
                VALUES (
                    v_org_id, v_pid, v_l2_ids[i],
                    'P' || p_idx || ' L3-' || i || '-' || c,
                    'Level 3 leaf task',
                    v_statuses[((i + c + 2) % 4) + 1],
                    v_priorities[((i + c + 2) % 4) + 1],
                    v_user_ids[((i * 7 + c) % array_length(v_user_ids, 1)) + 1],
                    ARRAY[v_user_ids[((i * 7 + c) % array_length(v_user_ids, 1)) + 1]],
                    3, c,
                    ARRAY[]::TEXT[],
                    '{}'::jsonb
                );
            END LOOP;
        END LOOP;

        IF p_idx % 10 = 0 THEN
            RAISE NOTICE 'Completed % / 50 projects', p_idx;
        END IF;
    END LOOP;

    RAISE NOTICE 'Created all tasks across 50 projects';
END $$;
