# OrbisPM — Enterprise Project Management SaaS

> **Version:** 0.1.0-alpha · **Status:** Architecture & Planning  
> **Stack:** Go · PostgreSQL 18 · Redis · Next.js 15 SSR · GoTrue · WebSockets  
> **License:** Proprietary (SaaS)

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Core Concepts](#2-core-concepts)
3. [Feature Catalog (67 Features)](#3-feature-catalog-67-features)
4. [Architecture Overview](#4-architecture-overview)
5. [Layered Architecture (DAO Pattern)](#5-layered-architecture-dao-pattern)
6. [Project File Structure](#6-project-file-structure)
7. [Database Schema](#7-database-schema)
8. [API Design](#8-api-design)
9. [Real-Time Architecture](#9-real-time-architecture)
10. [AI & MCP Integration](#10-ai--mcp-integration)
11. [Auth, Roles & Access Control](#11-auth-roles--access-control)
12. [Multi-Tenancy](#12-multi-tenancy)
13. [Import/Export & Templates](#13-importexport--templates)
14. [Billing & Plans](#14-billing--plans)
15. [Notification System](#15-notification-system)
16. [Frontend Architecture](#16-frontend-architecture)
17. [Infrastructure & Deployment](#17-infrastructure--deployment)
18. [Testing Strategy](#18-testing-strategy)
19. [Technology Decisions](#19-technology-decisions)
20. [Glossary](#20-glossary)

---

## 1. Vision & Goals

**OrbisPM** is an enterprise-grade, AI-augmented project management SaaS platform designed for organizations where a single manager oversees **20+ teams** efficiently with AI assistance.

### Primary Goals

| # | Goal | Metric |
|---|------|--------|
| G1 | Support 100+ organizations on a single deployment | Row-Level Security, <50ms p95 API latency |
| G2 | Deep hierarchy: Org → Team → Project → Task → Subtask (depth 5) | Recursive CTE, CHECK constraint |
| G3 | AI-powered task completion review | LLM evaluates criteria before marking done |
| G4 | MCP server for external AI agent connectivity | Model Context Protocol compliant |
| G5 | Real-time collaboration across all views | WebSocket + Redis Pub/Sub |
| G6 | Customizable dashboards per scope (org/team/project/user) | Widget system with drag-and-drop |
| G7 | Granular RBAC at org, team, and project level | Casbin with domain-scoped policies |
| G8 | Full SaaS billing with Stripe | Free/Pro/Enterprise plans |
| G9 | Multi-channel notifications | In-app, Email, Slack, Discord, Teams, Mobile Push |
| G10 | API-first design for third-party integrations | REST + OpenAPI 3.1 + Webhooks + API Keys |

---

## 2. Core Concepts

### Entity Hierarchy

```
Organization (Org)
├── Team 1
│   ├── Project A
│   │   ├── Task 1
│   │   │   ├── Subtask 1.1          (depth 1)
│   │   │   │   ├── Subtask 1.1.1    (depth 2)
│   │   │   │   │   ├── Subtask 1.1.1.1  (depth 3)
│   │   │   │   │   │   ├── Subtask 1.1.1.1.1  (depth 4)
│   │   │   │   │   │   │   └── Subtask 1.1.1.1.1.1  (depth 5 — MAX)
│   │   │   │   │   │   └── ✓ Checklist items
│   │   │   │   │   └── ✓ Checklist items
│   │   │   │   └── ✓ Checklist items
│   │   │   ├── Subtask 1.2
│   │   │   ├── ✓ Checklist items
│   │   │   └── ⚙ Rules (completion criteria)
│   │   └── Task 2
│   └── Project B
├── Team 2
│   └── ...
└── Settings (Roles, Billing, Webhooks, API Keys)
```

### Key Domain Terms

| Term | Definition |
|------|-----------|
| **Org** | Top-level tenant. All data is isolated per org via RLS. |
| **Team** | A group of users within an org. Owns projects. |
| **Project** | A container for tasks, owned by a team. Has its own role assignments. |
| **Task** | A work item within a project. Can have subtasks (max depth 5). |
| **Subtask** | A task that has a `parent_task_id`. Same schema as task. |
| **Checklist** | A list of boolean items within a task/subtask. |
| **Rule** | A completion criterion on a task. Must be satisfied before marking complete. |
| **Template** | A reusable task structure (with nested subtasks) that can be imported/exported. |
| **MCP Tool** | An action exposed via Model Context Protocol for external AI agents. |

---

## 3. Feature Catalog (67 Features)

### 3.1 Core Hierarchy & Task Management (1–15)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F1 | Org → Team → Project → Task → Subtask hierarchy | P0 | Max subtask depth = 5 |
| F2 | Hierarchical tree view with collapsible nested subtasks | P0 | Primary UI view |
| F3 | List view with sortable columns and inline editing | P0 | Secondary view |
| F4 | Checklist items within any task/subtask | P0 | Boolean items, ordered |
| F5 | Task rules engine (completion criteria) | P0 | Conditions before marking done |
| F6 | Task templates — create, save, import/export (JSON/CSV) | P1 | Nested subtask structure |
| F7 | Bulk task operations (assign, move, status change, delete) | P1 | Multi-select in tree/list |
| F8 | Drag-and-drop reordering and reparenting in tree view | P1 | @dnd-kit library |
| F9 | Task dependencies (blocked-by, blocks) | P1 | Visual indicators |
| F10 | Task priority (critical/high/medium/low) | P0 | Color-coded |
| F11 | Custom task statuses per project (workflow states) | P1 | Configurable |
| F12 | Task labels/tags with color coding | P1 | Filterable |
| F13 | Due dates, start dates, estimated hours, actual hours | P0 | Time tracking |
| F14 | Recurring tasks (daily/weekly/monthly/custom cron) | P2 | Asynq periodic |
| F15 | Task duplication with subtree | P1 | Deep copy |

### 3.2 AI-Powered Features (16–25)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F16 | AI task completion reviewer | P0 | LLM evaluates against rules |
| F17 | AI smart suggestions (assignees, due dates, priorities) | P1 | Historical pattern analysis |
| F18 | AI task description generator | P2 | Auto-draft from brief input |
| F19 | AI project/sprint status summarization | P1 | Standup report generator |
| F20 | MCP Server for external AI agents | P0 | create_task, search, status tools |
| F21 | Natural language task search | P1 | Meilisearch + LLM query |
| F22 | AI workload balancing suggestions | P2 | Detect overloaded members |
| F23 | Smart duplicate detection | P2 | When creating tasks |
| F24 | Auto-categorization of tasks by content | P2 | Labels/tags suggestion |
| F25 | AI-generated weekly digest per team/project | P1 | Email + in-app |

### 3.3 Role & Access Management (26–33)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F26 | Org-level roles: Owner, Admin, Member, Viewer, Billing Admin | P0 | Casbin RBAC |
| F27 | Project-level roles: Lead, Contributor, Reviewer, Observer | P0 | Domain-scoped |
| F28 | Team-level roles: Team Lead, Team Member | P0 | Inherited within team |
| F29 | Custom role builder (granular permissions per resource per org) | P1 | JSONB permissions |
| F30 | Role inheritance (org admin → all projects) | P0 | Casbin grouping |
| F31 | Invitation system (email invite + link invite) | P0 | GoTrue + custom flow |
| F32 | SSO/SAML for enterprise | P1 | GoTrue supports SAML |
| F33 | OAuth (Google, GitHub, MS, Apple) + Email/Password + Magic Link | P0 | GoTrue providers |

### 3.4 Dashboard & Analytics (34–43)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F34 | Org-wide dashboard (totals, rates, performance, bottlenecks) | P0 | Server Component |
| F35 | Project dashboard (burndown, distribution, timeline health) | P0 | Recharts |
| F36 | Team dashboard (workload, velocity, blockers) | P0 | Per-member breakdown |
| F37 | Personal dashboard (my tasks, deadlines, activity) | P0 | Default landing |
| F38 | Customizable dashboard (drag-and-drop widgets, saved layouts) | P1 | React Grid Layout |
| F39 | Real-time dashboard updates via WebSocket | P0 | Auto-refresh on events |
| F40 | Export dashboard as PDF/PNG | P2 | html2canvas |
| F41 | Time tracking per task with reports | P1 | Start/stop timer |
| F42 | Sprint/iteration analytics (velocity, carry-over, scope creep) | P1 | Historical comparison |
| F43 | Custom report builder (filter/group by any field, export) | P2 | Query builder UI |

### 3.5 Collaboration (44–52)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F44 | Threaded comments on tasks with @mentions | P0 | Rich text |
| F45 | File attachments with preview (images, PDFs) | P0 | MinIO/S3 storage |
| F46 | Real-time presence indicators | P1 | Who's viewing this task |
| F47 | Activity log/audit trail per task, project, org | P0 | Immutable log |
| F48 | Multi-channel notifications | P0 | In-app, email, Slack, Discord, Teams, push |
| F49 | Notification preferences per user (channel × event type) | P1 | Fine-grained control |
| F50 | Task watchers/followers | P1 | Subscribe to updates |
| F51 | Rich text editor (Tiptap/ProseMirror) | P0 | Descriptions + comments |
| F52 | Version history for task description edits | P2 | Diff view |

### 3.6 Import/Export & Integrations (53–62)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F53 | Import from CSV/XLSX with smart column mapping UI | P0 | Fuzzy match columns |
| F54 | Export projects/tasks to CSV/XLSX/JSON | P0 | Background job |
| F55 | Task template import/export (JSON with nested subtasks) | P1 | Shareable templates |
| F56 | REST API with OpenAPI 3.1 spec | P0 | Full CRUD |
| F57 | Webhook system (outgoing, configurable per event) | P1 | Retry with backoff |
| F58 | Stripe billing (Free/Pro/Enterprise plans) | P0 | Usage-based limits |
| F59 | API key management for programmatic access | P1 | Scoped permissions |
| F60 | Bulk import with conflict resolution (merge/skip/overwrite) | P1 | Import settings |
| F61 | Zapier/n8n integration via webhooks + API | P2 | No-code automation |
| F62 | Calendar sync (iCal export of due dates) | P2 | .ics endpoint |

### 3.7 Platform & Infrastructure (63–67)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F63 | Multi-tenant RLS isolation (org_id per row) | P0 | PostgreSQL policies |
| F64 | Full-text search via Meilisearch (per-tenant tokens) | P0 | <50ms search |
| F65 | Background job processing (Asynq) | P0 | Import, export, AI, email |
| F66 | Rate limiting per org/user (Redis) | P0 | Prevent abuse |
| F67 | Structured logging + Prometheus metrics + health checks | P0 | Observability |

---

## 4. Architecture Overview

```
                           ┌─────────────────────────┐
                           │     Load Balancer        │
                           │   (Traefik / Nginx)      │
                           └────────────┬────────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 │                      │                      │
          ┌──────┴──────┐       ┌───────┴───────┐      ┌──────┴──────┐
          │  Next.js    │       │   Go API      │      │ Go WebSocket│
          │  SSR App    │       │   Server      │      │   Server    │
          │ :3000       │       │  :8080        │      │  :8081      │
          └──────┬──────┘       └───────┬───────┘      └──────┬──────┘
                 │                      │                      │
                 │               ┌──────┴──────┐               │
                 │               │   Casbin    │               │
                 │               │   (RBAC)    │               │
                 │               └──────┬──────┘               │
                 │                      │                      │
    ┌────────────┴──────────────────────┴──────────────────────┴────────────┐
    │                              Redis 7                                  │
    │        Cache │ Pub/Sub │ Sessions │ Rate Limits │ Asynq Queues        │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
    ┌──────────────────────────────────┴───────────────────────────────────┐
    │                        PostgreSQL 18 (RLS)                           │
    │         Primary DB — all tenants, row-level security                 │
    └──────────────────────────────────────────────────────────────────────┘
                                       │
    ┌──────────┬───────────┬───────────┼───────────┬───────────┐
    │          │           │           │           │           │
┌───┴───┐ ┌───┴────┐ ┌────┴───┐ ┌─────┴────┐ ┌───┴────┐ ┌───┴──────┐
│GoTrue │ │Meili-  │ │ MinIO  │ │  Asynq   │ │  MCP   │ │ Stripe   │
│(Auth) │ │search  │ │ (S3)   │ │(Workers) │ │Server  │ │(Billing) │
└───────┘ └────────┘ └────────┘ └──────────┘ └────────┘ └──────────┘
```

### Service Communication Matrix

| From → To | Protocol | Purpose |
|-----------|----------|---------|
| Next.js → Go API | HTTP/REST | Data fetching (SSR + client) |
| Next.js → Go WS | WebSocket | Real-time events |
| Go API → PostgreSQL | TCP (pgx) | Data persistence |
| Go API → Redis | TCP | Cache, pub/sub publish |
| Go API → Asynq (Redis) | TCP | Enqueue background jobs |
| Go WS → Redis | TCP | Pub/Sub subscribe for fan-out |
| Go API → MinIO | HTTP (S3 API) | File storage |
| Go API → Meilisearch | HTTP | Search indexing + queries |
| Go API → GoTrue | HTTP | Auth verification, user mgmt |
| Go API → Stripe | HTTPS | Billing operations |
| Go Worker → PostgreSQL | TCP | Process jobs |
| Go Worker → SMTP/SES | SMTP/HTTPS | Send emails |
| Go Worker → FCM/APNs | HTTPS | Mobile push |
| Go Worker → LLM API | HTTPS | AI completion review |
| MCP Server → Go API | HTTP (internal) | Execute PM operations |
| External AI → MCP Server | stdio/SSE | Model Context Protocol |

---

## 5. Layered Architecture (DAO Pattern)

OrbisPM follows a strict **4-layer architecture** inspired by the DAO (Data Access Object) pattern, ensuring clean separation of concerns, testability, and maintainability.

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                          │
│  (HTTP Handlers / WebSocket Handlers / MCP Tool Handlers)       │
│  • Parse request (path params, query, body)                     │
│  • Validate input (struct tags + custom validators)             │
│  • Call service layer                                           │
│  • Format response (JSON, SSE)                                  │
│  • HTTP status codes, error responses                           │
│  Files: internal/handler/*.go                                   │
├─────────────────────────────────────────────────────────────────┤
│                      SERVICE LAYER                              │
│  (Business Logic / Use Cases / Orchestration)                   │
│  • Business rules (depth check, rule evaluation, permissions)   │
│  • Orchestration (call multiple repos, emit events)             │
│  • Transaction management (begin/commit/rollback)               │
│  • Event publishing (Redis pub/sub for real-time)               │
│  • Background job enqueueing (Asynq)                            │
│  Files: internal/service/*.go                                   │
├─────────────────────────────────────────────────────────────────┤
│                    REPOSITORY LAYER (DAO)                       │
│  (Data Access Objects — database interaction)                   │
│  • SQL queries via sqlc-generated code + sqlx dynamic queries   │
│  • Single-table or simple join operations                       │
│  • No business logic — pure data access                         │
│  • Accepts *sqlx.Tx or *sqlx.DB (transaction-aware)             │
│  • Maps DB rows → domain models                                 │
│  Files: internal/repository/*.go, db/queries/*.sql              │
├─────────────────────────────────────────────────────────────────┤
│                      DOMAIN LAYER                               │
│  (Domain Models / Entities / Value Objects)                     │
│  • Pure Go structs — no DB tags, no JSON tags                   │
│  • Business validation methods                                  │
│  • Domain constants and enums                                   │
│  • Zero dependencies on infrastructure                          │
│  Files: internal/domain/*.go                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Rules (Strictly Enforced)

| Rule | Description |
|------|-------------|
| **Dependencies flow downward only** | Handler → Service → Repository → Domain. Never upward. |
| **Domain has zero imports** | Domain models import nothing from other layers. |
| **Repository has no business logic** | No `if task.Status == "done"` — that belongs in Service. |
| **Handler has no business logic** | No complex conditionals — delegate to Service. |
| **Service owns transactions** | `repo.WithTx(ctx, func(tx) { ... })` — repos are TX-unaware. |
| **Interfaces at boundaries** | Service depends on `Repository` interface, not concrete struct. |
| **Errors propagate upward** | Domain/Repo return domain errors → Service wraps context → Handler maps to HTTP status. |

### Cross-Cutting Concerns (Middleware & Infrastructure)

```
┌─────────────────────────────────────────────────────────────────┐
│                   MIDDLEWARE / INFRASTRUCTURE                    │
│  (Orthogonal to the 4 layers — wraps or supports them)          │
│                                                                 │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐         │
│  │ Auth        │ │ RLS Tenant   │ │ RBAC (Casbin)    │         │
│  │ Middleware  │ │ Middleware   │ │ Middleware        │         │
│  └─────────────┘ └──────────────┘ └──────────────────┘         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐         │
│  │ Rate Limit  │ │ Request ID   │ │ Logging          │         │
│  │ Middleware  │ │ Middleware   │ │ (zerolog)        │         │
│  └─────────────┘ └──────────────┘ └──────────────────┘         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐         │
│  │ CORS        │ │ Recovery     │ │ Metrics          │         │
│  │ Middleware  │ │ (panic)      │ │ (Prometheus)     │         │
│  └─────────────┘ └──────────────┘ └──────────────────┘         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Infrastructure Services (injected via DI)                │   │
│  │ • RedisClient  • MeilisearchClient  • MinIOClient       │   │
│  │ • AsynqClient  • StripeClient       • LLMClient         │   │
│  │ • EmailSender  • PushSender         • WebhookSender     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Dependency Injection Flow

```go
// cmd/api/main.go — Wiring (Composition Root)
func main() {
    cfg := config.Load()
    db  := postgres.Connect(cfg.DatabaseURL)
    rdb := redis.Connect(cfg.RedisURL)

    // Layer 1: Repositories (DAO)
    orgRepo     := repository.NewOrgRepo(db)
    teamRepo    := repository.NewTeamRepo(db)
    projectRepo := repository.NewProjectRepo(db)
    taskRepo    := repository.NewTaskRepo(db)
    // ... more repos

    // Layer 2: Services
    orgSvc     := service.NewOrgService(orgRepo, rdb)
    teamSvc    := service.NewTeamService(teamRepo, orgRepo, rdb)
    projectSvc := service.NewProjectService(projectRepo, teamRepo, rdb)
    taskSvc    := service.NewTaskService(taskRepo, projectRepo, rdb, asynqClient)
    // ... more services

    // Layer 3: Handlers
    orgHandler     := handler.NewOrgHandler(orgSvc)
    teamHandler    := handler.NewTeamHandler(teamSvc)
    projectHandler := handler.NewProjectHandler(projectSvc)
    taskHandler    := handler.NewTaskHandler(taskSvc)
    // ... more handlers

    // Router
    r := chi.NewRouter()
    r.Use(middleware.RequestID, middleware.Logger, middleware.Recovery)
    r.Use(middleware.Auth(cfg.JWTSecret))
    r.Use(middleware.RLSTenant(db))
    r.Route("/api/v1", func(r chi.Router) {
        r.Mount("/orgs", orgHandler.Routes())
        r.Mount("/teams", teamHandler.Routes())
        // ...
    })
}
```

### Concrete Example: Task Creation Flow

```
Client POST /api/v1/orgs/:orgId/projects/:projectId/tasks
  │
  ▼
┌─── Handler Layer ──────────────────────────────────────┐
│ taskHandler.Create(w, r)                               │
│   1. Parse request body → CreateTaskRequest            │
│   2. Validate (title required, depth ≤ 5, etc.)       │
│   3. Extract orgID, projectID from URL params          │
│   4. Call taskSvc.Create(ctx, params)                  │
│   5. Return 201 + TaskResponse JSON                    │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌─── Service Layer ──────────────────────────────────────┐
│ taskSvc.Create(ctx, params)                            │
│   1. If parentTaskID != nil:                           │
│      a. Fetch parent task from repo                    │
│      b. Check parent.Depth < 5 (business rule)        │
│      c. Set newTask.Depth = parent.Depth + 1           │
│   2. Begin transaction                                 │
│   3. Call taskRepo.Create(ctx, tx, task)               │
│   4. If template: call taskRepo.CreateBatch for subs   │
│   5. Commit transaction                                │
│   6. Publish event to Redis: "task.created"            │
│   7. Enqueue Asynq job: search:index                   │
│   8. Return domain.Task                                │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌─── Repository Layer (DAO) ─────────────────────────────┐
│ taskRepo.Create(ctx, tx, task)                         │
│   1. Execute sqlc-generated INSERT query               │
│   2. Map returned row → domain.Task                    │
│   3. Return (domain.Task, error)                       │
│ NOTE: org_id filtering is handled by RLS policy        │
│       automatically — repo doesn't add WHERE org_id=   │
└────────────────────────────────────────────────────────┘
```

### Interface Contracts

```go
// internal/repository/interfaces.go

type TaskRepository interface {
    Create(ctx context.Context, tx pgx.Tx, task *domain.Task) (*domain.Task, error)
    GetByID(ctx context.Context, id uuid.UUID) (*domain.Task, error)
    GetTree(ctx context.Context, rootTaskID uuid.UUID) ([]*domain.Task, error)
    List(ctx context.Context, projectID uuid.UUID, filter TaskFilter) ([]*domain.Task, error)
    Update(ctx context.Context, tx pgx.Tx, task *domain.Task) (*domain.Task, error)
    Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
    UpdatePosition(ctx context.Context, tx pgx.Tx, id uuid.UUID, position int) error
    Reparent(ctx context.Context, tx pgx.Tx, id, newParentID uuid.UUID) error
}

type TaskService interface {
    Create(ctx context.Context, params CreateTaskParams) (*domain.Task, error)
    Get(ctx context.Context, id uuid.UUID) (*domain.Task, error)
    GetTree(ctx context.Context, rootID uuid.UUID) (*domain.TaskTree, error)
    Update(ctx context.Context, id uuid.UUID, params UpdateTaskParams) (*domain.Task, error)
    Delete(ctx context.Context, id uuid.UUID) error
    SubmitForReview(ctx context.Context, id uuid.UUID) error
    MarkComplete(ctx context.Context, id uuid.UUID, reviewResult *domain.ReviewResult) error
    Duplicate(ctx context.Context, id uuid.UUID, deep bool) (*domain.Task, error)
}
```

---

## 6. Project File Structure

```
orbispm/
│
├── .github/                                # GitHub & Copilot configuration
│   ├── copilot-instructions.md             # Global Copilot instructions
│   ├── prompts/                            # Reusable prompts
│   │   ├── go-backend.prompt.md            # Go backend development prompt
│   │   ├── nextjs-frontend.prompt.md       # Next.js frontend prompt
│   │   ├── database.prompt.md              # Database & migrations prompt
│   │   ├── testing.prompt.md               # Testing prompt
│   │   └── security.prompt.md              # Security review prompt
│   └── workflows/                          # CI/CD workflows
│       ├── ci.yml                          # Test + lint + build
│       ├── deploy-staging.yml              # Deploy to staging
│       └── deploy-prod.yml                 # Deploy to production
│
├── .vscode/                                # VS Code workspace settings
│   └── settings.json                       # Editor config
│
├── docker-compose.yml                      # Development environment
├── docker-compose.prod.yml                 # Production overrides
├── docker-compose.test.yml                 # Integration test environment
├── Makefile                                # Common commands
├── .env.example                            # Environment variable template
├── .gitignore
├── README.md                               # Quick start guide
│
├── k8s/                                    # Kubernetes manifests
│   ├── base/                               # Base Kustomize configs
│   │   ├── kustomization.yaml
│   │   ├── namespace.yaml
│   │   ├── api-deployment.yaml
│   │   ├── ws-deployment.yaml
│   │   ├── worker-deployment.yaml
│   │   ├── mcp-deployment.yaml
│   │   ├── frontend-deployment.yaml
│   │   ├── postgres-statefulset.yaml
│   │   ├── redis-statefulset.yaml
│   │   ├── meilisearch-statefulset.yaml
│   │   ├── minio-statefulset.yaml
│   │   ├── gotrue-deployment.yaml
│   │   ├── services.yaml
│   │   ├── configmaps.yaml
│   │   ├── secrets.yaml
│   │   ├── ingress.yaml
│   │   └── hpa.yaml                        # Horizontal Pod Autoscaler
│   └── overlays/
│       ├── staging/
│       │   └── kustomization.yaml
│       └── production/
│           └── kustomization.yaml
│
├── backend/                                # ═══ GO BACKEND MONOLITH ═══
│   ├── go.mod
│   ├── go.sum
│   ├── sqlc.yaml                           # sqlc code generation config
│   ├── Dockerfile                          # Multi-stage build
│   ├── .golangci.yml                       # Linter config
│   │
│   ├── cmd/                                # ─── Entry Points ───
│   │   ├── api/
│   │   │   └── main.go                     # HTTP API server
│   │   ├── ws/
│   │   │   └── main.go                     # WebSocket server
│   │   ├── worker/
│   │   │   └── main.go                     # Asynq background worker
│   │   ├── mcp/
│   │   │   └── main.go                     # MCP protocol server
│   │   └── migrate/
│   │       └── main.go                     # DB migration runner
│   │
│   ├── internal/                           # ─── Private Application Code ───
│   │   │
│   │   ├── config/                         # Configuration
│   │   │   └── config.go                   # Env config struct (envconfig)
│   │   │
│   │   ├── domain/                         # ═══ DOMAIN LAYER ═══
│   │   │   ├── org.go                      # Org entity + value objects
│   │   │   ├── team.go                     # Team entity
│   │   │   ├── project.go                  # Project entity
│   │   │   ├── task.go                     # Task entity + TaskTree
│   │   │   ├── checklist.go                # Checklist entity
│   │   │   ├── rule.go                     # Task rule + rule types
│   │   │   ├── template.go                 # Task template entity
│   │   │   ├── comment.go                  # Comment entity
│   │   │   ├── attachment.go               # Attachment entity
│   │   │   ├── user.go                     # User entity (mirrors GoTrue)
│   │   │   ├── notification.go             # Notification entity
│   │   │   ├── webhook.go                  # Webhook entity
│   │   │   ├── billing.go                  # Plan, Subscription entities
│   │   │   ├── activity.go                 # Activity log entry
│   │   │   ├── import_job.go               # Import job entity
│   │   │   ├── roles.go                    # Role constants + permissions
│   │   │   ├── errors.go                   # Domain error types
│   │   │   └── events.go                   # Domain event types
│   │   │
│   │   ├── repository/                     # ═══ REPOSITORY LAYER (DAO) ═══
│   │   │   ├── interfaces.go              # All repository interfaces
│   │   │   ├── org_repo.go                # OrgRepository implementation
│   │   │   ├── team_repo.go               # TeamRepository implementation
│   │   │   ├── project_repo.go            # ProjectRepository implementation
│   │   │   ├── task_repo.go               # TaskRepository implementation
│   │   │   ├── checklist_repo.go          # ChecklistRepository implementation
│   │   │   ├── rule_repo.go               # RuleRepository implementation
│   │   │   ├── template_repo.go           # TemplateRepository implementation
│   │   │   ├── comment_repo.go            # CommentRepository implementation
│   │   │   ├── attachment_repo.go         # AttachmentRepository implementation
│   │   │   ├── notification_repo.go       # NotificationRepository implementation
│   │   │   ├── activity_repo.go           # ActivityRepository implementation
│   │   │   ├── webhook_repo.go            # WebhookRepository implementation
│   │   │   ├── billing_repo.go            # BillingRepository implementation
│   │   │   ├── import_repo.go             # ImportJobRepository implementation
│   │   │   ├── apikey_repo.go             # APIKeyRepository implementation
│   │   │   └── tx.go                      # Transaction helper
│   │   │
│   │   ├── service/                        # ═══ SERVICE LAYER ═══
│   │   │   ├── org_service.go             # Org business logic
│   │   │   ├── team_service.go            # Team business logic
│   │   │   ├── project_service.go         # Project business logic
│   │   │   ├── task_service.go            # Task business logic (depth, rules)
│   │   │   ├── checklist_service.go       # Checklist operations
│   │   │   ├── rule_service.go            # Rule evaluation logic
│   │   │   ├── template_service.go        # Template CRUD + instantiation
│   │   │   ├── comment_service.go         # Comment business logic
│   │   │   ├── attachment_service.go      # File upload/download logic
│   │   │   ├── notification_service.go    # Notification routing
│   │   │   ├── dashboard_service.go       # Dashboard aggregation queries
│   │   │   ├── search_service.go          # Search indexing + query
│   │   │   ├── import_service.go          # Import orchestration
│   │   │   ├── export_service.go          # Export generation
│   │   │   ├── billing_service.go         # Stripe integration logic
│   │   │   ├── webhook_service.go         # Webhook delivery logic
│   │   │   └── apikey_service.go          # API key management
│   │   │
│   │   ├── handler/                        # ═══ PRESENTATION LAYER ═══
│   │   │   ├── org_handler.go             # /api/v1/orgs routes
│   │   │   ├── team_handler.go            # /api/v1/orgs/:id/teams routes
│   │   │   ├── project_handler.go         # /api/v1/orgs/:id/projects routes
│   │   │   ├── task_handler.go            # /api/v1/.../tasks routes
│   │   │   ├── checklist_handler.go       # /api/v1/tasks/:id/checklists
│   │   │   ├── rule_handler.go            # /api/v1/tasks/:id/rules
│   │   │   ├── template_handler.go        # /api/v1/templates
│   │   │   ├── comment_handler.go         # /api/v1/tasks/:id/comments
│   │   │   ├── attachment_handler.go      # /api/v1/tasks/:id/attachments
│   │   │   ├── notification_handler.go    # /api/v1/notifications
│   │   │   ├── dashboard_handler.go       # /api/v1/dashboard
│   │   │   ├── search_handler.go          # /api/v1/search
│   │   │   ├── import_handler.go          # /api/v1/import
│   │   │   ├── export_handler.go          # /api/v1/export
│   │   │   ├── billing_handler.go         # /api/v1/billing
│   │   │   ├── webhook_handler.go         # /api/v1/webhooks
│   │   │   ├── apikey_handler.go          # /api/v1/api-keys
│   │   │   ├── health_handler.go          # /health, /ready, /metrics
│   │   │   ├── request.go                 # Shared request parsing helpers
│   │   │   └── response.go               # Shared response formatting
│   │   │
│   │   ├── middleware/                     # ═══ CROSS-CUTTING MIDDLEWARE ═══
│   │   │   ├── auth.go                    # JWT validation (GoTrue)
│   │   │   ├── rls_tenant.go              # SET LOCAL app.current_org_id
│   │   │   ├── rbac.go                    # Casbin permission check
│   │   │   ├── rate_limit.go              # Redis-based rate limiter
│   │   │   ├── request_id.go             # X-Request-ID propagation
│   │   │   ├── logger.go                 # Structured request logging
│   │   │   ├── recovery.go               # Panic recovery
│   │   │   ├── cors.go                   # CORS configuration
│   │   │   ├── api_key.go               # API key auth (alternative to JWT)
│   │   │   └── plan_limit.go            # Usage limit enforcement
│   │   │
│   │   ├── ws/                             # ═══ WEBSOCKET MODULE ═══
│   │   │   ├── hub.go                     # Connection hub (per-org rooms)
│   │   │   ├── client.go                  # WebSocket client wrapper
│   │   │   ├── handler.go                # WS upgrade + message routing
│   │   │   ├── events.go                 # Event type definitions
│   │   │   └── redis_subscriber.go       # Redis Pub/Sub → WS fan-out
│   │   │
│   │   ├── worker/                         # ═══ BACKGROUND WORKERS ═══
│   │   │   ├── router.go                 # Asynq task → handler routing
│   │   │   ├── email_worker.go           # Send email notifications
│   │   │   ├── push_worker.go            # Send mobile push (FCM/APNs)
│   │   │   ├── slack_worker.go           # Deliver to Slack
│   │   │   ├── discord_worker.go         # Deliver to Discord
│   │   │   ├── teams_worker.go           # Deliver to MS Teams
│   │   │   ├── webhook_worker.go         # Deliver outgoing webhooks
│   │   │   ├── import_worker.go          # Process CSV/XLSX imports
│   │   │   ├── export_worker.go          # Generate export files
│   │   │   ├── search_index_worker.go    # Sync to Meilisearch
│   │   │   └── ai_review_worker.go       # AI task completion review
│   │   │
│   │   ├── mcp/                            # ═══ MCP SERVER MODULE ═══
│   │   │   ├── server.go                 # MCP protocol server setup
│   │   │   ├── tools.go                  # Tool definitions (create_task, etc.)
│   │   │   └── resources.go              # Resource definitions (projects, etc.)
│   │   │
│   │   ├── ai/                             # ═══ AI INTEGRATION ═══
│   │   │   ├── client.go                 # LLM client (OpenAI/Anthropic)
│   │   │   ├── reviewer.go              # Task completion reviewer
│   │   │   ├── suggester.go             # Smart suggestions engine
│   │   │   └── prompts.go               # LLM prompt templates
│   │   │
│   │   ├── rbac/                           # ═══ RBAC MODULE ═══
│   │   │   ├── model.go                  # Casbin model definition
│   │   │   ├── enforcer.go              # Cached enforcer setup
│   │   │   ├── adapter.go               # PostgreSQL policy adapter
│   │   │   └── policies.go              # Default policies + helpers
│   │   │
│   │   ├── notification/                   # ═══ NOTIFICATION MODULE ═══
│   │   │   ├── dispatcher.go             # Route to correct channel
│   │   │   ├── email.go                  # Email sender (SMTP/SES)
│   │   │   ├── push.go                   # FCM + APNs sender
│   │   │   └── templates/                # Go templates for emails
│   │   │       ├── task_assigned.html
│   │   │       ├── comment_mention.html
│   │   │       ├── weekly_digest.html
│   │   │       └── invitation.html
│   │   │
│   │   ├── billing/                        # ═══ BILLING MODULE ═══
│   │   │   ├── stripe.go                 # Stripe client wrapper
│   │   │   ├── plans.go                  # Plan definitions + limits
│   │   │   └── webhook.go               # Stripe webhook handler
│   │   │
│   │   ├── search/                         # ═══ SEARCH MODULE ═══
│   │   │   ├── meilisearch.go            # Meilisearch client wrapper
│   │   │   ├── indexer.go                # Index management
│   │   │   └── tenant_token.go           # Per-tenant search tokens
│   │   │
│   │   ├── storage/                        # ═══ FILE STORAGE MODULE ═══
│   │   │   ├── minio.go                  # MinIO/S3 client wrapper
│   │   │   └── presigned.go              # Pre-signed URL generation
│   │   │
│   │   └── pkg/                            # ═══ SHARED UTILITIES ═══
│   │       ├── pagination.go             # Cursor + offset pagination
│   │       ├── validator.go              # Custom validators
│   │       ├── slug.go                   # Slug generation
│   │       ├── crypto.go                 # Hash, token generation
│   │       └── ptr.go                    # Pointer helpers
│   │
│   ├── db/                                 # ─── Database Files ───
│   │   ├── migrations/                    # golang-migrate SQL files
│   │   │   ├── 000001_init_schema.up.sql
│   │   │   ├── 000001_init_schema.down.sql
│   │   │   ├── 000002_rls_policies.up.sql
│   │   │   ├── 000002_rls_policies.down.sql
│   │   │   ├── 000003_seed_roles.up.sql
│   │   │   └── 000003_seed_roles.down.sql
│   │   ├── queries/                       # sqlc query files
│   │   │   ├── orgs.sql
│   │   │   ├── teams.sql
│   │   │   ├── projects.sql
│   │   │   ├── tasks.sql                  # Includes recursive CTE
│   │   │   ├── checklists.sql
│   │   │   ├── rules.sql
│   │   │   ├── templates.sql
│   │   │   ├── comments.sql
│   │   │   ├── attachments.sql
│   │   │   ├── notifications.sql
│   │   │   ├── activity.sql
│   │   │   ├── webhooks.sql
│   │   │   ├── billing.sql
│   │   │   ├── import_jobs.sql
│   │   │   └── api_keys.sql
│   │   └── seeds/                         # Development seed data
│   │       └── dev_seed.sql
│   │
│   └── tests/                              # ─── Integration Tests ───
│       ├── integration/
│       │   ├── task_test.go               # Task CRUD + depth enforcement
│       │   ├── rbac_test.go               # Permission tests
│       │   ├── rls_test.go                # Cross-tenant isolation
│       │   ├── import_export_test.go      # Roundtrip test
│       │   └── helpers_test.go            # Test utilities
│       └── fixtures/
│           ├── sample_import.csv
│           └── sample_template.json
│
├── frontend/                               # ═══ NEXT.JS 15 FRONTEND ═══
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── .eslintrc.json
│   ├── .prettierrc
│   │
│   ├── public/
│   │   ├── favicon.ico
│   │   └── assets/
│   │
│   ├── src/
│   │   ├── app/                            # ─── App Router ───
│   │   │   ├── layout.tsx                 # Root layout (fonts, metadata)
│   │   │   ├── globals.css                # Tailwind + custom styles
│   │   │   │
│   │   │   ├── (auth)/                    # Auth group (no app shell)
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   ├── forgot-password/page.tsx
│   │   │   │   ├── magic-link/page.tsx
│   │   │   │   ├── invite/[token]/page.tsx
│   │   │   │   └── layout.tsx             # Auth layout (centered card)
│   │   │   │
│   │   │   └── (app)/                     # Authenticated app group
│   │   │       ├── layout.tsx             # App shell (sidebar, topbar)
│   │   │       │
│   │   │       └── [orgSlug]/             # ─── Org-scoped routes ───
│   │   │           ├── layout.tsx         # Org context provider
│   │   │           │
│   │   │           ├── dashboard/
│   │   │           │   ├── page.tsx       # Org dashboard
│   │   │           │   └── loading.tsx    # Skeleton
│   │   │           │
│   │   │           ├── teams/
│   │   │           │   ├── page.tsx       # Teams list
│   │   │           │   └── [teamId]/
│   │   │           │       ├── page.tsx   # Team dashboard
│   │   │           │       └── members/page.tsx
│   │   │           │
│   │   │           ├── projects/
│   │   │           │   ├── page.tsx       # Projects list
│   │   │           │   └── [projectId]/
│   │   │           │       ├── layout.tsx # Project context
│   │   │           │       ├── page.tsx   # Project dashboard
│   │   │           │       ├── tasks/
│   │   │           │       │   ├── page.tsx       # Task tree/list view
│   │   │           │       │   └── [taskId]/
│   │   │           │       │       └── page.tsx   # Task detail
│   │   │           │       ├── board/page.tsx     # Kanban (future)
│   │   │           │       ├── settings/page.tsx  # Project settings
│   │   │           │       ├── import/page.tsx    # Import UI
│   │   │           │       └── export/page.tsx    # Export UI
│   │   │           │
│   │   │           ├── templates/
│   │   │           │   └── page.tsx       # Template manager
│   │   │           │
│   │   │           ├── settings/
│   │   │           │   ├── page.tsx       # General org settings
│   │   │           │   ├── roles/page.tsx # Role management
│   │   │           │   ├── billing/page.tsx # Billing & plans
│   │   │           │   ├── webhooks/page.tsx
│   │   │           │   ├── api-keys/page.tsx
│   │   │           │   └── notifications/page.tsx
│   │   │           │
│   │   │           └── admin/
│   │   │               ├── members/page.tsx # Org members
│   │   │               └── audit/page.tsx   # Audit log
│   │   │
│   │   ├── components/                     # ─── React Components ───
│   │   │   ├── ui/                        # Shadcn/UI primitives
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── avatar.tsx
│   │   │   │   ├── skeleton.tsx
│   │   │   │   ├── toast.tsx
│   │   │   │   └── ... (all shadcn components)
│   │   │   │
│   │   │   ├── layout/
│   │   │   │   ├── sidebar.tsx            # App sidebar navigation
│   │   │   │   ├── topbar.tsx             # Top bar (search, user menu)
│   │   │   │   ├── org-switcher.tsx       # Org dropdown switcher
│   │   │   │   └── breadcrumb.tsx         # Dynamic breadcrumbs
│   │   │   │
│   │   │   ├── task/
│   │   │   │   ├── task-tree.tsx          # Hierarchical tree component
│   │   │   │   ├── task-tree-row.tsx      # Single tree row
│   │   │   │   ├── task-detail-panel.tsx  # Slide-over detail panel
│   │   │   │   ├── task-form.tsx          # Create/edit form
│   │   │   │   ├── task-status-badge.tsx  # Status indicator
│   │   │   │   ├── task-priority-icon.tsx # Priority indicator
│   │   │   │   ├── task-checklist.tsx     # Checklist widget
│   │   │   │   ├── task-rules.tsx         # Rules display/editor
│   │   │   │   ├── task-comments.tsx      # Comment thread
│   │   │   │   ├── task-attachments.tsx   # File attachments
│   │   │   │   ├── task-activity.tsx      # Activity log
│   │   │   │   └── task-context-menu.tsx  # Right-click menu
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── dashboard-grid.tsx     # React Grid Layout wrapper
│   │   │   │   ├── widget-task-distribution.tsx
│   │   │   │   ├── widget-team-workload.tsx
│   │   │   │   ├── widget-burndown.tsx
│   │   │   │   ├── widget-overdue.tsx
│   │   │   │   ├── widget-recent-activity.tsx
│   │   │   │   ├── widget-velocity.tsx
│   │   │   │   └── scope-selector.tsx     # Org/Team/Project/Personal
│   │   │   │
│   │   │   ├── import-export/
│   │   │   │   ├── file-dropzone.tsx      # Drag-and-drop upload
│   │   │   │   ├── column-mapper.tsx      # Smart column mapping
│   │   │   │   ├── import-preview.tsx     # Preview mapped data
│   │   │   │   └── export-dialog.tsx      # Format selection
│   │   │   │
│   │   │   ├── editor/
│   │   │   │   └── rich-text-editor.tsx   # Tiptap wrapper
│   │   │   │
│   │   │   └── common/
│   │   │       ├── data-table.tsx         # Reusable table
│   │   │       ├── empty-state.tsx        # Empty state placeholder
│   │   │       ├── error-boundary.tsx     # Error boundary
│   │   │       ├── loading-spinner.tsx    # Loading indicator
│   │   │       ├── confirm-dialog.tsx     # Confirmation modal
│   │   │       └── notification-bell.tsx  # Notification dropdown
│   │   │
│   │   ├── lib/                            # ─── Utilities ───
│   │   │   ├── api.ts                     # Typed API client (fetch wrapper)
│   │   │   ├── ws.ts                      # WebSocket client + reconnect
│   │   │   ├── auth.ts                    # GoTrue client helpers
│   │   │   ├── utils.ts                   # General utilities (cn, etc.)
│   │   │   └── constants.ts               # App constants
│   │   │
│   │   ├── hooks/                          # ─── Custom Hooks ───
│   │   │   ├── use-tasks.ts              # Task CRUD + optimistic updates
│   │   │   ├── use-realtime.ts           # WebSocket subscription hook
│   │   │   ├── use-auth.ts               # Auth state hook
│   │   │   ├── use-org.ts                # Current org context hook
│   │   │   ├── use-permissions.ts        # RBAC check hook
│   │   │   ├── use-notifications.ts      # Notifications hook
│   │   │   └── use-debounce.ts           # Debounce utility hook
│   │   │
│   │   ├── stores/                         # ─── Client State (Zustand) ───
│   │   │   ├── task-store.ts             # Task tree client state
│   │   │   ├── ui-store.ts               # UI state (sidebar, panels)
│   │   │   └── notification-store.ts     # Notification badge count
│   │   │
│   │   └── types/                          # ─── TypeScript Types ───
│   │       ├── api.ts                     # API response/request types
│   │       ├── task.ts                    # Task, Subtask, Checklist types
│   │       ├── org.ts                     # Org, Team, Project types
│   │       ├── user.ts                    # User, Role types
│   │       └── dashboard.ts              # Dashboard widget types
│   │
│   └── tests/                              # ─── Frontend Tests ───
│       ├── components/                    # Component tests (Vitest + RTL)
│       ├── e2e/                           # E2E tests (Playwright)
│       │   ├── auth.spec.ts
│       │   ├── task-crud.spec.ts
│       │   └── import-export.spec.ts
│       └── setup.ts                       # Test setup
│
├── gotrue/                                 # ═══ AUTH SERVICE CONFIG ═══
│   ├── gotrue.env                         # Auth service environment config
│   └── Dockerfile                         # Custom GoTrue image (if needed)
│
└── docs/                                   # ═══ DOCUMENTATION ═══
    ├── PROJECT.md                         # ← THIS FILE
    ├── API.md                             # API reference
    ├── ARCHITECTURE.md                    # Architecture decisions record
    ├── DEPLOYMENT.md                      # Deployment guide
    ├── CONTRIBUTING.md                    # Contribution guidelines
    └── SECURITY.md                        # Security policy
```

---

## 7. Database Schema

### 7.1 ER Diagram (Core Tables)

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│   orgs   │────<│  teams   │────<│   projects   │
│──────────│     │──────────│     │──────────────│
│ id (PK)  │     │ id (PK)  │     │ id (PK)      │
│ name     │     │ org_id   │     │ org_id       │
│ slug     │     │ name     │     │ team_id      │
│ plan     │     │ desc     │     │ name         │
│ settings │     │ ...      │     │ status       │
│ billing_ │     └──────────┘     │ settings     │
│ customer │           │          └──────────────┘
└──────────┘           │                 │
      │           ┌────┴─────┐    ┌──────┴──────┐
      │           │team_     │    │project_     │
      │           │members   │    │members      │
      │           │──────────│    │─────────────│
      │           │ team_id  │    │ project_id  │
      │           │ user_id  │    │ user_id     │
      │           │ role     │    │ role        │
      │           └──────────┘    └─────────────┘
      │
 ┌────┴─────┐     ┌─────────────────────────────────────────┐
 │org_      │     │                  tasks                   │
 │members   │     │─────────────────────────────────────────│
 │──────────│     │ id (PK)          │ org_id               │
 │ org_id   │     │ project_id       │ parent_task_id (FK→self)│
 │ user_id  │     │ title            │ depth (CHECK ≤ 5)    │
 │ role     │     │ description      │ position             │
 └──────────┘     │ status           │ priority             │
                  │ assignee_id      │ reporter_id          │
                  │ due_date         │ start_date           │
                  │ estimated_hours  │ actual_hours         │
                  │ metadata (JSONB) │ created_at           │
                  └──────────┬──────┴───────────────────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
     ┌──────┴──────┐  ┌─────┴─────┐  ┌───────┴───────┐
     │ checklists  │  │task_rules │  │  comments     │
     │─────────────│  │──────────│  │───────────────│
     │ id (PK)     │  │ id (PK)  │  │ id (PK)       │
     │ task_id     │  │ task_id  │  │ task_id       │
     │ title       │  │ rule_type│  │ user_id       │
     │ is_checked  │  │ config   │  │ body          │
     │ position    │  │ required │  │ parent_id     │
     └─────────────┘  └──────────┘  └───────────────┘
```

### 7.2 Core Table DDL

```sql
-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE orgs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    logo_url        TEXT,
    plan            TEXT NOT NULL DEFAULT 'free',
    billing_customer_id TEXT,  -- Stripe customer ID
    settings        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_teams_org ON teams(org_id);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'active',  -- active, archived, completed
    settings        JSONB NOT NULL DEFAULT '{}',     -- custom statuses, workflow
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_team ON projects(team_id);

-- ============================================================
-- TASKS (recursive — subtasks are tasks with parent_task_id)
-- ============================================================
CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id  UUID REFERENCES tasks(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'todo',
    priority        TEXT NOT NULL DEFAULT 'medium',   -- critical, high, medium, low
    assignee_id     UUID,
    reporter_id     UUID,
    depth           INT NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 5),
    position        INT NOT NULL DEFAULT 0,
    due_date        TIMESTAMPTZ,
    start_date      TIMESTAMPTZ,
    estimated_hours DECIMAL(8,2),
    actual_hours    DECIMAL(8,2),
    labels          TEXT[] DEFAULT '{}',
    metadata        JSONB NOT NULL DEFAULT '{}',
    review_status   TEXT,  -- null, pending_review, approved, rejected
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_org ON tasks(org_id);
CREATE INDEX idx_tasks_project ON tasks(org_id, project_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_assignee ON tasks(org_id, assignee_id);
CREATE INDEX idx_tasks_status ON tasks(org_id, project_id, status);
CREATE INDEX idx_tasks_due_date ON tasks(org_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_labels ON tasks USING GIN(labels);
CREATE INDEX idx_tasks_metadata ON tasks USING GIN(metadata);

-- ============================================================
-- CHECKLISTS
-- ============================================================
CREATE TABLE checklists (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    is_checked      BOOLEAN NOT NULL DEFAULT false,
    position        INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_checklists_task ON checklists(task_id);

-- ============================================================
-- TASK RULES (completion criteria)
-- ============================================================
CREATE TABLE task_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    rule_type       TEXT NOT NULL,  -- all_checklists_done, reviewer_approved, ai_approved, custom
    rule_config     JSONB NOT NULL DEFAULT '{}',
    is_required     BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_rules_task ON task_rules(task_id);

-- ============================================================
-- TASK TEMPLATES
-- ============================================================
CREATE TABLE task_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    structure       JSONB NOT NULL,  -- nested task tree definition
    is_shared       BOOLEAN NOT NULL DEFAULT false,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_templates_org ON task_templates(org_id);

-- ============================================================
-- COMMENTS (threaded)
-- ============================================================
CREATE TABLE comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    body            TEXT NOT NULL,
    parent_id       UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_task ON comments(task_id);

-- ============================================================
-- ATTACHMENTS
-- ============================================================
CREATE TABLE attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    task_id         UUID REFERENCES tasks(id) ON DELETE CASCADE,
    comment_id      UUID REFERENCES comments(id) ON DELETE CASCADE,
    uploaded_by     UUID NOT NULL,
    filename        TEXT NOT NULL,
    storage_path    TEXT NOT NULL,
    file_size       BIGINT NOT NULL,
    mime_type       TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_task ON attachments(task_id);

-- ============================================================
-- ACTIVITY LOG (immutable audit trail)
-- ============================================================
CREATE TABLE activity_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    entity_type     TEXT NOT NULL,  -- task, project, team, org
    entity_id       UUID NOT NULL,
    action          TEXT NOT NULL,  -- created, updated, deleted, status_changed, etc.
    actor_id        UUID NOT NULL,
    changes         JSONB,          -- before/after diff
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_org_entity ON activity_log(org_id, entity_type, entity_id);
CREATE INDEX idx_activity_created ON activity_log(org_id, created_at DESC);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT,
    payload         JSONB NOT NULL DEFAULT '{}',
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at NULLS FIRST, created_at DESC);

-- ============================================================
-- NOTIFICATION PREFERENCES
-- ============================================================
CREATE TABLE notification_preferences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    channel         TEXT NOT NULL,  -- in_app, email, slack, discord, teams, push
    enabled         BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(user_id, org_id, event_type, channel)
);

-- ============================================================
-- MEMBERSHIP TABLES
-- ============================================================
CREATE TABLE org_members (
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    role            TEXT NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(org_id, user_id)
);

CREATE TABLE team_members (
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    role            TEXT NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(team_id, user_id)
);

CREATE TABLE project_members (
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    role            TEXT NOT NULL DEFAULT 'contributor',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id, user_id)
);

-- ============================================================
-- BILLING
-- ============================================================
CREATE TABLE billing_plans (
    id              TEXT PRIMARY KEY,  -- 'free', 'pro', 'enterprise'
    name            TEXT NOT NULL,
    stripe_price_id TEXT,
    limits          JSONB NOT NULL DEFAULT '{}',  -- max_teams, max_projects, max_members
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE org_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE UNIQUE,
    plan_id         TEXT NOT NULL REFERENCES billing_plans(id),
    stripe_sub_id   TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- WEBHOOKS & API KEYS
-- ============================================================
CREATE TABLE webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    events          TEXT[] NOT NULL,
    secret          TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    name            TEXT NOT NULL,
    key_hash        TEXT NOT NULL,
    key_prefix      TEXT NOT NULL,  -- first 8 chars for identification
    scopes          TEXT[] NOT NULL DEFAULT '{}',
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- ============================================================
-- IMPORT JOBS
-- ============================================================
CREATE TABLE import_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending, mapping, processing, completed, failed
    file_path       TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    column_mapping  JSONB,
    total_rows      INT,
    processed_rows  INT DEFAULT 0,
    error_rows      INT DEFAULT 0,
    errors          JSONB DEFAULT '[]',
    result          JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

-- ============================================================
-- TASK DEPENDENCIES
-- ============================================================
CREATE TABLE task_dependencies (
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id   UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    type            TEXT NOT NULL DEFAULT 'blocked_by',  -- blocked_by, blocks
    PRIMARY KEY(task_id, depends_on_id),
    CHECK(task_id != depends_on_id)
);

-- ============================================================
-- TASK WATCHERS
-- ============================================================
CREATE TABLE task_watchers (
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    PRIMARY KEY(task_id, user_id)
);

-- ============================================================
-- CUSTOM ROLES
-- ============================================================
CREATE TABLE custom_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    permissions     JSONB NOT NULL,  -- {"task:read": true, "task:write": true, ...}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, name)
);
```

### 7.3 Row-Level Security Policies

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (applied to each table above)
-- Example for tasks:
CREATE POLICY tenant_isolation_tasks ON tasks
    FOR ALL
    USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- The Go middleware sets this per-transaction:
-- SET LOCAL app.current_org_id = '<org-uuid>';
```

### 7.4 Recursive Task Tree Query

```sql
-- Fetch full subtask tree for a root task
WITH RECURSIVE task_tree AS (
    -- Anchor: the root task
    SELECT
        id, parent_task_id, title, status, priority, depth,
        assignee_id, due_date, position,
        ARRAY[id] AS path,
        ARRAY[position] AS sort_path
    FROM tasks
    WHERE id = $1  -- root task ID

    UNION ALL

    -- Recursive: children
    SELECT
        t.id, t.parent_task_id, t.title, t.status, t.priority, t.depth,
        t.assignee_id, t.due_date, t.position,
        tt.path || t.id,
        tt.sort_path || t.position
    FROM tasks t
    INNER JOIN task_tree tt ON t.parent_task_id = tt.id
    WHERE t.depth <= 5
      AND NOT t.id = ANY(tt.path)  -- cycle detection
)
SELECT * FROM task_tree
ORDER BY sort_path;
```

---

## 8. API Design

### 8.1 API Structure

All endpoints are prefixed with `/api/v1` and require JWT authentication (except health checks).

### 8.2 Endpoint Reference

#### Organizations
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/orgs` | Create organization | User |
| GET | `/orgs` | List user's organizations | User |
| GET | `/orgs/:orgId` | Get organization details | Org Member |
| PATCH | `/orgs/:orgId` | Update organization | Org Admin |
| DELETE | `/orgs/:orgId` | Delete organization | Org Owner |
| GET | `/orgs/:orgId/members` | List org members | Org Member |
| POST | `/orgs/:orgId/members/invite` | Invite member | Org Admin |
| PATCH | `/orgs/:orgId/members/:userId` | Update member role | Org Admin |
| DELETE | `/orgs/:orgId/members/:userId` | Remove member | Org Admin |

#### Teams
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/orgs/:orgId/teams` | Create team | Org Admin |
| GET | `/orgs/:orgId/teams` | List teams | Org Member |
| GET | `/orgs/:orgId/teams/:teamId` | Get team | Team Member |
| PATCH | `/orgs/:orgId/teams/:teamId` | Update team | Team Lead |
| DELETE | `/orgs/:orgId/teams/:teamId` | Delete team | Org Admin |
| POST | `/orgs/:orgId/teams/:teamId/members` | Add team member | Team Lead |
| DELETE | `/orgs/:orgId/teams/:teamId/members/:userId` | Remove member | Team Lead |

#### Projects
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/orgs/:orgId/projects` | Create project | Team Lead |
| GET | `/orgs/:orgId/projects` | List projects | Org Member |
| GET | `/orgs/:orgId/projects/:projectId` | Get project | Project Member |
| PATCH | `/orgs/:orgId/projects/:projectId` | Update project | Project Lead |
| DELETE | `/orgs/:orgId/projects/:projectId` | Delete project | Org Admin |

#### Tasks
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/orgs/:orgId/projects/:projectId/tasks` | Create task | Project Contributor |
| GET | `/orgs/:orgId/projects/:projectId/tasks` | List tasks (flat) | Project Member |
| GET | `/orgs/:orgId/projects/:projectId/tasks/tree` | Get task tree | Project Member |
| GET | `/orgs/:orgId/tasks/:taskId` | Get task detail | Project Member |
| PATCH | `/orgs/:orgId/tasks/:taskId` | Update task | Assignee / Lead |
| DELETE | `/orgs/:orgId/tasks/:taskId` | Delete task (+ subtree) | Project Lead |
| POST | `/orgs/:orgId/tasks/:taskId/subtasks` | Create subtask | Project Contributor |
| PATCH | `/orgs/:orgId/tasks/:taskId/reparent` | Move task to new parent | Project Lead |
| POST | `/orgs/:orgId/tasks/:taskId/duplicate` | Duplicate task (+ subtree) | Project Contributor |
| POST | `/orgs/:orgId/tasks/:taskId/submit-review` | Submit for AI/reviewer | Assignee |
| POST | `/orgs/:orgId/tasks/:taskId/complete` | Mark complete (after review) | Reviewer |
| PATCH | `/orgs/:orgId/tasks/bulk` | Bulk update tasks | Project Lead |

#### Checklists
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orgs/:orgId/tasks/:taskId/checklists` | Add checklist item |
| PATCH | `/orgs/:orgId/tasks/:taskId/checklists/:id` | Toggle/update item |
| DELETE | `/orgs/:orgId/tasks/:taskId/checklists/:id` | Remove item |
| PATCH | `/orgs/:orgId/tasks/:taskId/checklists/reorder` | Reorder items |

#### Comments, Attachments, Rules
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orgs/:orgId/tasks/:taskId/comments` | Add comment |
| GET | `/orgs/:orgId/tasks/:taskId/comments` | List comments (threaded) |
| POST | `/orgs/:orgId/tasks/:taskId/attachments` | Upload file |
| GET | `/orgs/:orgId/tasks/:taskId/attachments/:id/url` | Get download URL |
| POST | `/orgs/:orgId/tasks/:taskId/rules` | Add completion rule |
| DELETE | `/orgs/:orgId/tasks/:taskId/rules/:id` | Remove rule |

#### Templates, Import/Export, Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orgs/:orgId/templates` | Create template |
| GET | `/orgs/:orgId/templates` | List templates |
| POST | `/orgs/:orgId/templates/:id/apply` | Apply template to project |
| POST | `/orgs/:orgId/templates/import` | Import template (JSON) |
| GET | `/orgs/:orgId/templates/:id/export` | Export template (JSON) |
| POST | `/orgs/:orgId/import` | Upload file for import |
| POST | `/orgs/:orgId/import/:jobId/map` | Submit column mapping |
| POST | `/orgs/:orgId/import/:jobId/execute` | Execute import |
| GET | `/orgs/:orgId/import/:jobId/status` | Get import status |
| POST | `/orgs/:orgId/export` | Trigger export job |
| GET | `/orgs/:orgId/export/:jobId/download` | Download export file |
| GET | `/orgs/:orgId/search` | Full-text search |

#### Dashboard, Billing, Webhooks, API Keys
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/orgs/:orgId/dashboard` | Org dashboard data |
| GET | `/orgs/:orgId/projects/:projectId/dashboard` | Project dashboard |
| GET | `/orgs/:orgId/teams/:teamId/dashboard` | Team dashboard |
| GET | `/orgs/:orgId/dashboard/personal` | Personal dashboard |
| POST | `/orgs/:orgId/billing/checkout` | Create Stripe checkout |
| GET | `/orgs/:orgId/billing/portal` | Stripe customer portal URL |
| POST | `/webhooks/stripe` | Stripe webhook endpoint |
| POST | `/orgs/:orgId/webhooks` | Create outgoing webhook |
| POST | `/orgs/:orgId/api-keys` | Create API key |
| GET | `/orgs/:orgId/api-keys` | List API keys |
| DELETE | `/orgs/:orgId/api-keys/:id` | Revoke API key |

#### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness check |
| GET | `/metrics` | Prometheus metrics |

---

## 9. Real-Time Architecture

### WebSocket Protocol

```
Client                   WS Server                Redis
  │                         │                       │
  │── WS Connect ──────────>│                       │
  │   (JWT in query param)  │                       │
  │                         │── Subscribe ─────────>│
  │                         │   org:{orgId}:events  │
  │                         │                       │
  │<─ Connected ────────────│                       │
  │   {type: "connected"}   │                       │
  │                         │                       │
  │── Join Room ───────────>│                       │
  │   {type: "join",        │── Subscribe ─────────>│
  │    room: "project:123"} │   project:123:events  │
  │                         │                       │
  │                         │    (API publishes      │
  │                         │     task.created to    │
  │                         │     Redis)             │
  │                         │                       │
  │                         │<─ Message ────────────│
  │<─ Event ────────────────│   task.created        │
  │   {type: "task.created",│                       │
  │    data: {...}}         │                       │
  │                         │                       │
  │── Presence ────────────>│                       │
  │   {type: "presence",    │── Publish ───────────>│
  │    task: "456"}         │   presence update     │
```

### Event Types

| Event | Trigger | Payload |
|-------|---------|---------|
| `task.created` | Task created | Full task object |
| `task.updated` | Task fields changed | Changed fields + task ID |
| `task.deleted` | Task deleted | Task ID |
| `task.status_changed` | Status transition | Task ID + old/new status |
| `task.assigned` | Assignee changed | Task ID + assignee |
| `comment.created` | New comment | Comment object |
| `checklist.toggled` | Checklist item toggled | Checklist ID + state |
| `presence.update` | User viewing/editing | User ID + entity ID |
| `notification.new` | New notification | Notification object |
| `import.progress` | Import job progress | Job ID + progress % |
| `dashboard.refresh` | Data changed for dashboard | Scope + metric type |

---

## 10. AI & MCP Integration

### 10.1 Task Completion Review Flow

```
Assignee clicks "Submit for Review"
        │
        ▼
┌─── Service Layer ─────────────────────────────────────────┐
│ 1. Fetch task + all rules                                  │
│ 2. Evaluate automatic rules:                               │
│    • all_checklists_done → check checklist state           │
│    • all_subtasks_complete → check subtask statuses        │
│ 3. If has "ai_approved" rule:                              │
│    → Enqueue Asynq job: ai:review_task                     │
│ 4. If has "reviewer_approved" rule:                        │
│    → Set status = "pending_review"                         │
│    → Notify designated reviewer                            │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌─── AI Review Worker ──────────────────────────────────────┐
│ 1. Fetch task details, checklists, comments, attachments   │
│ 2. Build LLM prompt with:                                  │
│    • Task description + acceptance criteria (from rules)   │
│    • Checklist status                                      │
│    • Attached evidence (file descriptions)                 │
│    • Comment history                                       │
│ 3. Call LLM API (OpenAI / Anthropic / custom)              │
│ 4. Parse structured response:                              │
│    { passed: bool, criteria: [{name, passed, reason}] }    │
│ 5. Store review result in DB                               │
│ 6. If all rules pass → auto-complete task                  │
│ 7. If any fail → notify assignee with feedback             │
│ 8. Publish event: task.review_completed                    │
└───────────────────────────────────────────────────────────┘
```

### 10.2 MCP Server Tools

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `create_task` | Create a new task or subtask | projectId, title, description, parentTaskId?, priority?, assigneeId? |
| `update_task` | Update task fields | taskId, fields to update |
| `search_tasks` | Search tasks by query | query, projectId?, status?, assigneeId? |
| `get_task_tree` | Get task with all subtasks | taskId |
| `get_project_status` | Project metrics and health | projectId |
| `assign_task` | Assign task to user | taskId, userId |
| `list_projects` | List all projects | teamId? |
| `get_dashboard_metrics` | Dashboard data | scope (org/team/project), scopeId |
| `create_comment` | Add comment to task | taskId, body |
| `complete_task` | Mark task as complete | taskId |

---

## 11. Auth, Roles & Access Control

### 11.1 Authentication (GoTrue)

| Method | Flow |
|--------|------|
| Email/Password | Register → verify email → login → JWT |
| Magic Link | Enter email → click link → JWT |
| OAuth | Google / GitHub / Microsoft / Apple → callback → JWT |
| SSO/SAML | Enterprise config → IdP redirect → JWT |
| API Key | `X-API-Key` header → scoped access |

### 11.2 Role Hierarchy

```
Org Owner
├── Org Admin
│   ├── Org Member
│   │   └── Org Viewer
│   └── Billing Admin
│
Team Lead
├── Team Member
│
Project Lead
├── Project Contributor
│   ├── Project Reviewer
│   └── Project Observer
```

### 11.3 Permission Matrix (Default Roles)

| Permission | Owner | Admin | Member | Viewer | Team Lead | Contributor | Reviewer | Observer |
|-----------|-------|-------|--------|--------|-----------|-------------|----------|----------|
| Manage org settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create teams | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create projects | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Create tasks | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Edit any task | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Edit own task | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Review/approve tasks | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| View tasks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete tasks | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Manage webhooks | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View audit log | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 12. Multi-Tenancy

### Strategy: Row-Level Security (Single Database)

```
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL 18                              │
│                                                              │
│  ┌─── RLS Policy ──────────────────────────────────────┐    │
│  │ USING (org_id = current_setting('app.current_org_id'))│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─── Org A Data ───┐  ┌─── Org B Data ───┐               │
│  │ tasks WHERE      │  │ tasks WHERE      │               │
│  │ org_id='aaa'     │  │ org_id='bbb'     │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                              │
│  Go Middleware sets per-transaction:                          │
│  SET LOCAL app.current_org_id = 'aaa';                       │
│  → All queries automatically filtered                         │
└─────────────────────────────────────────────────────────────┘
```

### Isolation guarantees:
1. **RLS policies** on every tenant-scoped table
2. **Composite indexes** on `(org_id, ...)` for performance
3. **Middleware enforces** `SET LOCAL` per transaction — no leakage between requests
4. **Integration tests** verify cross-tenant access returns 0 rows

---

## 13. Import/Export & Templates

### Import Flow

```
Upload CSV/XLSX → Parse Headers → Show Column Mapping UI → Preview → Execute → Track Progress
     │                │                    │                  │          │            │
     ▼                ▼                    ▼                  ▼          ▼            ▼
  MinIO/S3     Asynq Worker         Smart Matching      First 10      Asynq      WebSocket
  storage      extracts cols       (fuzzy match to      rows with    Worker     progress
                                   OrbisPM fields)     mapping       batch      events
                                                       applied       inserts
```

### Template JSON Structure

```json
{
  "name": "Sprint Planning Template",
  "description": "Standard 2-week sprint structure",
  "tasks": [
    {
      "title": "Sprint Planning",
      "status": "todo",
      "priority": "high",
      "checklists": [
        {"title": "Review backlog"},
        {"title": "Estimate stories"},
        {"title": "Assign tasks"}
      ],
      "rules": [
        {"rule_type": "all_checklists_done", "is_required": true}
      ],
      "subtasks": [
        {
          "title": "Backlog Grooming",
          "priority": "medium",
          "subtasks": [
            {"title": "Review P0 items"},
            {"title": "Review P1 items"}
          ]
        }
      ]
    }
  ]
}
```

---

## 14. Billing & Plans

| Feature | Free | Pro ($12/user/mo) | Enterprise (custom) |
|---------|------|-------|------------|
| Teams | 1 | Unlimited | Unlimited |
| Projects | 3 | Unlimited | Unlimited |
| Members | 5 | Unlimited | Unlimited |
| Subtask depth | 3 | 5 | 5 |
| AI reviews/month | 10 | 500 | Unlimited |
| File storage | 1 GB | 50 GB | Custom |
| Templates | 5 | Unlimited | Unlimited |
| Webhooks | 1 | 10 | Unlimited |
| API keys | 1 | 5 | Unlimited |
| SSO/SAML | ❌ | ❌ | ✅ |
| Custom roles | ❌ | ✅ | ✅ |
| Audit log | 30 days | 1 year | Unlimited |
| Priority support | ❌ | ✅ | ✅ + dedicated |

---

## 15. Notification System

### Channel Matrix

| Event | In-App | Email | Slack/Discord/Teams | Mobile Push |
|-------|--------|-------|---------------------|-------------|
| Task assigned to you | ✅ | ✅ | ✅ | ✅ |
| Task status changed | ✅ | ❌ | ✅ | ❌ |
| New comment on watched task | ✅ | ✅ | ✅ | ✅ |
| @mentioned in comment | ✅ | ✅ | ✅ | ✅ |
| Task overdue | ✅ | ✅ | ✅ | ✅ |
| Review requested | ✅ | ✅ | ✅ | ✅ |
| Review completed | ✅ | ✅ | ✅ | ✅ |
| Invitation received | ❌ | ✅ | ❌ | ❌ |
| Weekly digest | ❌ | ✅ | ❌ | ❌ |
| Import completed | ✅ | ❌ | ❌ | ❌ |
| Export ready | ✅ | ✅ | ❌ | ❌ |

All preferences are configurable per user per org.

---

## 16. Frontend Architecture

### Rendering Strategy

| Route | Rendering | Reason |
|-------|-----------|--------|
| Auth pages | SSR | SEO, fast initial load |
| Dashboard | SSR + Streaming | Multiple independent data sources |
| Task tree | SSR (shell) + Client (interactions) | Tree needs client interactivity |
| Task detail | SSR | Content-heavy, share-able |
| Settings | SSR | Configuration forms |
| Import wizard | Client | Multi-step stateful flow |

### State Management

| State Type | Solution |
|-----------|---------|
| Server data | React Query (TanStack Query) with SSR hydration |
| UI state (sidebar, panels) | Zustand |
| Forms | React Hook Form + Zod validation |
| Real-time events | WebSocket → React Query cache invalidation |
| URL state (filters, pagination) | Next.js searchParams |

---

## 17. Infrastructure & Deployment

### Docker Compose Services (Development)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| postgres | postgres:16 | 5432 | Primary database |
| redis | redis:7-alpine | 6379 | Cache, pub/sub, queues |
| gotrue | supabase/gotrue | 9999 | Authentication |
| meilisearch | getmeili/meilisearch | 7700 | Full-text search |
| minio | minio/minio | 9000/9001 | Object storage |
| api | orbispm/api (built) | 8080 | HTTP API |
| ws | orbispm/ws (built) | 8081 | WebSocket server |
| worker | orbispm/worker (built) | — | Background workers |
| mcp | orbispm/mcp (built) | 8082 | MCP server |
| frontend | orbispm/frontend (built) | 3000 | Next.js SSR |
| traefik | traefik:v3 | 80/443 | Reverse proxy |
| asynqmon | hibiken/asynqmon | 8083 | Asynq monitoring UI |

### Kubernetes (Production)

- **HPA** on api + ws services (CPU/memory-based scaling)
- **PVC** for Postgres, Redis, MinIO, Meilisearch (persistent storage)
- **Ingress** via Traefik or Nginx Ingress Controller
- **Secrets** via K8s Secrets or external secrets operator
- **Kustomize** overlays for staging vs production config

---

## 18. Testing Strategy

| Test Type | Tool | Scope | Location |
|-----------|------|-------|----------|
| Unit (Go) | `go test` | Service + domain logic | `*_test.go` alongside code |
| Unit (TS) | Vitest + RTL | Components + hooks | `frontend/tests/components/` |
| Integration (Go) | `go test` + Docker | Full API flows | `backend/tests/integration/` |
| E2E | Playwright | User journeys | `frontend/tests/e2e/` |
| Load | k6 | Performance | `tests/load/` |
| RLS isolation | Custom Go tests | Cross-tenant security | `backend/tests/integration/rls_test.go` |
| RBAC | Custom Go tests | Permission enforcement | `backend/tests/integration/rbac_test.go` |

---

## 19. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Go HTTP framework | Chi v5 | `net/http` compatible, composable middleware, zero deps |
| WebSocket library | coder/websocket | Concurrent-safe, context-aware, actively maintained |
| SQL layer | sqlc + sqlx | Type-safe generated code + dynamic queries, no ORM magic |
| Auth | GoTrue (Supabase Auth) | Battle-tested, supports all auth flows + SSO/SAML |
| RBAC | Casbin | Domain-scoped RBAC, PostgreSQL adapter, cached enforcer |
| Task queue | Asynq | Redis-backed, priority queues, monitoring UI, retry logic |
| Search | Meilisearch | Tenant tokens, <50ms search, MIT license, MCP support |
| Object storage | MinIO | S3-compatible, self-hosted, per-org path isolation |
| Frontend framework | Next.js 15 (App Router) | SSR + streaming, multi-tenant routing, React Server Components |
| UI components | Shadcn/UI + Tailwind | Copy-paste components, full control, small bundle |
| Rich text | Tiptap | Stable API, extension ecosystem, collaborative-ready |
| Multi-tenancy | RLS (single DB) | Simpler ops at 100+ orgs, single migration path |
| Task tree | Adjacency list + recursive CTE | Easy reparenting, depth CHECK, acceptable read perf |
| Billing | Stripe | Industry standard, checkout + portal + webhooks |

---

## 20. Glossary

| Term | Definition |
|------|-----------|
| **RLS** | Row-Level Security — PostgreSQL feature that filters rows per-session |
| **RBAC** | Role-Based Access Control — permissions assigned via roles |
| **DAO** | Data Access Object — pattern isolating DB queries from business logic |
| **CTE** | Common Table Expression — SQL `WITH` clause for recursive queries |
| **MCP** | Model Context Protocol — standard for AI agent ↔ tool communication |
| **GoTrue** | Open-source auth service used by Supabase/Netlify |
| **Asynq** | Go library for Redis-backed background job processing |
| **Casbin** | Authorization library supporting ACL, RBAC, ABAC models |
| **SSR** | Server-Side Rendering — HTML generated on the server |
| **HPA** | Horizontal Pod Autoscaler — Kubernetes auto-scaling |
| **Tiptap** | ProseMirror-based rich text editor for the web |
| **Shadcn/UI** | Copy-paste React component library built on Radix + Tailwind |
