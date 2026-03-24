#!/bin/bash
ZIT_URL="https://zitadel.animastuff.fun"
ZIT_PAT="CNHZW7FHGU-VA1DphdxaF1eS5tfdkHc7EI_FxziZmIlwi1FVFS8PRp9OMTchtPRt2AojMXg"
NEW_PASS="Test@1234!"

get_uid() {
  local email=$1
  curl -sk "$ZIT_URL/v2/users" \
    -H "Authorization: Bearer $ZIT_PAT" \
    -H "Content-Type: application/json" \
    -d "{\"queries\":[{\"emailQuery\":{\"emailAddress\":\"$email\",\"method\":\"TEXT_QUERY_METHOD_EQUALS\"}}]}" | python3 -c "import sys,json; r=json.load(sys.stdin).get('result',[]); print(r[0]['userId'] if r else '')"
}

reset_password() {
  local uid=$1 email=$2
  echo -n "  Resetting password for $email (uid=$uid)... "
  local resp=$(curl -sk -w "\n%{http_code}" "$ZIT_URL/v2/users/$uid/password" \
    -H "Authorization: Bearer $ZIT_PAT" \
    -H "Content-Type: application/json" \
    -d "{\"newPassword\":{\"password\":\"$NEW_PASS\",\"changeRequired\":false}}")
  local code=$(echo "$resp" | tail -1)
  echo "HTTP $code"
}

echo "=== Getting user IDs ==="
for email in member1@orbispm.local member2@orbispm.local viewer1@orbispm.local billing1@orbispm.local admin2@orbispm.local; do
  uid=$(get_uid "$email")
  if [ -n "$uid" ]; then
    echo "$email → $uid"
    reset_password "$uid" "$email"
  else
    echo "$email → NOT FOUND"
  fi
done

echo ""
echo "=== Verify logins ==="
for email in member1@orbispm.local member2@orbispm.local viewer1@orbispm.local billing1@orbispm.local admin2@orbispm.local; do
  echo -n "  $email: "
  resp=$(curl -s http://localhost:8000/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"$NEW_PASS\"}")
  has_token=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('access_token') else f'FAIL: {d.get(\"message\",\"unknown\")}')")
  echo "$has_token"
done
