---
applyTo: "backend/db/**/*.sql"
---

# Database & Migrations — OrbisPM

You are working on OrbisPM's PostgreSQL database layer.

## Tech Stack
- **Database:** PostgreSQL 16+ with Row-Level Security (RLS)
- **Migrations:** golang-migrate (SQL files in `db/migrations/`)
- **Query generation:** sqlc (SQL files in `db/queries/`)
- **Multi-tenancy:** RLS with `org_id` column on all tenant-scoped tables

## Migration Rules

### File Naming
```
db/migrations/
├── 000001_init_schema.up.sql       # Creates schema
├── 000001_init_schema.down.sql     # Drops everything
├── 000002_rls_policies.up.sql      # Enable RLS + policies
├── 000002_rls_policies.down.sql    # Drop policies
```
Format: `NNNNNN_description.up.sql` / `NNNNNN_description.down.sql`

### Mandatory Table Columns
Every tenant-scoped table MUST have:
```sql
CREATE TABLE example (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    -- ... business columns ...
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Mandatory RLS
Every new tenant-scoped table MUST have:
```sql
ALTER TABLE example ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_example ON example
    FOR ALL
    USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
```

### Mandatory Indexes
```sql
-- Always index org_id as leading column
CREATE INDEX idx_example_org ON example(org_id);
-- Composite indexes for common query patterns
CREATE INDEX idx_example_org_status ON example(org_id, status);
-- GIN index on JSONB columns
CREATE INDEX idx_example_metadata ON example USING GIN(metadata);
-- GIN index on array columns
CREATE INDEX idx_example_labels ON example USING GIN(labels);
```

## sqlc Query Rules

### File Structure
```sql
-- db/queries/tasks.sql

-- name: CreateTask :one
INSERT INTO tasks (org_id, project_id, parent_task_id, title, description, status, priority, depth, position)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetTaskByID :one
SELECT * FROM tasks WHERE id = $1;

-- name: GetTaskTree :many
WITH RECURSIVE task_tree AS (
    SELECT *, ARRAY[id] AS path, ARRAY[position] AS sort_path
    FROM tasks WHERE id = $1
    UNION ALL
    SELECT t.*, tt.path || t.id, tt.sort_path || t.position
    FROM tasks t
    INNER JOIN task_tree tt ON t.parent_task_id = tt.id
    WHERE t.depth <= 3 AND NOT t.id = ANY(tt.path)
)
SELECT * FROM task_tree ORDER BY sort_path;
```

## Rules

- ALWAYS use `UUID` primary keys (never auto-increment integers)
- ALWAYS use `TIMESTAMPTZ` (never `TIMESTAMP` without timezone)
- ALWAYS use `JSONB` (never `JSON`)
- ALWAYS add `ON DELETE CASCADE` for foreign keys within the same org
- NEVER use `TEXT` with unbounded length for user input without application-level validation
- The `tasks.depth` column has `CHECK (depth >= 0 AND depth <= 3)` — NEVER remove this constraint
- Use `gen_random_uuid()` for default UUIDs (built-in, no extension needed)
- Down migrations must be safe — drop objects in reverse order of creation
- Every migration must be idempotent where possible (use `IF NOT EXISTS`, `IF EXISTS`)
- Add comments on complex columns: `COMMENT ON COLUMN tasks.depth IS 'Subtask nesting depth, max 3';`
