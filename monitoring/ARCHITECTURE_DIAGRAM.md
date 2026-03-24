# OrbisPM Monitoring Architecture — Diagrams

> **Stack**: OpenTelemetry · Prometheus · Grafana · Loki · Tempo · ClickHouse  
> **Mermaid version**: 8.8.0 compatible

---

## 1. Complete Architecture

```mermaid
graph TB
    subgraph APP["OrbisPM Application Tier"]
        API["Go API Server :8080"]
        KONG["Kong Gateway :8000"]
        WS["WebSocket Server :8081"]
        WORKERS["Asynq Workers"]
        FRONTEND["Next.js Frontend :3000"]
        MCP_SRV["MCP Server :8082"]
    end

    subgraph OTEL_SDK["OpenTelemetry SDK in Services"]
        OTEL_M["OTel Metrics"]
        OTEL_T["OTel Traces"]
        OTEL_L["OTel Logs"]
    end

    API --> OTEL_M
    API --> OTEL_T
    API --> OTEL_L
    KONG --> OTEL_T
    WS --> OTEL_T
    WORKERS --> OTEL_T
    MCP_SRV --> OTEL_T

    subgraph COLLECTOR["1. Collector Service"]
        OTEL_COL["OTel Collector :4317/:4318"]
        PROM["Prometheus :9090"]
        RW["Remote Write Adapter"]
        PG_EXP["Postgres Exporter :9187"]
        REDIS_EXP["Redis Exporter :9121"]
        NODE_EXP["Node Exporter :9100"]
        CADV["cAdvisor :8088"]
    end

    OTEL_M --> OTEL_COL
    OTEL_T --> OTEL_COL
    OTEL_L --> OTEL_COL
    OTEL_COL --> PROM
    PROM --> RW
    PG_EXP --> PROM
    REDIS_EXP --> PROM
    NODE_EXP --> PROM
    CADV --> PROM

    subgraph TRACING["2. Tracing Service"]
        TEMPO["Grafana Tempo :3200"]
    end

    OTEL_COL --> TEMPO

    subgraph LOGGING["3. Log Aggregator Service"]
        VECTOR["Vector :9080"]
        LOKI["Grafana Loki :3100"]
    end

    OTEL_COL --> LOKI
    API --> VECTOR
    KONG --> VECTOR
    WORKERS --> VECTOR
    WS --> VECTOR
    FRONTEND --> VECTOR
    MCP_SRV --> VECTOR
    VECTOR --> LOKI

    subgraph ANALYTICS["4. Analytics DB"]
        CH["ClickHouse :8123/:9000"]
    end

    RW --> CH
    VECTOR --> CH
    TEMPO --> CH

    subgraph SHARED["Shared Data Tier - Existing"]
        PG["PostgreSQL 16 :5432"]
        REDIS["Redis 7 :6379"]
    end

    PG --> PG_EXP
    REDIS --> REDIS_EXP

    subgraph ALERTSVC["5. Alerting Service"]
        ALERT_ENG["Alert Rules Engine Go :8090"]
        AM["Alertmanager :9093"]
    end

    PROM --> ALERT_ENG
    LOKI --> ALERT_ENG
    ALERT_ENG --> PG
    ALERT_ENG --> REDIS
    ALERT_ENG --> AM

    subgraph DASHSVC["6. Dashboard Service - Grafana"]
        GF["Grafana :3001"]
    end

    PROM --> GF
    CH --> GF
    LOKI --> GF
    TEMPO --> GF
    PG --> GF

    subgraph SUPERADMIN["7. Super Admin Service"]
        SA_APP["Go Admin API :8091"]
        SA_UI["Admin Web UI"]
    end

    PG --> SA_APP
    REDIS --> SA_APP
    PROM --> SA_APP
    CH --> SA_APP
    SA_APP --> SA_UI

    subgraph NOTIFY["Notification Targets"]
        EMAIL["Email SMTP"]
        SLACK_CH["Slack"]
        DISCORD_CH["Discord"]
        PD["PagerDuty"]
        WH["Custom Webhook"]
    end

    AM --> EMAIL
    AM --> SLACK_CH
    AM --> DISCORD_CH
    AM --> PD
    AM --> WH
```

---

## 2. Data Flow - Three Signals

```mermaid
graph LR
    subgraph SIGNALS["Three Pillars"]
        M["Metrics"]
        T["Traces"]
        L["Logs"]
    end

    subgraph COLLECT["Collection Layer"]
        SDK["OTel SDK"]
        COL["OTel Collector"]
        VEC["Vector"]
    end

    subgraph SHORT["Short-Term - Real-time"]
        PR["Prometheus 15d"]
        TE["Tempo 7d"]
        LO["Loki 30d"]
    end

    subgraph LONG["Long-Term - Analytics"]
        CK["ClickHouse 90d+"]
    end

    subgraph VIZ["Visualization"]
        GR["Grafana"]
        SA["Super Admin"]
    end

    M --> SDK
    T --> SDK
    L --> SDK
    L --> VEC
    SDK --> COL
    COL --> PR
    COL --> TE
    COL --> LO
    VEC --> LO
    VEC --> CK
    PR --> CK
    TE --> CK
    PR --> GR
    TE --> GR
    LO --> GR
    CK --> GR
    CK --> SA
```

---

## 3. Super Admin Dashboard Panels

```mermaid
graph TB
    DASH["Super Admin Dashboard :8091"]

    subgraph ROW1["Health Overview"]
        P1["Service Health Map"]
        P2["Key Metrics"]
        P3["Active Alerts"]
    end

    subgraph ROW2["Infrastructure"]
        P4["Request Rate and Latency"]
        P5["System Resources"]
        P6["Database Health"]
    end

    subgraph ROW3["Tracing"]
        P7["Distributed Trace Explorer"]
        P8["Service Dependency Map"]
    end

    subgraph ROW4["Logs and Errors"]
        P9["Live Log Stream"]
        P10["Error Correlation"]
    end

    subgraph ROW5["Business"]
        P11["Tenant Analytics"]
        P12["Business Metrics"]
        P13["Resource Costs"]
    end

    DASH --> ROW1
    DASH --> ROW2
    DASH --> ROW3
    DASH --> ROW4
    DASH --> ROW5
```

---

## 4. OTel Collector Pipeline

```mermaid
graph LR
    subgraph RX["Receivers"]
        R1["otlp gRPC :4317"]
        R2["otlp HTTP :4318"]
        R3["prometheus scrape"]
    end

    subgraph PX["Processors"]
        P1["batch"]
        P2["memory_limiter"]
        P3["attributes"]
        P4["tail_sampling"]
        P5["filter"]
    end

    subgraph EXM["Metric Exporters"]
        E1["prometheus remote write"]
        E2["clickhouse"]
    end

    subgraph EXT["Trace Exporters"]
        E3["otlp to Tempo"]
        E4["clickhouse"]
    end

    subgraph EXL["Log Exporters"]
        E5["loki"]
        E6["clickhouse"]
    end

    R1 --> P2
    R2 --> P2
    R3 --> P2
    P2 --> P3
    P3 --> P1
    P1 --> P5
    P5 --> E1
    P5 --> E2
    P5 --> P4
    P4 --> E3
    P4 --> E4
    P5 --> E5
    P5 --> E6
```

---

## 5. Security Architecture

```mermaid
graph TB
    subgraph EXTERNAL["External Access"]
        ADMIN["Super Admin User"]
        DEVOPS["DevOps User"]
    end

    subgraph AUTH["Authentication Layer"]
        ZIT["Zitadel OIDC"]
        RBAC["Role Check"]
    end

    subgraph NET["Network Security"]
        FW["Docker Network Isolation"]
        TLS_INT["mTLS Internal"]
        TLS_EXT["TLS External"]
    end

    subgraph SERVICES["Monitoring Services"]
        GF["Grafana"]
        SA["Super Admin"]
        PROM["Prometheus"]
        AM["Alertmanager"]
    end

    ADMIN --> TLS_EXT
    DEVOPS --> TLS_EXT
    TLS_EXT --> ZIT
    ZIT --> RBAC
    RBAC --> GF
    RBAC --> SA
    FW --> PROM
    FW --> AM
    TLS_INT --> PROM
    TLS_INT --> AM
```

---

## Service Ports

| Service | Port | Access |
|---------|------|--------|
| OTel Collector | 4317/4318 | Internal only |
| Prometheus | 9090 | Internal only |
| Tempo | 3200 | Internal only |
| Loki | 3100 | Internal only |
| Grafana | 3001 | Authenticated |
| ClickHouse | 8123 | Internal only |
| Super Admin | 8091 | Authenticated |
| Alert Engine | 8090 | Internal only |
| Alertmanager | 9093 | Internal only |
| Vector | 9080 | Internal only |
