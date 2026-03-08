#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:8080"
AUTH="http://localhost:9999"
PASS=0
FAIL=0
TOTAL=0
TS=$(date +%s)
TEST_EMAIL="test${TS}@orbispm.dev"

red()   { printf "\e[31m%s\e[0m\n" "$*"; }
green() { printf "\e[32m%s\e[0m\n" "$*"; }
yellow(){ printf "\e[33m%s\e[0m\n" "$*"; }

check() {
  local desc="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" -eq "$expected" ]; then
    green "  ✓ $desc (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    red "  ✗ $desc — expected $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

section() {
  echo ""
  yellow "=== $1 ==="
}

# ─── HEALTH ─────────────────────────
section "Health"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
check "GET /health" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health/ready")
check "GET /health/ready" 200 "$STATUS"

# ─── AUTH (GoTrue) ──────────────────
section "Auth (GoTrue Proxy)"

SIGNUP_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"TestPass123!\",\"name\":\"Test User\"}")
SIGNUP_CODE=$(echo "$SIGNUP_RESP" | tail -1)
SIGNUP_BODY=$(echo "$SIGNUP_RESP" | sed '$d')
check "POST /api/v1/auth/signup" 201 "$SIGNUP_CODE"

# Login
LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"TestPass123!\"}")
LOGIN_CODE=$(echo "$LOGIN_RESP" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESP" | sed '$d')
check "POST /api/v1/auth/login" 200 "$LOGIN_CODE"

# Extract token
TOKEN=$(echo "$LOGIN_BODY" | grep -oP '"access_token"\s*:\s*"\K[^"]+' || echo "")
REFRESH=$(echo "$LOGIN_BODY" | grep -oP '"refresh_token"\s*:\s*"\K[^"]+' || echo "")
if [ -z "$TOKEN" ]; then
  red "  ✗ Failed to extract access token — cannot continue"
  echo "Login response: $LOGIN_BODY"
  exit 1
fi
green "  Token obtained: ${TOKEN:0:20}..."

# Refresh
if [ -n "$REFRESH" ]; then
  REFRESH_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/auth/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refresh_token\":\"$REFRESH\"}")
  check "POST /api/v1/auth/refresh" 200 "$REFRESH_RESP"
fi

# Get user
GET_USER=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/auth/user" \
  -H "Authorization: Bearer $TOKEN")
check "GET /api/v1/auth/user" 200 "$GET_USER"

AUTH_HEADER="Authorization: Bearer $TOKEN"

# ─── ORGS ───────────────────────────
section "Organizations"

# No auth → 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs")
check "GET /api/v1/orgs (no auth)" 401 "$STATUS"

# Create org
ORG_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name":"Test Org","slug":"test-org"}')
ORG_CODE=$(echo "$ORG_RESP" | tail -1)
ORG_BODY=$(echo "$ORG_RESP" | sed '$d')
check "POST /api/v1/orgs" 201 "$ORG_CODE"

ORG_ID=$(echo "$ORG_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)
green "  Org ID: $ORG_ID"

# List orgs
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs" -H "$AUTH_HEADER")
check "GET /api/v1/orgs" 200 "$STATUS"

# Get org
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID" -H "$AUTH_HEADER")
check "GET /api/v1/orgs/{id}" 200 "$STATUS"

# Update org
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/v1/orgs/$ORG_ID" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name":"Updated Org"}')
check "PATCH /api/v1/orgs/{id}" 200 "$STATUS"

# List members
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/members" -H "$AUTH_HEADER")
check "GET /api/v1/orgs/{id}/members" 200 "$STATUS"

# ─── TEAMS ──────────────────────────
section "Teams"

TEAM_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/teams" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name":"Engineering","description":"Dev team"}')
TEAM_CODE=$(echo "$TEAM_RESP" | tail -1)
TEAM_BODY=$(echo "$TEAM_RESP" | sed '$d')
check "POST /api/v1/orgs/{id}/teams" 201 "$TEAM_CODE"

TEAM_ID=$(echo "$TEAM_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/teams" -H "$AUTH_HEADER")
check "GET /api/v1/orgs/{id}/teams" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/teams/$TEAM_ID" -H "$AUTH_HEADER")
check "GET /api/v1/orgs/{id}/teams/{id}" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/v1/orgs/$ORG_ID/teams/$TEAM_ID" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name":"Backend Team"}')
check "PATCH /api/v1/orgs/{id}/teams/{id}" 200 "$STATUS"

# ─── PROJECTS ───────────────────────
section "Projects"

PROJ_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d "{\"name\":\"OrbisPM\",\"description\":\"Main project\",\"key\":\"OPM\",\"team_id\":\"$TEAM_ID\"}")
PROJ_CODE=$(echo "$PROJ_RESP" | tail -1)
PROJ_BODY=$(echo "$PROJ_RESP" | sed '$d')
check "POST /api/v1/orgs/{id}/projects" 201 "$PROJ_CODE"

PROJ_ID=$(echo "$PROJ_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects" -H "$AUTH_HEADER")
check "GET /api/v1/orgs/{id}/projects" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID" -H "$AUTH_HEADER")
check "GET /api/v1/orgs/{id}/projects/{id}" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name":"OrbisPM v2"}')
check "PATCH /api/v1/orgs/{id}/projects/{id}" 200 "$STATUS"

# ─── TASKS ──────────────────────────
section "Tasks"

TASK_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"title":"Setup CI/CD","description":"Configure pipelines","priority":"high","status":"todo"}')
TASK_CODE=$(echo "$TASK_RESP" | tail -1)
TASK_BODY=$(echo "$TASK_RESP" | sed '$d')
check "POST /api/v1/orgs/{id}/projects/{id}/tasks" 201 "$TASK_CODE"

TASK_ID=$(echo "$TASK_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

# Create a second task for dependencies testing
TASK2_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"title":"Write tests","description":"Unit tests","priority":"medium","status":"todo"}')
TASK2_CODE=$(echo "$TASK2_RESP" | tail -1)
TASK2_BODY=$(echo "$TASK2_RESP" | sed '$d')
check "POST /api/v1/.../tasks (2nd)" 201 "$TASK2_CODE"

TASK2_ID=$(echo "$TASK2_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks" -H "$AUTH_HEADER")
check "GET /api/v1/.../tasks" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID" -H "$AUTH_HEADER")
check "GET /api/v1/.../tasks/{id}" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"title":"Setup CI/CD pipeline"}')
check "PATCH /api/v1/.../tasks/{id}" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/tree" -H "$AUTH_HEADER")
check "GET /api/v1/.../tasks/{id}/tree" 200 "$STATUS"

# ─── CHECKLISTS ─────────────────────
section "Checklists"

CL_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/checklists" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"title":"Checklist item 1"}')
CL_CODE=$(echo "$CL_RESP" | tail -1)
CL_BODY=$(echo "$CL_RESP" | sed '$d')
check "POST /api/v1/.../checklists" 201 "$CL_CODE"

CL_ID=$(echo "$CL_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/checklists" -H "$AUTH_HEADER")
check "GET /api/v1/.../checklists" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/checklists/$CL_ID" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"is_checked":true}')
check "PATCH /api/v1/.../checklists/{id}" 200 "$STATUS"

# ─── COMMENTS ───────────────────────
section "Comments"

CMT_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/comments" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"body":"This is a test comment"}')
CMT_CODE=$(echo "$CMT_RESP" | tail -1)
check "POST /api/v1/.../comments" 201 "$CMT_CODE"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/comments" -H "$AUTH_HEADER")
check "GET /api/v1/.../comments" 200 "$STATUS"

# ─── RULES ──────────────────────────
section "Rules"

RULE_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/rules" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"rule_type":"all_checklists_done","is_required":true}')
RULE_CODE=$(echo "$RULE_RESP" | tail -1)
check "POST /api/v1/.../rules" 201 "$RULE_CODE"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/rules" -H "$AUTH_HEADER")
check "GET /api/v1/.../rules" 200 "$STATUS"

# ─── DEPENDENCIES ───────────────────
section "Dependencies"

DEP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/dependencies" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d "{\"depends_on_id\":\"$TASK2_ID\",\"type\":\"blocked_by\"}")
check "POST /api/v1/.../dependencies" 201 "$DEP_STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/dependencies" -H "$AUTH_HEADER")
check "GET /api/v1/.../dependencies" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/dependencies/dependents" -H "$AUTH_HEADER")
check "GET /api/v1/.../dependents" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/dependencies/$TASK2_ID" -H "$AUTH_HEADER")
check "DELETE /api/v1/.../dependencies/{id}" 204 "$STATUS"

# ─── WATCHERS ───────────────────────
section "Watchers"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/watchers" -H "$AUTH_HEADER")
check "POST /api/v1/.../watchers" 201 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/watchers" -H "$AUTH_HEADER")
check "GET /api/v1/.../watchers" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/watchers" -H "$AUTH_HEADER")
check "DELETE /api/v1/.../watchers" 204 "$STATUS"

# ─── ATTACHMENTS ────────────────────
section "Attachments"

ATT_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/attachments" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"filename":"test.pdf","file_size":1024,"mime_type":"application/pdf"}')
ATT_CODE=$(echo "$ATT_RESP" | tail -1)
ATT_BODY=$(echo "$ATT_RESP" | sed '$d')
check "POST /api/v1/.../attachments" 201 "$ATT_CODE"

ATT_ID=$(echo "$ATT_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/attachments" -H "$AUTH_HEADER")
check "GET /api/v1/.../attachments" 200 "$STATUS"

if [ -n "$ATT_ID" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/attachments/$ATT_ID/download" -H "$AUTH_HEADER")
  check "GET /api/v1/.../attachments/{id}/download" 200 "$STATUS"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/attachments/$ATT_ID" -H "$AUTH_HEADER")
  check "DELETE /api/v1/.../attachments/{id}" 204 "$STATUS"
fi

# ─── TEMPLATES ──────────────────────
section "Templates"

TMPL_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/templates" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name":"Bug Report","description":"Standard bug template","structure":{"fields":["title","steps","expected","actual"]}}')
TMPL_CODE=$(echo "$TMPL_RESP" | tail -1)
TMPL_BODY=$(echo "$TMPL_RESP" | sed '$d')
check "POST /api/v1/.../templates" 201 "$TMPL_CODE"

TMPL_ID=$(echo "$TMPL_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/templates" -H "$AUTH_HEADER")
check "GET /api/v1/.../templates" 200 "$STATUS"

if [ -n "$TMPL_ID" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/templates/$TMPL_ID" -H "$AUTH_HEADER")
  check "GET /api/v1/.../templates/{id}" 200 "$STATUS"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/v1/orgs/$ORG_ID/templates/$TMPL_ID" \
    -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    -d '{"name":"Bug Report v2"}')
  check "PATCH /api/v1/.../templates/{id}" 200 "$STATUS"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/templates/$TMPL_ID" -H "$AUTH_HEADER")
  check "DELETE /api/v1/.../templates/{id}" 204 "$STATUS"
fi

# ─── WEBHOOKS ───────────────────────
section "Webhooks"

WH_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/webhooks" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/webhook","events":["task.created","task.updated"]}')
WH_CODE=$(echo "$WH_RESP" | tail -1)
WH_BODY=$(echo "$WH_RESP" | sed '$d')
check "POST /api/v1/.../webhooks" 201 "$WH_CODE"

WH_ID=$(echo "$WH_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/webhooks" -H "$AUTH_HEADER")
check "GET /api/v1/.../webhooks" 200 "$STATUS"

if [ -n "$WH_ID" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/webhooks/$WH_ID" -H "$AUTH_HEADER")
  check "GET /api/v1/.../webhooks/{id}" 200 "$STATUS"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/v1/orgs/$ORG_ID/webhooks/$WH_ID" \
    -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    -d '{"is_active":false}')
  check "PATCH /api/v1/.../webhooks/{id}" 200 "$STATUS"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/webhooks/$WH_ID" -H "$AUTH_HEADER")
  check "DELETE /api/v1/.../webhooks/{id}" 204 "$STATUS"
fi

# ─── API KEYS ───────────────────────
section "API Keys"

AK_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/api-keys" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name":"CI Token","scopes":["read","write"]}')
AK_CODE=$(echo "$AK_RESP" | tail -1)
AK_BODY=$(echo "$AK_RESP" | sed '$d')
check "POST /api/v1/.../api-keys" 201 "$AK_CODE"

AK_ID=$(echo "$AK_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/api-keys" -H "$AUTH_HEADER")
check "GET /api/v1/.../api-keys" 200 "$STATUS"

if [ -n "$AK_ID" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/api-keys/$AK_ID" -H "$AUTH_HEADER")
  check "DELETE /api/v1/.../api-keys/{id}" 204 "$STATUS"
fi

# ─── CUSTOM ROLES ───────────────────
section "Custom Roles"

ROLE_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/roles" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name":"technical-lead","description":"Tech lead role","permissions":{"tasks.delete":true,"projects.manage":true}}')
ROLE_CODE=$(echo "$ROLE_RESP" | tail -1)
ROLE_BODY=$(echo "$ROLE_RESP" | sed '$d')
check "POST /api/v1/.../roles" 201 "$ROLE_CODE"

ROLE_ID=$(echo "$ROLE_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/roles" -H "$AUTH_HEADER")
check "GET /api/v1/.../roles" 200 "$STATUS"

if [ -n "$ROLE_ID" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/roles/$ROLE_ID" -H "$AUTH_HEADER")
  check "GET /api/v1/.../roles/{id}" 200 "$STATUS"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/v1/orgs/$ORG_ID/roles/$ROLE_ID" \
    -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    -d '{"name":"tech-lead-updated"}')
  check "PATCH /api/v1/.../roles/{id}" 200 "$STATUS"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/roles/$ROLE_ID" -H "$AUTH_HEADER")
  check "DELETE /api/v1/.../roles/{id}" 204 "$STATUS"
fi

# ─── BILLING ────────────────────────
section "Billing"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/billing/plans" -H "$AUTH_HEADER")
check "GET /api/v1/.../billing/plans" 200 "$STATUS"

SUB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/billing/subscription" -H "$AUTH_HEADER")
# May be 404 if no subscription exists
if [ "$SUB_STATUS" -eq 200 ] || [ "$SUB_STATUS" -eq 404 ]; then
  TOTAL=$((TOTAL + 1))
  PASS=$((PASS + 1))
  green "  ✓ GET /api/v1/.../billing/subscription (HTTP $SUB_STATUS — expected 200 or 404)"
else
  TOTAL=$((TOTAL + 1))
  FAIL=$((FAIL + 1))
  red "  ✗ GET /api/v1/.../billing/subscription — got $SUB_STATUS"
fi

# ─── NOTIFICATION PREFERENCES ──────
section "Notification Preferences"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/v1/orgs/$ORG_ID/notification-preferences" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"event_type":"task.created","channel":"in_app","enabled":true}')
check "PUT /api/v1/.../notification-preferences" 204 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/notification-preferences" -H "$AUTH_HEADER")
check "GET /api/v1/.../notification-preferences" 200 "$STATUS"

# ─── IMPORTS ────────────────────────
section "Imports"

IMP_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/imports" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"file_path":"uploads/test.csv","file_name":"test.csv"}')
IMP_CODE=$(echo "$IMP_RESP" | tail -1)
IMP_BODY=$(echo "$IMP_RESP" | sed '$d')
check "POST /api/v1/.../imports" 201 "$IMP_CODE"

IMP_ID=$(echo "$IMP_BODY" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/imports" -H "$AUTH_HEADER")
check "GET /api/v1/.../imports" 200 "$STATUS"

if [ -n "$IMP_ID" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/imports/$IMP_ID" -H "$AUTH_HEADER")
  check "GET /api/v1/.../imports/{id}" 200 "$STATUS"
fi

# ─── ACTIVITY ───────────────────────
section "Activity"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/activity?entity_type=task&entity_id=$TASK_ID" -H "$AUTH_HEADER")
check "GET /api/v1/.../activity" 200 "$STATUS"

# ─── NOTIFICATIONS ──────────────────
section "Notifications"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/notifications" -H "$AUTH_HEADER")
check "GET /api/v1/notifications" 200 "$STATUS"

# ─── SEARCH ─────────────────────────
section "Search"

SEARCH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/orgs/$ORG_ID/search/tasks?q=CI" -H "$AUTH_HEADER")
if [ "$SEARCH_STATUS" -eq 200 ] || [ "$SEARCH_STATUS" -eq 404 ]; then
  TOTAL=$((TOTAL + 1))
  PASS=$((PASS + 1))
  green "  ✓ GET /api/v1/.../search/tasks (HTTP $SEARCH_STATUS)"
else
  TOTAL=$((TOTAL + 1))
  FAIL=$((FAIL + 1))
  red "  ✗ GET /api/v1/.../search/tasks — got $SEARCH_STATUS"
fi

# ─── TASK STATUS TRANSITIONS ───────
section "Task Status Transitions"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID/submit-review" \
  -H "$AUTH_HEADER")
check "POST .../submit-review" 200 "$STATUS"

# ─── CLEANUP ────────────────────────
section "Cleanup"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK2_ID" -H "$AUTH_HEADER")
check "DELETE task 2" 204 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID/tasks/$TASK_ID" -H "$AUTH_HEADER")
check "DELETE task 1" 204 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/projects/$PROJ_ID" -H "$AUTH_HEADER")
check "DELETE project" 204 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID/teams/$TEAM_ID" -H "$AUTH_HEADER")
check "DELETE team" 204 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/orgs/$ORG_ID" -H "$AUTH_HEADER")
check "DELETE org" 204 "$STATUS"

# Logout
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/auth/logout" \
  -H "Authorization: Bearer $TOKEN")
check "POST /api/v1/auth/logout" 204 "$STATUS"

# ─── SUMMARY ────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAIL -eq 0 ]; then
  green "ALL $TOTAL TESTS PASSED ✓"
else
  red "$FAIL/$TOTAL TESTS FAILED"
  green "$PASS/$TOTAL tests passed"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit $FAIL
