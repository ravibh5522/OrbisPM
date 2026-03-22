# OrbisPM Monitoring Stack

> OpenTelemetry · Prometheus · Grafana · Loki · Tempo · ClickHouse

## Quick Start

```bash
# 1. Configure root env file (from repository root)
#    Use .env.local for local or .env.production for production

# 2. Start monitoring stack from repository root
docker compose --env-file .env.local -f monitoring/docker-compose.yml up -d

# 3. Verify services
docker compose --env-file .env.local -f monitoring/docker-compose.yml ps
```

## Architecture

The monitoring stack consists of 7 microservices:

| Service | Port | Description | Access |
|---------|------|-------------|--------|
| OTel Collector | 4317/4318 | Telemetry collection gateway | Internal |
| Prometheus | 9090 | Metrics storage & alerting | Internal |
| Tempo | 3200 | Distributed tracing backend | Internal |
| Loki | 3100 | Log aggregation | Internal |
| Grafana | 3003 | DevOps dashboards | **External** |\n| ClickHouse | 8123/9000 | Analytics database | Internal |\n| Alert Engine | - | Rule evaluation | Internal |\n| Super Admin | 8090 | React-based admin console | **External** |
| ClickHouse | 8123 | Long-term analytics DB | Internal |
| Super Admin | 8091 | Business admin dashboard | **External** |

## Service URLs (after startup)

- **Grafana**: http://localhost:3001 (admin/changeme)
- **Super Admin**: http://localhost:8091 (Zitadel auth)

## Directory Structure

```
monitoring/
├── docker-compose.yml          # Master compose file
├── collector-service/           # OTel Collector + Prometheus + Exporters
├── tracing-service/             # Grafana Tempo
├── log-aggregator-service/      # Vector + Loki
├── dashboard-service/           # Grafana
├── alerting-service/            # Custom Go alerting + Alertmanager
├── analytics-db/                # ClickHouse
└── super-admin-service/         # Go Admin API + Web UI
```

## Three Pillars of Observability

```
┌─────────────────────────────────────────────────────────────┐
│                      OrbisPM Services                        │
│  (API, Kong, Workers, WebSocket, Frontend, MCP)              │
└──────────────────────────┬──────────────────────────────────┘
                           │ OTel SDK
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    OTel Collector                            │
│  Receivers → Processors → Exporters                          │
└───────┬─────────────────┬─────────────────┬─────────────────┘
        │ Metrics         │ Traces          │ Logs
        ▼                 ▼                 ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Prometheus  │  │     Tempo     │  │     Loki      │
│   (15 days)   │  │   (7 days)    │  │   (30 days)   │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  ClickHouse │
                    │   (90+ days)│
                    └─────────────┘
```

## Security

### Network Isolation
- All internal services on `monitoring` network — no host port mapping
- Only Grafana (3001) and Super Admin (8091) exposed
- OTel Collector bridges `monitoring` and `orbispm_default` networks

### Authentication
- **Grafana**: OAuth2 via Zitadel (production) or local admin (dev)
- **Super Admin**: JWT validation via Zitadel, requires `super_admin` role

### Secret Management
- All secrets in root `.env.local` / `.env.production` files (gitignored)
- Production: use Docker Secrets or Vault

## Alerting

### Infrastructure Alerts (Prometheus)
- ServiceDown
- HighErrorRate (>5% 5xx)
- HighLatencyP95 (>2s)
- HighCPU (>85%)
- HighMemory (>80%)
- DiskSpaceLow (<15%)
- DBConnectionsHigh (>90%)
- RedisMemoryHigh (>80%)

### Business Alerts (Custom Evaluator)
- Configurable per-tenant via `monitoring.alert_configs` table
- Uses PostgreSQL RLS for tenant isolation

### Notification Channels
- Email (Mailpit for dev, SMTP for prod)
- Slack (optional)
- PagerDuty (optional)
- Discord (optional)
- Custom webhooks

## Operations

### Start Stack
```bash
docker compose --env-file .env.local -f monitoring/docker-compose.yml up -d
```

### Stop Stack
```bash
docker compose --env-file .env.local -f monitoring/docker-compose.yml down
```

### View Logs
```bash
docker compose --env-file .env.local -f monitoring/docker-compose.yml logs -f [service-name]
```

### Restart Service
```bash
docker compose --env-file .env.local -f monitoring/docker-compose.yml restart [service-name]
```

### Verify Prometheus Targets
```bash
docker compose --env-file .env.local -f monitoring/docker-compose.yml exec prometheus \
        wget -q -O - http://localhost:9090/api/v1/targets | jq '.data.activeTargets[].labels.job'
```

### Test Alert
```bash
# Stop API to trigger ServiceDown alert
docker compose -f ../docker-compose.yaml stop api

# Check Alertmanager
docker compose --env-file .env.local -f monitoring/docker-compose.yml exec alertmanager \
        wget -q -O - http://localhost:9093/api/v2/alerts | jq '.[].labels.alertname'

# Restart API
docker compose -f ../docker-compose.yaml start api
```

## Troubleshooting

### Collector not receiving telemetry
1. Check OTel SDK config in API service
2. Verify collector endpoint: `otel-collector:4317`
3. Check collector logs: `docker compose logs otel-collector`

### Grafana can't connect to datasources
1. Verify services are on same Docker network
2. Check datasource URLs use service names, not localhost
3. Verify credentials in root `.env.local` / `.env.production`

### Alerts not firing
1. Check Prometheus alert rules: http://localhost:9090/alerts
2. Verify Alertmanager config: `amtool check-config alertmanager.yml`
3. Check alert-engine logs: `docker compose logs alert-engine`

### High memory usage
1. Check container limits in docker-compose.yml
2. Adjust retention settings in root `.env.local` / `.env.production`
3. Enable tail sampling for traces

## License

Part of OrbisPM — Multi-tenant SaaS Project Management Platform
