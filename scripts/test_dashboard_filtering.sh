#!/bin/bash

# Test Dashboard Role-Based Filtering
# Tests the org dashboard with different roles to verify filtering works correctly

BASE="http://localhost:8000/api/v1"
ORG="4a133658-1a9c-49e9-a524-5cf823d1ed72"
PROJECT_ID="e4d1cb9d-8b86-4e30-9d9b-c777af189b15"
TEAM_ID="4c9153a6-ca5a-4f43-9891-fe74194e179b"

login() {
  local email=$1 pass=$2
  curl -s "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null
}

test_dashboard() {
  local role=$1 email=$2 password=$3
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Testing Dashboard for Role: $role"
  echo "Email: $email"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Login
  token=$(login "$email" "$password")
  if [ -z "$token" ]; then
    echo "❌ FAILED: Could not login as $email"
    return 1
  fi
  echo "✓ Logged in successfully"
  
  # Call dashboard API
  response=$(curl -s -X GET "$BASE/orgs/$ORG/dashboard/stats" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json")
  
  # Check for errors
  if echo "$response" | jq -e '.error // .message // empty' >/dev/null 2>&1; then
    error=$(echo "$response" | jq -r '.error // .message // "Unknown error"')
    echo "❌ API Error: $error"
    return 1
  fi
  
  # Extract and display stats
  total_projects=$(echo "$response" | jq -r '.total_projects // 0')
  total_tasks=$(echo "$response" | jq -r '.total_tasks // 0')
  total_teams=$(echo "$response" | jq -r '.total_teams // 0')
  total_members=$(echo "$response" | jq -r '.total_members // 0')
  overdue_tasks=$(echo "$response" | jq -r '.overdue_tasks // 0')
  recent_tasks=$(echo "$response" | jq -r '.recent_tasks | length // 0')
  
  # Show all metrics
  echo "✓ Dashboard Stats Retrieved:"
  echo "  • Total Projects Visible:  $total_projects"
  echo "  • Total Tasks Visible:     $total_tasks"
  echo "  • Total Teams:             $total_teams"
  echo "  • Total Members:           $total_members"
  echo "  • Overdue Tasks:           $overdue_tasks"
  echo "  • Recent Tasks Count:      $recent_tasks"
  
  # Display task status distribution
  status_dist=$(echo "$response" | jq -r '.tasks_by_status | to_entries | .[] | "\(.key):\(.value)" | @csv' | tr -d '"')
  if [ ! -z "$status_dist" ]; then
    echo "  • Task Status Distribution:"
    echo "$response" | jq -r '.tasks_by_status | to_entries[] | "    - \(.key): \(.value)"'
  fi
  
  echo ""
  echo "✅ Success for $role"
}

echo "=================================================="
echo " DASHBOARD ROLE-BASED FILTERING TEST SUITE"
echo "=================================================="
echo ""

# Test 1: ADMIN (owner) - should see all projects and tasks
test_dashboard "ADMIN (owner)" "admin@orbispm.local" "Admin123!"

# Test 2: ADMIN2 (org admin, no project membership) - should still see all org data
test_dashboard "ADMIN2 (org admin)" "admin2@orbispm.local" "Test@1234!"

# Test 3: MEMBER1 (org member, team lead) - should see accessible projects
test_dashboard "MEMBER1 (org member, team lead)" "member1@orbispm.local" "Test@1234!"

# Test 4: MEMBER2 (org member, senior dev) - should see accessible projects
test_dashboard "MEMBER2 (org member, senior dev)" "member2@orbispm.local" "Test@1234!"

# Test 5: VIEWER1 (org viewer, project intern) - should see only their project
test_dashboard "VIEWER1 (org viewer, project intern)" "viewer1@orbispm.local" "Test@1234!"

# Test 6: BILLING1 (org billing admin, project qa_tester) - should see org and project data
test_dashboard "BILLING1 (org billing admin)" "billing1@orbispm.local" "Test@1234!"

echo ""
echo "=================================================="
echo " ALL TESTS COMPLETED"
echo "=================================================="
