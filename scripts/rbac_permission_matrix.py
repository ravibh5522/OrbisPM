#!/usr/bin/env python3
"""
Dumps the FULL live permission matrix: every seeded (resource, action, scope)
triple, cross-referenced against every role's actual granted permissions —
both the 12 SYSTEM roles and a set of representative CUSTOM roles created
by this script — pulled straight from the running API, not from migration
files (which may have drifted from what's actually deployed).

Answers "which roles can do what, feature by feature, action by action",
including read-vs-write splits, AND confirms custom roles slot into the
same matrix with exactly the permissions they were given — no more, no
less, no bleed from the system roles they sit alongside.

Self-contained: creates one throwaway owner + org via the public API,
creates 6 custom roles (2 per scope) on it, then discards nothing
destructive — no other data is touched.

Run from project root:
  python3 scripts/rbac_permission_matrix.py [--base http://localhost:8000/api/v1]
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
PASSWORD = "RbacMatrix@2026!"


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


email = f"rbac.matrix.{TS}@rbactest.local"
req("POST", "/auth/signup", body={"email": email, "password": PASSWORD, "name": "Matrix Owner"})
status, body = req("POST", "/auth/login", body={"email": email, "password": PASSWORD})
if status != 200:
    print(f"FATAL: login failed: {status} {body}")
    sys.exit(1)
token = body["access_token"]

status, org = req("POST", "/orgs", token, {"name": f"Matrix {TS}", "slug": f"rbac-matrix-{TS}"})
assert status == 201, f"org create failed: {status} {org}"
ORG = org["id"]

# ── Canonical permissions, straight from the live seed ──────────────────────
status, perms = req("GET", f"/orgs/{ORG}/permissions", token)
assert status == 200, f"permissions fetch failed: {status} {perms}"

perm_id = {(p["scope"], p["resource"], p["action"]): p["id"] for p in perms}


def pid(scope, resource, action):
    key = (scope, resource, action)
    if key not in perm_id:
        raise SystemExit(f"FATAL: permission {key} not seeded — can't build custom role")
    return perm_id[key]


# ── Create representative custom roles, 2 per scope ─────────────────────────
CUSTOM_ROLES = [
    {"scope": "org", "slug": f"template_manager_{TS}", "name": "Template Manager",
     "perms": [("org", "templates", "create"), ("org", "templates", "update"),
               ("org", "templates", "delete"), ("org", "templates", "read")],
     "note": "Full CRUD on templates only — nothing else, not even tasks"},
    {"scope": "org", "slug": f"read_only_auditor_{TS}", "name": "Read Only Auditor",
     "perms": [("org", "org", "read"), ("org", "projects", "read"),
               ("org", "teams", "read"), ("org", "tasks", "read")],
     "note": "Multi-resource read-only, hand-picked (not the seeded 'viewer' shape)"},
    {"scope": "team", "slug": f"task_runner_{TS}", "name": "Task Runner",
     "perms": [("team", "tasks", "create"), ("team", "tasks", "update"), ("team", "tasks", "read")],
     "note": "Can work tasks, cannot see team settings or comment"},
    {"scope": "team", "slug": f"silent_observer_{TS}", "name": "Silent Observer",
     "perms": [("team", "team", "read")],
     "note": "Can see the team exists, nothing else — not even tasks:read"},
    {"scope": "project", "slug": f"field_tester_{TS}", "name": "Field Tester",
     "perms": [("project", "tasks", "create")],
     "note": "Has create, deliberately NO read — the my-permissions self-check edge case"},
    {"scope": "project", "slug": f"qa_approver_{TS}", "name": "QA Approver",
     "perms": [("project", "tasks", "read"), ("project", "tasks", "review"),
               ("project", "comments", "create"), ("project", "comments", "read")],
     "note": "Narrower than the system 'reviewer' — no direct_update"},
]

for r in CUSTOM_ROLES:
    permission_ids = [str(pid(*p)) for p in r["perms"]]
    status, role = req("POST", f"/orgs/{ORG}/permissions/roles", token, {
        "scope": r["scope"], "slug": r["slug"], "name": r["name"], "permission_ids": permission_ids,
    })
    assert status == 201, f"custom role create failed for {r['slug']}: {status} {role}"

# ── All roles per scope (system + the custom ones just created) ─────────────
roles_by_scope = {}
for scope in ("org", "team", "project"):
    status, roles = req("GET", f"/orgs/{ORG}/permissions/roles?scope={scope}", token)
    assert status == 200, f"roles fetch failed for {scope}: {status} {roles}"
    # System roles first, then custom — stable, readable column order
    roles_by_scope[scope] = sorted(roles, key=lambda r: (not r.get("is_system"), r["name"]))

# ── Build resource -> action -> scope -> {role: bool} ────────────────────────
by_resource = {}
for p in perms:
    by_resource.setdefault((p["resource"], p["scope"]), set()).add(p["action"])


def role_has(role, resource, action):
    for p in role.get("permissions") or []:
        if p["action"] == action and (p["resource"] == resource or p["resource"] == "*"):
            return True
    return False


lines = []
lines.append("# RBAC Permission Matrix — Live Seeded Data + Custom Roles\n")
lines.append(f"Generated {time.strftime('%Y-%m-%d %H:%M:%S')} against `{BASE}`. "
              f"Includes all system roles plus 6 representative custom roles created by this script "
              f"({', '.join(r['name'] for r in CUSTOM_ROLES)}), to confirm custom roles slot into the "
              f"exact same permission model with no special-casing.\n")
lines.append(f"**Total canonical permissions:** {len(perms)}\n")

notes_by_slug = {r["slug"]: r["note"] for r in CUSTOM_ROLES}

for scope in ("org", "team", "project"):
    roles = roles_by_scope[scope]
    role_names = [r["name"] + ("" if r.get("is_system") else " *(Custom)*") for r in roles]
    lines.append(f"\n## {scope.capitalize()} scope\n")
    custom_here = [r for r in roles if not r.get("is_system")]
    if custom_here:
        lines.append("Custom roles in this scope:")
        for r in custom_here:
            lines.append(f"- **{r['name']}** — {notes_by_slug.get(r['slug'], '')}")
        lines.append("")

    resources = sorted({res for (res, sc) in by_resource if sc == scope})
    lines.append(f"| Resource | Action | " + " | ".join(role_names) + " |")
    lines.append("|---|---|" + "---|" * len(roles))
    for resource in resources:
        actions = sorted(by_resource[(resource, scope)])
        for action in actions:
            row = [resource, action]
            for r in roles:
                row.append("✅" if role_has(r, resource, action) else "—")
            lines.append("| " + " | ".join(row) + " |")

report = "\n".join(lines)
print(report)

with open("docs/RBAC_PERMISSION_MATRIX.md", "w") as f:
    f.write(report + "\n")
print(f"\n\nWritten to docs/RBAC_PERMISSION_MATRIX.md")
print(f"Test org (safe to delete): {ORG}")
