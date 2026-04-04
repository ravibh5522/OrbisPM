# OrbisPM Quick Start

Small guide to build and start the stack locally.

## One Command Setup (Ubuntu and Windows)

Use the cross-platform setup script. It builds the stack, starts local profile
services, runs Zitadel bootstrap, and refreshes app services with updated env values.

Ubuntu/macOS:

```bash
bash scripts/local-setup.sh
```

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-setup.ps1
```

Direct (all OS, Python 3):

```bash
python scripts/setup-local.py
```

## 1) Build images

```bash
docker compose --env-file .env.local -f docker-compose.yaml build
```

## 2) Start services (local profile)

```bash
docker compose --env-file .env.local -f docker-compose.yaml --profile local up -d
```

## 3) Check status

```bash
docker compose --env-file .env.local -f docker-compose.yaml ps
```

## 4) Useful URLs

- Frontend: http://localhost:3000
- API Gateway (Kong): http://localhost:8000
- Mailpit UI: http://localhost:8000/mail/
- Zitadel: http://localhost:8081

## 5) Stop stack

```bash
docker compose --env-file .env.local -f docker-compose.yaml down
```

## 6) Stop and remove volumes (full reset)

```bash
docker compose --env-file .env.local -f docker-compose.yaml down -v
```
