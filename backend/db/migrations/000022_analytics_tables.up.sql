-- Migration 000022: Analytics tables for performance tracking, predictions, and reporting.
-- Adds: analytics_events, task_state_transitions, task_status_snapshots,
--        daily_metrics, weekly_metrics, risk_scores, metric_alerts, performance_reports

-- ══════════════════════════════════════════════════════════════
-- 1. Analytics Events — raw event stream for all trackable activities
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics_events (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    actor_id    UUID NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   UUID NOT NULL,
    project_id  UUID,
    team_id     UUID,
    data        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_org_type_time
    ON analytics_events (org_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_entity
    ON analytics_events (org_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_project
    ON analytics_events (org_id, project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_actor
    ON analytics_events (org_id, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_data
    ON analytics_events USING GIN (data);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_events_isolation ON analytics_events;
CREATE POLICY analytics_events_isolation ON analytics_events
    USING (org_id = current_setting('app.current_org_id', true)::UUID);

-- ══════════════════════════════════════════════════════════════
-- 2. Task State Transitions — every status change with timestamps
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS task_state_transitions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL,
    from_status     TEXT,
    to_status       TEXT NOT NULL,
    actor_id        UUID NOT NULL,
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_transitions_task
    ON task_state_transitions (org_id, task_id, transitioned_at);
CREATE INDEX IF NOT EXISTS idx_task_transitions_project
    ON task_state_transitions (org_id, project_id, transitioned_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_transitions_status
    ON task_state_transitions (org_id, to_status, transitioned_at DESC);

ALTER TABLE task_state_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_state_transitions_isolation ON task_state_transitions;
CREATE POLICY task_state_transitions_isolation ON task_state_transitions
    USING (org_id = current_setting('app.current_org_id', true)::UUID);

-- ══════════════════════════════════════════════════════════════
-- 3. Task Status Snapshots — daily CFD data per project
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS task_status_snapshots (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    snapshot_date   DATE NOT NULL,
    todo_count      INT NOT NULL DEFAULT 0,
    in_progress_count INT NOT NULL DEFAULT 0,
    blocked_count   INT NOT NULL DEFAULT 0,
    done_count      INT NOT NULL DEFAULT 0,
    total_count     INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_task_snapshots_lookup
    ON task_status_snapshots (org_id, project_id, snapshot_date DESC);

ALTER TABLE task_status_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_status_snapshots_isolation ON task_status_snapshots;
CREATE POLICY task_status_snapshots_isolation ON task_status_snapshots
    USING (org_id = current_setting('app.current_org_id', true)::UUID);

-- ══════════════════════════════════════════════════════════════
-- 4. Daily Metrics — pre-computed daily KPIs per scope
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS daily_metrics (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    scope_type  TEXT NOT NULL,
    scope_id    UUID NOT NULL,
    metrics     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, metric_date, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_lookup
    ON daily_metrics (org_id, scope_type, scope_id, metric_date DESC);

ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_metrics_isolation ON daily_metrics;
CREATE POLICY daily_metrics_isolation ON daily_metrics
    USING (org_id = current_setting('app.current_org_id', true)::UUID);

-- ══════════════════════════════════════════════════════════════
-- 5. Weekly Metrics — aggregated weekly KPIs
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS weekly_metrics (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    scope_type  TEXT NOT NULL,
    scope_id    UUID NOT NULL,
    metrics     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, metric_date, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_metrics_lookup
    ON weekly_metrics (org_id, scope_type, scope_id, metric_date DESC);

ALTER TABLE weekly_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_metrics_isolation ON weekly_metrics;
CREATE POLICY weekly_metrics_isolation ON weekly_metrics
    USING (org_id = current_setting('app.current_org_id', true)::UUID);

-- ══════════════════════════════════════════════════════════════
-- 6. Risk Scores — per-task risk assessment
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS risk_scores (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    task_id             UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    risk_level          TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    risk_score          DECIMAL(5,2) NOT NULL,
    factors             JSONB NOT NULL DEFAULT '{}',
    predicted_completion TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_project
    ON risk_scores (org_id, risk_level);

ALTER TABLE risk_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS risk_scores_isolation ON risk_scores;
CREATE POLICY risk_scores_isolation ON risk_scores
    USING (org_id = current_setting('app.current_org_id', true)::UUID);

-- ══════════════════════════════════════════════════════════════
-- 7. Metric Alerts — anomaly and warning alerts
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS metric_alerts (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    alert_type      TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    scope_type      TEXT NOT NULL,
    scope_id        UUID NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    data            JSONB,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metric_alerts_active
    ON metric_alerts (org_id, severity, created_at DESC)
    WHERE acknowledged_at IS NULL;

ALTER TABLE metric_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS metric_alerts_isolation ON metric_alerts;
CREATE POLICY metric_alerts_isolation ON metric_alerts
    USING (org_id = current_setting('app.current_org_id', true)::UUID);

-- ══════════════════════════════════════════════════════════════
-- 8. Performance Reports — generated report metadata
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS performance_reports (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    report_type     TEXT NOT NULL,
    scope_type      TEXT NOT NULL,
    scope_id        UUID NOT NULL,
    parameters      JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    storage_path    TEXT,
    generated_by    UUID NOT NULL,
    generated_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_reports_lookup
    ON performance_reports (org_id, report_type, created_at DESC);

ALTER TABLE performance_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS performance_reports_isolation ON performance_reports;
CREATE POLICY performance_reports_isolation ON performance_reports
    USING (org_id = current_setting('app.current_org_id', true)::UUID);
