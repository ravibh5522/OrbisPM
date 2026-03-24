# OrbisPM Monitoring Platform — Complete Implementation Plan

> **For**: AI Agent / Developer Implementation  
> **Stack**: OpenTelemetry · Prometheus · Grafana · Loki · Tempo · ClickHouse  
> **Date**: March 2026

---

## Architecture Decision: Super Admin Separate from Grafana

**Why separate?**
- Grafana = DevOps tool. Super Admin = business admin tool. Different audiences.
- Custom Go service integrates with OrbisPM's Zitadel auth (same OIDC flow, same RBAC).
- Can query PostgreSQL directly (with RLS) for tenant-specific business metrics.
- Full control over UI/UX — no Grafana plugin limitations.
- Grafana stays available for DevOps (raw metrics/traces/logs exploration).

---

## 7 Microservices

| # | Service | Folder | Technology | Port |
|---|---------|--------|-----------|------|
| 1 | Collector | `collector-service/` | OTel Collector + Prometheus + Exporters | 4317, 9090 |
| 2 | Tracing | `tracing-service/` | Grafana Tempo | 3200 |
| 3 | Log Aggregator | `log-aggregator-service/` | Vector + Loki | 3100, 9080 |
| 4 | Dashboard | `dashboard-service/` | Grafana (DevOps dashboards) | 3001 |
| 5 | Alerting | `alerting-service/` | Custom Go + Alertmanager | 8090, 9093 |
| 6 | Analytics DB | `analytics-db/` | ClickHouse | 8123 |
| 7 | Super Admin | `super-admin-service/` | Go API + HTML/JS Dashboard | 8091 |

---

## Security Concerns & Mitigations

### Network Security
| Concern | Mitigation |
|---------|-----------|
| Prometheus/Loki/Tempo exposed to internet | All internal services on `monitoring` Docker network — **no port mapping to host** except Grafana (3001) and Super Admin (8091) |
| Cross-container attack surface | Docker network isolation: `monitoring` network separate from `orbispm_default`. Only OTel Collector and Vector bridge both |
| Unencrypted metrics scraping | mTLS between Prometheus ↔ exporters in production (skip in dev) |

### Authentication & Authorization
| Concern | Mitigation |
|---------|-----------|
| Grafana unauthenticated access | OAuth2 via Zitadel (same OIDC as main app). Anonymous access disabled in prod |
| Super Admin API unauthenticated | JWT validation via Zitadel. Requires `super_admin` or `org_owner` role |
| Alertmanager API open | No host port mapping. Access only through Super Admin proxy |
| Prometheus API open | No host port mapping. Access only via Grafana datasource |

### Data Security
| Concern | Mitigation |
|---------|-----------|
| Logs contain sensitive data | Vector pipeline strips: passwords, tokens, PII fields via VRL transforms before storage |
| Metrics expose tenant info | ClickHouse queries require service-account auth. Tenant dashboards use RLS-scoped queries |
| Alert configs leaked | `monitoring.alert_configs` has RLS policy — tenant isolation enforced same as app tables |
| ClickHouse data at rest | Enable encryption at rest (`encrypted_disk` config). In k8s: encrypted PVCs |
| Redis monitoring keys readable | Prefix isolation (`monitoring:*`). Same Redis auth as app |

### Secret Management
| Concern | Mitigation |
|---------|-----------|
| Credentials in docker-compose | All secrets via `.env` file (gitignored). In prod: k8s Secrets or Vault |
| Grafana admin password | Set via `GF_SECURITY_ADMIN_PASSWORD` env var. Force change on first login |
| ClickHouse credentials | Separate user with limited permissions. Not the default `default` user |
| Alertmanager webhook secrets | HMAC-signed payloads. Secrets in env vars, never in YAML |

### Operational Security
| Concern | Mitigation |
|---------|-----------|
| Alert fatigue (too many alerts) | Alertmanager grouping + inhibition rules. Cooldown periods per alert config |
| Monitoring system itself goes down | Prometheus self-monitoring. Dead man's switch alert (always-firing → Alertmanager → if missing → external ping) |
| Log storage exhaustion | Loki retention policy (30d dev, configurable prod). ClickHouse TTL policies. Vector backpressure handling |
| Container resource exhaustion | Memory limits on all monitoring containers. Prometheus `--storage.tsdb.retention.size` |

---

## Implementation Steps (Agent-Ready)

### Phase 0: Root Setup

```
STEP 0.1: Create monitoring/.env.example
- All monitoring-specific env vars
- Passwords, ports, retention settings, feature flags

STEP 0.2: Create monitoring/docker-compose.yml
- Master compose that includes all sub-services
- Define networks: monitoring (internal), connect to orbispm_default (external)
- Shared volumes for persistent data

STEP 0.3: Create monitoring/README.md
- Quick start, architecture overview, port reference
```

---

### Phase 1: Collector Service

```
STEP 1.1: Create monitoring/collector-service/docker-compose.yml
  Services:
  - otel-collector (otel/opentelemetry-collector-contrib:0.96.0)
    ports: 4317 (gRPC), 4318 (HTTP) — internal only
    volumes: ./otel-collector/otel-config.yml:/etc/otelcol-contrib/config.yaml
    networks: monitoring, orbispm_default
    mem_limit: 512m

  - prometheus (prom/prometheus:v2.51.0)
    ports: 9090 — internal only
    volumes: ./prometheus/prometheus.yml, ./prometheus/rules/
    command: --config.file=/etc/prometheus/prometheus.yml
            --storage.tsdb.retention.time=15d
            --storage.tsdb.retention.size=10GB
            --web.enable-lifecycle
    networks: monitoring, orbispm_default
    mem_limit: 1g

  - postgres-exporter (prometheuscommunity/postgres-exporter:v0.15.0)
    env: DATA_SOURCE_NAME from .env (same PostgreSQL)
    networks: monitoring, orbispm_default
    mem_limit: 64m

  - redis-exporter (oliver006/redis_exporter:v1.58.0)
    env: REDIS_ADDR from .env (same Redis)
    networks: monitoring, orbispm_default
    mem_limit: 64m

  - node-exporter (prom/node-exporter:v1.7.0)
    volumes: /proc:/host/proc:ro, /sys:/host/sys:ro
    command: --path.procfs=/host/proc --path.sysfs=/host/sys
    networks: monitoring
    mem_limit: 64m

  - cadvisor (gcr.io/cadvisor/cadvisor:v0.49.1)
    volumes: /:/rootfs:ro, /var/run:/var/run:ro,
             /sys:/sys:ro, /var/lib/docker:/var/lib/docker:ro
    networks: monitoring
    mem_limit: 128m

STEP 1.2: Create monitoring/collector-service/otel-collector/otel-config.yml
  receivers:
    otlp:
      protocols:
        grpc: {endpoint: "0.0.0.0:4317"}
        http: {endpoint: "0.0.0.0:4318"}
  processors:
    batch: {timeout: 200ms, send_batch_size: 8192}
    memory_limiter: {check_interval: 1s, limit_mib: 400}
    attributes/env:
      actions:
        - key: environment
          value: "${ENV:-development}"
          action: upsert
        - key: service.namespace
          value: orbispm
          action: upsert
    filter/healthcheck:
      traces:
        span:
          - 'attributes["http.target"] == "/health"'
          - 'attributes["http.target"] == "/ready"'
          - 'attributes["http.target"] == "/metrics"'
    tail_sampling:
      policies:
        - name: error-traces
          type: status_code
          status_code: {status_codes: [ERROR]}
        - name: slow-traces
          type: latency
          latency: {threshold_ms: 1000}
        - name: probabilistic
          type: probabilistic
          probabilistic: {sampling_percentage: 10}
  exporters:
    prometheusremotewrite:
      endpoint: "http://prometheus:9090/api/v1/write"
    otlp/tempo:
      endpoint: "tempo:4317"
      tls: {insecure: true}
    loki:
      endpoint: "http://loki:3100/loki/api/v1/push"
    clickhouse:
      endpoint: "tcp://clickhouse:9000"
      database: monitoring
      # Only enable when ClickHouse is running
      # Controlled by CLICKHOUSE_ENABLED env var
  service:
    pipelines:
      metrics:
        receivers: [otlp]
        processors: [memory_limiter, attributes/env, batch]
        exporters: [prometheusremotewrite]
      traces:
        receivers: [otlp]
        processors: [memory_limiter, attributes/env, filter/healthcheck, tail_sampling, batch]
        exporters: [otlp/tempo]
      logs:
        receivers: [otlp]
        processors: [memory_limiter, attributes/env, batch]
        exporters: [loki]

STEP 1.3: Create monitoring/collector-service/prometheus/prometheus.yml
  global:
    scrape_interval: 15s
    evaluation_interval: 15s
  rule_files:
    - /etc/prometheus/rules/*.yml
  scrape_configs:
    - job_name: orbispm-api
      static_configs:
        - targets: ["api:8080"]
      metrics_path: /metrics
    - job_name: kong
      static_configs:
        - targets: ["kong:8001"]
    - job_name: postgres-exporter
      static_configs:
        - targets: ["postgres-exporter:9187"]
    - job_name: redis-exporter
      static_configs:
        - targets: ["redis-exporter:9121"]
    - job_name: node-exporter
      static_configs:
        - targets: ["node-exporter:9100"]
    - job_name: cadvisor
      static_configs:
        - targets: ["cadvisor:8080"]
    - job_name: loki
      static_configs:
        - targets: ["loki:3100"]
    - job_name: tempo
      static_configs:
        - targets: ["tempo:3200"]
  alerting:
    alertmanagers:
      - static_configs:
          - targets: ["alertmanager:9093"]

STEP 1.4: Create monitoring/collector-service/prometheus/rules/recording-rules.yml
  groups:
    - name: orbispm_recording
      rules:
        - record: job:http_requests:rate5m
          expr: sum(rate(http_requests_total[5m])) by (job)
        - record: job:http_request_duration:p95
          expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job))
        - record: job:http_request_duration:p99
          expr: histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job))
        - record: job:http_errors:rate5m
          expr: sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (job)

STEP 1.5: Create monitoring/collector-service/prometheus/rules/alert-rules.yml
  groups:
    - name: infrastructure
      rules:
        - alert: ServiceDown
          expr: up == 0
          for: 1m
          labels: {severity: critical}
          annotations: {summary: "{{ $labels.instance }} is down"}
        - alert: HighErrorRate
          expr: (job:http_errors:rate5m / job:http_requests:rate5m) > 0.05
          for: 5m
          labels: {severity: critical}
        - alert: HighLatencyP95
          expr: job:http_request_duration:p95 > 2
          for: 5m
          labels: {severity: warning}
        - alert: HighCPU
          expr: (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))) > 0.85
          for: 5m
          labels: {severity: warning}
        - alert: HighMemory
          expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.80
          for: 5m
          labels: {severity: warning}
        - alert: DiskSpaceLow
          expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.15
          for: 5m
          labels: {severity: critical}
        - alert: DBConnectionsHigh
          expr: db_pool_active_connections / 100 > 0.9
          for: 2m
          labels: {severity: critical}
        - alert: RedisMemoryHigh
          expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.80
          for: 5m
          labels: {severity: warning}
```

---

### Phase 2: Tracing Service

```
STEP 2.1: Create monitoring/tracing-service/docker-compose.yml
  Services:
  - tempo (grafana/tempo:2.4.0)
    ports: 3200 (query) — internal only
    volumes: ./tempo/tempo-config.yml:/etc/tempo/config.yml
    command: -config.file=/etc/tempo/config.yml
    networks: monitoring
    mem_limit: 512m

STEP 2.2: Create monitoring/tracing-service/tempo/tempo-config.yml
  server:
    http_listen_port: 3200
  distributor:
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: "0.0.0.0:4317"
  storage:
    trace:
      backend: local
      local:
        path: /var/tempo/traces
      wal:
        path: /var/tempo/wal
  compactor:
    compaction:
      block_retention: 168h  # 7 days dev, increase for prod
  metrics_generator:
    registry:
      external_labels:
        source: tempo
    storage:
      path: /var/tempo/generator/wal
      remote_write:
        - url: http://prometheus:9090/api/v1/write
  overrides:
    defaults:
      metrics_generator:
        processors: [service-graphs, span-metrics]
```

---

### Phase 3: Log Aggregator Service

```
STEP 3.1: Create monitoring/log-aggregator-service/docker-compose.yml
  Services:
  - vector (timberio/vector:0.37.0-alpine)
    volumes:
      - ./vector/vector.toml:/etc/vector/vector.toml
      - /var/run/docker.sock:/var/run/docker.sock:ro  # SECURITY: read-only
    networks: monitoring, orbispm_default
    mem_limit: 256m

  - loki (grafana/loki:2.9.5)
    ports: 3100 — internal only
    volumes: ./loki/loki-config.yml:/etc/loki/config.yaml
    command: -config.file=/etc/loki/config.yaml
    networks: monitoring
    mem_limit: 512m

STEP 3.2: Create monitoring/log-aggregator-service/vector/vector.toml
  [sources.docker_logs]
  type = "docker_logs"
  include_containers = ["orbispm-api*", "orbispm-kong*", "orbispm-frontend*",
                         "orbispm-worker*", "orbispm-ws*", "orbispm-mcp*"]

  [transforms.parse_json]
  type = "remap"
  inputs = ["docker_logs"]
  source = '''
    # Parse zerolog JSON
    parsed, err = parse_json(.message)
    if err == null {
      . = merge(., parsed)
    }
    # SECURITY: Strip sensitive fields
    del(.password)
    del(.token)
    del(.authorization)
    del(.cookie)
    del(.secret)
    del(.api_key)
    # Add standard labels
    .service = get!(.container_name)
    .environment = get_env_var("ENV") ?? "development"
  '''

  [transforms.filter_noise]
  type = "filter"
  inputs = ["parse_json"]
  condition = '.level != "debug" || get_env_var("LOG_DEBUG") == "true"'

  [sinks.loki]
  type = "loki"
  inputs = ["filter_noise"]
  endpoint = "http://loki:3100"
  encoding.codec = "json"
  labels.service = "{{ service }}"
  labels.level = "{{ level }}"
  labels.environment = "{{ environment }}"
  labels.container = "{{ container_name }}"

  # ClickHouse sink (enable when analytics-db is running)
  # [sinks.clickhouse]
  # type = "clickhouse"
  # inputs = ["filter_noise"]
  # endpoint = "http://clickhouse:8123"
  # database = "monitoring"
  # table = "logs"

STEP 3.3: Create monitoring/log-aggregator-service/loki/loki-config.yml
  auth_enabled: false
  server:
    http_listen_port: 3100
  common:
    ring:
      instance_addr: 127.0.0.1
      kvstore:
        store: inmemory
    replication_factor: 1
    path_prefix: /loki
  schema_config:
    configs:
      - from: 2024-01-01
        store: tsdb
        object_store: filesystem
        schema: v13
        index:
          prefix: index_
          period: 24h
  storage_config:
    filesystem:
      directory: /loki/chunks
  limits_config:
    retention_period: 720h  # 30 days
    max_query_series: 500
    max_query_parallelism: 2
  compactor:
    working_directory: /loki/compactor
    retention_enabled: true
```

---

### Phase 4: Dashboard Service (Grafana — DevOps)

```
STEP 4.1: Create monitoring/dashboard-service/docker-compose.yml
  Services:
  - grafana (grafana/grafana:10.4.0)
    ports: "3001:3000"  # Only external-facing monitoring port
    environment:
      GF_SECURITY_ADMIN_USER: ${GF_ADMIN_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: ${GF_ADMIN_PASSWORD:-changeme}
      GF_SERVER_ROOT_URL: ${GF_ROOT_URL:-http://localhost:3001}
      GF_AUTH_ANONYMOUS_ENABLED: "false"
      # Production: enable Zitadel OAuth
      # GF_AUTH_GENERIC_OAUTH_ENABLED: "true"
      # GF_AUTH_GENERIC_OAUTH_CLIENT_ID: ${ZITADEL_CLIENT_ID}
      # GF_AUTH_GENERIC_OAUTH_SCOPES: "openid profile email"
      # GF_AUTH_GENERIC_OAUTH_AUTH_URL: https://${ZITADEL_DOMAIN}/oauth/v2/authorize
      # GF_AUTH_GENERIC_OAUTH_TOKEN_URL: https://${ZITADEL_DOMAIN}/oauth/v2/token
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    networks: monitoring
    mem_limit: 256m

STEP 4.2: Create monitoring/dashboard-service/grafana/provisioning/datasources/datasources.yml
  datasources:
    - name: Prometheus
      type: prometheus
      url: http://prometheus:9090
      isDefault: true
      editable: false
    - name: Loki
      type: loki
      url: http://loki:3100
      editable: false
      jsonData:
        derivedFields:
          - name: TraceID
            matcherRegex: '"trace_id":"(\w+)"'
            datasourceUid: tempo
            url: "$${__value.raw}"
    - name: Tempo
      type: tempo
      uid: tempo
      url: http://tempo:3200
      editable: false
      jsonData:
        tracesToLogs:
          datasourceUid: loki
          tags: ["service"]
        serviceMap:
          datasourceUid: prometheus
    - name: ClickHouse
      type: grafana-clickhouse-datasource
      url: http://clickhouse:8123
      editable: false
      jsonData:
        defaultDatabase: monitoring
        username: ${CH_USER:-monitoring}
      secureJsonData:
        password: ${CH_PASSWORD:-changeme}
    - name: PostgreSQL
      type: postgres
      url: ${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}
      editable: false
      jsonData:
        database: ${POSTGRES_DB:-orbispm}
        sslmode: disable
        user: ${POSTGRES_USER:-orbispm}
      secureJsonData:
        password: ${POSTGRES_PASSWORD:-changeme}

STEP 4.3: Create monitoring/dashboard-service/grafana/provisioning/dashboards/provider.yml
  apiVersion: 1
  providers:
    - name: OrbisPM
      folder: OrbisPM
      type: file
      options:
        path: /etc/grafana/provisioning/dashboards/json
        foldersFromFilesStructure: true

STEP 4.4: Create Grafana dashboard JSON files (provisioned)
  monitoring/dashboard-service/grafana/provisioning/dashboards/json/
    - api-overview.json       # Request rate, latency, error rate, in-flight
    - database-health.json    # PG connections, query latency, table sizes
    - redis-health.json       # Memory, connections, ops/sec, hit rate
    - system-resources.json   # CPU, memory, disk, network per container
    - traces-explorer.json    # Tempo service graph, trace search
    - log-explorer.json       # Loki log search, error patterns
```

---

### Phase 5: Alerting Service

```
STEP 5.1: Create monitoring/alerting-service/go.mod
  module github.com/orbispm/monitoring-alerting
  go 1.24
  require (
    github.com/jackc/pgx/v5
    github.com/redis/go-redis/v9
    github.com/prometheus/client_golang
    github.com/rs/zerolog
    github.com/go-chi/chi/v5
  )

STEP 5.2: Create monitoring/alerting-service/Dockerfile
  Multi-stage build (same pattern as backend/Dockerfile)
  golang:1.24-alpine → alpine:3.19

STEP 5.3: Create monitoring/alerting-service/cmd/alerting/main.go
  - Load config from env vars
  - Connect to PostgreSQL (same DB, monitoring schema)
  - Connect to Redis (same instance, monitoring:* prefix)
  - Initialize evaluators (metric, log, business)
  - Start evaluation loop (every 30s)
  - Start HTTP health endpoint (:8090/health)
  - Expose Prometheus metrics (:8090/metrics)

STEP 5.4: Create monitoring/alerting-service/internal/evaluator/metric_evaluator.go
  - Query Prometheus HTTP API for alert rule expressions
  - Compare against thresholds defined in monitoring.alert_configs
  - Return list of firing alerts

STEP 5.5: Create monitoring/alerting-service/internal/evaluator/log_evaluator.go
  - Query Loki HTTP API for LogQL alert expressions
  - Pattern matching: error spikes, panic detection, auth failures

STEP 5.6: Create monitoring/alerting-service/internal/evaluator/business_evaluator.go
  - Query PostgreSQL monitoring.alert_configs for business rules
  - Examples: overdue tasks > threshold, approval SLA breach
  - SECURITY: Uses RLS context (SET LOCAL app.current_org_id) for tenant isolation

STEP 5.7: Create monitoring/alerting-service/internal/notifier/dedup.go
  - Redis SET NX with TTL for alert deduplication
  - Key: monitoring:alert:dedup:{sha256(alert_fingerprint)}
  - TTL: cooldown period from alert config (default 15m)

STEP 5.8: Create monitoring/alerting-service/internal/notifier/router.go
  - Route firing alerts to Alertmanager via HTTP API
  - POST http://alertmanager:9093/api/v2/alerts

STEP 5.9: Create monitoring/alerting-service/alertmanager/alertmanager.yml
  route:
    receiver: default
    group_by: [alertname, severity]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    routes:
      - match: {severity: critical}
        receiver: critical
        repeat_interval: 1h
      - match: {severity: warning}
        receiver: warning
  receivers:
    - name: default
      email_configs:
        - to: ${ALERT_EMAIL_TO:-admin@orbispm.local}
          from: ${SMTP_FROM:-noreply@orbispm.local}
          smarthost: ${SMTP_HOST:-mailpit}:${SMTP_PORT:-1025}
          require_tls: false
    - name: critical
      email_configs:
        - to: ${ALERT_EMAIL_TO:-admin@orbispm.local}
      # slack_configs:
      #   - api_url: ${SLACK_WEBHOOK_URL}
      #     channel: '#alerts-critical'
    - name: warning
      email_configs:
        - to: ${ALERT_EMAIL_TO:-admin@orbispm.local}

STEP 5.10: Create monitoring/alerting-service/docker-compose.yml
  Services:
  - alert-engine (build: .)
    ports: 8090 — internal only
    env: DATABASE_URL, REDIS_URL, PROMETHEUS_URL, LOKI_URL
    networks: monitoring, orbispm_default
    mem_limit: 128m

  - alertmanager (prom/alertmanager:v0.27.0)
    ports: 9093 — internal only
    volumes: ./alertmanager/alertmanager.yml
    command: --config.file=/etc/alertmanager/alertmanager.yml
             --storage.path=/alertmanager
    networks: monitoring
    mem_limit: 64m
```

---

### Phase 6: Analytics DB (ClickHouse)

```
STEP 6.1: Create monitoring/analytics-db/docker-compose.yml
  Services:
  - clickhouse (clickhouse/clickhouse-server:24.2)
    ports: 8123 (HTTP) — internal only
    volumes:
      - ./clickhouse/config.xml:/etc/clickhouse-server/config.d/custom.xml
      - ./clickhouse/users.xml:/etc/clickhouse-server/users.d/custom.xml
      - ./clickhouse/init/:/docker-entrypoint-initdb.d/
      - clickhouse-data:/var/lib/clickhouse
    networks: monitoring
    mem_limit: 1g
    # SECURITY: no host port mapping — internal only

STEP 6.2: Create monitoring/analytics-db/clickhouse/users.xml
  <!-- SECURITY: Create dedicated monitoring user, not default -->
  <users>
    <monitoring>
      <password_sha256_hex>${CH_PASSWORD_HASH}</password_sha256_hex>
      <networks><ip>::/0</ip></networks>
      <profile>default</profile>
      <quota>default</quota>
      <databases>
        <monitoring>
          <table_filter>.*</table_filter>
        </monitoring>
      </databases>
    </monitoring>
  </users>

STEP 6.3: Create monitoring/analytics-db/clickhouse/init/001_schema.sql
  CREATE DATABASE IF NOT EXISTS monitoring;

  CREATE TABLE IF NOT EXISTS monitoring.metrics_raw (
    timestamp DateTime64(3),
    metric_name LowCardinality(String),
    labels Map(LowCardinality(String), String),
    value Float64,
    environment LowCardinality(String),
    service LowCardinality(String)
  ) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(timestamp)
  ORDER BY (metric_name, timestamp)
  TTL timestamp + INTERVAL 90 DAY;

  CREATE TABLE IF NOT EXISTS monitoring.logs (
    timestamp DateTime64(3),
    service LowCardinality(String),
    level LowCardinality(String),
    message String,
    trace_id String DEFAULT '',
    span_id String DEFAULT '',
    labels Map(LowCardinality(String), String),
    environment LowCardinality(String)
  ) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(timestamp)
  ORDER BY (service, timestamp)
  TTL timestamp + INTERVAL 90 DAY;

  CREATE TABLE IF NOT EXISTS monitoring.traces (
    trace_id String,
    span_id String,
    parent_span_id String DEFAULT '',
    service LowCardinality(String),
    operation String,
    duration_ms UInt64,
    status_code LowCardinality(String),
    timestamp DateTime64(3),
    labels Map(LowCardinality(String), String)
  ) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(timestamp)
  ORDER BY (service, timestamp)
  TTL timestamp + INTERVAL 30 DAY;
```

---

### Phase 7: Super Admin Service

```
STEP 7.1: Create monitoring/super-admin-service/go.mod
  module github.com/orbispm/monitoring-admin
  go 1.24
  require (
    github.com/go-chi/chi/v5
    github.com/jackc/pgx/v5
    github.com/redis/go-redis/v9
    github.com/rs/zerolog
    github.com/zitadel/oidc/v3          # OIDC verification
    github.com/prometheus/client_golang  # Query Prometheus
  )

STEP 7.2: Create monitoring/super-admin-service/Dockerfile
  Multi-stage: build Go binary + embed static HTML/JS

STEP 7.3: Create monitoring/super-admin-service/cmd/admin/main.go
  - Load config (DATABASE_URL, REDIS_URL, PROMETHEUS_URL, ZITADEL_ISSUER)
  - JWT middleware (validates Zitadel tokens, requires super_admin role)
  - Mount API routes under /api/admin/
  - Serve static HTML dashboard at /

STEP 7.4: Create monitoring/super-admin-service/internal/handler/
  Files:
  - health_handler.go      GET /api/admin/health
  - services_handler.go    GET /api/admin/services (service health map)
  - metrics_handler.go     GET /api/admin/metrics (key metrics from Prometheus)
  - alerts_handler.go      GET /api/admin/alerts (from PostgreSQL + Alertmanager)
  - tenants_handler.go     GET /api/admin/tenants (per-org usage from ClickHouse)
  - logs_handler.go        GET /api/admin/logs (proxy to Loki)
  - traces_handler.go      GET /api/admin/traces (proxy to Tempo)
  - dashboard_handler.go   GET / (serve HTML dashboard)

STEP 7.5: Create monitoring/super-admin-service/internal/middleware/
  - auth.go: Validate JWT from Zitadel, extract user_id and roles
  - rbac.go: Require "super_admin" or "org_owner" role
  - cors.go: Restrict origins to admin domain
  - rate_limit.go: Rate limit admin API (100 req/min)

STEP 7.6: Create monitoring/super-admin-service/web/
  Static HTML/JS dashboard (single page app, no framework needed)
  - index.html: Dashboard shell with 7 panels
  - css/admin.css: Dark theme, responsive grid
  - js/app.js: Fetch from /api/admin/* endpoints, render charts
  - js/charts.js: Lightweight charting (Chart.js or uPlot)
  Uses: fetch() → Go API → Prometheus/Loki/Tempo/ClickHouse/PostgreSQL

STEP 7.7: Create monitoring/super-admin-service/docker-compose.yml
  Services:
  - super-admin (build: .)
    ports: "8091:8091"  # External-facing (authenticated)
    env: DATABASE_URL, REDIS_URL, PROMETHEUS_URL, LOKI_URL,
         TEMPO_URL, CLICKHOUSE_URL, ZITADEL_ISSUER, ZITADEL_CLIENT_ID
    networks: monitoring, orbispm_default
    mem_limit: 128m
```

---

### Phase 8: PostgreSQL Migration

```
STEP 8.1: Create backend/db/migrations/000020_monitoring_schema.up.sql
  -- SECURITY: Separate schema, RLS on tenant-scoped tables
  CREATE SCHEMA IF NOT EXISTS monitoring;

  CREATE TABLE monitoring.alert_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.orgs(id),
    name TEXT NOT NULL, rule_type TEXT NOT NULL,
    expression TEXT NOT NULL, threshold JSONB NOT NULL,
    severity TEXT DEFAULT 'warning', channels TEXT[],
    is_active BOOLEAN DEFAULT true,
    cooldown INTERVAL DEFAULT '15 minutes',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE monitoring.alert_configs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_iso ON monitoring.alert_configs
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid);

  CREATE TABLE monitoring.alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.orgs(id),
    config_id UUID REFERENCES monitoring.alert_configs(id),
    alert_name TEXT NOT NULL, severity TEXT NOT NULL,
    status TEXT NOT NULL, labels JSONB, annotations JSONB,
    started_at TIMESTAMPTZ NOT NULL, resolved_at TIMESTAMPTZ,
    notified_channels TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
  ) PARTITION BY RANGE (created_at);
  -- Create initial partitions
  CREATE TABLE monitoring.alert_history_2026_q1
    PARTITION OF monitoring.alert_history
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
  CREATE TABLE monitoring.alert_history_2026_q2
    PARTITION OF monitoring.alert_history
    FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
  ALTER TABLE monitoring.alert_history ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_iso ON monitoring.alert_history
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid);

  CREATE TABLE monitoring.service_health (
    service_name TEXT PRIMARY KEY,
    status TEXT NOT NULL, last_check TIMESTAMPTZ NOT NULL,
    response_time_ms INT, metadata JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
  );

STEP 8.2: Create backend/db/migrations/000020_monitoring_schema.down.sql
  DROP SCHEMA IF EXISTS monitoring CASCADE;
```

---

### Phase 9: Integration & Verification

```
STEP 9.1: Update monitoring/docker-compose.yml (master)
  Include all sub-service compose files
  Define shared networks and volumes

STEP 9.2: Verify all configs
  docker compose -f monitoring/docker-compose.yml config
  promtool check config collector-service/prometheus/prometheus.yml
  amtool check-config alerting-service/alertmanager/alertmanager.yml

STEP 9.3: Start stack
  cd monitoring && docker compose up -d

STEP 9.4: Verify services
  - Prometheus targets: http://localhost:9090/targets
  - Grafana login: http://localhost:3001
  - Super Admin: http://localhost:8091
  - Alertmanager: (internal only, verify via Super Admin)

STEP 9.5: Test alert flow
  - Stop API container → verify ServiceDown alert fires
  - Check Alertmanager receives alert
  - Check email arrives in Mailpit
```
