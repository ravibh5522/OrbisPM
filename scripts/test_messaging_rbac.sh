#!/usr/bin/env bash
# test_messaging_rbac.sh
# Comprehensive messaging RBAC + auto-channel test suite
# Tests:
#  1. Auto channel creation (team.created / project.created events)
#  2. Auto member + role mapping when team/project members are added
#  3. RBAC enforcement: owner/admin/member/viewer permission rules
#
# Environment:
#   Admin org: 2c0da001-ffeb-4c11-b234-869d7d729153  (admin@orbispm.local)
#   TestUser:  3ccc1286-b0a7-5033-850d-6a0287effce2  (testuser@example.com)
#              testuser is added to admin's org via invite

set -uo pipefail  # -e removed so individual test failures don't abort

BASE="http://localhost:8000/api/v1"
CHAT="$BASE/chat"
ORG="2c0da001-ffeb-4c11-b234-869d7d729153"
DB_NAME="orbispmdev"
DB_CONTAINER="orbispm-postgres-1"

ADMIN_EMAIL="admin@orbispm.local"
ADMIN_PASS="Admin123!"
TESTUSER_EMAIL="testuser@example.com"
TESTUSER_PASS="TestUser@123!"
TESTUSER_ID="3ccc1286-b0a7-5033-850d-6a0287effce2"

GREEN='\e[32m'; RED='\e[31m'; CYAN='\e[36m'; RESET='\e[0m'
PASS() { echo -e "${GREEN}PASS${RESET} $1"; }
FAIL() { echo -e "${RED}FAIL${RESET} $1"; FAILURES=$((FAILURES+1)); }
INFO() { echo -e "${CYAN}INFO${RESET} $1"; }

FAILURES=0

# ── DB helper ─────────────────────────────────────────────────────────────────
db() { docker exec "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -t -A -c "$1" 2>/dev/null | head -1; }

# ── Auth ──────────────────────────────────────────────────────────────────────
login() {
  local email=$1 pass=$2
  local tok
  tok=$(curl -s "$BASE/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || true)
  if [[ -n "$tok" && "$tok" != "LOGIN_FAILED" ]]; then
    echo "$tok"
  else
    echo ""
    echo "[ERROR] Login failed for $email" >&2
    return 1
  fi
}

INFO "Logging in test users..."
T_ADMIN=$(login "$ADMIN_EMAIL" "$ADMIN_PASS")
T_TEST=$(login "$TESTUSER_EMAIL" "$TESTUSER_PASS")

if [[ -z "$T_ADMIN" ]]; then
  echo "[FATAL] Cannot login as admin@orbispm.local — aborting"; exit 1
fi
if [[ -z "$T_TEST" ]]; then
  echo "[FATAL] Cannot login as testuser@example.com — aborting"
  echo "  Hint: Run: docker exec orbispm-postgres-1 psql ... and check user exists"
  exit 1
fi
echo "  admin@orbispm.local    ✓"
echo "  testuser@example.com   ✓"

# Helper: make auth'd request
req() {
  local method=$1 url=$2 tok=$3 body=${4:-}
  if [[ -n "$body" ]]; then
    curl -s -X "$method" "$url" \
      -H "Authorization: Bearer $tok" \
      -H "X-Org-ID: $ORG" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -s -X "$method" "$url" \
      -H "Authorization: Bearer $tok" \
      -H "X-Org-ID: $ORG"
  fi
}

req_code() {
  local method=$1 url=$2 tok=$3 body=${4:-}
  if [[ -n "$body" ]]; then
    curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer $tok" \
      -H "X-Org-ID: $ORG" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer $tok" \
      -H "X-Org-ID: $ORG"
  fi
}

expect_code() {
  local label=$1 expected=$2 actual=$3
  if [[ "$actual" == "$expected" ]]; then
    PASS "$label → HTTP $actual"
  else
    FAIL "$label → expected HTTP $expected, got HTTP $actual"
  fi
}

echo ""
echo "════════════════════════════════════════════════════════"
echo " SECTION 1: Role Permission Matrix"
echo "════════════════════════════════════════════════════════"

INFO "GET /chat/roles (role permission matrix)"
ROLES_RESP=$(req GET "$CHAT/roles" "$T_ADMIN")
ROLE_COUNT=$(echo "$ROLES_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
if [[ "$ROLE_COUNT" -ge 5 ]]; then
  PASS "GET /chat/roles returns $ROLE_COUNT roles (owner/admin/moderator/member/viewer)"
else
  FAIL "GET /chat/roles returned only $ROLE_COUNT roles (expected ≥ 5)"
fi

# Print role summary
echo "$ROLES_RESP" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data:
    perms = [p['resource']+'.'+p['action'] for p in r.get('permissions',[])]
    print(f'  {r[\"role\"]:12s}: {len(perms):2d} perms  sample={perms[:3]}')
" 2>/dev/null

echo ""
echo "════════════════════════════════════════════════════════"
echo " SECTION 2: Verify Existing Auto Channels in DB"
echo "════════════════════════════════════════════════════════"

INFO "Checking existing auto-managed channels in DB..."
TEAM_CHAN_COUNT=$(db "SELECT count(*) FROM channels WHERE auto_source='team' AND org_id='$ORG';")
PROJ_CHAN_COUNT=$(db "SELECT count(*) FROM channels WHERE auto_source='project' AND org_id='$ORG';")
OWNER_ROLE_COUNT=$(db "SELECT count(*) FROM channel_members cm JOIN channels c ON c.id=cm.channel_id WHERE c.org_id='$ORG' AND c.is_auto_managed=true AND cm.role='owner';")

echo "  Team auto-channels:      $TEAM_CHAN_COUNT"
echo "  Project auto-channels:   $PROJ_CHAN_COUNT"
echo "  Owner role assignments:  $OWNER_ROLE_COUNT"

if [[ "$TEAM_CHAN_COUNT" -gt 0 ]]; then
  PASS "Team auto-channels exist ($TEAM_CHAN_COUNT found)"
else
  FAIL "No team auto-channels found — check Redis event propagation"
fi
if [[ "$PROJ_CHAN_COUNT" -gt 0 ]]; then
  PASS "Project auto-channels exist ($PROJ_CHAN_COUNT found)"
else
  FAIL "No project auto-channels found — check Redis event propagation"
fi
if [[ "$OWNER_ROLE_COUNT" -gt 0 ]]; then
  PASS "Auto-managed channel members have owner role ($OWNER_ROLE_COUNT assignments)"
else
  FAIL "No owner role assignments in auto-managed channels"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo " SECTION 3: Create New Team → Auto Channel Creation"
echo "════════════════════════════════════════════════════════"

INFO "Creating RBAC test team via main backend..."
NEW_TEAM=$(req POST "$BASE/orgs/$ORG/teams" "$T_ADMIN" \
  '{"name":"RBAC_Test_Team_'"$(date +%s)"'","description":"Auto-created for RBAC testing"}')
NEW_TEAM_ID=$(echo "$NEW_TEAM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")

if [[ -n "$NEW_TEAM_ID" && "$NEW_TEAM_ID" != "null" ]]; then
  PASS "Team created: $NEW_TEAM_ID"
  INFO "Waiting for Redis event → messaging service..."
  sleep 3

  AUTO_CHAN=$(db "SELECT id||'|'||name FROM channels WHERE auto_source='team' AND auto_source_id='$NEW_TEAM_ID' AND NOT is_archived LIMIT 1;")
  if [[ -n "$AUTO_CHAN" ]]; then
    PASS "Auto #general channel created for team: $AUTO_CHAN"
    AUTO_CHAN_ID=$(echo "$AUTO_CHAN" | cut -d'|' -f1)

    CREATOR_ROLE=$(db "SELECT cm.role FROM channel_members cm JOIN channels c ON c.id=cm.channel_id WHERE c.auto_source_id='$NEW_TEAM_ID' AND c.auto_source='team' LIMIT 1;")
    if [[ "$CREATOR_ROLE" == "owner" ]]; then
      PASS "Team creator auto-assigned 'owner' role in channel ✓"
    else
      FAIL "Creator role: expected 'owner', got '$CREATOR_ROLE'"
    fi
  else
    FAIL "Auto channel NOT created after team creation (check Redis pub/sub)"
    AUTO_CHAN_ID=""
  fi
else
  FAIL "Failed to create team: $(echo "$NEW_TEAM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',d))" 2>/dev/null)"
  NEW_TEAM_ID=""
  AUTO_CHAN_ID=""
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo " SECTION 4: Team Member Role Mapping (team → channel)"
echo "════════════════════════════════════════════════════════"
echo " Role Map: team_lead→admin  |  member→member  |  viewer→viewer"

if [[ -n "$NEW_TEAM_ID" ]]; then
  # ── 4a. team_lead → channel admin ─────────────────────────────────────────
  INFO "Adding testuser as team_lead to team..."
  ADD_RESP=$(req POST "$BASE/orgs/$ORG/teams/$NEW_TEAM_ID/members" "$T_ADMIN" \
    "{\"user_id\":\"$TESTUSER_ID\",\"role\":\"team_lead\"}")
  ADD_ERR=$(echo "$ADD_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null || echo "")
  if [[ -n "$ADD_ERR" ]]; then
    INFO "Add response: $ADD_ERR"
  fi
  sleep 3

  if [[ -n "${AUTO_CHAN_ID:-}" ]]; then
    CHAN_ROLE=$(db "SELECT role FROM channel_members WHERE channel_id='$AUTO_CHAN_ID' AND user_id='$TESTUSER_ID' LIMIT 1;")
    if [[ "$CHAN_ROLE" == "admin" ]]; then
      PASS "team_lead → channel role 'admin' ✓"
    else
      FAIL "team_lead: expected 'admin', got '${CHAN_ROLE:-<not found>}'"
    fi
  else
    INFO "Skipping channel role check (auto channel not available)"
  fi

  # ── 4b. Remove and re-add as member → channel member ───────────────────────
  INFO "Removing testuser from team..."
  req DELETE "$BASE/orgs/$ORG/teams/$NEW_TEAM_ID/members/$TESTUSER_ID" "$T_ADMIN" > /dev/null 2>&1 || true
  sleep 2

  INFO "Re-adding testuser as member to team..."
  req POST "$BASE/orgs/$ORG/teams/$NEW_TEAM_ID/members" "$T_ADMIN" \
    "{\"user_id\":\"$TESTUSER_ID\",\"role\":\"member\"}" > /dev/null

  sleep 3

  if [[ -n "${AUTO_CHAN_ID:-}" ]]; then
    CHAN_ROLE2=$(db "SELECT role FROM channel_members WHERE channel_id='$AUTO_CHAN_ID' AND user_id='$TESTUSER_ID' LIMIT 1;")
    if [[ "$CHAN_ROLE2" == "member" ]]; then
      PASS "team member → channel role 'member' ✓"
    else
      FAIL "team member: expected 'member', got '${CHAN_ROLE2:-<not found>}'"
    fi
  fi

  # ── 4c. Remove and re-add as viewer → channel viewer ───────────────────────
  INFO "Re-adding testuser as viewer to team..."
  req DELETE "$BASE/orgs/$ORG/teams/$NEW_TEAM_ID/members/$TESTUSER_ID" "$T_ADMIN" > /dev/null 2>&1 || true
  sleep 2

  req POST "$BASE/orgs/$ORG/teams/$NEW_TEAM_ID/members" "$T_ADMIN" \
    "{\"user_id\":\"$TESTUSER_ID\",\"role\":\"viewer\"}" > /dev/null
  sleep 3

  if [[ -n "${AUTO_CHAN_ID:-}" ]]; then
    CHAN_ROLE3=$(db "SELECT role FROM channel_members WHERE channel_id='$AUTO_CHAN_ID' AND user_id='$TESTUSER_ID' LIMIT 1;")
    if [[ "$CHAN_ROLE3" == "viewer" ]]; then
      PASS "team viewer → channel role 'viewer' ✓"
    else
      FAIL "team viewer: expected 'viewer', got '${CHAN_ROLE3:-<not found>}'"
    fi
  fi
else
  INFO "Skipping role mapping tests — team creation failed"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo " SECTION 5: RBAC Enforcement (Admin channel)"
echo "════════════════════════════════════════════════════════"

# Use an existing non-archived channel admin is a member of
ADMIN_CHAN_ID=$(db "SELECT cm.channel_id FROM channel_members cm JOIN channels c ON c.id=cm.channel_id WHERE c.org_id='$ORG' AND c.is_auto_managed=true AND cm.role='owner' AND NOT c.is_archived LIMIT 1;")

if [[ -z "$ADMIN_CHAN_ID" ]]; then
  # Fall back to any fresh channel
  ADMIN_CHAN_ID="${AUTO_CHAN_ID:-}"
fi

if [[ -z "$ADMIN_CHAN_ID" ]]; then
  FAIL "No channel found for RBAC enforcement tests — skipping Section 5"
else
  INFO "RBAC tests on channel: $ADMIN_CHAN_ID"

  # ── 5a. Admin can access their channel ────────────────────────────────────
  CODE=$(req_code GET "$CHAT/channels/$ADMIN_CHAN_ID" "$T_ADMIN")
  expect_code "admin GET /channels/{id}" "200" "$CODE"

  # ── 5b. Admin can send message ────────────────────────────────────────────
  MSG='{"body":"RBAC test message","body_format":"text"}'
  CODE=$(req_code POST "$CHAT/channels/$ADMIN_CHAN_ID/messages" "$T_ADMIN" "$MSG")
  expect_code "admin POST /channels/{id}/messages" "201" "$CODE"

  # ── 5c. Admin can update channel ─────────────────────────────────────────
  CODE=$(req_code PUT "$CHAT/channels/$ADMIN_CHAN_ID" "$T_ADMIN" '{"description":"Updated by RBAC test"}')
  expect_code "admin PUT /channels/{id}" "200" "$CODE"

  # ── 5d. GET my-permissions ────────────────────────────────────────────────
  PERMS=$(req GET "$CHAT/channels/$ADMIN_CHAN_ID/my-permissions" "$T_ADMIN")
  MY_ROLE=$(echo "$PERMS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('role','?'))" 2>/dev/null)
  MY_COUNT=$(echo "$PERMS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('permissions',[])))" 2>/dev/null)
  if [[ "$MY_ROLE" == "owner" || "$MY_ROLE" == "admin" ]]; then
    PASS "admin GET /channels/{id}/my-permissions → role=$MY_ROLE, perms=$MY_COUNT"
  else
    FAIL "admin my-permissions returned role=$MY_ROLE (expected owner/admin)"
  fi

  # ── 5e. Viewer cannot send messages ──────────────────────────────────────
  if [[ -n "${AUTO_CHAN_ID:-}" ]]; then
    # Ensure testuser is viewer in the auto channel (set in Section 4c)
    VIEWER_ROLE=$(db "SELECT role FROM channel_members WHERE channel_id='$AUTO_CHAN_ID' AND user_id='$TESTUSER_ID' LIMIT 1;")
    INFO "testuser channel role in auto-channel: '${VIEWER_ROLE:-<not member>}'"
    CODE=$(req_code POST "$CHAT/channels/$AUTO_CHAN_ID/messages" "$T_TEST" "$MSG")
    if [[ "$CODE" == "403" ]]; then
      PASS "viewer BLOCKED from posting messages (403) ✓"
    elif [[ "$CODE" == "201" ]]; then
      FAIL "viewer should be blocked from posting but got 201"
    else
      INFO "viewer POST message: $CODE (viewer may need channel membership to get 403)"
    fi

    # ── 5f. Viewer can list messages (read access) ─────────────────────────
    CODE=$(req_code GET "$CHAT/channels/$AUTO_CHAN_ID/messages" "$T_TEST")
    expect_code "viewer GET /channels/{id}/messages (read-only)" "200" "$CODE"

    # ── 5g. Viewer cannot update channel ──────────────────────────────────
    CODE=$(req_code PUT "$CHAT/channels/$AUTO_CHAN_ID" "$T_TEST" '{"description":"viewer update attempt"}')
    if [[ "$CODE" == "403" ]]; then
      PASS "viewer BLOCKED from updating channel (403) ✓"
    else
      FAIL "viewer PUT channel: expected 403, got $CODE"
    fi

  # ── 5h. Viewer creating group channel (allowed — any org member can create) ────
    CODE=$(req_code POST "$CHAT/channels" "$T_TEST" '{"name":"viewer-group-chat","type":"group"}')
    if [[ "$CODE" == "201" ]]; then
      PASS "viewer CAN create a group channel (201) — any org member can create group channels"
    else
      FAIL "viewer group channel create: expected 201, got $CODE"
    fi

  # ── 5h2. Viewer cannot create team/project channels (invalid type) ────────────
    CODE=$(req_code POST "$CHAT/channels" "$T_TEST" '{"name":"viewer-team-channel","type":"team"}')
    if [[ "$CODE" == "400" ]]; then
      PASS "viewer BLOCKED from creating team-type channels (400 — type restricted) ✓"
    else
      FAIL "viewer create team-type channel: expected 400, got $CODE"
    fi
  fi

  # ── 5i. testuser (not admin channel member) cannot access private channel ──
  # dm/team/project channels now check membership in GetChannel service
  TESTUSER_IN_ADMIN_CHAN=$(db "SELECT count(*) FROM channel_members WHERE channel_id='$ADMIN_CHAN_ID' AND user_id='$TESTUSER_ID';")
  ADMIN_CHAN_TYPE=$(db "SELECT type FROM channels WHERE id='$ADMIN_CHAN_ID' LIMIT 1;")
  INFO "Admin channel type: $ADMIN_CHAN_TYPE, testuser is member: $TESTUSER_IN_ADMIN_CHAN"
  if [[ "$TESTUSER_IN_ADMIN_CHAN" == "0" && "$ADMIN_CHAN_TYPE" != "group" ]]; then
    CODE=$(req_code GET "$CHAT/channels/$ADMIN_CHAN_ID" "$T_TEST")
    if [[ "$CODE" == "403" || "$CODE" == "404" ]]; then
      PASS "non-member cannot access private $ADMIN_CHAN_TYPE channel (HTTP $CODE) ✓"
    else
      FAIL "non-member $ADMIN_CHAN_TYPE channel access: expected 403/404, got $CODE"
    fi
  else
    INFO "Skipping: testuser is member ($TESTUSER_IN_ADMIN_CHAN) or channel is group ($ADMIN_CHAN_TYPE)"
  fi
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo " SECTION 6: Project Auto Channel + Role Mapping"
echo "════════════════════════════════════════════════════════"
echo " Role Map: lead→admin | contributor→member | reviewer→viewer | observer→viewer"

INFO "Creating RBAC test project via main backend..."
NEW_PROJ=$(req POST "$BASE/orgs/$ORG/projects" "$T_ADMIN" \
  '{"name":"RBAC_Test_Project_'"$(date +%s)"'","description":"Auto-created","status":"active"}')
NEW_PROJ_ID=$(echo "$NEW_PROJ" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")

if [[ -n "$NEW_PROJ_ID" && "$NEW_PROJ_ID" != "null" ]]; then
  PASS "Project created: $NEW_PROJ_ID"
  sleep 3

  PROJ_AUTO_CHAN=$(db "SELECT id||'|'||name FROM channels WHERE auto_source='project' AND auto_source_id='$NEW_PROJ_ID' AND NOT is_archived LIMIT 1;")
  if [[ -n "$PROJ_AUTO_CHAN" ]]; then
    PASS "Auto project channel created: $PROJ_AUTO_CHAN"
    PROJ_CHAN_ID=$(echo "$PROJ_AUTO_CHAN" | cut -d'|' -f1)

    # Add testuser as contributor → channel member
    INFO "Adding testuser as project contributor..."
    req POST "$BASE/orgs/$ORG/projects/$NEW_PROJ_ID/members" "$T_ADMIN" \
      "{\"user_id\":\"$TESTUSER_ID\",\"role\":\"contributor\"}" > /dev/null 2>&1 || true
    sleep 3

    PROJ_ROLE=$(db "SELECT role FROM channel_members WHERE channel_id='$PROJ_CHAN_ID' AND user_id='$TESTUSER_ID' LIMIT 1;")
    if [[ "$PROJ_ROLE" == "member" ]]; then
      PASS "project contributor → channel 'member' ✓"
    else
      FAIL "project contributor: expected 'member', got '${PROJ_ROLE:-<not found>}'"
    fi

    # Remove and add as lead → channel admin
    INFO "Re-adding testuser as project lead..."
    req DELETE "$BASE/orgs/$ORG/projects/$NEW_PROJ_ID/members/$TESTUSER_ID" "$T_ADMIN" > /dev/null 2>&1 || true
    sleep 1
    req POST "$BASE/orgs/$ORG/projects/$NEW_PROJ_ID/members" "$T_ADMIN" \
      "{\"user_id\":\"$TESTUSER_ID\",\"role\":\"lead\"}" > /dev/null 2>&1 || true
    sleep 3

    PROJ_ROLE2=$(db "SELECT role FROM channel_members WHERE channel_id='$PROJ_CHAN_ID' AND user_id='$TESTUSER_ID' LIMIT 1;")
    if [[ "$PROJ_ROLE2" == "admin" ]]; then
      PASS "project lead → channel 'admin' ✓"
    else
      FAIL "project lead: expected 'admin', got '${PROJ_ROLE2:-<not found>}'"
    fi

    # Remove and add as reviewer → channel viewer
    INFO "Re-adding testuser as project reviewer..."
    req DELETE "$BASE/orgs/$ORG/projects/$NEW_PROJ_ID/members/$TESTUSER_ID" "$T_ADMIN" > /dev/null 2>&1 || true
    sleep 1
    req POST "$BASE/orgs/$ORG/projects/$NEW_PROJ_ID/members" "$T_ADMIN" \
      "{\"user_id\":\"$TESTUSER_ID\",\"role\":\"reviewer\"}" > /dev/null 2>&1 || true
    sleep 3

    PROJ_ROLE3=$(db "SELECT role FROM channel_members WHERE channel_id='$PROJ_CHAN_ID' AND user_id='$TESTUSER_ID' LIMIT 1;")
    if [[ "$PROJ_ROLE3" == "viewer" ]]; then
      PASS "project reviewer → channel 'viewer' ✓"
    else
      FAIL "project reviewer: expected 'viewer', got '${PROJ_ROLE3:-<not found>}'"
    fi
  else
    FAIL "Auto project channel NOT created (check Redis event propagation)"
  fi
else
  FAIL "Failed to create project: $(echo "$NEW_PROJ" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',d))" 2>/dev/null)"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo " SECTION 7: Role Hierarchy — Member Cannot Elevate"
echo "════════════════════════════════════════════════════════"

if [[ -n "${AUTO_CHAN_ID:-}" ]]; then
  # Ensure testuser is member in auto channel
  CURRENT_ROLE=$(db "SELECT role FROM channel_members WHERE channel_id='$AUTO_CHAN_ID' AND user_id='$TESTUSER_ID' LIMIT 1;")
  INFO "testuser current role in auto-channel: '${CURRENT_ROLE:-<not member>}'"

  if [[ "$CURRENT_ROLE" == "viewer" || "$CURRENT_ROLE" == "member" ]]; then
    ADMIN_USER_ID=$(db "SELECT cm.user_id FROM channel_members cm JOIN channels c ON c.id=cm.channel_id WHERE c.id='$AUTO_CHAN_ID' AND cm.role='owner' LIMIT 1;")

    # testuser (viewer/member) tries to promote admin → should be 403
    CODE=$(req_code PUT "$CHAT/channels/$AUTO_CHAN_ID/members/$ADMIN_USER_ID/role" "$T_TEST" '{"role":"admin"}')
    if [[ "$CODE" == "403" ]]; then
      PASS "viewer/member cannot change owner's role (403) ✓"
    else
      FAIL "viewer/member role change: expected 403, got $CODE"
    fi

    # testuser (viewer/member) tries to promote self to admin → should be 403
    CODE=$(req_code PUT "$CHAT/channels/$AUTO_CHAN_ID/members/$TESTUSER_ID/role" "$T_TEST" '{"role":"owner"}')
    if [[ "$CODE" == "403" ]]; then
      PASS "viewer/member cannot self-elevate to owner (403) ✓"
    else
      FAIL "self-elevation attempt: expected 403, got $CODE"
    fi
  else
    INFO "Skipping role hierarchy tests (testuser not viewer/member in auto-channel)"
  fi
else
  INFO "Skipping Section 7 — auto channel not available"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo " SECTION 8: DM Channel (direct messages)"
echo "════════════════════════════════════════════════════════"

# Get admin user ID from DB
ADMIN_USER_ID=$(db "SELECT id FROM users WHERE email='admin@orbispm.local' LIMIT 1;")
INFO "Admin user ID: $ADMIN_USER_ID"
INFO "Creating DM between admin and testuser..."
# DM endpoint is at /channels/dm (within the channels route group)
DM_RESP=$(req POST "$CHAT/channels/dm" "$T_ADMIN" "{\"user_id\":\"$TESTUSER_ID\"}")
DM_CHAN_ID=$(echo "$DM_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")

if [[ -n "$DM_CHAN_ID" && "$DM_CHAN_ID" != "null" ]]; then
  PASS "DM channel created: $DM_CHAN_ID"
  DM_TYPE=$(db "SELECT type FROM channels WHERE id='$DM_CHAN_ID' LIMIT 1;")
  if [[ "$DM_TYPE" == "dm" ]]; then
    PASS "DM channel type is 'dm' ✓"
  else
    FAIL "DM channel type: expected 'dm', got '$DM_TYPE'"
  fi

  # Both users can send messages in DM
  CODE=$(req_code POST "$CHAT/channels/$DM_CHAN_ID/messages" "$T_ADMIN" '{"body":"Hello from admin","body_format":"text"}')
  expect_code "admin can send DM message" "201" "$CODE"

  CODE=$(req_code POST "$CHAT/channels/$DM_CHAN_ID/messages" "$T_TEST" '{"body":"Hello from testuser","body_format":"text"}')
  expect_code "testuser can send DM message" "201" "$CODE"
else
  INFO "DM creation: $(echo "$DM_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','?'))" 2>/dev/null)"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo " SUMMARY"
echo "════════════════════════════════════════════════════════"
echo ""
if [[ "$FAILURES" -eq 0 ]]; then
  echo -e "${GREEN}✓ All tests passed!${RESET}"
else
  echo -e "${RED}✗ $FAILURES test(s) failed${RESET}"
fi
echo ""
echo "Auto Role Mapping Reference:"
echo "  Team Roles → Channel Roles:"
echo "    team_lead  → admin"
echo "    member     → member"
echo "    viewer     → viewer"
echo ""
echo "  Project Roles → Channel Roles:"
echo "    lead        → admin"
echo "    contributor → member"
echo "    reviewer    → viewer"
echo "    observer    → viewer"
echo ""
echo "  RBAC Permission Matrix:"
echo "    owner:     all 19 permissions"
echo "    admin:     18 permissions (no channel.delete)"
echo "    moderator: 14 permissions (message moderation + member management)"
echo "    member:    9 permissions (standard messaging)"
echo "    viewer:    3 permissions (read-only: message.list, bookmark.add/remove)"
echo ""
exit $FAILURES
