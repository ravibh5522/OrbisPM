-- =======================================================
-- ClickHouse Schema — OrbisPM Monitoring Analytics
-- =======================================================

-- Create monitoring database
CREATE DATABASE IF NOT EXISTS monitoring;

-- =======================================================
-- API Metrics Table — High-frequency endpoint metrics
-- =======================================================
CREATE TABLE IF NOT EXISTS monitoring.api_metrics
(
    -- Timestamp (granularity: second)
    timestamp DateTime64(3, 'UTC'),
    
    -- Request identification
    org_id UUID,
    request_id String,
    
    -- Endpoint info
    method LowCardinality(String),
    path String,
    route_pattern LowCardinality(String),
    
    -- Response
    status_code UInt16,
    
    -- Timing (milliseconds)
    duration_ms Float64,
    
    -- Size
    request_size UInt64,
    response_size UInt64,
    
    -- Client info
    client_ip String,
    user_agent String,
    
    -- User info (optional)
    user_id UUID DEFAULT toUUID('00000000-0000-0000-0000-000000000000'),
    
    -- Error info
    error_message String DEFAULT '',
    
    -- Date for partitioning
    date Date DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (org_id, route_pattern, timestamp)
TTL date + INTERVAL 90 DAY DELETE
SETTINGS index_granularity = 8192;

-- =======================================================
-- System Metrics Table — Resource utilization
-- =======================================================
CREATE TABLE IF NOT EXISTS monitoring.system_metrics
(
    timestamp DateTime64(3, 'UTC'),
    
    -- Host identification
    host String,
    container_name LowCardinality(String),
    
    -- CPU metrics
    cpu_usage_percent Float64,
    cpu_system_percent Float64,
    cpu_user_percent Float64,
    
    -- Memory metrics (bytes)
    memory_used UInt64,
    memory_available UInt64,
    memory_percent Float64,
    
    -- Disk metrics
    disk_read_bytes UInt64,
    disk_write_bytes UInt64,
    disk_used_bytes UInt64,
    disk_total_bytes UInt64,
    
    -- Network metrics
    network_rx_bytes UInt64,
    network_tx_bytes UInt64,
    
    -- Date for partitioning
    date Date DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (host, container_name, timestamp)
TTL date + INTERVAL 30 DAY DELETE
SETTINGS index_granularity = 8192;

-- =======================================================
-- Database Metrics Table — PostgreSQL performance
-- =======================================================
CREATE TABLE IF NOT EXISTS monitoring.database_metrics
(
    timestamp DateTime64(3, 'UTC'),
    
    -- Database identification
    database_name LowCardinality(String),
    
    -- Connection metrics
    active_connections UInt32,
    idle_connections UInt32,
    max_connections UInt32,
    
    -- Transaction metrics
    commits_per_sec Float64,
    rollbacks_per_sec Float64,
    
    -- Query metrics
    queries_per_sec Float64,
    avg_query_time_ms Float64,
    
    -- Table metrics
    rows_fetched UInt64,
    rows_inserted UInt64,
    rows_updated UInt64,
    rows_deleted UInt64,
    
    -- Cache metrics
    cache_hit_ratio Float64,
    
    -- Replication lag (if applicable)
    replication_lag_bytes UInt64,
    
    -- Date for partitioning
    date Date DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (database_name, timestamp)
TTL date + INTERVAL 30 DAY DELETE
SETTINGS index_granularity = 8192;

-- =======================================================
-- Redis Metrics Table — Cache performance
-- =======================================================
CREATE TABLE IF NOT EXISTS monitoring.redis_metrics
(
    timestamp DateTime64(3, 'UTC'),
    
    -- Redis identification
    instance LowCardinality(String),
    
    -- Memory metrics
    used_memory UInt64,
    peak_memory UInt64,
    memory_fragmentation_ratio Float64,
    
    -- Connection metrics
    connected_clients UInt32,
    blocked_clients UInt32,
    
    -- Command metrics
    commands_per_sec Float64,
    hits UInt64,
    misses UInt64,
    hit_ratio Float64,
    
    -- Key metrics
    total_keys UInt64,
    expired_keys UInt64,
    evicted_keys UInt64,
    
    -- Persistence
    rdb_last_save_time DateTime,
    aof_enabled UInt8,
    
    -- Date for partitioning
    date Date DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (instance, timestamp)
TTL date + INTERVAL 30 DAY DELETE
SETTINGS index_granularity = 8192;

-- =======================================================
-- Audit Log Table — Security and compliance
-- =======================================================
CREATE TABLE IF NOT EXISTS monitoring.audit_logs
(
    timestamp DateTime64(3, 'UTC'),
    
    -- Event identification
    event_id UUID,
    event_type LowCardinality(String),
    
    -- Actor
    org_id UUID,
    user_id UUID,
    user_email String,
    
    -- Action
    resource_type LowCardinality(String),
    resource_id String,
    action LowCardinality(String),
    
    -- Details
    details String, -- JSON
    
    -- Request context
    request_id String,
    client_ip String,
    user_agent String,
    
    -- Result
    success UInt8,
    error_message String DEFAULT '',
    
    -- Date for partitioning
    date Date DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (org_id, event_type, timestamp)
TTL date + INTERVAL 365 DAY DELETE
SETTINGS index_granularity = 8192;

-- =======================================================
-- Alert History Table — Alert tracking
-- =======================================================
CREATE TABLE IF NOT EXISTS monitoring.alert_history
(
    timestamp DateTime64(3, 'UTC'),
    
    -- Alert identification
    alert_id String,
    fingerprint String,
    
    -- Alert details
    alertname LowCardinality(String),
    severity LowCardinality(String),
    status LowCardinality(String),
    
    -- Labels and annotations (JSON)
    labels String,
    annotations String,
    
    -- Timing
    starts_at DateTime64(3, 'UTC'),
    ends_at Nullable(DateTime64(3, 'UTC')),
    
    -- Organization (if applicable)
    org_id UUID DEFAULT toUUID('00000000-0000-0000-0000-000000000000'),
    
    -- Date for partitioning
    date Date DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (alertname, timestamp)
TTL date + INTERVAL 180 DAY DELETE
SETTINGS index_granularity = 8192;

-- =======================================================
-- Business Metrics Table — Application KPIs
-- =======================================================
CREATE TABLE IF NOT EXISTS monitoring.business_metrics
(
    timestamp DateTime64(3, 'UTC'),
    
    -- Organization
    org_id UUID,
    
    -- User metrics
    active_users UInt32,
    new_users UInt32,
    
    -- Project metrics
    total_projects UInt32,
    active_projects UInt32,
    
    -- Task metrics
    tasks_created UInt32,
    tasks_completed UInt32,
    tasks_overdue UInt32,
    
    -- Team metrics
    total_teams UInt32,
    avg_team_size Float32,
    
    -- Activity metrics
    api_requests UInt64,
    file_uploads UInt32,
    comments_created UInt32,
    
    -- Date for partitioning
    date Date DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (org_id, timestamp)
TTL date + INTERVAL 365 DAY DELETE
SETTINGS index_granularity = 8192;

-- =======================================================
-- Materialized Views for Aggregations
-- =======================================================

-- Hourly API metrics aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS monitoring.api_metrics_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (org_id, route_pattern, method, status_code, hour)
TTL hour + INTERVAL 365 DAY DELETE
AS SELECT
    toStartOfHour(timestamp) AS hour,
    org_id,
    route_pattern,
    method,
    status_code,
    count() AS request_count,
    sum(duration_ms) AS total_duration_ms,
    avg(duration_ms) AS avg_duration_ms,
    max(duration_ms) AS max_duration_ms,
    min(duration_ms) AS min_duration_ms,
    quantile(0.95)(duration_ms) AS p95_duration_ms,
    quantile(0.99)(duration_ms) AS p99_duration_ms,
    sum(request_size) AS total_request_size,
    sum(response_size) AS total_response_size
FROM monitoring.api_metrics
GROUP BY hour, org_id, route_pattern, method, status_code;

-- Daily error summary
CREATE MATERIALIZED VIEW IF NOT EXISTS monitoring.error_summary_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (org_id, route_pattern, day)
TTL day + INTERVAL 365 DAY DELETE
AS SELECT
    toDate(timestamp) AS day,
    org_id,
    route_pattern,
    countIf(status_code >= 400 AND status_code < 500) AS client_errors,
    countIf(status_code >= 500) AS server_errors,
    count() AS total_requests,
    100.0 * countIf(status_code >= 500) / count() AS error_rate
FROM monitoring.api_metrics
GROUP BY day, org_id, route_pattern;

-- =======================================================
-- Indexes for Common Queries
-- =======================================================

-- Skip index for request_id lookups
ALTER TABLE monitoring.api_metrics
    ADD INDEX IF NOT EXISTS idx_request_id request_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Skip index for error filtering
ALTER TABLE monitoring.api_metrics
    ADD INDEX IF NOT EXISTS idx_status_code status_code TYPE minmax GRANULARITY 4;

-- Skip index for user lookups in audit logs
ALTER TABLE monitoring.audit_logs
    ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 4;

ALTER TABLE monitoring.audit_logs
    ADD INDEX IF NOT EXISTS idx_resource_id resource_id TYPE bloom_filter(0.01) GRANULARITY 4;
