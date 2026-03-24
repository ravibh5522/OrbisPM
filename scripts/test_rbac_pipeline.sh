#!/bin/bash
set -uo pipefail

BASE="http://localhost:8000/api/v1"
ORG="4a133658-1a9c-49e9-a524-5cf823d1ed72"
PROJ="e4d1cb9d-8b86-4e30-9d9b-c777af189b15"
TASK="42168461-dc21-4169-af5a-e81cb09adec4"

login() {
  local email=$1 pass=$2
  local resp
  resp=$(curl -s "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}")
  local tok
  tok=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)
  if [ -z "$tok" ]; then
    return 1
  fi
  echo "$tok"
}

http_code() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

http_body() {
  curl -sf "$@" 2>/dev/null || echo '{"error":"request_failed"}'
}

echo "========================================="
echo "  PHASE 1: LOGIN ALL USERS"
echo "========================================="

T_ADMIN=$(login "admin@orbispm.local" "Admin123!")
echo "✓ admin (owner) logged in"

T_ADMIN2=$(login "admin2@orbispm.local" "Test@1234!" || echo "")
if [ -z "$T_ADMIN2" ]; then
  echo "⚠ admin2 login failed - skipping"
  T_ADMIN2=""
else
  echo "✓ admin2 (org admin) logged in"
fi

T_MEMBER1=$(login "member1@orbispm.local" "Test@1234!")
echo "✓ member1 (team_lead→project_lead) logged in"

T_MEMBER2=$(login "member2@orbispm.local" "Test@1234!")
echo "✓ member2 (senior_dev) logged in"

T_BILLING1=$(login "billing1@orbispm.local" "Test@1234!")
echo "✓ billing1 (qa_tester) logged in"

T_VIEWER1=$(login "viewer1@orbispm.local" "Test@1234!")
echo "✓ viewer1 (intern) logged in"

echo ""
echo "========================================="
echo "  PHASE 2: MY-PERMISSIONS PER ROLE"
echo "========================================="

check_perms() {
  local label=$1 token=$2
  echo ""
  echo "--- $label ---"
  http_body -H "Authorization: Bearer $token" \
    "$BASE/orgs/$ORG/projects/$PROJ/my-permissions" | python3 -c "
import sys,json
d = json.load(sys.stdin)
role = d.get('role','?')
perms = sorted([f'{p[\"resource\"]}.{p[\"action\"]}' for p in d.get('permissions',[])])
has_direct = 'tasks.direct_update' in perms
has_review = 'tasks.review' in perms
has_create = 'tasks.create' in perms
has_delete = 'tasks.delete' in perms
has_update = 'tasks.update' in perms
print(f'  Role: {role}')
print(f'  Permissions ({len(perms)}): {\", \".join(perms)}')
print(f'  tasks.create={has_create} tasks.update={has_update} tasks.direct_update={has_direct} tasks.review={has_review} tasks.delete={has_delete}')
" 2>/dev/null || echo "  FAILED (no access)"
}

check_perms "admin (owner)" "$T_ADMIN"
[ -n "$T_ADMIN2" ] && check_perms "admin2 (org admin, NO project membership)" "$T_ADMIN2" || echo "--- admin2 SKIPPED ---"
check_perms "member1 (team_lead→lead)" "$T_MEMBER1"
check_perms "member2 (senior_dev)" "$T_MEMBER2"
check_perms "billing1 (qa_tester)" "$T_BILLING1"
check_perms "viewer1 (intern)" "$T_VIEWER1"

echo ""
echo "========================================="
echo "  PHASE 3: ACCESS CONTROL TESTS"
echo "========================================="

test_access() {
  local label=$1 token=$2
  echo ""
  echo "--- $label ---"
  echo -n "  GET /projects:        "; http_code -H "Authorization: Bearer $token" "$BASE/orgs/$ORG/projects"
  echo ""
  echo -n "  GET /projects/{id}:   "; http_code -H "Authorization: Bearer $token" "$BASE/orgs/$ORG/projects/$PROJ"
  echo ""
  echo -n "  GET /tasks:           "; http_code -H "Authorization: Bearer $token" "$BASE/orgs/$ORG/projects/$PROJ/tasks"
  echo ""
  echo -n "  POST /tasks (create): "; http_code -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' "$BASE/orgs/$ORG/projects/$PROJ/tasks" -d "{\"title\":\"Test by $label\"}"
  echo ""
  echo -n "  PATCH /tasks (title): "; http_code -X PATCH -H "Authorization: Bearer $token" -H 'Content-Type: application/json' "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK" -d '{"title":"title change test"}'
  echo ""
}

test_access "admin (owner)" "$T_ADMIN"
[ -n "$T_ADMIN2" ] && test_access "admin2 (org admin)" "$T_ADMIN2" || echo "--- admin2 SKIPPED ---"
test_access "member1 (lead)" "$T_MEMBER1"
test_access "member2 (senior_dev)" "$T_MEMBER2"
test_access "billing1 (qa_tester)" "$T_BILLING1"
test_access "viewer1 (intern)" "$T_VIEWER1"

echo ""
echo "========================================="
echo "  PHASE 4: APPROVAL PIPELINE TEST"
echo "========================================="

# --- Step 0: Reset task to known state (admin/owner — direct update) ---
echo ""
echo "--- Step 0: Reset task status to 'todo' (admin/owner direct) ---"
RESET=$(curl -s -X PATCH -H "Authorization: Bearer $T_ADMIN" -H 'Content-Type: application/json' \
  "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK" -d '{"status":"todo","priority":"critical"}')
echo "  $(echo "$RESET" | python3 -c "
import sys,json
d = json.load(sys.stdin)
t = d.get('task',d)
print(f'Reset → status={t.get(\"status\",\"?\")}, priority={t.get(\"priority\",\"?\")}, pending_review={d.get(\"pending_review\",False)}')
" 2>/dev/null)"

# --- Step 1: senior_dev changes status → BYPASS review (has tasks.direct_update) ---
echo ""
echo "--- Step 1: senior_dev (member2) changes status → BYPASS review ---"
SD_RAW=$(curl -s -X PATCH -H "Authorization: Bearer $T_MEMBER2" -H 'Content-Type: application/json' \
  "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK" -d '{"status":"in_progress"}')
echo "  $(echo "$SD_RAW" | python3 -c "
import sys,json
d = json.load(sys.stdin)
t = d.get('task',d)
cr = d.get('change_request')
pending = d.get('pending_review', False)
applied = d.get('applied_changes', {})
status = t.get('status','?')
print(f'status={status}, pending_review={pending}, applied_changes={list(applied.keys())}')
if cr:
    print(f'  ⚠ UNEXPECTED change_request: id={cr.get(\"id\")}')
elif not pending:
    print(f'  ✓ Direct update confirmed (no change request)')
" 2>/dev/null)"

# Reset back
curl -s -X PATCH -H "Authorization: Bearer $T_ADMIN" -H 'Content-Type: application/json' \
  "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK" -d '{"status":"todo"}' > /dev/null
echo "  (reset to todo)"

# --- Step 2: intern (viewer1) changes status → CREATE change request ---
echo ""
echo "--- Step 2: intern (viewer1) changes status → should CREATE change request ---"
INTERN_RAW=$(curl -s -X PATCH -H "Authorization: Bearer $T_VIEWER1" -H 'Content-Type: application/json' \
  "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK" -d '{"status":"in_progress"}')
echo "  $(echo "$INTERN_RAW" | python3 -c "
import sys,json
d = json.load(sys.stdin)
if 'error' in d:
    print(f'ERROR: {d[\"error\"]} — {d.get(\"detail\",\"\")}')
    sys.exit(0)
t = d.get('task', d)
cr = d.get('change_request')
pending = d.get('pending_review', False)
applied = d.get('applied_changes', {})
print(f'task_status={t.get(\"status\",\"?\")}, pending_review={pending}')
if cr:
    print(f'  ✓ Change Request created: id={cr[\"id\"]}, status={cr[\"status\"]}, changes={cr.get(\"changes\",{})}')
elif pending:
    print(f'  ? pending_review=True but no change_request in response')
else:
    print(f'  ⚠ No change request — update may have applied directly')
" 2>/dev/null)"

# Extract CR ID
CR_ID=$(echo "$INTERN_RAW" | python3 -c "
import sys,json
d = json.load(sys.stdin)
cr = d.get('change_request')
if cr and cr.get('status') == 'pending':
    print(cr['id'])
" 2>/dev/null)
echo "  CR_ID=$CR_ID"

# --- Step 3: Verify task status still 'todo' (change is pending) ---
echo ""
echo "--- Step 3: Verify task status still 'todo' (change gated) ---"
TASK_CHECK=$(curl -s -H "Authorization: Bearer $T_ADMIN" "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK")
echo "  $(echo "$TASK_CHECK" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f'Current status: {d.get(\"status\",\"?\")}')
" 2>/dev/null)"

# --- Step 4: qa_tester APPROVES the change request ---
if [ -n "$CR_ID" ]; then
  echo ""
  echo "--- Step 4: qa_tester (billing1) APPROVES the change request ---"
  APPROVE_RAW=$(curl -s -X POST -H "Authorization: Bearer $T_BILLING1" -H 'Content-Type: application/json' \
    "$BASE/orgs/$ORG/change-requests/$CR_ID/approve" -d '{"note":"Looks good, approved by QA"}')
  echo "  $(echo "$APPROVE_RAW" | python3 -c "
import sys,json
d = json.load(sys.stdin)
if 'error' in d:
    print(f'ERROR: {d[\"error\"]} — {d.get(\"detail\",\"\")}')
else:
    print(f'CR status={d.get(\"status\",\"?\")}, reviewer_id={d.get(\"reviewer_id\",\"?\")}, note={d.get(\"review_note\",\"\")}')
" 2>/dev/null)"

  # --- Step 5: Verify task status auto-updated to 'in_progress' ---
  echo ""
  echo "--- Step 5: Verify task status auto-updated after approval ---"
  TASK_FINAL=$(curl -s -H "Authorization: Bearer $T_ADMIN" "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK")
  echo "  $(echo "$TASK_FINAL" | python3 -c "
import sys,json
d = json.load(sys.stdin)
status = d.get('status','?')
if status == 'in_progress':
    print(f'✓ Status auto-updated to: {status}')
else:
    print(f'⚠ Status is: {status} (expected: in_progress)')
" 2>/dev/null)"
else
  echo ""
  echo "  ⚠ No CR_ID found — skipping approval test"
fi

# Reset for next test
curl -s -X PATCH -H "Authorization: Bearer $T_ADMIN" -H 'Content-Type: application/json' \
  "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK" -d '{"status":"todo","priority":"critical"}' > /dev/null

# --- Step 6: Priority change pipeline (intern → qa_tester rejects) ---
echo ""
echo "--- Step 6: intern changes priority → qa_tester rejects ---"
PRIO_RAW=$(curl -s -X PATCH -H "Authorization: Bearer $T_VIEWER1" -H 'Content-Type: application/json' \
  "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK" -d '{"priority":"high"}')
echo "  $(echo "$PRIO_RAW" | python3 -c "
import sys,json
d = json.load(sys.stdin)
if 'error' in d:
    print(f'ERROR: {d[\"error\"]} — {d.get(\"detail\",\"\")}')
    sys.exit(0)
t = d.get('task',d)
cr = d.get('change_request')
pending = d.get('pending_review', False)
print(f'task_priority={t.get(\"priority\",\"?\")}, pending_review={pending}')
if cr:
    print(f'  ✓ Change Request: id={cr[\"id\"]}, changes={cr.get(\"changes\",{})}')
" 2>/dev/null)"

PRIO_CR_ID=$(echo "$PRIO_RAW" | python3 -c "
import sys,json
d = json.load(sys.stdin)
cr = d.get('change_request')
if cr and cr.get('status') == 'pending':
    print(cr['id'])
" 2>/dev/null)

if [ -n "$PRIO_CR_ID" ]; then
  # --- Step 7: qa_tester REJECTS the priority CR ---
  echo ""
  echo "--- Step 7: qa_tester REJECTS the priority change request ---"
  REJECT_RAW=$(curl -s -X POST -H "Authorization: Bearer $T_BILLING1" -H 'Content-Type: application/json' \
    "$BASE/orgs/$ORG/change-requests/$PRIO_CR_ID/reject" -d '{"note":"Priority should stay as-is"}')
  echo "  $(echo "$REJECT_RAW" | python3 -c "
import sys,json
d = json.load(sys.stdin)
if 'error' in d:
    print(f'ERROR: {d[\"error\"]} — {d.get(\"detail\",\"\")}')
else:
    print(f'✓ CR status={d.get(\"status\",\"?\")}, note={d.get(\"review_note\",\"\")}')
" 2>/dev/null)"

  # --- Step 8: Verify priority unchanged ---
  echo ""
  echo "--- Step 8: Verify priority unchanged after rejection ---"
  TASK_PRIO=$(curl -s -H "Authorization: Bearer $T_ADMIN" "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK")
  echo "  $(echo "$TASK_PRIO" | python3 -c "
import sys,json
d = json.load(sys.stdin)
prio = d.get('priority','?')
if prio == 'critical':
    print(f'✓ Priority unchanged: {prio}')
else:
    print(f'⚠ Priority changed to: {prio} (expected: critical)')
" 2>/dev/null)"
else
  echo "  ⚠ No priority CR_ID found — skipping reject test"
fi

# --- Step 9: qa_tester (with tasks.update but NOT direct_update) changes status ---
echo ""
echo "--- Step 9: qa_tester changes status → should CREATE change request ---"
QA_RAW=$(curl -s -X PATCH -H "Authorization: Bearer $T_BILLING1" -H 'Content-Type: application/json' \
  "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK" -d '{"status":"in_progress"}')
echo "  $(echo "$QA_RAW" | python3 -c "
import sys,json
d = json.load(sys.stdin)
if 'error' in d:
    print(f'ERROR: {d[\"error\"]} — {d.get(\"detail\",\"\")}')
    sys.exit(0)
t = d.get('task',d)
cr = d.get('change_request')
pending = d.get('pending_review', False)
print(f'task_status={t.get(\"status\",\"?\")}, pending_review={pending}')
if cr:
    print(f'  ✓ Change Request created: id={cr[\"id\"]}, status={cr[\"status\"]}')
else:
    print(f'  ⚠ No change request created — check if qa_tester has tasks.direct_update')
" 2>/dev/null)"

echo ""
echo "========================================="
echo "  PHASE 5: EDGE CASE TESTS"
echo "========================================="

# Edge case 1: Non-project-member org admin bypass
if [ -n "$T_ADMIN2" ]; then
  echo ""
  echo "--- admin2 (org admin, no project membership) ---"
  echo -n "  GET /tasks: "; http_code -H "Authorization: Bearer $T_ADMIN2" "$BASE/orgs/$ORG/projects/$PROJ/tasks"
  echo ""
  echo -n "  PATCH status: "
  A2_RAW=$(curl -s -X PATCH -H "Authorization: Bearer $T_ADMIN2" -H 'Content-Type: application/json' \
    "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK" -d '{"status":"todo"}')
  echo "$(echo "$A2_RAW" | python3 -c "
import sys,json
d = json.load(sys.stdin)
t = d.get('task',d)
print(f'status={t.get(\"status\",\"?\")}, pending={d.get(\"pending_review\",False)}, error={d.get(\"error\",\"none\")}')
" 2>/dev/null)"
else
  echo ""
  echo "--- admin2 SKIPPED (login failed) ---"
fi

# Edge case 2: intern tries to delete (should 403)
echo ""
echo "--- Intern tries to DELETE task (should 403) ---"
echo -n "  DELETE /tasks: "; http_code -X DELETE -H "Authorization: Bearer $T_VIEWER1" "$BASE/orgs/$ORG/projects/$PROJ/tasks/$TASK"
echo ""

# Edge case 3: qa_tester tries to create task (should 403)
echo ""
echo "--- QA Tester tries to CREATE task (should 403) ---"
echo -n "  POST /tasks: "; http_code -X POST -H "Authorization: Bearer $T_BILLING1" -H 'Content-Type: application/json' "$BASE/orgs/$ORG/projects/$PROJ/tasks" -d '{"title":"QA test task"}'
echo ""

echo ""
echo "========================================="
echo "  TEST COMPLETE"
echo "========================================="
echo ""
echo "EXPECTED ROLE BEHAVIOR:"
echo "  admin (owner):     Full access, direct updates (all fields)"
echo "  admin2 (org admin): Full access via org-admin bypass, direct updates"
echo "  member1 (lead):     Full access, direct updates"
echo "  member2 (senior_dev): tasks CRUD + direct updates (bypasses review)"
echo "  billing1 (qa_tester): tasks.read + tasks.update + tasks.review (creates CRs, can approve/reject)"
echo "  viewer1 (intern):    tasks.read + tasks.update (creates CRs, cannot approve/reject)"
