#!/usr/bin/env python3
"""
Sets up all 7 project-scope role identities (4 system: lead, contributor,
reviewer, observer; 3 custom: field_tester, reviewer_lite, qa_approver — the
same shapes already enforcement-tested in rbac_conformance_test.py) via the
real API, then hands off a JSON file for the Playwright driver
(frontend/scripts/rbac_frontend_test.mjs) to load the real frontend AS EACH
IDENTITY IN SEQUENCE — one account, test, log, close browser, next account —
and report what's actually rendered for each.

Run:
  python3 scripts/rbac_frontend_test.py --base http://localhost:8000/api/v1
  cd frontend && node scripts/rbac_frontend_test.mjs
"""
import json
import sys
import time
import urllib.request
import urllib.error

BASE = "http://localhost:8000/api/v1"
if "--base" in sys.argv:
    BASE = sys.argv[sys.argv.index("--base") + 1]

TS = int(time.time())
PASSWORD = "RbacFrontend@2026!"


def req(method, path, token=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}


def signup_and_login(email, name):
    req("POST", "/auth/signup", body={"email": email, "password": PASSWORD, "name": name})
    status, body = req("POST", "/auth/login", body={"email": email, "password": PASSWORD})
    if status != 200:
        print(f"  x login failed for {email}: {status} {body}")
        return None
    return body  # full token payload — access_token, refresh_token, expires_in, user


owner_email = f"rbac.fe.owner.{TS}@rbactest.local"
owner = signup_and_login(owner_email, "Frontend Test Owner")
if not owner:
    sys.exit(1)
owner_token = owner["access_token"]

status, org = req("POST", "/orgs", owner_token, {"name": f"Frontend Test {TS}", "slug": f"rbac-fe-{TS}"})
assert status == 201, f"org create failed: {status} {org}"
ORG, ORG_SLUG = org["id"], org["slug"]

status, proj = req("POST", f"/orgs/{ORG}/projects", owner_token, {"name": "Frontend Test Project"})
assert status == 201, f"project create failed: {status} {proj}"
PROJECT = proj["id"]

# Seed one visible task so "lead" has something real to see/act on.
req("POST", f"/orgs/{ORG}/projects/{PROJECT}/tasks", owner_token, {"title": "Sample visible task"})

status, perms = req("GET", f"/orgs/{ORG}/permissions", owner_token)
perm_id = {(p["scope"], p["resource"], p["action"]): p["id"] for p in perms}


def pid(resource, action):
    return str(perm_id[("project", resource, action)])


CUSTOM_ROLES = [
    {"slug": f"field_tester_{TS}", "name": "Field Tester",
     "perms": [pid("tasks", "create")]},
    {"slug": f"reviewer_lite_{TS}", "name": "Reviewer Lite",
     "perms": [pid("tasks", "read"), pid("tasks", "review")]},
    {"slug": f"qa_approver_{TS}", "name": "QA Approver",
     "perms": [pid("tasks", "read"), pid("tasks", "review"), pid("comments", "create"), pid("comments", "read")]},
]
for r in CUSTOM_ROLES:
    status, role = req("POST", f"/orgs/{ORG}/permissions/roles", owner_token, {
        "scope": "project", "slug": r["slug"], "name": r["name"], "permission_ids": r["perms"],
    })
    assert status == 201, f"custom role create failed for {r['slug']}: {status} {role}"

IDENTITIES = [
    ("lead", "lead"),
    ("contributor", "contributor"),
    ("reviewer", "reviewer"),
    ("observer", "observer"),
    ("field_tester", CUSTOM_ROLES[0]["slug"]),
    ("reviewer_lite", CUSTOM_ROLES[1]["slug"]),
    ("qa_approver", CUSTOM_ROLES[2]["slug"]),
]

sessions = []
for label, project_role in IDENTITIES:
    email = f"rbac.fe.{label}.{TS}@rbactest.local"
    tokens = signup_and_login(email, label)
    if not tokens:
        continue
    uid = tokens["user"].get("internal_id") or tokens["user"].get("id")
    req("POST", f"/orgs/{ORG}/members/invite", owner_token, {"user_id": uid, "role": "member"})
    status, _ = req("POST", f"/orgs/{ORG}/projects/{PROJECT}/members", owner_token,
                     {"user_id": uid, "role": project_role})
    print(f"OK {label:14s} -> project_role={project_role} add_member_status={status}")
    sessions.append({
        "label": label,
        "project_role": project_role,
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "expires_in": tokens.get("expires_in", 3600),
        "user": tokens["user"],
    })

with open("/tmp/rbac_frontend_sessions.json", "w") as f:
    json.dump({"org_slug": ORG_SLUG, "project_id": PROJECT, "sessions": sessions}, f)

print(f"\nWrote /tmp/rbac_frontend_sessions.json")
print(f"Org: {ORG_SLUG}  Project: {PROJECT}")
