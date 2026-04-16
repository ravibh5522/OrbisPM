#!/usr/bin/env python3
"""
Create 6 demo Zitadel users for OrbisPM and wire them into the Acme Corp demo org.

Run from project root:
  python3 scripts/create_demo_zitadel_users.py [--env .env.production]

What it does:
  1. Signs up each demo user via the backend /api/v1/auth/signup endpoint
  2. Extracts their internal UUID (DB primary key) from the response
  3. INSERTs them into org_members, team_members, project_members for the Acme
     Corp demo org (seeded by seed_demo_prod.sql)
  4. Prints a summary of created UUIDs (save as DEMO_CREDENTIALS.md input)
"""
import json, os, sys, urllib.request, urllib.error
import uuid
import psycopg2
from urllib.parse import urlparse

# ── Load .env ────────────────────────────────────────────────────────────────
def load_dotenv(path):
    if not os.path.isfile(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k not in os.environ:
                os.environ[k] = v

env_file = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env.production')
load_dotenv(env_file)

# ── Config ───────────────────────────────────────────────────────────────────
API_URL      = os.environ.get('DEMO_API_URL', 'http://10.0.6.12:8080')
DB_HOST      = os.environ.get('POSTGRES_HOST', '192.168.1.15')
DB_PORT      = int(os.environ.get('POSTGRES_PORT', 5432))
DB_NAME      = os.environ.get('POSTGRES_DB', 'orbispmdev')
DB_USER      = os.environ.get('POSTGRES_USER', 'ravi_admin')
DB_PASS      = os.environ.get('POSTGRES_PASSWORD', 'Suraj5522')

DEMO_ORG_ID    = 'dd000000-0000-4000-a000-000000000001'
DEMO_ORG_SLUG  = 'acme-corp'

# ── Demo personas ─────────────────────────────────────────────────────────────
DEMO_USERS = [
    {
        'email':    'sarah.chen@acme.demo',
        'name':     'Sarah Chen',
        'password': 'Demo@Acme2026!',
        'org_role': 'owner',
        'team_id':  'dd000000-0000-4000-a000-000000000201',  # Backend Platform
        'team_role':'team_lead',
        'project_id':'dd000000-0000-4000-a000-000000000301',  # Phoenix
        'proj_role':'lead',
        'label':    'Org Owner — VP Engineering',
    },
    {
        'email':    'marcus.johnson@acme.demo',
        'name':     'Marcus Johnson',
        'password': 'Demo@Acme2026!',
        'org_role': 'admin',
        'team_id':  'dd000000-0000-4000-a000-000000000201',
        'team_role':'team_lead',
        'project_id':'dd000000-0000-4000-a000-000000000301',
        'proj_role':'lead',
        'label':    'Org Admin — Engineering Manager',
    },
    {
        'email':    'priya.patel@acme.demo',
        'name':     'Priya Patel',
        'password': 'Demo@Acme2026!',
        'org_role': 'member',
        'team_id':  'dd000000-0000-4000-a000-000000000201',
        'team_role':'member',
        'project_id':'dd000000-0000-4000-a000-000000000301',
        'proj_role':'contributor',
        'label':    'Org Member — Senior Backend Engineer',
    },
    {
        'email':    'olivia.brown@acme.demo',
        'name':     'Olivia Brown',
        'password': 'Demo@Acme2026!',
        'org_role': 'member',
        'team_id':  'dd000000-0000-4000-a000-000000000202',  # Frontend
        'team_role':'team_lead',
        'project_id':'dd000000-0000-4000-a000-000000000302',  # Aurora
        'proj_role':'lead',
        'label':    'Org Member — Lead Designer',
    },
    {
        'email':    'mia.anderson@acme.demo',
        'name':     'Mia Anderson',
        'password': 'Demo@Acme2026!',
        'org_role': 'member',
        'team_id':  'dd000000-0000-4000-a000-000000000203',  # QA
        'team_role':'team_lead',
        'project_id':'dd000000-0000-4000-a000-000000000302',
        'proj_role':'reviewer',
        'label':    'Org Member — QA Lead',
    },
    {
        'email':    'mason.walker@acme.demo',
        'name':     'Mason Walker',
        'password': 'Demo@Acme2026!',
        'org_role': 'billing_admin',
        'team_id':  None,
        'team_role':None,
        'project_id':'dd000000-0000-4000-a000-000000000303',  # Nebula
        'proj_role':'observer',
        'label':    'Billing Admin — Finance',
    },
]

# ── HTTP helper ───────────────────────────────────────────────────────────────
def post_json(url, payload):
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Accept', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode()), r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return json.loads(body) if body.strip().startswith('{') else {'error': body}, e.code

# ── DB helper ─────────────────────────────────────────────────────────────────
def get_db():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS
    )

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    print(f"API → {API_URL}")
    print(f"DB  → {DB_USER}@{DB_HOST}/{DB_NAME}\n")

    results = []

    for u in DEMO_USERS:
        print(f"Creating {u['name']} ({u['email']}) …")
        resp, status = post_json(
            f"{API_URL}/api/v1/auth/signup",
            {'email': u['email'], 'password': u['password'],
             'name':  u['name']}
        )
        if status not in (200, 201) or 'user' not in resp:
            # Might already exist — try login
            print(f"  Signup failed ({status}), trying login…")
            resp, status = post_json(
                f"{API_URL}/api/v1/auth/login",
                {'email': u['email'], 'password': u['password']}
            )
            if status not in (200, 201) or 'user' not in resp:
                print(f"  ✗ Both signup and login failed: {resp}")
                results.append({**u, 'internal_id': None, 'ok': False})
                continue

        user_obj     = resp.get('user', {})
        # internal_id is the Zitadel numeric ID; we derive UUID5 the same way the Go backend does:
        # uuid.NewSHA1(uuid.NameSpaceURL, []byte(zitadelID)) → Go's UUID5
        zitadel_id   = str(user_obj.get('internal_id') or user_obj.get('id', ''))
        internal_id  = str(uuid.uuid5(uuid.NAMESPACE_URL, zitadel_id)) if zitadel_id else None
        print(f"  ✓ internal_id={internal_id}")
        results.append({**u, 'internal_id': internal_id, 'ok': True})

    # ── DB wiring ───────────────────────────────────────────────────────────
    db = get_db()
    cur = db.cursor()

    for u in results:
        if not u['ok'] or not u['internal_id']:
            continue
        uid = u['internal_id']

        # Org membership
        cur.execute("""
            INSERT INTO org_members (org_id, user_id, role)
            VALUES (%s, %s, %s)
            ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
        """, (DEMO_ORG_ID, uid, u['org_role']))

        # Team membership
        if u['team_id']:
            cur.execute("""
                INSERT INTO team_members (team_id, user_id, role)
                VALUES (%s, %s, %s)
                ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role
            """, (u['team_id'], uid, u['team_role']))

        # Project membership
        if u['project_id']:
            cur.execute("""
                INSERT INTO project_members (project_id, user_id, role, source)
                VALUES (%s, %s, %s, 'direct')
                ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
            """, (u['project_id'], uid, u['proj_role']))

    db.commit()
    cur.close()
    db.close()
    print("\n✓ DB memberships written")

    # ── Summary ─────────────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("DEMO USER CREDENTIALS")
    print("="*60)
    for u in results:
        status = "✓" if u['ok'] else "✗"
        print(f"{status} {u['name']}")
        print(f"   Email:    {u['email']}")
        print(f"   Password: {u['password']}")
        print(f"   Role:     {u['label']}")
        print(f"   UUID:     {u.get('internal_id', 'N/A')}")
        print()

if __name__ == '__main__':
    main()
