#!/usr/bin/env bash
# ============================================================
# OrbisPM Performance Seed Script
# ============================================================
# Phase 1: Small smoke test (2 orgs, 10 users, 2 teams, 2 projects, 10 tasks)
# Phase 2: Full load for b@b.com org (100 teams, 50 projects, 200 members, 10k tasks)
# Phase 3: Clone to 20 orgs (regex username swap) → ~200k+ tasks total
# Phase 4: Performance benchmark
# ============================================================

set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://postgres:YESVeW48YWdzHq3DYlJRG80DjMgIE@localhost:5432/orbispmdev?sslmode=disable}"
PSQL="psql $DB_URL -v ON_ERROR_STOP=1"
PARALLEL_JOBS=8

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
fail() { echo -e "${RED}[✗]${NC} $*"; exit 1; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }

timer_start() { TIMER_START=$(date +%s%N); }
timer_end()   { local elapsed=$(( ($(date +%s%N) - TIMER_START) / 1000000 )); echo "${elapsed}ms"; }

# ────────────────────────────────────────────────────────────
# SQL Helper: run SQL through psql
# ────────────────────────────────────────────────────────────
run_sql() { echo "$1" | $PSQL -q 2>&1; }

run_sql_result() { echo "$1" | $PSQL -t -A 2>&1; }

# ────────────────────────────────────────────────────────────
# PHASE 0: Connectivity check
# ────────────────────────────────────────────────────────────
phase0_connectivity() {
    log "Phase 0: Checking database connectivity..."
    local ver
    ver=$(run_sql_result "SELECT version();") || fail "Cannot connect to database. Set DATABASE_URL."
    ok "Connected: ${ver:0:60}..."
}

# ────────────────────────────────────────────────────────────
# PHASE 1: Small smoke test
# ────────────────────────────────────────────────────────────
phase1_smoke_test() {
    log "Phase 1: Smoke test — 2 orgs, 10 users, 2 teams, 2 projects, 10 tasks"
    timer_start

    run_sql "
    DO \$\$
    DECLARE
        org1_id   UUID;
        org2_id   UUID;
        team1_id  UUID;
        team2_id  UUID;
        proj1_id  UUID;
        proj2_id  UUID;
        user_ids  UUID[] := ARRAY[]::UUID[];
        uid       UUID;
        root_id   UUID;
        child_id  UUID;
    BEGIN
        -- Create 10 test users
        FOR i IN 1..10 LOOP
            uid := gen_random_uuid();
            INSERT INTO users (id, email, display_name)
            VALUES (uid, 'smoke_user_' || i || '@test.com', 'Smoke User ' || i)
            ON CONFLICT (id) DO NOTHING;
            user_ids := array_append(user_ids, uid);
        END LOOP;

        -- Create 2 orgs
        INSERT INTO orgs (id, name, slug) VALUES (gen_random_uuid(), 'Smoke Org 1', 'smoke-org-1') RETURNING id INTO org1_id;
        INSERT INTO orgs (id, name, slug) VALUES (gen_random_uuid(), 'Smoke Org 2', 'smoke-org-2') RETURNING id INTO org2_id;

        -- Add users as org members
        FOR i IN 1..10 LOOP
            INSERT INTO org_members (org_id, user_id, role) VALUES (org1_id, user_ids[i], CASE WHEN i = 1 THEN 'owner' ELSE 'member' END) ON CONFLICT DO NOTHING;
            INSERT INTO org_members (org_id, user_id, role) VALUES (org2_id, user_ids[i], CASE WHEN i = 1 THEN 'owner' ELSE 'member' END) ON CONFLICT DO NOTHING;
        END LOOP;

        -- Create 2 teams
        INSERT INTO teams (id, org_id, name) VALUES (gen_random_uuid(), org1_id, 'Smoke Team A') RETURNING id INTO team1_id;
        INSERT INTO teams (id, org_id, name) VALUES (gen_random_uuid(), org1_id, 'Smoke Team B') RETURNING id INTO team2_id;

        -- Add members to teams
        FOR i IN 1..5 LOOP
            INSERT INTO team_members (team_id, user_id, role) VALUES (team1_id, user_ids[i], 'member') ON CONFLICT DO NOTHING;
        END LOOP;
        FOR i IN 6..10 LOOP
            INSERT INTO team_members (team_id, user_id, role) VALUES (team2_id, user_ids[i], 'member') ON CONFLICT DO NOTHING;
        END LOOP;

        -- Create 2 projects
        INSERT INTO projects (id, org_id, team_id, name, status) VALUES (gen_random_uuid(), org1_id, team1_id, 'Smoke Project Alpha', 'active') RETURNING id INTO proj1_id;
        INSERT INTO projects (id, org_id, team_id, name, status) VALUES (gen_random_uuid(), org1_id, team2_id, 'Smoke Project Beta', 'active') RETURNING id INTO proj2_id;

        -- Add members to projects
        FOR i IN 1..5 LOOP
            INSERT INTO project_members (project_id, user_id, role, source) VALUES (proj1_id, user_ids[i], 'contributor', 'direct') ON CONFLICT DO NOTHING;
        END LOOP;
        FOR i IN 6..10 LOOP
            INSERT INTO project_members (project_id, user_id, role, source) VALUES (proj2_id, user_ids[i], 'contributor', 'direct') ON CONFLICT DO NOTHING;
        END LOOP;

        -- Create 10 tasks (5 per project, with 2-level depth)
        FOR i IN 1..3 LOOP
            INSERT INTO tasks (id, org_id, project_id, title, status, priority, assignee_id, assignee_ids, depth, position)
            VALUES (gen_random_uuid(), org1_id, proj1_id, 'Smoke Task P1-' || i, 'todo', 'medium', user_ids[i], ARRAY[user_ids[i]], 0, i)
            RETURNING id INTO root_id;
            -- Add a child
            IF i <= 2 THEN
                INSERT INTO tasks (org_id, project_id, parent_task_id, title, status, priority, assignee_id, assignee_ids, depth, position)
                VALUES (org1_id, proj1_id, root_id, 'Smoke Subtask P1-' || i || '-1', 'todo', 'low', user_ids[i], ARRAY[user_ids[i]], 1, 1);
            END IF;
        END LOOP;
        FOR i IN 1..3 LOOP
            INSERT INTO tasks (id, org_id, project_id, title, status, priority, assignee_id, assignee_ids, depth, position)
            VALUES (gen_random_uuid(), org1_id, proj2_id, 'Smoke Task P2-' || i, 'in_progress', 'high', user_ids[i+5], ARRAY[user_ids[i+5]], 0, i)
            RETURNING id INTO root_id;
            IF i <= 2 THEN
                INSERT INTO tasks (org_id, project_id, parent_task_id, title, status, priority, assignee_id, assignee_ids, depth, position)
                VALUES (org1_id, proj2_id, root_id, 'Smoke Subtask P2-' || i || '-1', 'todo', 'medium', user_ids[i+5], ARRAY[user_ids[i+5]], 1, 1);
            END IF;
        END LOOP;

        RAISE NOTICE 'Smoke test data created: org1=%, org2=%', org1_id, org2_id;
    END \$\$;
    " || fail "Phase 1 failed"

    local counts
    counts=$(run_sql_result "
        SELECT json_build_object(
            'orgs', (SELECT count(*) FROM orgs WHERE slug LIKE 'smoke%'),
            'users', (SELECT count(*) FROM users WHERE email LIKE 'smoke%'),
            'teams', (SELECT count(*) FROM teams WHERE name LIKE 'Smoke%'),
            'projects', (SELECT count(*) FROM projects WHERE name LIKE 'Smoke%'),
            'tasks', (SELECT count(*) FROM tasks WHERE title LIKE 'Smoke%')
        );
    ")
    ok "Phase 1 complete ($(timer_end)): $counts"
}

# ────────────────────────────────────────────────────────────
# PHASE 2: Full load for primary org
# ────────────────────────────────────────────────────────────
phase2_full_load() {
    log "Phase 2: Full load — 200 members, 100 teams, 50 projects, 10,000 tasks (4 levels)"
    timer_start

    # Step 1: Create primary user and org
    log "  Creating primary org + 200 users..."
    run_sql "
    DO \$\$
    DECLARE
        main_user_id UUID;
        main_org_id  UUID;
        uid          UUID;
    BEGIN
        -- Primary user (b@b.com)
        main_user_id := gen_random_uuid();
        INSERT INTO users (id, email, display_name) VALUES (main_user_id, 'b@b.com', 'Benchmark User')
        ON CONFLICT DO NOTHING;

        -- If b@b.com already exists, get its id
        SELECT id INTO main_user_id FROM users WHERE email = 'b@b.com';

        -- Main org
        INSERT INTO orgs (id, name, slug) VALUES (gen_random_uuid(), 'Perf Test Org', 'perf-test-org')
        ON CONFLICT (slug) DO UPDATE SET name = 'Perf Test Org'
        RETURNING id INTO main_org_id;

        -- Store IDs for later phases
        PERFORM set_config('seed.main_user_id', main_user_id::text, false);
        PERFORM set_config('seed.main_org_id', main_org_id::text, false);

        -- Owner membership
        INSERT INTO org_members (org_id, user_id, role) VALUES (main_org_id, main_user_id, 'owner') ON CONFLICT DO NOTHING;

        -- Create 200 users + org memberships
        FOR i IN 1..200 LOOP
            uid := gen_random_uuid();
            INSERT INTO users (id, email, display_name)
            VALUES (uid, 'perf_user_' || i || '@test.com', 'Perf User ' || i)
            ON CONFLICT (id) DO NOTHING;
            INSERT INTO org_members (org_id, user_id, role)
            VALUES (main_org_id, uid, CASE WHEN i <= 5 THEN 'admin' ELSE 'member' END)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END \$\$;
    " || fail "Failed to create users/org"
    ok "  Users + org created"

    # Step 2: Create 100 teams with members
    log "  Creating 100 teams..."
    run_sql "
    DO \$\$
    DECLARE
        main_org_id UUID;
        tid UUID;
        user_ids UUID[];
    BEGIN
        SELECT id INTO main_org_id FROM orgs WHERE slug = 'perf-test-org';
        SELECT array_agg(user_id) INTO user_ids FROM org_members WHERE org_id = main_org_id AND role != 'owner';

        FOR i IN 1..100 LOOP
            INSERT INTO teams (id, org_id, name, description)
            VALUES (gen_random_uuid(), main_org_id, 'Perf Team ' || i, 'Performance test team ' || i)
            RETURNING id INTO tid;

            -- Each team gets 10-20 random members
            FOR j IN 1..((i % 11) + 10) LOOP
                BEGIN
                    INSERT INTO team_members (team_id, user_id, role)
                    VALUES (tid, user_ids[((i * 7 + j * 3) % array_length(user_ids, 1)) + 1],
                            CASE WHEN j = 1 THEN 'lead' ELSE 'member' END)
                    ON CONFLICT DO NOTHING;
                EXCEPTION WHEN OTHERS THEN NULL;
                END;
            END LOOP;
        END LOOP;
    END \$\$;
    " || fail "Failed to create teams"
    ok "  100 teams created"

    # Step 3: Create 50 projects with members + project_teams
    log "  Creating 50 projects..."
    run_sql "
    DO \$\$
    DECLARE
        main_org_id UUID;
        main_user_id UUID;
        pid UUID;
        team_ids UUID[];
        user_ids UUID[];
        tid UUID;
    BEGIN
        SELECT id INTO main_org_id FROM orgs WHERE slug = 'perf-test-org';
        SELECT id INTO main_user_id FROM users WHERE email = 'b@b.com';
        SELECT array_agg(id) INTO team_ids FROM teams WHERE org_id = main_org_id AND name LIKE 'Perf Team%';
        SELECT array_agg(user_id) INTO user_ids FROM org_members WHERE org_id = main_org_id;

        FOR i IN 1..50 LOOP
            tid := team_ids[((i - 1) % array_length(team_ids, 1)) + 1];
            INSERT INTO projects (id, org_id, team_id, name, description, status, created_by)
            VALUES (gen_random_uuid(), main_org_id, tid,
                    'Perf Project ' || i, 'Performance test project ' || i, 'active', main_user_id)
            RETURNING id INTO pid;

            -- Link 2 teams per project
            INSERT INTO project_teams (project_id, team_id) VALUES (pid, tid) ON CONFLICT DO NOTHING;
            INSERT INTO project_teams (project_id, team_id)
            VALUES (pid, team_ids[((i + 17) % array_length(team_ids, 1)) + 1]) ON CONFLICT DO NOTHING;

            -- Add 15-25 direct members per project
            FOR j IN 1..((i % 11) + 15) LOOP
                BEGIN
                    INSERT INTO project_members (project_id, user_id, role, source)
                    VALUES (pid, user_ids[((i * 13 + j * 7) % array_length(user_ids, 1)) + 1],
                            CASE WHEN j = 1 THEN 'lead' ELSE 'contributor' END, 'direct')
                    ON CONFLICT DO NOTHING;
                EXCEPTION WHEN OTHERS THEN NULL;
                END;
            END LOOP;

            -- Always add b@b.com
            INSERT INTO project_members (project_id, user_id, role, source)
            VALUES (pid, main_user_id, 'lead', 'direct') ON CONFLICT DO NOTHING;
        END LOOP;
    END \$\$;
    " || fail "Failed to create projects"
    ok "  50 projects created"

    # Step 4: Create 10,000 tasks across 4 depth levels (parallelized by project)
    log "  Creating 10,000 tasks across 4 depth levels (parallelized)..."

    # Generate SQL files for parallel execution
    local tmpdir
    tmpdir=$(mktemp -d)

    # Each project gets ~200 tasks: 50 root → 60 L1 → 50 L2 → 40 L3 = 200 per project × 50 = 10,000
    for proj_idx in $(seq 1 50); do
        cat > "${tmpdir}/tasks_${proj_idx}.sql" << 'EOSQL'
DO $$
DECLARE
    main_org_id  UUID;
    proj_id      UUID;
    proj_ids     UUID[];
    user_ids     UUID[];
    root_ids     UUID[] := ARRAY[]::UUID[];
    l1_ids       UUID[] := ARRAY[]::UUID[];
    l2_ids       UUID[] := ARRAY[]::UUID[];
    tid          UUID;
    statuses     TEXT[] := ARRAY['todo', 'in_progress', 'in_review', 'done'];
    priorities   TEXT[] := ARRAY['low', 'medium', 'high', 'critical'];
    labels_pool  TEXT[] := ARRAY['bug', 'feature', 'docs', 'refactor', 'critical', 'frontend', 'backend', 'api', 'enhancement', 'testing'];
    proj_num     INT;
BEGIN
    SELECT id INTO main_org_id FROM orgs WHERE slug = 'perf-test-org';
    SELECT array_agg(id ORDER BY name) INTO proj_ids FROM projects WHERE org_id = main_org_id AND name LIKE 'Perf Project%';
    SELECT array_agg(user_id) INTO user_ids FROM org_members WHERE org_id = main_org_id;

EOSQL
        # Inject project number
        echo "    proj_num := ${proj_idx};" >> "${tmpdir}/tasks_${proj_idx}.sql"
        cat >> "${tmpdir}/tasks_${proj_idx}.sql" << 'EOSQL'
    proj_id := proj_ids[proj_num];
    IF proj_id IS NULL THEN RETURN; END IF;

    -- Depth 0: 50 root tasks
    FOR i IN 1..50 LOOP
        tid := gen_random_uuid();
        INSERT INTO tasks (id, org_id, project_id, parent_task_id, title, description, status, priority,
            assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date,
            estimated_hours, labels, metadata)
        VALUES (
            tid, main_org_id, proj_id, NULL,
            'P' || proj_num || ' Task ' || i,
            'Description for task ' || i || ' in project ' || proj_num || '. This is a performance test task with enough text to be realistic.',
            statuses[(i % 4) + 1],
            priorities[(i % 4) + 1],
            user_ids[(i % array_length(user_ids, 1)) + 1],
            ARRAY[user_ids[(i % array_length(user_ids, 1)) + 1]],
            user_ids[((i + 3) % array_length(user_ids, 1)) + 1],
            0, i,
            CASE WHEN i % 3 = 0 THEN now() + (i || ' days')::interval ELSE NULL END,
            CASE WHEN i % 4 = 0 THEN now() - (i || ' days')::interval ELSE NULL END,
            (random() * 40)::decimal(8,2),
            ARRAY[labels_pool[(i % 10) + 1]],
            jsonb_build_object('source', 'perf-seed', 'idx', i)
        );
        root_ids := array_append(root_ids, tid);
    END LOOP;

    -- Depth 1: ~60 tasks (first 30 roots each get 2 children)
    FOR i IN 1..30 LOOP
        FOR c IN 1..2 LOOP
            tid := gen_random_uuid();
            INSERT INTO tasks (id, org_id, project_id, parent_task_id, title, description, status, priority,
                assignee_id, assignee_ids, depth, position, labels, metadata)
            VALUES (
                tid, main_org_id, proj_id, root_ids[i],
                'P' || proj_num || ' T' || i || ' Sub-' || c,
                'Subtask ' || c || ' of task ' || i,
                statuses[((i + c) % 4) + 1],
                priorities[((i + c) % 4) + 1],
                user_ids[((i * 3 + c) % array_length(user_ids, 1)) + 1],
                ARRAY[user_ids[((i * 3 + c) % array_length(user_ids, 1)) + 1]],
                1, c,
                ARRAY[labels_pool[((i + c) % 10) + 1]],
                '{}'::jsonb
            );
            l1_ids := array_append(l1_ids, tid);
        END LOOP;
    END LOOP;

    -- Depth 2: ~50 tasks (first 25 L1 tasks each get 2 children)
    FOR i IN 1..25 LOOP
        FOR c IN 1..2 LOOP
            tid := gen_random_uuid();
            INSERT INTO tasks (id, org_id, project_id, parent_task_id, title, description, status, priority,
                assignee_id, assignee_ids, depth, position, labels, metadata)
            VALUES (
                tid, main_org_id, proj_id, l1_ids[i],
                'P' || proj_num || ' L2-' || i || '-' || c,
                'Level 2 subtask',
                statuses[((i + c + 1) % 4) + 1],
                priorities[((i + c + 1) % 4) + 1],
                user_ids[((i * 5 + c) % array_length(user_ids, 1)) + 1],
                ARRAY[user_ids[((i * 5 + c) % array_length(user_ids, 1)) + 1]],
                2, c,
                ARRAY[]::TEXT[],
                '{}'::jsonb
            );
            l2_ids := array_append(l2_ids, tid);
        END LOOP;
    END LOOP;

    -- Depth 3: ~40 tasks (first 20 L2 tasks each get 2 children)
    FOR i IN 1..20 LOOP
        FOR c IN 1..2 LOOP
            INSERT INTO tasks (org_id, project_id, parent_task_id, title, description, status, priority,
                assignee_id, assignee_ids, depth, position, labels, metadata)
            VALUES (
                main_org_id, proj_id, l2_ids[i],
                'P' || proj_num || ' L3-' || i || '-' || c,
                'Level 3 leaf task',
                statuses[((i + c + 2) % 4) + 1],
                priorities[((i + c + 2) % 4) + 1],
                user_ids[((i * 7 + c) % array_length(user_ids, 1)) + 1],
                ARRAY[user_ids[((i * 7 + c) % array_length(user_ids, 1)) + 1]],
                3, c,
                ARRAY[]::TEXT[],
                '{}'::jsonb
            );
        END LOOP;
    END LOOP;
END $$;
EOSQL
    done

    # Run in parallel batches
    local pids=()
    local batch=0
    for sql_file in "${tmpdir}"/tasks_*.sql; do
        psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$sql_file" &
        pids+=($!)
        batch=$((batch + 1))
        if (( batch % PARALLEL_JOBS == 0 )); then
            for pid in "${pids[@]}"; do wait "$pid" || fail "Task creation failed (pid $pid)"; done
            pids=()
        fi
    done
    # Wait for remaining
    for pid in "${pids[@]}"; do wait "$pid" || fail "Task creation failed (pid $pid)"; done

    rm -rf "$tmpdir"
    ok "  Tasks created"

    # Verify counts
    local counts
    counts=$(run_sql_result "
        SELECT json_build_object(
            'users', (SELECT count(*) FROM users WHERE email LIKE 'perf_%' OR email = 'b@b.com'),
            'teams', (SELECT count(*) FROM teams WHERE name LIKE 'Perf Team%'),
            'projects', (SELECT count(*) FROM projects WHERE name LIKE 'Perf Project%'),
            'tasks', (SELECT count(*) FROM tasks WHERE title LIKE 'P%' AND org_id = (SELECT id FROM orgs WHERE slug = 'perf-test-org')),
            'depth_0', (SELECT count(*) FROM tasks WHERE depth = 0 AND org_id = (SELECT id FROM orgs WHERE slug = 'perf-test-org') AND title LIKE 'P%'),
            'depth_1', (SELECT count(*) FROM tasks WHERE depth = 1 AND org_id = (SELECT id FROM orgs WHERE slug = 'perf-test-org') AND title LIKE 'P%'),
            'depth_2', (SELECT count(*) FROM tasks WHERE depth = 2 AND org_id = (SELECT id FROM orgs WHERE slug = 'perf-test-org') AND title LIKE 'P%'),
            'depth_3', (SELECT count(*) FROM tasks WHERE depth = 3 AND org_id = (SELECT id FROM orgs WHERE slug = 'perf-test-org') AND title LIKE 'P%')
        );
    ")
    ok "Phase 2 complete ($(timer_end)): $counts"
}

# ────────────────────────────────────────────────────────────
# PHASE 3: Clone to 20 additional orgs
# ────────────────────────────────────────────────────────────
phase3_clone_orgs() {
    log "Phase 3: Cloning data to 20 additional orgs (parallelized)..."
    timer_start

    local tmpdir
    tmpdir=$(mktemp -d)

    for org_num in $(seq 1 20); do
        cat > "${tmpdir}/clone_org_${org_num}.sql" << EOSQL
DO \$\$
DECLARE
    src_org_id    UUID;
    new_org_id    UUID;
    new_user_id   UUID;
    org_num       INT := ${org_num};
    uid           UUID;
    old_tid       UUID;
    new_tid       UUID;
    old_pid       UUID;
    new_pid       UUID;
    old_team_id   UUID;
    new_team_id   UUID;
    team_map      JSONB := '{}';
    proj_map      JSONB := '{}';
    task_map      JSONB := '{}';
    r             RECORD;
BEGIN
    SELECT id INTO src_org_id FROM orgs WHERE slug = 'perf-test-org';
    IF src_org_id IS NULL THEN RAISE EXCEPTION 'Source org not found'; END IF;

    -- Create new org
    INSERT INTO orgs (id, name, slug)
    VALUES (gen_random_uuid(), 'Clone Org ' || org_num, 'clone-org-' || org_num)
    ON CONFLICT (slug) DO UPDATE SET name = 'Clone Org ' || org_num
    RETURNING id INTO new_org_id;

    -- Create users with regex-swapped emails (perf_user_N@ → clone{org_num}_user_N@)
    FOR r IN SELECT * FROM users WHERE email LIKE 'perf_user_%@test.com' LOOP
        uid := gen_random_uuid();
        INSERT INTO users (id, email, display_name)
        VALUES (uid,
                regexp_replace(r.email, '^perf_user_', 'c' || org_num || '_user_'),
                regexp_replace(r.display_name, '^Perf User ', 'C' || org_num || ' User '))
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO org_members (org_id, user_id, role)
        VALUES (new_org_id, uid, 'member') ON CONFLICT DO NOTHING;
    END LOOP;

    -- Create org owner
    new_user_id := gen_random_uuid();
    INSERT INTO users (id, email, display_name)
    VALUES (new_user_id, 'owner_c' || org_num || '@test.com', 'Owner Clone ' || org_num)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO org_members (org_id, user_id, role)
    VALUES (new_org_id, new_user_id, 'owner') ON CONFLICT DO NOTHING;

    -- Clone teams
    FOR r IN SELECT * FROM teams WHERE org_id = src_org_id AND name LIKE 'Perf Team%' LOOP
        new_team_id := gen_random_uuid();
        INSERT INTO teams (id, org_id, name, description)
        VALUES (new_team_id, new_org_id, regexp_replace(r.name, '^Perf ', 'C' || org_num || ' '), r.description);
        team_map := team_map || jsonb_build_object(r.id::text, new_team_id::text);
    END LOOP;

    -- Clone projects (use first new team as team_id)
    FOR r IN SELECT * FROM projects WHERE org_id = src_org_id AND name LIKE 'Perf Project%' LOOP
        new_pid := gen_random_uuid();
        old_team_id := r.team_id;
        new_team_id := (team_map ->> old_team_id::text)::UUID;
        IF new_team_id IS NULL THEN
            SELECT id INTO new_team_id FROM teams WHERE org_id = new_org_id LIMIT 1;
        END IF;
        INSERT INTO projects (id, org_id, team_id, name, description, status)
        VALUES (new_pid, new_org_id, new_team_id,
                regexp_replace(r.name, '^Perf ', 'C' || org_num || ' '),
                r.description, r.status);
        proj_map := proj_map || jsonb_build_object(r.id::text, new_pid::text);
    END LOOP;

    -- Get new user IDs for assignment
    DECLARE
        new_user_ids UUID[];
    BEGIN
        SELECT array_agg(user_id) INTO new_user_ids FROM org_members WHERE org_id = new_org_id;

        -- Clone tasks depth-by-depth so parent references work
        -- Depth 0
        FOR r IN SELECT * FROM tasks WHERE org_id = src_org_id AND depth = 0 AND title LIKE 'P%' ORDER BY project_id, position LOOP
            new_pid := (proj_map ->> r.project_id::text)::UUID;
            IF new_pid IS NULL THEN CONTINUE; END IF;
            new_tid := gen_random_uuid();
            INSERT INTO tasks (id, org_id, project_id, parent_task_id, title, description, status, priority,
                assignee_id, assignee_ids, depth, position, due_date, start_date, estimated_hours, labels, metadata)
            VALUES (new_tid, new_org_id, new_pid, NULL,
                regexp_replace(r.title, '^P', 'C' || org_num || 'P'),
                r.description, r.status, r.priority,
                new_user_ids[(random() * (array_length(new_user_ids, 1) - 1))::int + 1],
                ARRAY[new_user_ids[(random() * (array_length(new_user_ids, 1) - 1))::int + 1]],
                0, r.position, r.due_date, r.start_date, r.estimated_hours, r.labels, r.metadata);
            task_map := task_map || jsonb_build_object(r.id::text, new_tid::text);
        END LOOP;

        -- Depth 1
        FOR r IN SELECT * FROM tasks WHERE org_id = src_org_id AND depth = 1 AND title LIKE 'P%' ORDER BY project_id, position LOOP
            new_pid := (proj_map ->> r.project_id::text)::UUID;
            old_tid := (task_map ->> r.parent_task_id::text)::UUID;
            IF new_pid IS NULL OR old_tid IS NULL THEN CONTINUE; END IF;
            new_tid := gen_random_uuid();
            INSERT INTO tasks (id, org_id, project_id, parent_task_id, title, description, status, priority,
                assignee_id, assignee_ids, depth, position, labels, metadata)
            VALUES (new_tid, new_org_id, new_pid, old_tid,
                regexp_replace(r.title, '^P', 'C' || org_num || 'P'),
                r.description, r.status, r.priority,
                new_user_ids[(random() * (array_length(new_user_ids, 1) - 1))::int + 1],
                ARRAY[new_user_ids[(random() * (array_length(new_user_ids, 1) - 1))::int + 1]],
                1, r.position, r.labels, r.metadata);
            task_map := task_map || jsonb_build_object(r.id::text, new_tid::text);
        END LOOP;

        -- Depth 2
        FOR r IN SELECT * FROM tasks WHERE org_id = src_org_id AND depth = 2 AND title LIKE 'P%' ORDER BY project_id, position LOOP
            new_pid := (proj_map ->> r.project_id::text)::UUID;
            old_tid := (task_map ->> r.parent_task_id::text)::UUID;
            IF new_pid IS NULL OR old_tid IS NULL THEN CONTINUE; END IF;
            new_tid := gen_random_uuid();
            INSERT INTO tasks (id, org_id, project_id, parent_task_id, title, description, status, priority,
                assignee_id, assignee_ids, depth, position, labels, metadata)
            VALUES (new_tid, new_org_id, new_pid, old_tid,
                regexp_replace(r.title, '^P', 'C' || org_num || 'P'),
                r.description, r.status, r.priority,
                new_user_ids[(random() * (array_length(new_user_ids, 1) - 1))::int + 1],
                ARRAY[new_user_ids[(random() * (array_length(new_user_ids, 1) - 1))::int + 1]],
                2, r.position, r.labels, r.metadata);
            task_map := task_map || jsonb_build_object(r.id::text, new_tid::text);
        END LOOP;

        -- Depth 3
        FOR r IN SELECT * FROM tasks WHERE org_id = src_org_id AND depth = 3 AND title LIKE 'P%' ORDER BY project_id, position LOOP
            new_pid := (proj_map ->> r.project_id::text)::UUID;
            old_tid := (task_map ->> r.parent_task_id::text)::UUID;
            IF new_pid IS NULL OR old_tid IS NULL THEN CONTINUE; END IF;
            INSERT INTO tasks (org_id, project_id, parent_task_id, title, description, status, priority,
                assignee_id, assignee_ids, depth, position, labels, metadata)
            VALUES (new_org_id, new_pid, old_tid,
                regexp_replace(r.title, '^P', 'C' || org_num || 'P'),
                r.description, r.status, r.priority,
                new_user_ids[(random() * (array_length(new_user_ids, 1) - 1))::int + 1],
                ARRAY[new_user_ids[(random() * (array_length(new_user_ids, 1) - 1))::int + 1]],
                3, r.position, r.labels, r.metadata);
        END LOOP;
    END;
END \$\$;
EOSQL
    done

    # Run in parallel
    local pids=()
    local batch=0
    for sql_file in "${tmpdir}"/clone_org_*.sql; do
        psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$sql_file" &
        pids+=($!)
        batch=$((batch + 1))
        if (( batch % PARALLEL_JOBS == 0 )); then
            for pid in "${pids[@]}"; do wait "$pid" || warn "Clone batch had errors (pid $pid)"; done
            pids=()
            log "  Cloned $batch / 20 orgs..."
        fi
    done
    for pid in "${pids[@]}"; do wait "$pid" || warn "Clone had errors (pid $pid)"; done

    rm -rf "$tmpdir"

    local counts
    counts=$(run_sql_result "
        SELECT json_build_object(
            'total_orgs', (SELECT count(*) FROM orgs),
            'total_users', (SELECT count(*) FROM users),
            'total_teams', (SELECT count(*) FROM teams),
            'total_projects', (SELECT count(*) FROM projects),
            'total_tasks', (SELECT count(*) FROM tasks),
            'clone_orgs', (SELECT count(*) FROM orgs WHERE slug LIKE 'clone-org-%')
        );
    ")
    ok "Phase 3 complete ($(timer_end)): $counts"
}

# ────────────────────────────────────────────────────────────
# PHASE 4: Performance benchmark
# ────────────────────────────────────────────────────────────
phase4_benchmark() {
    log "Phase 4: Performance benchmarks"
    echo ""
    echo "============================================================"
    echo "  PERFORMANCE BENCHMARKS"
    echo "============================================================"

    local main_org_id proj_id user_id

    main_org_id=$(run_sql_result "SELECT id FROM orgs WHERE slug = 'perf-test-org';")
    proj_id=$(run_sql_result "SELECT id FROM projects WHERE org_id = '$main_org_id' AND name LIKE 'Perf Project%' ORDER BY name LIMIT 1;")
    user_id=$(run_sql_result "SELECT id FROM users WHERE email = 'b@b.com' LIMIT 1;")

    echo ""
    echo "  Org: $main_org_id | Project: $proj_id | User: $user_id"
    echo ""

    # Benchmark queries
    local queries=(
        "Task list (paginated 50)|SELECT * FROM tasks WHERE project_id = '$proj_id' ORDER BY position LIMIT 50"
        "Task tree (project)|SELECT * FROM tasks WHERE project_id = '$proj_id' ORDER BY depth, position, created_at LIMIT 500"
        "Task tree LIGHT|SELECT id, org_id, project_id, parent_task_id, title, '' as description, status, priority, assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours, labels, '{}'::jsonb as metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at FROM tasks WHERE project_id = '$proj_id' ORDER BY depth, position, created_at LIMIT 500"
        "Task count (project)|SELECT count(*) FROM tasks WHERE project_id = '$proj_id'"
        "Task count (org)|SELECT count(*) FROM tasks WHERE org_id = '$main_org_id'"
        "Task count (total DB)|SELECT count(*) FROM tasks"
        "Project members|SELECT m.*, u.email, u.display_name FROM project_members m LEFT JOIN users u ON u.id = m.user_id WHERE m.project_id = '$proj_id' LIMIT 20"
        "Org members list|SELECT * FROM org_members WHERE org_id = '$main_org_id'"
        "Permission check (direct member)|SELECT m.role FROM project_members m WHERE m.project_id = '$proj_id' AND m.user_id = '$user_id'"
        "Permission check (team inheritance)|SELECT tm.role FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.team_id WHERE pt.project_id = '$proj_id' AND tm.user_id = '$user_id' LIMIT 1"
        "Task search (ILIKE)|SELECT * FROM tasks WHERE project_id = '$proj_id' AND title ILIKE '%Task 2%' LIMIT 20"
        "Tasks by assignee|SELECT * FROM tasks WHERE org_id = '$main_org_id' AND assignee_id = '$user_id' ORDER BY due_date NULLS LAST LIMIT 50"
        "Tasks by status|SELECT * FROM tasks WHERE org_id = '$main_org_id' AND project_id = '$proj_id' AND status = 'todo' LIMIT 50"
        "Dashboard stats|SELECT status, count(*) FROM tasks WHERE org_id = '$main_org_id' GROUP BY status"
        "Recursive tree (single root)|WITH RECURSIVE tt AS (SELECT * FROM tasks WHERE id = (SELECT id FROM tasks WHERE project_id='$proj_id' AND depth=0 LIMIT 1) UNION ALL SELECT t.* FROM tasks t JOIN tt ON t.parent_task_id = tt.id WHERE t.depth <= 3) SELECT count(*) FROM tt"
    )

    printf "  %-40s %10s %10s %10s\n" "QUERY" "MIN" "AVG" "MAX"
    printf "  %-40s %10s %10s %10s\n" "─────" "───" "───" "───"

    for entry in "${queries[@]}"; do
        local label="${entry%%|*}"
        local query="${entry#*|}"

        # Run 5 times, parse Execution Time from EXPLAIN ANALYZE (in ms with decimals)
        local times=()
        for _ in $(seq 1 5); do
            local explain_out
            explain_out=$(run_sql_result "EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) $query" 2>&1)
            local exec_time
            exec_time=$(echo "$explain_out" | sed -n 's/.*Execution Time: \([0-9.]*\).*/\1/p' | head -1)
            if [ -z "$exec_time" ]; then
                exec_time="0"
            fi
            # Convert to integer ms (multiply by 100 for 2-decimal precision then divide)
            local exec_ms=$(echo "$exec_time" | awk '{printf "%.2f", $1}')
            times+=("$exec_ms")
        done

        # Calculate min/avg/max using awk
        local stats
        stats=$(printf '%s\n' "${times[@]}" | awk '
            NR==1 { min=$1; max=$1; sum=0 }
            { sum+=$1; if($1<min)min=$1; if($1>max)max=$1 }
            END { printf "%.2f %.2f %.2f", min, sum/NR, max }
        ')
        local min_ms=$(echo "$stats" | awk '{print $1}')
        local avg_ms=$(echo "$stats" | awk '{print $2}')
        local max_ms=$(echo "$stats" | awk '{print $3}')

        local avg_int=$(echo "$avg_ms" | awk '{printf "%d", $1}')
        local color=$GREEN
        (( avg_int > 100 )) && color=$YELLOW
        (( avg_int > 200 )) && color=$RED

        printf "  %-40s %10s %s%10s${NC} %10s\n" "$label" "${min_ms}ms" "$color" "${avg_ms}ms" "${max_ms}ms"
    done

    echo ""
    echo "============================================================"
    echo "  DATABASE SIZE"
    echo "============================================================"
    run_sql_result "
        SELECT format('  %-25s %s', relname, pg_size_pretty(pg_total_relation_size(oid)))
        FROM pg_class
        WHERE relkind = 'r' AND relname IN ('tasks','projects','teams','org_members','project_members','team_members','users','orgs')
        ORDER BY pg_total_relation_size(oid) DESC;
    "
    echo ""

    local total_tasks total_size
    total_tasks=$(run_sql_result "SELECT count(*) FROM tasks;")
    total_size=$(run_sql_result "SELECT pg_size_pretty(pg_database_size(current_database()));")
    echo "  Total tasks: $total_tasks | DB size: $total_size"
    echo "============================================================"
}

# ────────────────────────────────────────────────────────────
# CLEANUP: Remove all seeded data
# ────────────────────────────────────────────────────────────
cleanup() {
    log "Cleaning up all performance test data..."
    run_sql "
        DELETE FROM tasks WHERE org_id IN (SELECT id FROM orgs WHERE slug LIKE 'perf-test%' OR slug LIKE 'clone-org-%' OR slug LIKE 'smoke-org-%');
        DELETE FROM orgs WHERE slug LIKE 'perf-test%' OR slug LIKE 'clone-org-%' OR slug LIKE 'smoke-org-%';
        DELETE FROM users WHERE email LIKE 'perf_%' OR email LIKE 'smoke_%' OR email LIKE 'c%_user_%' OR email LIKE 'owner_c%';
    "
    ok "Cleanup complete"
}

# ────────────────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────────────────
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  OrbisPM Performance Seed & Benchmark                   ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""

    case "${1:-all}" in
        smoke)     phase0_connectivity; phase1_smoke_test ;;
        load)      phase0_connectivity; phase2_full_load ;;
        clone)     phase0_connectivity; phase3_clone_orgs ;;
        bench)     phase0_connectivity; phase4_benchmark ;;
        cleanup)   phase0_connectivity; cleanup ;;
        all)
            phase0_connectivity
            phase1_smoke_test
            phase2_full_load
            phase3_clone_orgs
            phase4_benchmark
            ;;
        *)
            echo "Usage: $0 {smoke|load|clone|bench|cleanup|all}"
            exit 1
            ;;
    esac
}

main "$@"
