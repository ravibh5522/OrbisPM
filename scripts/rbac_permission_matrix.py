#!/usr/bin/env python3
"""
Dumps the FULL live permission matrix: every seeded (resource, action, scope)
triple, cross-referenced against every SYSTEM role's actual granted
permissions — pulled straight from the running API, not from migration
files (which may have drifted from what's actually deployed).

Answers the question "which roles can do what, feature by feature, action
by action" precisely, including the cases where a role has read but not
write on a given resource.

Self-contained: creates one throwaway owner + org via the public API to
read the org's freshly-seeded system roles (every org gets the same system
role set), then discards nothing destructive — no other data is touched.

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

# ── System roles per scope, with their populated permissions ────────────────
roles_by_scope = {}
for scope in ("org", "team", "project"):
    status, roles = req("GET", f"/orgs/{ORG}/permissions/roles?scope={scope}", token)
    assert status == 200, f"roles fetch failed for {scope}: {status} {roles}"
    roles_by_scope[scope] = [r for r in roles if r.get("is_system")]

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
lines.append("# RBAC Permission Matrix — Live Seeded Data\n")
lines.append(f"Generated {time.strftime('%Y-%m-%d %H:%M:%S')} against `{BASE}`. "
              f"Every org gets this same system-role seed — this is the real baseline every custom role is layered on top of.\n")
lines.append(f"**Total canonical permissions:** {len(perms)}\n")

for scope in ("org", "team", "project"):
    roles = roles_by_scope[scope]
    role_names = [r["name"] for r in roles]
    lines.append(f"\n## {scope.capitalize()} scope\n")
    lines.append("System roles: " + ", ".join(f"**{n}**" for n in role_names) + "\n")

    resources = sorted({res for (res, sc) in by_resource if sc == scope})
    lines.append(f"\n| Resource | Action | " + " | ".join(role_names) + " |")
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
