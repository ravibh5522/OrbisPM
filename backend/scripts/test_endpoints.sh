#!/bin/bash
set -e

BASE="http://localhost:8080/api/v1"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFsaWNlQHRlc3QuY29tIiwiZXhwIjoxNzcyMzk0OTUzLCJpYXQiOjE3NzIzMDg1NTMsInN1YiI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSJ9.gid4qxlj75qYHRJdEgBK3oS7iJK6sZfdgz8eQdzTRrI"
TOKEN2="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImJvYkB0ZXN0LmNvbSIsImV4cCI6MTc3MjM5NDk1MywiaWF0IjoxNzcyMzA4NTUzLCJzdWIiOiIyMjIyMjIyMi0yMjIyLTIyMjItMjIyMi0yMjIyMjIyMjIyMjIifQ.UXV7Npn19qtiD2huElPikHECPFCh8uo3caK9joYP51I"
AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"

USER1="11111111-1111-1111-1111-111111111111"
USER2="22222222-2222-2222-2222-222222222222"

PASS=0
FAIL=0

check() {
  local desc="$1"
  local expected_code="$2"
  local actual_code="$3"
  local body="$4"
  if [ "$actual_code" = "$expected_code" ]; then
    echo "✅ PASS: $desc (HTTP $actual_code)"
    PASS=$((PASS+1))
  else
    echo "❌ FAIL: $desc (expected $expected_code, got $actual_code)"
    echo "   Body: $body"
    FAIL=$((FAIL+1))
  fi
}

echo "=== OrbisPM API Endpoint Tests ==="
echo ""

# ============ HEALTH ============
echo "--- Health ---"
RESP=$(curl -s -w "\n%{http_code}" http://localhost:8080/health)
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /health" "200" "$CODE" "$BODY"

RESP=$(curl -s -w "\n%{http_code}" http://localhost:8080/health/ready)
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /health/ready" "200" "$CODE" "$BODY"

# ============ AUTH CHECK ============
echo ""
echo "--- Auth ---"
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs)
CODE=$(echo "$RESP" | tail -1)
check "GET /orgs without auth => 401" "401" "$CODE"

# ============ ORGS ============
echo ""
echo "--- Orgs ---"

# Create org
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs -H "$AUTH" -H "$CT" \
  -d '{"name":"Acme Corp","slug":"acme-corp"}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /orgs (create)" "201" "$CODE" "$BODY"

ORG_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   ORG_ID=$ORG_ID"

# List orgs
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /orgs (list)" "200" "$CODE" "$BODY"

# Get org
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /orgs/:orgId" "200" "$CODE" "$BODY"

# Update org
RESP=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/orgs/$ORG_ID -H "$AUTH" -H "$CT" \
  -d '{"name":"Acme Corp Updated"}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "PATCH /orgs/:orgId (update)" "200" "$CODE" "$BODY"

# ============ ORG MEMBERS ============
echo ""
echo "--- Org Members ---"

# Invite member
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/members/invite -H "$AUTH" -H "$CT" \
  -d "{\"user_id\":\"$USER2\",\"role\":\"member\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /orgs/:orgId/members/invite" "204" "$CODE" "$BODY"

# List members
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/members -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /orgs/:orgId/members" "200" "$CODE" "$BODY"

# Update member role
RESP=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/orgs/$ORG_ID/members/$USER2 -H "$AUTH" -H "$CT" \
  -d '{"role":"admin"}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "PATCH /orgs/:orgId/members/:userId" "204" "$CODE" "$BODY"

# Remove member
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID/members/$USER2 -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "DELETE /orgs/:orgId/members/:userId" "204" "$CODE" "$BODY"

# ============ TEAMS ============
echo ""
echo "--- Teams ---"

# Create team
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/teams -H "$AUTH" -H "$CT" \
  -d '{"name":"Engineering","description":"Dev team"}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /orgs/:orgId/teams (create)" "201" "$CODE" "$BODY"

TEAM_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   TEAM_ID=$TEAM_ID"

# List teams
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/teams -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /orgs/:orgId/teams (list)" "200" "$CODE" "$BODY"

# Get team
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/teams/$TEAM_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /orgs/:orgId/teams/:teamId" "200" "$CODE" "$BODY"

# Update team
RESP=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/orgs/$ORG_ID/teams/$TEAM_ID -H "$AUTH" -H "$CT" \
  -d '{"name":"Engineering Team"}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "PATCH /orgs/:orgId/teams/:teamId" "200" "$CODE" "$BODY"

# Add team member
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/teams/$TEAM_ID/members -H "$AUTH" -H "$CT" \
  -d "{\"user_id\":\"$USER2\",\"role\":\"member\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /orgs/:orgId/teams/:teamId/members" "204" "$CODE" "$BODY"

# List team members
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/teams/$TEAM_ID/members -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /orgs/:orgId/teams/:teamId/members" "200" "$CODE" "$BODY"

# Remove team member
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID/teams/$TEAM_ID/members/$USER2 -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "DELETE /orgs/:orgId/teams/:teamId/members/:userId" "204" "$CODE" "$BODY"

# ============ PROJECTS ============
echo ""
echo "--- Projects ---"

# Create project
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects -H "$AUTH" -H "$CT" \
  -d "{\"name\":\"OrbisPM\",\"description\":\"Main project\",\"team_id\":\"$TEAM_ID\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /orgs/:orgId/projects (create)" "201" "$CODE" "$BODY"

PROJECT_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   PROJECT_ID=$PROJECT_ID"

# List projects
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/projects -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /orgs/:orgId/projects (list)" "200" "$CODE" "$BODY"

# Get project
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/projects/$PROJECT_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /orgs/:orgId/projects/:projectId" "200" "$CODE" "$BODY"

# Update project
RESP=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/orgs/$ORG_ID/projects/$PROJECT_ID -H "$AUTH" -H "$CT" \
  -d '{"name":"OrbisPM v2"}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "PATCH /orgs/:orgId/projects/:projectId" "200" "$CODE" "$BODY"

# Add project member
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/members -H "$AUTH" -H "$CT" \
  -d "{\"user_id\":\"$USER2\",\"role\":\"contributor\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /projects/:projectId/members" "204" "$CODE" "$BODY"

# List project members
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/members -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /projects/:projectId/members" "200" "$CODE" "$BODY"

# Remove project member
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/members/$USER2 -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "DELETE /projects/:projectId/members/:userId" "204" "$CODE" "$BODY"

# ============ TASKS ============
echo ""
echo "--- Tasks ---"

# Create task
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks -H "$AUTH" -H "$CT" \
  -d '{"title":"Setup CI/CD","description":"Configure pipelines","priority":"high","labels":["devops","infra"]}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /tasks (create)" "201" "$CODE" "$BODY"

TASK_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   TASK_ID=$TASK_ID"

# Create subtask
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks -H "$AUTH" -H "$CT" \
  -d "{\"title\":\"Configure Docker\",\"parent_task_id\":\"$TASK_ID\",\"priority\":\"medium\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /tasks (create subtask)" "201" "$CODE" "$BODY"

SUBTASK_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   SUBTASK_ID=$SUBTASK_ID"

# List tasks
RESP=$(curl -s -w "\n%{http_code}" "$BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks?limit=10&offset=0" -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /tasks (list)" "200" "$CODE" "$BODY"

# Get task
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /tasks/:taskId" "200" "$CODE" "$BODY"

# Get task tree
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/tree -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /tasks/:taskId/tree" "200" "$CODE" "$BODY"

# Update task
RESP=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID -H "$AUTH" -H "$CT" \
  -d '{"status":"in_progress","priority":"critical"}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "PATCH /tasks/:taskId (update)" "200" "$CODE" "$BODY"

# Filter tasks by status
RESP=$(curl -s -w "\n%{http_code}" "$BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks?status=in_progress" -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /tasks?status=in_progress (filter)" "200" "$CODE" "$BODY"

# ============ CHECKLISTS ============
echo ""
echo "--- Checklists ---"

# Create checklist item
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/checklists -H "$AUTH" -H "$CT" \
  -d '{"title":"Write Dockerfile","position":1}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /checklists (create)" "201" "$CODE" "$BODY"

CHECKLIST_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   CHECKLIST_ID=$CHECKLIST_ID"

# Create second checklist item
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/checklists -H "$AUTH" -H "$CT" \
  -d '{"title":"Test builds","position":2}')
CODE=$(echo "$RESP" | tail -1)
check "POST /checklists (create 2nd)" "201" "$CODE"

# List checklists
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/checklists -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /checklists (list)" "200" "$CODE" "$BODY"

# Update checklist (mark as checked)
RESP=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/checklists/$CHECKLIST_ID -H "$AUTH" -H "$CT" \
  -d '{"is_checked":true}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "PATCH /checklists/:id (check)" "200" "$CODE" "$BODY"

# ============ TASK RULES ============
echo ""
echo "--- Task Rules ---"

# Create rule
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/rules -H "$AUTH" -H "$CT" \
  -d '{"rule_type":"all_checklists_done","is_required":true}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /rules (create)" "201" "$CODE" "$BODY"

RULE_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   RULE_ID=$RULE_ID"

# List rules
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/rules -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /rules (list)" "200" "$CODE" "$BODY"

# ============ COMMENTS ============
echo ""
echo "--- Comments ---"

# Create comment
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/comments -H "$AUTH" -H "$CT" \
  -d '{"body":"This looks great! Ready for review."}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /comments (create)" "201" "$CODE" "$BODY"

COMMENT_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   COMMENT_ID=$COMMENT_ID"

# Create threaded reply
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/comments -H "$AUTH" -H "$CT" \
  -d "{\"body\":\"Thanks! Will merge.\",\"parent_id\":\"$COMMENT_ID\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /comments (reply)" "201" "$CODE" "$BODY"

# List comments
RESP=$(curl -s -w "\n%{http_code}" $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/comments -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /comments (list)" "200" "$CODE" "$BODY"

# ============ SUBMIT FOR REVIEW ============
echo ""
echo "--- Submit for Review ---"

# Should fail because not all checklists are done (rule is all_checklists_done)
RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/submit-review -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /submit-review (should fail - checklists not done)" "422" "$CODE" "$BODY"

# ============ MARK COMPLETE ============
echo ""
echo "--- Mark Complete ---"

RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/complete -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /complete" "200" "$CODE" "$BODY"

# ============ NOTIFICATIONS ============
echo ""
echo "--- Notifications ---"

RESP=$(curl -s -w "\n%{http_code}" "$BASE/notifications?limit=10&offset=0" -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "GET /notifications" "200" "$CODE" "$BODY"

RESP=$(curl -s -w "\n%{http_code}" -X POST $BASE/notifications/mark-all-read -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
check "POST /notifications/mark-all-read" "204" "$CODE"

# ============ CLEANUP - DELETE ============
echo ""
echo "--- Cleanup (Delete) ---"

# Delete comment
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/comments/$COMMENT_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
check "DELETE /comments/:id" "204" "$CODE"

# Delete rule
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/rules/$RULE_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
check "DELETE /rules/:id" "204" "$CODE"

# Delete checklist
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/checklists/$CHECKLIST_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
check "DELETE /checklists/:id" "204" "$CODE"

# Delete subtask
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$SUBTASK_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
check "DELETE /tasks/:taskId (subtask)" "204" "$CODE"

# Delete task
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
check "DELETE /tasks/:taskId" "204" "$CODE"

# Delete project
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID/projects/$PROJECT_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
check "DELETE /projects/:projectId" "204" "$CODE"

# Delete team
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID/teams/$TEAM_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
check "DELETE /teams/:teamId" "204" "$CODE"

# Delete org
RESP=$(curl -s -w "\n%{http_code}" -X DELETE $BASE/orgs/$ORG_ID -H "$AUTH")
CODE=$(echo "$RESP" | tail -1)
check "DELETE /orgs/:orgId" "204" "$CODE"

# ============ SUMMARY ============
echo ""
echo "=================================="
echo "RESULTS: $PASS passed, $FAIL failed"
echo "=================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
