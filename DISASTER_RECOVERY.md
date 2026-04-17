# OrbisPM — Production Disaster Recovery & Incident Response

> **Version:** 1.0 — April 2026  
> **Scope:** All 6 production failure scenarios with step-by-step response, prevention, and recovery playbooks.

---

## Table of Contents

1. [Zitadel ↔ App DB Separation](#1-zitadel--app-db-separation)
2. [All User Accounts Deleted — Data Safe](#2-all-user-accounts-deleted--data-safe)
3. [Zitadel Fully Deleted / Corrupted](#3-zitadel-fully-deleted--corrupted)
4. [Org Data Partially Corrupted](#4-org-data-partially-corrupted)
5. [Mass Server Attack / DDoS / Breach](#5-mass-server-attack--ddos--breach)
6. [Org / User Credentials Leaked](#6-org--user-credentials-leaked)

---

## Architecture Reference

```
                ┌──────────────────────────────────────────────┐
                │              orbispmdev (AWS RDS)             │
                │                                               │
  OrbisPM API ──┤  public.*  (org/teams/projects/tasks/...)    │
                │  auth.*    (Zitadel projections/users)        │
                │  projections.* / eventstore.*  (Zitadel)     │
                └──────────────────────────────────────────────┘
                              ▲                ▲
                              │                │
                    OrbisPM API          Zitadel service
                  (internal_id = UUID5(zitadel_id))
```

**Key coupling points:**
- `public.users.id` = `uuid5(NAMESPACE_URL, zitadel_numeric_id)` — derived, not stored in Zitadel
- `org_members`, `team_members`, `project_members` reference `public.users.id`
- Zitadel and OrbisPM app share the **same RDS instance** by default (different schemas)
- All tenant data isolated via PostgreSQL RLS (`app.current_org_id`)

---

## 1. Zitadel ↔ App DB Separation

### Problem
Currently Zitadel (`auth.*`, `projections.*`, `eventstore.*`, `system.*`) and the OrbisPM application (`public.*`) share the same AWS RDS instance `orbispmdev`. This creates:
- Single point of failure (Zitadel event storm can starve app queries)
- Schema migration conflicts
- Impossible to scale auth and app independently
- Zitadel's `pg_partman` background jobs affect app query performance

### Solution: Move Zitadel to an Isolated DB

#### Step 1 — Provision the Zitadel-dedicated DB

```bash
# Create a new RDS instance (or a new DB on the same instance as interim step)
# Recommended: separate instance (db.t4g.medium, Postgres 16)
ZITADEL_DB_HOST=zitadel-db.ced2k8ieu4we.us-east-1.rds.amazonaws.com
ZITADEL_DB_NAME=zitadel
ZITADEL_DB_USER=zitadel_admin
ZITADEL_DB_PASS=<strong-generated-password>
```

#### Step 2 — Dump Zitadel schemas from current RDS

```bash
PGPASSWORD=$APP_DB_PASS pg_dump \
  -h database-1.ced2k8ieu4we.us-east-1.rds.amazonaws.com \
  -U ravi_admin -d orbispmdev \
  --schema=auth \
  --schema=projections \
  --schema=eventstore \
  --schema=system \
  --schema=adminapi \
  --schema=logstore \
  --schema=cache \
  --schema=queue \
  -Fc -f zitadel_schemas_$(date +%Y%m%d).dump
```

#### Step 3 — Restore to new DB

```bash
PGPASSWORD=$ZITADEL_DB_PASS pg_restore \
  -h $ZITADEL_DB_HOST -U $ZITADEL_DB_USER -d $ZITADEL_DB_NAME \
  --no-owner --role=$ZITADEL_DB_USER \
  zitadel_schemas_$(date +%Y%m%d).dump
```

#### Step 4 — Update `.env.production`

```bash
# Old (shared RDS)
ZITADEL_DB_HOST=database-1.ced2k8ieu4we.us-east-1.rds.amazonaws.com
ZITADEL_DATABASE_POSTGRES_DATABASE=orbispmdev

# New (dedicated Zitadel RDS)
ZITADEL_DB_HOST=zitadel-db.ced2k8ieu4we.us-east-1.rds.amazonaws.com
ZITADEL_DATABASE_POSTGRES_DATABASE=zitadel

# App DB stays unchanged
DATABASE_URL=postgres://ravi_admin:...@database-1.ced2k8ieu4we.us-east-1.rds.amazonaws.com/orbispmdev
```

#### Step 5 — Redeploy and verify

```bash
cd ~/Project
docker compose --env-file .env.production up -d zitadel
# Verify Zitadel connects
curl -s https://zitadel.orbispm.in/healthz

# Drop now-unnecessary Zitadel schemas from app DB
# (only after verified working for 48h)
PGPASSWORD=$APP_DB_PASS psql -h database-1... -U ravi_admin -d orbispmdev \
  -c "DROP SCHEMA IF EXISTS auth CASCADE;" \
  -c "DROP SCHEMA IF EXISTS eventstore CASCADE;" \
  -c "DROP SCHEMA IF EXISTS projections CASCADE;" \
  -c "DROP SCHEMA IF EXISTS system CASCADE;"
```

#### Target Architecture

```
 ┌──────────────────────┐     ┌─────────────────────────────────┐
 │  app-db (RDS)        │     │  zitadel-db (RDS, separate)     │
 │  public.*  only      │     │  auth.* / eventstore.* /        │
 │  OrbisPM API ────────┤     │  projections.*                  │
 └──────────────────────┘     │  Zitadel service ───────────────┤
                               └─────────────────────────────────┘
```

**RDS parameter changes needed for Zitadel DB:**
```
max_connections = 100           # Zitadel uses many short-lived connections
shared_buffers = 25% RAM
work_mem = 16MB
idle_in_transaction_session_timeout = 30000   # 30s
```

---

## 2. All User Accounts Deleted — Data Safe

### Scenario
Someone (or an automated script) deleted all rows from `public.users` and all `*_members` tables, but org/project/task data is intact. Zitadel still has all user accounts.

### Impact Assessment
- `public.users` rows gone → all API calls with auth fail (user lookup returns 404)
- `org_members` empty → all org-scoped queries return empty (RLS + membership checks)
- Task `assignee_id` / `assignee_ids` FKs: no FK constraint on `public.users` from tasks (UUID references are soft) → task data intact

### Recovery Playbook

#### Step A — Stop the API (prevent further writes with bad state)

```bash
docker stop api-i7stpxv6q4amix5z97dhwx69-060130829802
```

#### Step B — Restore from RDS automated backup

AWS RDS provides automated backups with PITR (Point-In-Time Recovery) up to 35 days.

```bash
# In AWS Console → RDS → database-1 → Actions → Restore to point in time
# Target time: 5 minutes before the deletion was detected
# New instance ID: orbispmdev-recovery-$(date +%Y%m%d)

# OR via CLI:
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier database-1 \
  --target-db-instance-identifier orbispmdev-recovery \
  --restore-time "2026-04-16T07:30:00Z"   # adjust to 5 min before incident
```

#### Step C — Extract only the deleted tables

```bash
# Connect to recovery instance
PGPASSWORD=$PASS pg_dump \
  -h orbispmdev-recovery.ced2k8ieu4we.us-east-1.rds.amazonaws.com \
  -U ravi_admin -d orbispmdev \
  -t public.users \
  -t public.org_members \
  -t public.team_members \
  -t public.project_members \
  --data-only -Fc -f users_tables_recovery.dump
```

#### Step D — Restore tables to live DB

```bash
PGPASSWORD=$PASS pg_restore \
  -h database-1.ced2k8ieu4we.us-east-1.rds.amazonaws.com \
  -U ravi_admin -d orbispmdev \
  --data-only --disable-triggers \
  users_tables_recovery.dump
```

#### Step E — If no RDS backup is available: re-sync from Zitadel

If you only have Zitadel (user identities intact), rebuild `public.users` by re-triggering a login for each user (each successful login upserts a row into `public.users` automatically via `auth_handler.go`).

```python
# scripts/resync_users_from_zitadel.py
# Uses Zitadel management API to list all users, then calls POST /api/v1/auth/login
# for each user to force-populate public.users
import requests, json

TOKEN = "YOUR_ZITADEL_SERVICE_TOKEN"
headers = {"Authorization": f"Bearer {TOKEN}"}

# List all users from Zitadel
resp = requests.post(
    "https://zitadel.orbispm.in/v2beta/users",
    headers=headers,
    json={"queries": [{"stateQuery": {"state": "STATE_ACTIVE"}}]}
)
users = resp.json().get("result", [])

for user in users:
    print(f"User: {user['userId']} / {user.get('human', {}).get('email', {}).get('email')}")
    # NOTE: you cannot login on behalf of users — org memberships must be re-added manually
    # or restored from backup
```

For memberships without a backup, restore from the event log (see **Scenario 4**).

#### Step F — Restart API

```bash
docker start api-i7stpxv6q4amix5z97dhwx69-060130829802
```

### Prevention

```sql
-- 1. Protect users table from accidental bulk DELETE
CREATE RULE protect_users_bulk_delete AS
  ON DELETE TO public.users
  WHERE (SELECT count(*) FROM public.users) > (OLD.id IS NOT NULL)::int * 5
  DO INSTEAD NOTHING;

-- 2. Enable audit triggers (see Scenario 4 for full audit setup)

-- 3. Restrict permissions — API role should NOT have DELETE on users
REVOKE DELETE ON public.users FROM orbispm_api;
-- Only a maintenance role should be able to delete users
```

```yaml
# 4. AWS RDS — ensure automated backups are on
# Console → RDS → Modify → Backup retention = 7 days minimum
# Enable "Deletion protection" on the RDS instance
```

---

## 3. Zitadel Fully Deleted / Corrupted

### Scenario
The Zitadel container data, its database schemas, or its Docker volumes are wiped. Zitadel cannot start. Users cannot log in.

### Impact
- **Login completely broken** — all auth endpoints return 500/401
- OrbisPM app data (`public.*`) is **unaffected** — it's in a different schema
- `public.users` rows remain — UUIDs still valid
- Org/project/task data fully intact

### Recovery Playbook

#### Option A — Restore Zitadel from DB snapshot (fastest, < 30 min)

```bash
# Step 1: Restore Zitadel schemas from last known-good pg_dump
# You should be running nightly Zitadel-schema dumps (see Prevention below)
PGPASSWORD=$PASS pg_restore \
  -h database-1.ced2k8ieu4we.us-east-1.rds.amazonaws.com \
  -U ravi_admin -d orbispmdev \
  --no-owner --role=ravi_admin \
  zitadel_schemas_backup_YYYYMMDD.dump

# Step 2: Redeploy Zitadel (use 'start' not 'start-from-init')
docker compose --env-file .env.production up -d zitadel
```

#### Option B — Rebuild Zitadel from scratch (nuclear, ~2 hours)

If no Zitadel backup exists:

```bash
# Step 1: Start fresh Zitadel with start-from-init
# Edit docker-compose.yaml: command: start-from-init
docker compose --env-file .env.production up -d zitadel

# Step 2: Run the bootstrap script to recreate PAT, machine user, app
./scripts/setup_zitadel.sh  # or equivalent

# Step 3: For each user, trigger password reset email via management API
# (users must reset passwords — old Zitadel session tokens are invalid)
TOKEN=<new_service_token>
# List all public.users emails
PGPASSWORD=$PASS psql -h database-1... -U ravi_admin -d orbispmdev \
  -t -c "SELECT id::text, email FROM public.users;" | while IFS='|' read uid email; do
    uid=$(echo $uid | xargs)
    email=$(echo $email | xargs)
    # Create user in new Zitadel
    resp=$(curl -s -X POST "https://zitadel.orbispm.in/v2/users/human" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"profile\":{\"displayName\":\"$email\"},\"email\":{\"email\":\"$email\",\"sendCode\":{}}}")
    new_zitadel_id=$(echo $resp | python3 -c "import sys,json; print(json.load(sys.stdin).get('userId',''))")
    
    # Derive new UUID5 and update public.users
    new_uuid=$(python3 -c "import uuid; print(uuid.uuid5(uuid.NAMESPACE_URL, '$new_zitadel_id'))")
    
    # Update user ID if it changed
    if [ "$new_uuid" != "$uid" ]; then
      PGPASSWORD=$PASS psql -h database-1... -U ravi_admin -d orbispmdev \
        -c "UPDATE public.users SET id='$new_uuid'::uuid WHERE id='$uid'::uuid;" \
        -c "UPDATE org_members SET user_id='$new_uuid'::uuid WHERE user_id='$uid'::uuid;" \
        -c "UPDATE team_members SET user_id='$new_uuid'::uuid WHERE user_id='$uid'::uuid;" \
        -c "UPDATE project_members SET user_id='$new_uuid'::uuid WHERE user_id='$uid'::uuid;"
    fi
done

# Step 4: Notify all users that their password must be reset
# (magic link / reset email is sent by Zitadel on user creation above)

# Step 5: Switch Zitadel command back to 'start'
docker compose --env-file .env.production up -d --force-recreate zitadel
```

#### Option C — Interim: Bypass Zitadel with emergency API keys

While Zitadel recovers, super-admins can use long-lived API keys stored in `public.api_keys`:

```bash
# This only works if API key auth middleware handles Zitadel absence gracefully
# Add to .env.production temporarily:
EMERGENCY_AUTH_BYPASS=true
EMERGENCY_ADMIN_KEY=sha256:$(openssl rand -hex 32)
```

### Prevention — Mandatory Backups

Add to cron on the server:

```bash
# /etc/cron.d/orbispm-backups
# Every night at 2 AM UTC — dump Zitadel schemas
0 2 * * * root PGPASSWORD=Suraj5522 pg_dump \
  -h 192.168.1.15 -U ravi_admin -d orbispmdev \
  --schema=auth --schema=projections --schema=eventstore \
  --schema=system --schema=adminapi \
  -Fc -f /data/backups/zitadel/zitadel_$(date +\%Y\%m\%d_\%H\%M).dump && \
  find /data/backups/zitadel/ -mtime +14 -delete

# Every night at 3 AM UTC — dump public schema
0 3 * * * root PGPASSWORD=Suraj5522 pg_dump \
  -h 192.168.1.15 -U ravi_admin -d orbispmdev \
  --schema=public \
  -Fc -f /data/backups/app/app_$(date +\%Y\%m\%d_\%H\%M).dump && \
  find /data/backups/app/ -mtime +30 -delete
```

Also upload to S3 for off-site retention:

```bash
aws s3 cp /data/backups/zitadel/zitadel_$(date +%Y%m%d_%H%M).dump \
  s3://orbispm/backups/zitadel/ --sse AES256
```

---

## 4. Org Data Partially Corrupted

### Scenario
Tasks, comments, or member records for one or more orgs are incorrect, overwritten, or deleted — caused by a bad migration, bug in a service, or manual DB change.

### Step 1 — Identify the corruption scope

```sql
-- Find affected org
SELECT o.id, o.name, o.slug,
       count(DISTINCT t.id) AS tasks,
       count(DISTINCT p.id) AS projects,
       count(DISTINCT m.user_id) AS members
FROM orgs o
LEFT JOIN projects p ON p.org_id = o.id
LEFT JOIN tasks t ON t.org_id = o.id
LEFT JOIN org_members m ON m.org_id = o.id
WHERE o.slug = 'acme-corp'   -- change to affected org
GROUP BY o.id;

-- Check for orphaned records
SELECT id, parent_task_id, depth FROM tasks
WHERE org_id = 'AFFECTED_ORG_ID'
  AND parent_task_id IS NOT NULL
  AND parent_task_id NOT IN (SELECT id FROM tasks)
ORDER BY created_at DESC LIMIT 20;

-- Check for task version inconsistencies
SELECT id, title, version, updated_at
FROM tasks WHERE org_id = 'AFFECTED_ORG_ID'
ORDER BY updated_at DESC LIMIT 50;
```

### Step 2 — Isolate the org (prevent further writes)

```sql
-- Temporarily block writes to affected org via RLS extension
-- Insert a "maintenance" flag in org settings
UPDATE orgs SET settings = settings || '{"maintenance": true}'::jsonb
WHERE id = 'AFFECTED_ORG_ID';
```

**In OrbisPM service layer** (`org_service.go`), add a maintenance check:

```go
if org.Settings["maintenance"] == true {
    return nil, domain.ErrOrgUnderMaintenance
}
```

### Step 3 — Restore affected org's data from PITR

```bash
# Restore full DB to a point-in-time instance
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier database-1 \
  --target-db-instance-identifier orbispmdev-pitr \
  --restore-time "2026-04-16T06:00:00Z"

# Extract only the corrupted org's data
PGPASSWORD=$PASS psql -h orbispmdev-pitr... -U ravi_admin -d orbispmdev \
  -c "SET app.current_org_id = 'AFFECTED_ORG_ID';" \
  -c "\COPY (SELECT * FROM tasks WHERE org_id='AFFECTED_ORG_ID') TO '/tmp/tasks_recovery.csv' CSV HEADER;"

# Re-insert into live DB (with conflict handling)
PGPASSWORD=$PASS psql -h database-1... -U ravi_admin -d orbispmdev <<'SQL'
-- Disable RLS for admin restore
SET SESSION AUTHORIZATION ravi_admin;

-- Upsert recovered tasks
\COPY tasks FROM '/tmp/tasks_recovery.csv' CSV HEADER;
-- OR use ON CONFLICT for partial updates:
INSERT INTO tasks SELECT * FROM tasks_staging
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  version = EXCLUDED.version,
  updated_at = EXCLUDED.updated_at;
SQL
```

### Step 4 — Verify and lift maintenance mode

```sql
-- Verify counts match pre-corruption state
SELECT count(*) FROM tasks WHERE org_id = 'AFFECTED_ORG_ID';
SELECT count(*) FROM comments WHERE org_id = 'AFFECTED_ORG_ID';

-- Lift maintenance
UPDATE orgs SET settings = settings - 'maintenance'
WHERE id = 'AFFECTED_ORG_ID';
```

### Prevention — Soft Deletes + Audit Log

Add the following migration to prevent accidental permanent loss:

```sql
-- Migration: 000029_soft_deletes.up.sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL,
    actor_id    UUID,
    action      TEXT NOT NULL,       -- 'UPDATE', 'DELETE', 'BULK_DELETE'
    table_name  TEXT NOT NULL,
    row_id      UUID NOT NULL,
    old_data    JSONB,
    new_data    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_org ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_log_row ON audit_log(table_name, row_id);

-- Trigger function
CREATE OR REPLACE FUNCTION audit_trail() RETURNS trigger AS $$
BEGIN
    INSERT INTO audit_log (org_id, action, table_name, row_id, old_data, new_data)
    VALUES (
        COALESCE(OLD.org_id, NEW.org_id),
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(OLD.id, NEW.id),
        CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD)::jsonb END,
        CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW)::jsonb END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to critical tables
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION audit_trail();
CREATE TRIGGER audit_projects AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trail();
CREATE TRIGGER audit_org_members AFTER INSERT OR UPDATE OR DELETE ON org_members
  FOR EACH ROW EXECUTE FUNCTION audit_trail();
```

---

## 5. Mass Server Attack / DDoS / Breach

### Scenario
Server is under active attack: DDoS flooding, brute-force login attempts, unauthorized container access, or data exfiltration.

### Immediate Response (first 5 minutes)

#### Step 1 — Enable Cloudflare "Under Attack" mode

```
Cloudflare Dashboard → orbispm.in → Security → Settings
→ Security Level: "I'm Under Attack"
→ This immediately forces JS challenge on all visitors
```

Or via API:
```bash
CF_ZONE_ID=<your-zone-id>
CF_API_TOKEN=<your-api-token>

curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/settings/security_level" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"under_attack"}'
```

#### Step 2 — Block attacking IPs immediately

```bash
# Cloudflare Firewall Rule — block top attacking IPs
# Or if you have the IPs, add WAF custom rules

# On server level (iptables as last resort):
ssh ravi@ssh.orbispm.in "sudo iptables -I INPUT -s ATTACKER_IP -j DROP"
```

#### Step 3 — Enable rate limiting at Kong

```yaml
# kong.yml — add stricter limits immediately
plugins:
  - name: rate-limiting
    config:
      minute: 30          # down from 100
      hour: 500
      policy: redis
      block_on_first_violation: true

  - name: bot-detection
    config:
      deny: ["curl", "python-requests", "Go-http-client"]  # if attack is scripted
```

#### Step 4 — Revoke all active sessions

```bash
# Revoke all Zitadel sessions (forces all users to re-login)
TOKEN=<service_token>
curl -X DELETE "https://zitadel.orbispm.in/v2/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionIds": []}' # empty = all sessions

# Rotate backend service token
docker exec api-i7stpxv6q4amix5z97dhwx69... \
  env | grep ZITADEL_SERVICE_TOKEN
# Generate new PAT in Zitadel console > Users > backend-service > PATs
# Update .env.production and redeploy
```

#### Step 5 — If breach is suspected — rotate ALL secrets

```bash
# 1. Generate new JWT secret
NEW_JWT=$(openssl rand -base64 48)

# 2. Generate new MinIO credentials
NEW_MINIO_KEY=$(openssl rand -base64 32)
NEW_MINIO_SECRET=$(openssl rand -base64 48)

# 3. Rotate DB password
# AWS Console → RDS → Modify → Master user password

# 4. Update .env.production
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$NEW_JWT/" .env.production
sed -i "s/MINIO_ACCESS_KEY=.*/MINIO_ACCESS_KEY=$NEW_MINIO_KEY/" .env.production
sed -i "s/MINIO_SECRET_KEY=.*/MINIO_SECRET_KEY=$NEW_MINIO_SECRET/" .env.production

# 5. Redeploy all services
docker compose --env-file .env.production up -d --force-recreate
```

#### Step 6 — Isolate the server if breach confirmed

```bash
# Cloudflare: set DNS records to "Proxied" if not already (hides origin IP)
# AWS: Modify RDS security group to remove all connections except from server IP
aws rds modify-db-instance \
  --db-instance-identifier database-1 \
  --vpc-security-group-ids sg-00000000000000000  # restrictive SG only

# Take RDS snapshot immediately (preserve state for forensics)
aws rds create-db-snapshot \
  --db-instance-identifier database-1 \
  --db-snapshot-identifier breach-snapshot-$(date +%Y%m%d%H%M)
```

### Post-Incident

```bash
# Audit recent activity
PGPASSWORD=$PASS psql -h database-1... -U ravi_admin -d orbispmdev <<'SQL'
-- Suspicious logins in last 24h (check Zitadel audit)
SELECT session_id, creator, creation_date
FROM auth.sessions
WHERE creation_date > now() - interval '24 hours'
ORDER BY creation_date DESC;

-- Orgs with unusual task modification spikes
SELECT org_id, count(*) as updates, max(updated_at)
FROM tasks
WHERE updated_at > now() - interval '1 hour'
GROUP BY org_id
ORDER BY updates DESC;
SQL
```

### Prevention Checklist

| Control | Status | Implementation |
|---------|--------|----------------|
| Cloudflare proxied | ✅ Required | All DNS A records set to orange-cloud |
| Rate limiting | ✅ Kong | 100 req/min per IP |
| Auth brute-force lock | ✅ Zitadel | 5 failed attempts → lockout |
| DDoS auto-mode | Configure | Cloudflare Analytics → DDoS rules |
| VPC isolation | Configure | RDS in private subnet, no public endpoint |
| Container readonly FS | Configure | `read_only: true` in docker-compose for API |
| Secrets in env only | ✅ Done | No hardcoded secrets in code |
| AWS GuardDuty | Recommended | Enable for RDS anomaly detection |
| Server firewall | Configure | UFW: only allow 80, 443, SSH from known IPs |

---

## 6. Org / User Credentials Leaked

### Scenario
API keys, user passwords, an org's service credentials, or the `.env.production` file have been exposed publicly (GitHub push, Slack paste, misconfigured S3 bucket).

### Immediate Steps by Credential Type

#### A — `.env.production` file leaked (worst case)

```bash
# 1. IMMEDIATELY revoke/rotate every secret in the file
# Priority order:

# a) DB password (all data at risk)
# AWS Console → RDS database-1 → Modify → Master/User password
# Update DATABASE_URL in .env.production

# b) Zitadel service token (admin-level auth control)
# Zitadel Console → Users → backend-service → Personal Access Tokens
# → Revoke old → Create new
# Update ZITADEL_SERVICE_TOKEN in .env.production

# c) Minio credentials (file storage access)
docker exec orbispm-minio-1 mc admin user set local $OLD_KEY $NEW_SECRET
# Update MINIO_ACCESS_KEY / MINIO_SECRET_KEY

# d) JWT secret (all active sessions invalidated immediately after rotation)
NEW_JWT=$(openssl rand -base64 48)
# Update JWT_SECRET in .env.production

# e) Stripe keys (if billing enabled)
# Stripe Dashboard → Developers → API Keys → Roll key

# 2. Redeploy ALL services
docker compose --env-file .env.production up -d --force-recreate

# 3. Force all users to re-authenticate (JWT rotation does this automatically)
```

#### B — Specific org API keys leaked

```bash
# OrbisPM API keys are SHA-256 hashed in DB — a leaked plaintext key must be revoked

# Find and revoke by prefix (first 8 chars of the leaked key)
LEAKED_PREFIX="abcd1234"  # first 8 chars of leaked key

PGPASSWORD=$PASS psql -h database-1... -U ravi_admin -d orbispmdev <<SQL
-- Find the key
SELECT id, org_id, name, key_prefix, created_at, last_used_at
FROM api_keys
WHERE key_prefix = '$LEAKED_PREFIX';

-- Revoke immediately
UPDATE api_keys SET revoked_at = now(), revoked_reason = 'security_incident'
WHERE key_prefix = '$LEAKED_PREFIX';
SQL

# Alert affected org admin
# POST /api/v1/orgs/{orgId}/notifications with incident notice
```

#### C — User password leaked

```bash
# Invalidate the user's password and force reset via Zitadel
TOKEN=<service_token>
ZITADEL_USER_ID=<affected_user_id>

# Force password reset on next login
curl -X POST "https://zitadel.orbispm.in/v2/users/$ZITADEL_USER_ID/password_reset" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Revoke ALL sessions for this user
curl -X DELETE "https://zitadel.orbispm.in/v2/users/$ZITADEL_USER_ID/sessions" \
  -H "Authorization: Bearer $TOKEN"

# Check what this user accessed in the last 48h
PGPASSWORD=$PASS psql -h database-1... -U ravi_admin -d orbispmdev -c "
SELECT action, table_name, row_id, old_data, new_data, created_at
FROM audit_log
WHERE actor_id = (SELECT id FROM public.users WHERE email = 'affected@example.com')
  AND created_at > now() - interval '48 hours'
ORDER BY created_at DESC LIMIT 100;"
```

#### D — User emails / PII exposed

```bash
# Notify affected users per GDPR Article 33 (72-hour notification requirement)
# Generate affected user list
PGPASSWORD=$PASS psql -h database-1... -U ravi_admin -d orbispmdev \
  -t -c "SELECT email, display_name FROM public.users WHERE org_id IN (SELECT id FROM orgs WHERE id='AFFECTED_ORG');" \
  > affected_users.csv

# Disable the affected org temporarily
PGPASSWORD=$PASS psql -h database-1... -U ravi_admin -d orbispmdev \
  -c "UPDATE orgs SET settings = settings || '{\"suspended\": true}'::jsonb WHERE id='AFFECTED_ORG';"
```

### Prevention

#### Add API key access logging

```go
// In api_key_middleware.go — log every API key usage
log.Info().
    Str("key_prefix", keyPrefix).
    Str("org_id", orgID.String()).
    Str("ip", r.RemoteAddr).
    Str("path", r.URL.Path).
    Msg("api_key_used")
```

#### Add secrets scanning to CI

```yaml
# .github/workflows/secrets-scan.yml
- name: Scan for secrets
  uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: main
    head: HEAD
    extra_args: --only-verified
```

#### Mark `.env.production` as non-trackable

```bash
echo ".env.production" >> .gitignore
echo ".env*" >> .gitignore
git rm --cached .env.production 2>/dev/null || true
```

#### Rotate secrets quarterly (cron reminder)

```bash
# Add to team calendar: "Rotate OrbisPM production secrets"
# - DB password
# - Zitadel service token
# - MinIO credentials
# - JWT secret
# Frequency: every 90 days
```

---

## Quick Reference: Recovery Decision Tree

```
Incident detected
│
├── Auth broken (can't login)?
│   ├── Zitadel container down → restart: docker compose up -d zitadel
│   ├── Zitadel DB corrupt → Option A: restore Zitadel schemas (Scenario 3)
│   └── All user accounts gone → PITR restore of public.users (Scenario 2)
│
├── Org data wrong/missing?
│   ├── Single org → PITR extract + upsert (Scenario 4)
│   └── All orgs → Full DB restore from RDS automated backup
│
├── Server under attack?
│   ├── DDoS → Cloudflare "Under Attack" mode (Scenario 5)
│   ├── Breach suspected → Rotate all secrets immediately (Scenario 5-B)
│   └── Unauthorized container access → docker stop all + forensics snapshot
│
└── Credentials leaked?
    ├── .env.production → Rotate all secrets + force redeploy (Scenario 6-A)
    ├── API key → Revoke by prefix (Scenario 6-B)
    └── User password → Force Zitadel password reset + revoke sessions (Scenario 6-C)
```

---

## Backup Schedule Summary

| What | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Full RDS automated backup | Daily (AWS managed) | 7 days | AWS RDS |
| RDS manual snapshot (before deploys) | Before each deploy | 30 days | AWS RDS |
| Zitadel schemas dump | Nightly 02:00 UTC | 14 days | S3 + local |
| App (public schema) dump | Nightly 03:00 UTC | 30 days | S3 + local |
| .env.production | On each change | Latest only | Encrypted vault (1Password/Bitwarden) |
| MinIO bucket | S3 versioning enabled | 90 days | S3 |

---

## Contact & Escalation

| Role | Responsibility | Action |
|------|---------------|--------|
| On-call engineer | First responder | Follow this doc |
| DB Admin | RDS PITR / schema restore | Scenarios 2, 3, 4 |
| Security lead | Breach assessment | Scenarios 5, 6 |
| Zitadel admin | Identity recovery | Scenarios 2, 3 |
| AWS account owner | RDS/S3/IAM access | All scenarios |

---

*Last updated: 2026-04-16. Review quarterly or after any incident.*
