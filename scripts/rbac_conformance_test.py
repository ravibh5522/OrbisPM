#!/usr/bin/env python3
"""
RBAC conformance test — hits the LIVE running OrbisPM API with real users,
real roles (system + 3 new custom ones), and real feature endpoints, then
reports which (role, endpoint) pairs behave as their permission set says
they should, and which don't.

Fully self-contained: creates its own throwaway org/team/project/users via
the public API (signup, login, org/team/project create) so it never touches
any existing org or account. Safe to re-run.

Run from project root:
  python3 scripts/rbac_conformance_test.py [--base http://localhost:8000/api/v1]
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
PASSWORD = "RbacTest@2026!"


REQUEST_DELAY = 0.2  # seconds between requests — stays under the backend's
                      # per-IP rate limiter (600/min sustained, burst 50).
                      # All test identities share one source IP, so without
                      # this every identity after the first ~50 calls gets
                      # 429'd regardless of its actual permissions.


def req(method, path, token=None, body=None, _retry=True):
    time.sleep(REQUEST_DELAY)
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw.strip().startswith("{") or raw.strip().startswith("[") else {})
    except urllib.error.HTTPError as e:
        if e.code == 429 and _retry:
            time.sleep(2.0)  # back off and retry once — rate limit, not a permission verdict
            return req(method, path, token, body, _retry=False)
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}
    except Exception as e:
        return 0, {"error": str(e)}


def signup_and_login(email, name):
    req("POST", "/auth/signup", body={"email": email, "password": PASSWORD, "name": name})
    status, body = req("POST", "/auth/login", body={"email": email, "password": PASSWORD})
    if status != 200:
        print(f"  ✗ login failed for {email}: {status} {body}")
        return None, None
    token = body.get("access_token")
    internal_id = (body.get("user") or {}).get("internal_id")
    return token, internal_id


print(f"Target API: {BASE}")
print(f"Run id: {TS}\n")

print("=" * 70)
print("SETUP: owner + throwaway org/team/project")
print("=" * 70)

owner_email = f"rbac.owner.{TS}@rbactest.local"
owner_token, owner_id = signup_and_login(owner_email, "RBAC Test Owner")
if not owner_token:
    print("FATAL: could not create owner account. Is the API reachable at", BASE, "?")
    sys.exit(1)
print(f"✓ owner created: {owner_email} ({owner_id})")

status, org = req("POST", "/orgs", owner_token, {"name": f"RBAC Conformance {TS}", "slug": f"rbac-conf-{TS}"})
assert status == 201, f"org create failed: {status} {org}"
ORG = org["id"]
print(f"✓ org created: {ORG}")

status, team = req("POST", f"/orgs/{ORG}/teams", owner_token, {"name": "Conformance Team"})
assert status == 201, f"team create failed: {status} {team}"
TEAM = team["id"]
print(f"✓ team created: {TEAM}")

status, proj = req("POST", f"/orgs/{ORG}/projects", owner_token, {"name": "Conformance Project"})
assert status == 201, f"project create failed: {status} {proj}"
PROJECT = proj["id"]
print(f"✓ project created: {PROJECT}")

# ── Canonical permission ID lookup (needed to build custom roles) ──────────
status, perms = req("GET", f"/orgs/{ORG}/permissions", owner_token)
assert status == 200, f"permissions list failed: {status} {perms}"
perm_id = {}
for p in perms:
    perm_id[(p["scope"], p["resource"], p["action"])] = p["id"]


def pid(scope, resource, action):
    key = (scope, resource, action)
    if key not in perm_id:
        raise SystemExit(f"FATAL: permission {key} not found in seeded permissions — can't build custom role")
    return perm_id[key]


print("\n" + "=" * 70)
print("CREATING 3 NEW CUSTOM ROLES")
print("=" * 70)

CUSTOM_ROLES = [
    {
        "scope": "project", "slug": f"field_tester_{TS}", "name": "Field Tester",
        "perms": [("project", "tasks", "create")],
        "note": "Deliberately has NO project:read — regression test for the my-permissions self-check fix",
    },
    {
        "scope": "project", "slug": f"reviewer_lite_{TS}", "name": "Reviewer Lite",
        "perms": [("project", "tasks", "read"), ("project", "tasks", "review")],
        "note": "Narrower than the system 'reviewer' role — no comments, no direct_update",
    },
    {
        "scope": "team", "slug": f"comms_only_{TS}", "name": "Comms Only",
        "perms": [("team", "team", "read"), ("team", "comments", "create")],
        "note": "Unusual combo: can see the team and comment, nothing else",
    },
    # The following 5 mirror scripts/rbac_permission_matrix.py's roles exactly —
    # that script only verified their DB permission assignment via the roles
    # listing endpoint. This closes the gap by actually hitting protected
    # endpoints with real users assigned these exact roles.
    {
        "scope": "org", "slug": f"template_manager_{TS}", "name": "Template Manager",
        "perms": [("org", "templates", "create"), ("org", "templates", "update"),
                  ("org", "templates", "delete"), ("org", "templates", "read")],
        "note": "Full CRUD on templates only — nothing else, not even tasks",
    },
    {
        "scope": "org", "slug": f"read_only_auditor_{TS}", "name": "Read Only Auditor",
        "perms": [("org", "org", "read"), ("org", "projects", "read"),
                  ("org", "teams", "read"), ("org", "tasks", "read")],
        "note": "Multi-resource read-only, hand-picked (not the seeded 'viewer' shape)",
    },
    {
        "scope": "team", "slug": f"task_runner_{TS}", "name": "Task Runner",
        "perms": [("team", "tasks", "create"), ("team", "tasks", "update"), ("team", "tasks", "read")],
        "note": "Can work tasks, cannot see team settings or comment",
    },
    {
        "scope": "team", "slug": f"silent_observer_{TS}", "name": "Silent Observer",
        "perms": [("team", "team", "read")],
        "note": "Can see the team exists, nothing else — not even tasks:read",
    },
    {
        "scope": "project", "slug": f"qa_approver_{TS}", "name": "QA Approver",
        "perms": [("project", "tasks", "read"), ("project", "tasks", "review"),
                  ("project", "comments", "create"), ("project", "comments", "read")],
        "note": "Narrower than the system 'reviewer' — no direct_update",
    },
]

for r in CUSTOM_ROLES:
    permission_ids = [str(pid(*p)) for p in r["perms"]]
    status, role = req("POST", f"/orgs/{ORG}/permissions/roles", owner_token, {
        "scope": r["scope"], "slug": r["slug"], "name": r["name"], "permission_ids": permission_ids,
    })
    assert status == 201, f"custom role create failed for {r['slug']}: {status} {role}"
    r["id"] = role["id"]
    print(f"✓ {r['scope']:8s} role '{r['name']}' ({r['slug']}) — perms: {[f'{s}:{a}' for _, s, a in r['perms']]}")
    print(f"    {r['note']}")

# ── Identities under test ───────────────────────────────────────────────────
# (label, kind, org_role, team_role_or_None, project_role_or_None)
IDENTITIES = [
    ("owner",                  "org",     "owner",         None,       None),
    ("org_admin",              "org",     "admin",         None,       None),
    ("org_member",             "org",     "member",        None,       None),
    ("org_viewer",             "org",     "viewer",        None,       None),
    ("org_billing_admin",      "org",     "billing_admin", None,       None),
    ("project_lead",           "project", "member",        None,       "lead"),
    ("project_contributor",    "project", "member",        None,       "contributor"),
    ("project_reviewer",       "project", "member",        None,       "reviewer"),
    ("project_observer",       "project", "member",        None,       "observer"),
    ("project_field_tester",   "project", "member",        None,       CUSTOM_ROLES[0]["slug"]),
    ("project_reviewer_lite",  "project", "member",        None,       CUSTOM_ROLES[1]["slug"]),
    ("team_lead",              "team",    "member",        "team_lead", None),
    ("team_member",            "team",    "member",        "member",   None),
    ("team_comms_only",        "team",    "member",        CUSTOM_ROLES[2]["slug"], None),
    ("org_template_manager",   "org",     CUSTOM_ROLES[3]["slug"], None, None),
    ("org_read_only_auditor",  "org",     CUSTOM_ROLES[4]["slug"], None, None),
    ("team_task_runner",       "team",    "member",        CUSTOM_ROLES[5]["slug"], None),
    ("team_silent_observer",   "team",    "member",        CUSTOM_ROLES[6]["slug"], None),
    ("project_qa_approver",    "project", "member",        None,       CUSTOM_ROLES[7]["slug"]),
]

print("\n" + "=" * 70)
print("CREATING TEST USERS AND ASSIGNING ROLES")
print("=" * 70)

users = {}
for label, kind, org_role, team_role, project_role in IDENTITIES:
    if label == "owner":
        users[label] = {"token": owner_token, "id": owner_id}
        print(f"✓ {label:24s} → org={org_role} (creator)")
        continue
    email = f"rbac.{label}.{TS}@rbactest.local"
    token, uid = signup_and_login(email, label)
    if not token:
        print(f"✗ {label}: could not create/login user, skipping")
        continue
    status, _ = req("POST", f"/orgs/{ORG}/members/invite", owner_token, {"user_id": uid, "role": org_role})
    if status not in (200, 201, 204):
        print(f"✗ {label}: org invite failed ({status})")
        continue
    if team_role:
        status, _ = req("POST", f"/orgs/{ORG}/teams/{TEAM}/members", owner_token, {"user_id": uid, "role": team_role})
        if status not in (200, 201, 204):
            print(f"  ⚠ {label}: team member add returned {status}")
    if project_role:
        status, _ = req("POST", f"/orgs/{ORG}/projects/{PROJECT}/members", owner_token, {"user_id": uid, "role": project_role})
        if status not in (200, 201, 204):
            print(f"  ⚠ {label}: project member add returned {status}")
    users[label] = {"token": token, "id": uid}
    print(f"✓ {label:24s} → org={org_role}" + (f" team={team_role}" if team_role else "") + (f" project={project_role}" if project_role else ""))

# ── Ground truth: fetch each identity's actual effective permissions ───────
print("\n" + "=" * 70)
print("FETCHING GROUND-TRUTH PERMISSIONS (/my-permissions)")
print("=" * 70)


def has_perm(perm_list, resource, action):
    for p in perm_list:
        if p["action"] == action and (p["resource"] == resource or p["resource"] == "*"):
            return True
    return False


for label, kind, org_role, team_role, project_role in IDENTITIES:
    u = users.get(label)
    if not u:
        continue
    org_perms = []
    status, body = req("GET", f"/orgs/{ORG}/my-permissions", u["token"])
    if status == 200:
        org_perms = body.get("permissions", [])
    u["org_role_effective"] = body.get("role") if status == 200 else None
    u["org_perms"] = org_perms

    proj_perms = []
    status, body = req("GET", f"/orgs/{ORG}/projects/{PROJECT}/my-permissions", u["token"])
    if status == 200:
        proj_perms = body.get("permissions", [])
    u["proj_role_effective"] = body.get("role") if status == 200 else None
    u["proj_perms"] = proj_perms

    team_perms = []
    status, body = req("GET", f"/orgs/{ORG}/teams/{TEAM}/my-permissions", u["token"])
    if status == 200:
        team_perms = body.get("permissions", [])
    u["team_role_effective"] = body.get("role") if status == 200 else None
    u["team_perms"] = team_perms

    print(f"{label:24s} org_role={u['org_role_effective']!s:14s} proj_role={u['proj_role_effective']!s:14s} team_role={u['team_role_effective']!s:14s} "
          f"org_perms={len(org_perms)} proj_perms={len(proj_perms)} team_perms={len(team_perms)}")

# ── Feature endpoint matrix ─────────────────────────────────────────────────
# Each entry: (feature_label, scope, resource, action, fn(user) -> (status, body))

def call_project_get(u):
    return req("GET", f"/orgs/{ORG}/projects/{PROJECT}", u["token"])


def call_project_update(u):
    return req("PATCH", f"/orgs/{ORG}/projects/{PROJECT}", u["token"], {"description": f"updated by test @ {TS}"})


def call_tasks_read(u):
    return req("GET", f"/orgs/{ORG}/projects/{PROJECT}/tasks", u["token"])


def call_task_create(u):
    status, body = req("POST", f"/orgs/{ORG}/projects/{PROJECT}/tasks", u["token"], {"title": f"task-by-test-{TS}"})
    if status == 201:
        u["own_task_id"] = body.get("id") or (body.get("task") or {}).get("id")
    return status, body


def call_task_update(u):
    tid = u.get("own_task_id")
    if not tid:
        return None, {"skipped": "no task created (tasks:create likely denied)"}
    return req("PATCH", f"/orgs/{ORG}/projects/{PROJECT}/tasks/{tid}", u["token"], {"priority": "high"})


def call_comment_create(u):
    tid = u.get("own_task_id")
    if not tid:
        return None, {"skipped": "no task created"}
    return req("POST", f"/orgs/{ORG}/projects/{PROJECT}/tasks/{tid}/comments", u["token"], {"body": "test comment"})


def call_task_review(u):
    tid = u.get("own_task_id")
    if not tid:
        return None, {"skipped": "no task created"}
    return req("POST", f"/orgs/{ORG}/projects/{PROJECT}/tasks/{tid}/complete", u["token"])


def call_task_delete(u):
    tid = u.get("own_task_id")
    if not tid:
        return None, {"skipped": "no task created"}
    return req("DELETE", f"/orgs/{ORG}/projects/{PROJECT}/tasks/{tid}", u["token"])


def call_project_member_add(u):
    return req("POST", f"/orgs/{ORG}/projects/{PROJECT}/members", u["token"], {"user_id": "00000000-0000-0000-0000-000000000000", "role": "observer"})


def call_team_get(u):
    return req("GET", f"/orgs/{ORG}/teams/{TEAM}", u["token"])


def call_team_update(u):
    return req("PATCH", f"/orgs/{ORG}/teams/{TEAM}", u["token"], {"description": f"updated @ {TS}"})


def call_team_member_add(u):
    return req("POST", f"/orgs/{ORG}/teams/{TEAM}/members", u["token"], {"user_id": "00000000-0000-0000-0000-000000000000", "role": "member"})


def call_org_projects_create(u):
    return req("POST", f"/orgs/{ORG}/projects", u["token"], {"name": f"throwaway-{TS}-{u.get('id','')[:6]}"})


def call_org_roles_create(u):
    return req("POST", f"/orgs/{ORG}/permissions/roles", u["token"],
               {"scope": "org", "slug": f"probe-{TS}-{u.get('id','')[:6]}", "name": "Probe", "permission_ids": []})


def call_org_webhooks_create(u):
    return req("POST", f"/orgs/{ORG}/webhooks", u["token"], {"url": "https://example.com/hook", "events": ["task.created"]})


def call_org_projects_list(u):
    return req("GET", f"/orgs/{ORG}/projects", u["token"])


def call_org_teams_list(u):
    return req("GET", f"/orgs/{ORG}/teams", u["token"])


def call_org_templates_list(u):
    return req("GET", f"/orgs/{ORG}/templates", u["token"])


def call_org_template_create(u):
    return req("POST", f"/orgs/{ORG}/templates", u["token"],
               {"name": f"tpl-{TS}", "structure": {"tasks": []}})


FEATURES = [
    ("GET project",           "proj_perms", "project", "read",           call_project_get),
    ("PATCH project",         "proj_perms", "project", "update",         call_project_update),
    ("GET tasks",             "proj_perms", "tasks",   "read",           call_tasks_read),
    ("POST task (create)",    "proj_perms", "tasks",   "create",         call_task_create),
    ("PATCH task (update)",   "proj_perms", "tasks",   "update",         call_task_update),
    ("POST comment",          "proj_perms", "comments","create",         call_comment_create),
    ("POST task complete",    "proj_perms", "tasks",   "review",         call_task_review),
    ("DELETE task",           "proj_perms", "tasks",   "delete",         call_task_delete),
    ("POST project member",  "proj_perms", "members", "manage",         call_project_member_add),
    ("GET team",               "team_perms", "team",   "read",           call_team_get),
    ("PATCH team",             "team_perms", "team",   "update",         call_team_update),
    ("POST team member",      "team_perms", "team",   "manage_members", call_team_member_add),
    ("POST org project create","org_perms", "projects","create",         call_org_projects_create),
    ("POST org role create",  "org_perms",  "roles",  "create",         call_org_roles_create),
    ("POST org webhook",      "org_perms",  "webhooks","manage",        call_org_webhooks_create),
    ("GET org projects list", "org_perms",  "projects","read",          call_org_projects_list),
    ("GET org teams list",    "org_perms",  "teams",  "read",           call_org_teams_list),
    ("GET org templates",     "org_perms",  "templates","read",         call_org_templates_list),
    ("POST org template",     "org_perms",  "templates","create",       call_org_template_create),
]

print("\n" + "=" * 70)
print("HITTING FEATURE ENDPOINTS PER IDENTITY")
print("=" * 70)

results = []  # (label, feature, expected_allowed, actual_status, verdict)

for label, kind, org_role, team_role, project_role in IDENTITIES:
    u = users.get(label)
    if not u:
        continue
    for feat_label, perm_key, resource, action, fn in FEATURES:
        expected_allowed = has_perm(u.get(perm_key, []), resource, action)
        status, body = fn(u)
        if status is None:
            results.append((label, feat_label, expected_allowed, "SKIPPED", "SKIP"))
            continue
        if status == 429:
            results.append((label, feat_label, expected_allowed, status, "RATE_LIMITED"))
            continue
        actual_allowed = status not in (401, 403)
        if expected_allowed == actual_allowed:
            verdict = "PASS"
        elif expected_allowed and not actual_allowed:
            verdict = "FAIL (should be ALLOWED, got denied)"
        else:
            verdict = "FAIL (should be DENIED, got allowed)"
        results.append((label, feat_label, expected_allowed, status, verdict))

# ── Report ──────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("RESULTS")
print("=" * 70)

passed = [r for r in results if r[4] == "PASS"]
skipped = [r for r in results if r[4] == "SKIP"]
rate_limited = [r for r in results if r[4] == "RATE_LIMITED"]
failed = [r for r in results if r[4].startswith("FAIL")]

for label, kind, org_role, team_role, project_role in IDENTITIES:
    rows = [r for r in results if r[0] == label]
    if not rows:
        continue
    print(f"\n--- {label} ---")
    for _, feat, expected, status, verdict in rows:
        exp_s = "ALLOW" if expected else "DENY "
        mark = "✓" if verdict == "PASS" else ("·" if verdict in ("SKIP", "RATE_LIMITED") else "✗")
        print(f"  {mark} {feat:24s} expected={exp_s}  actual_status={status!s:8s}  {verdict}")

print("\n" + "=" * 70)
print(f"SUMMARY: {len(passed)} passed, {len(failed)} failed, {len(skipped)} skipped, {len(rate_limited)} rate-limited (inconclusive) (out of {len(results)})")
print("=" * 70)

if failed:
    print("\nENDPOINTS THAT NEED FIXES:")
    for label, feat, expected, status, verdict in failed:
        print(f"  ✗ [{label}] {feat} — {verdict} (HTTP {status})")
else:
    print("\nAll (role, endpoint) combinations matched their expected permission outcome.")

print(f"\nTest org (safe to delete): {ORG}  slug=rbac-conf-{TS}")
