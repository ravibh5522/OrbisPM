---
description: "Guide for adding a new database migration with RLS"
---

# Add New Database Migration

## File Naming
```
db/migrations/NNNNNN_description.up.sql
db/migrations/NNNNNN_description.down.sql
```
Get the next number by checking existing files in `db/migrations/`.

## Up Migration Template

```sql
-- NNNNNN_create_<table>.up.sql

CREATE TABLE IF NOT EXISTS <table_name> (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    -- business columns here --
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY tenant_isolation_<table_name> ON <table_name>
    FOR ALL
    USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- Indexes (org_id MUST be leading column in composites)
CREATE INDEX IF NOT EXISTS idx_<table_name>_org ON <table_name>(org_id);
CREATE INDEX IF NOT EXISTS idx_<table_name>_org_created ON <table_name>(org_id, created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER set_<table_name>_updated_at
    BEFORE UPDATE ON <table_name>
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## Down Migration Template

```sql
-- NNNNNN_create_<table>.down.sql

DROP TRIGGER IF EXISTS set_<table_name>_updated_at ON <table_name>;
DROP POLICY IF EXISTS tenant_isolation_<table_name> ON <table_name>;
DROP TABLE IF EXISTS <table_name>;
```

## Rules
- **ALWAYS** use `UUID` primary keys (never auto-increment)
- **ALWAYS** use `TIMESTAMPTZ` (never `TIMESTAMP`)
- **ALWAYS** use `JSONB` (never `JSON`)
- **ALWAYS** add `org_id` with `ON DELETE CASCADE` for tenant-scoped tables
- **ALWAYS** enable RLS and create isolation policy
- **ALWAYS** create indexes with `org_id` as leading column
- Task `depth` column: `CHECK (depth >= 0 AND depth <= 3)` — max depth is 3
- Run migration: `make migrate-up`
- Rollback: `make migrate-down`
