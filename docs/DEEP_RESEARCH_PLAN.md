# OrbisPM — Deep Research & Implementation Plan

> Generated: March 8, 2026
> Scope: Offline-First, Approval Workflows, MCP/Agentic, Integrations, Dashboards

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Market Research & Competitive Analysis](#2-market-research--competitive-analysis)
3. [Offline-First Architecture](#3-offline-first-architecture)
4. [Role-Based Approval System](#4-role-based-approval-system)
5. [MCP Server & Agentic Architecture](#5-mcp-server--agentic-architecture)
6. [Third-Party Integrations](#6-third-party-integrations)
7. [Role-Based Dashboards](#7-role-based-dashboards)
8. [Database Schema Changes](#8-database-schema-changes)
9. [Implementation Phases](#9-implementation-phases)
10. [Technology Decisions](#10-technology-decisions)

---

## 1. Executive Summary

OrbisPM is being evolved from a standard SaaS project management tool into a **future-ready agentic project management platform** — where AI agents and human workers collaborate as equals. This document outlines the research, architecture, and phased implementation plan for five major capability areas.

### Vision Statement
> "The first project management platform built for the agentic era — where AI agents are first-class team members with real roles, permissions, and accountability."

### Key Differentiators vs. Market
| Capability | Jira | Linear | Asana | Plane | OrbisPM |
|---|---|---|---|---|---|
| True offline-first (CRDT) | ❌ | ❌ | ❌ | Partial | ✅ |
| End-to-end approval workflows | Plugin | ❌ | Basic | ❌ | ✅ Native |
| MCP server (agent-native) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Bidirectional webhooks | Outbound | Outbound | Outbound | Basic | ✅ Both |
| Agent RBAC (agents as members) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Role-scoped dashboards | Basic | Basic | Basic | Basic | ✅ Full |
| Self-hosted + air-gapped | ❌ | ❌ | ❌ | ✅ | ✅ |

### What Exists Today (Current State)
- **Backend**: Go 1.24, Chi v5, PostgreSQL 16+ with RLS, Redis 7, Asynq workers
- **Frontend**: Next.js 15, React 19, TypeScript strict, DaisyUI 5, TanStack Query v5
- **Auth**: Zitadel v4 (OIDC + gRPC), JWT RS256
- **Real-time**: Org-level WebSocket with project room multiplexing via Redis Pub/Sub
- **RBAC**: DB-driven roles (org: owner/admin/member/viewer/billing_admin, team: lead/member, project: lead/contributor/reviewer/observer)
- **Review Pipeline**: Task change requests with reviewable fields, approval/rejection flow
- **Existing Infrastructure**: Kong API Gateway, MinIO storage, Meilisearch, Mailpit (dev email)

---

## 2. Market Research & Competitive Analysis

### 2.1 Offline-First PM Tools (State of Art 2026)

**Linear** — No true offline. Optimistic UI with retry queue. Loses data on prolonged disconnection.

**Plane (self-hosted)** — Has experimental offline mode using IndexedDB cache. No CRDT. Last-write-wins conflict resolution. Loses concurrent edits.

**Notion** — Proprietary offline system. Uses operation log (OT-like). Good for documents, weak for structured PM data. Not self-hostable.

**Anytype** — True offline-first using CRDTs (built on IPFS). Open source. Excellent conflict resolution. Not a PM tool but proves the architecture works at scale.

**Figma** — Uses CRDTs for real-time collaboration. Proves CRDTs work for complex structured data. Not PM but architectural inspiration.

**Key Technology Choices (2026 landscape)**:
| Technology | Maturity | Best For | Used By |
|---|---|---|---|
| **Yjs** (CRDT library) | Production | Rich text, shared state | Tiptap, Notion-like apps |
| **Automerge** | Production | Structured data, JSON docs | Ink & Switch projects |
| **cr-sqlite** (Conflict-free SQLite) | Production | SQL-based offline, mobile | Vlcn.io → now part of Electric |
| **ElectricSQL** | Production | Postgres sync to client SQLite | Growing ecosystem |
| **PowerSync** | Production | Postgres ↔ SQLite bidirectional sync | Enterprise apps |
| **IndexedDB + Custom CRDT** | Proven | Full control, works everywhere | Custom implementations |

**Our Choice: Hybrid approach** — Yjs for rich text (Tiptap already uses it) + custom CRDT-inspired operation log for structured PM data + IndexedDB for client storage + PostgreSQL as source of truth.

### 2.2 Approval/Workflow Engines

**Jira Workflows** — State machine per issue type. Configurable transitions with conditions, validators, post-functions. Complex but powerful. Requires admin expertise.

**Asana Approvals** — Simple approve/reject on tasks. Limited to single-level. No multi-stage pipelines.

**Monday.com** — Has "approval" column type. Basic single-stage. No conditional routing.

**Camunda/Temporal** — Full BPMN workflow engines. Overkill for PM but proves the pattern. Temporal's Go SDK is excellent.

**GitHub Actions** — YAML-defined workflows triggered by events. Excellent model for PM automation rules.

**Our Approach**: Build a native **workflow engine** inspired by GitHub Actions' event-trigger model + Jira's state machine transitions, but simpler to configure. Store workflow definitions as JSONB, execute via Asynq workers.

### 2.3 MCP & Agentic Platforms

**Model Context Protocol (MCP)** — Anthropic's open standard (2024-2026). Defines how AI agents discover and invoke tools. JSON-RPC 2.0 over stdio/SSE/HTTP. Becoming the de facto standard for agent-tool interop.

**Current MCP Server Landscape**:
- GitHub MCP Server — browse repos, create issues, manage PRs
- Slack MCP Server — send/read messages, manage channels
- Linear MCP Server — create/update issues (read-only as of 2025)
- No PM tool has a comprehensive read-write MCP server yet

**Agent Frameworks (2026)**:
- **Claude Computer Use / Tool Use** — Anthropic's agent framework
- **OpenAI Assistants API** — Function calling + code interpreter
- **LangGraph / CrewAI** — Multi-agent orchestration
- **AutoGen** — Microsoft's multi-agent framework
- **Semantic Kernel** — Microsoft's agent SDK (.NET/Python/Java)

**Our Differentiator**: OrbisPM will be the **first PM tool with a comprehensive MCP server** that treats agents as first-class team members with real RBAC roles. Agents will have:
- Organization membership with assigned roles
- API keys scoped to their permissions
- Activity audit trails
- Rate limits per agent tier
- Bidirectional webhooks (agent → OrbisPM and OrbisPM → agent)

### 2.4 Integration Landscape

**Standard Integrations for PM Tools (expected by market)**:
| Category | Services | Priority |
|---|---|---|
| Communication | Slack, Microsoft Teams, Discord | P0 |
| Video/Meeting | Google Meet, Zoom, Microsoft Teams | P1 |
| Knowledge | Notion, Confluence, Google Docs | P1 |
| Development | GitHub, GitLab, Bitbucket | P0 |
| Automation | n8n, Zapier, Make.com | P0 |
| Calendar | Google Calendar, Outlook | P1 |
| Email | Gmail, Outlook (IMAP/SMTP) | P2 |
| Storage | Google Drive, OneDrive, Dropbox | P2 |

**Integration Architecture Patterns**:
1. **Outbound Webhooks** — OrbisPM → External (we have this partially)
2. **Inbound Webhooks** — External → OrbisPM (need to build)
3. **OAuth2 Connections** — User authorizes OrbisPM to act on their behalf
4. **Bot/App Installs** — Slack App, Teams Bot, GitHub App
5. **Bidirectional Sync** — Two-way data sync (e.g., GitHub Issues ↔ OrbisPM Tasks)
6. **Embedded Actions** — Slash commands in Slack, Teams message extensions

### 2.5 Dashboard Research

**Best-in-class PM Dashboards**:
- **Linear Insights** — Clean, minimal, project velocity + cycle time
- **Jira Dashboards** — Highly customizable gadgets, complex but powerful
- **Asana Portfolios** — Cross-project views, workload management
- **Plane Analytics** — Basic charts, scope/demand analytics

**Modern Dashboard Tech (2026)**:
- **Recharts** (already using) — Good for standard charts
- **D3.js** — For custom visualizations (burndown, Gantt-like)
- **Observable Plot** — Modern D3 wrapper, simpler API
- **Tremor** — React dashboard components (Tailwind-based)
- **Apache ECharts** — Heavy but powerful, good for complex dashboards

**Our Approach**: Role-scoped dashboards using Recharts (already integrated) + custom components. Three levels: Org → Team → Project, each showing role-appropriate metrics.

---

## 3. Offline-First Architecture

### 3.1 Design Principles

1. **Local-first**: All reads come from local storage (IndexedDB). Network fetches populate local cache.
2. **Optimistic writes**: All mutations apply immediately to local state, then sync to server.
3. **Conflict resolution**: Operation-based CRDT-inspired log with automatic merge + manual resolution for true conflicts.
4. **Eventual consistency**: All clients converge to the same state regardless of network conditions.
5. **Sync protocol**: Client tracks a vector clock per entity. Server sends only deltas since last sync.

### 3.2 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Browser)                 │
│                                                       │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ React UI │──│ Zustand Store │──│ Sync Engine   │  │
│  └──────────┘  └──────┬───────┘  └───────┬───────┘  │
│                        │                   │          │
│                 ┌──────┴───────┐   ┌──────┴───────┐  │
│                 │  IndexedDB   │   │  Op Log      │  │
│                 │  (idb-keyval │   │  (pending    │  │
│                 │   / Dexie)   │   │   mutations) │  │
│                 └──────────────┘   └──────────────┘  │
│                                           │          │
│                                    ┌──────┴───────┐  │
│                                    │ Service Worker│  │
│                                    │ (bg sync)    │  │
│                                    └──────────────┘  │
└───────────────────────────┬─────────────────────────┘
                            │
                    ┌───────┴────────┐
                    │   WebSocket +  │
                    │   REST API     │
                    └───────┬────────┘
                            │
┌───────────────────────────┴─────────────────────────┐
│                    Backend (Go API)                   │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Sync Handler │  │ Op Log Store │  │ Conflict   │ │
│  │ (delta sync) │  │ (PostgreSQL) │  │ Resolver   │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │ Redis PubSub │  │ Merge Engine │                  │
│  │ (fan-out)    │  │ (LWW + CRDT)│                  │
│  └──────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────┘
```

### 3.3 Offline-Capable Operations

| Operation | Offline? | Conflict Strategy | Notes |
|---|---|---|---|
| View tasks/projects/teams | ✅ | N/A (read-only) | Served from IndexedDB |
| Create task | ✅ | Client UUID, no conflict | UUID generated client-side |
| Update task title/description | ✅ | LWW per-field | Last-write-wins with timestamp |
| Update task status | ✅ | State machine validation | Server validates transition legality |
| Reorder tasks (position) | ✅ | Fractional indexing | No integer collisions |
| Add comment | ✅ | Append-only, no conflict | Ordered by client timestamp |
| Add checklist item | ✅ | Append-only + LWW for check state | Toggle is LWW |
| Toggle checklist item | ✅ | LWW | Last toggle wins |
| Assign/unassign user | ✅ | LWW per-field | Last assignment wins |
| Edit rich text (Tiptap) | ✅ | Yjs CRDT | Already supported by Tiptap |
| File upload | ❌ → Queued | Queue for sync | Files queued, uploaded on reconnect |
| Delete task | ✅ | Tombstone | Soft-delete synced on reconnect |
| Create project/team | ✅ | Client UUID | Synced on reconnect, server validates |
| Approval actions | ❌ | Requires connectivity | Approvals need authoritative state |
| Role/permission changes | ❌ | Requires connectivity | Security-critical, online only |
| Billing operations | ❌ | Requires connectivity | Stripe needs server |

### 3.4 Client-Side Storage (IndexedDB via Dexie.js)

```typescript
// frontend/src/lib/offline/db.ts
import Dexie, { Table } from 'dexie'

interface OfflineTask {
  id: string              // UUID
  orgId: string
  projectId: string
  data: Task              // Full task object
  version: number         // Monotonic version counter
  updatedAt: number       // Unix timestamp ms
  syncState: 'synced' | 'pending' | 'conflict'
}

interface PendingOperation {
  id: string              // UUID
  entityType: 'task' | 'comment' | 'checklist' | 'project' | 'team'
  entityId: string
  operation: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>  // Changed fields only
  timestamp: number       // Client timestamp (HLC)
  orgId: string
  projectId?: string
  retries: number
  status: 'pending' | 'sent' | 'confirmed' | 'failed' | 'conflict'
}

class OrbisPMOfflineDB extends Dexie {
  tasks!: Table<OfflineTask>
  comments!: Table<OfflineComment>
  checklists!: Table<OfflineChecklist>
  projects!: Table<OfflineProject>
  teams!: Table<OfflineTeam>
  pendingOps!: Table<PendingOperation>
  syncMeta!: Table<SyncMeta>  // Last sync cursor per entity type

  constructor() {
    super('orbispm')
    this.version(1).stores({
      tasks: 'id, [orgId+projectId], syncState, updatedAt',
      comments: 'id, [orgId+taskId], syncState',
      checklists: 'id, [orgId+taskId], syncState',
      projects: 'id, orgId, syncState',
      teams: 'id, orgId, syncState',
      pendingOps: 'id, [entityType+entityId], status, timestamp',
      syncMeta: 'entityType',
    })
  }
}
```

### 3.5 Operation Log (Server-Side)

```sql
-- New migration: db/migrations/NNNNNN_operation_log.up.sql

CREATE TABLE IF NOT EXISTS operation_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    entity_type  TEXT NOT NULL,           -- 'task', 'comment', 'checklist', etc.
    entity_id    UUID NOT NULL,
    operation    TEXT NOT NULL,           -- 'create', 'update', 'delete'
    field_name   TEXT,                    -- NULL for create/delete, field name for update
    old_value    JSONB,
    new_value    JSONB,
    user_id      UUID NOT NULL,
    client_id    TEXT NOT NULL,           -- Browser tab unique ID (prevents echo)
    hlc_timestamp BIGINT NOT NULL,       -- Hybrid Logical Clock timestamp
    server_seq   BIGSERIAL,              -- Monotonic server sequence for sync cursor
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE operation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_operation_log ON operation_log
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

CREATE INDEX idx_oplog_entity ON operation_log(entity_type, entity_id, server_seq);
CREATE INDEX idx_oplog_org_seq ON operation_log(org_id, server_seq);
CREATE INDEX idx_oplog_org_type_seq ON operation_log(org_id, entity_type, server_seq);

-- Partition by month for performance (large orgs generate millions of ops)
-- Consider: CREATE TABLE operation_log (...) PARTITION BY RANGE (created_at);
```

### 3.6 Sync Protocol

```
CLIENT                                          SERVER
  │                                                │
  │  1. GET /api/v1/orgs/:id/sync                  │
  │     ?since=<last_server_seq>                   │
  │     &entity_types=task,comment,checklist        │
  │────────────────────────────────────────────────►│
  │                                                │
  │  2. Response: { ops: [...], cursor: 12345 }    │
  │◄────────────────────────────────────────────────│
  │                                                │
  │  3. Apply remote ops to IndexedDB              │
  │     (skip ops from own client_id)              │
  │                                                │
  │  4. POST /api/v1/orgs/:id/sync                 │
  │     { ops: [pending_local_ops] }               │
  │────────────────────────────────────────────────►│
  │                                                │
  │  5. Server applies ops, resolves conflicts     │
  │     Response: { confirmed: [...],              │
  │                 conflicts: [...],              │
  │                 cursor: 12350 }                │
  │◄────────────────────────────────────────────────│
  │                                                │
  │  6. Mark confirmed ops as synced               │
  │     Handle conflicts (auto-merge or prompt)    │
  │                                                │
  │  7. WebSocket: real-time push of new ops       │
  │◄════════════════════════════════════════════════│
```

### 3.7 Conflict Resolution Strategy

**Per-Field Last-Write-Wins (LWW)** with Hybrid Logical Clock:

```go
// internal/sync/conflict.go

type FieldConflict struct {
    EntityType  string
    EntityID    uuid.UUID
    FieldName   string
    LocalValue  interface{}
    RemoteValue interface{}
    LocalHLC    int64
    RemoteHLC   int64
    Resolution  string  // "local_wins", "remote_wins", "manual"
}

func ResolveConflict(local, remote Operation) FieldConflict {
    // Rule 1: Higher HLC wins (most recent edit)
    if local.HLCTimestamp > remote.HLCTimestamp {
        return FieldConflict{Resolution: "local_wins"}
    }
    if remote.HLCTimestamp > local.HLCTimestamp {
        return FieldConflict{Resolution: "remote_wins"}
    }
    // Rule 2: Same HLC → higher client_id wins (deterministic tiebreaker)
    if local.ClientID > remote.ClientID {
        return FieldConflict{Resolution: "local_wins"}
    }
    return FieldConflict{Resolution: "remote_wins"}
}
```

**Special handling per field type**:
- **Title/Description**: LWW per-field (not per-character — Tiptap/Yjs handles rich text)
- **Status**: State machine validation — server rejects invalid transitions even if LWW says otherwise
- **Position/Order**: Fractional indexing (e.g., "aaa" between "aa" and "ab") — no integer conflicts
- **Assignee**: LWW — last assignment wins
- **Labels/Tags (arrays)**: Union merge — add all, never remove unless explicit delete op
- **Checklist toggle**: LWW — last toggle state wins
- **Comments**: Append-only — never conflict, ordered by HLC
- **Rich text (Tiptap)**: Yjs CRDT merge — handled at the editor layer

### 3.8 Service Worker for Background Sync

```typescript
// frontend/public/sw.js (Service Worker)

self.addEventListener('sync', (event) => {
  if (event.tag === 'orbispm-sync') {
    event.waitUntil(syncPendingOperations())
  }
})

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'orbispm-periodic-sync') {
    event.waitUntil(syncPendingOperations())
  }
})

async function syncPendingOperations() {
  const db = await openDB()
  const pendingOps = await db.getAll('pendingOps', 'pending')
  if (pendingOps.length === 0) return

  const response = await fetch('/api/v1/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await getToken()}` },
    body: JSON.stringify({ ops: pendingOps })
  })

  const result = await response.json()
  // Mark confirmed, handle conflicts...
}
```

### 3.9 Frontend Integration Points

```typescript
// frontend/src/hooks/use-offline.ts

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingOps, setPendingOps] = useState(0)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)

  // Visual indicator: "Online", "Offline (5 pending changes)", "Syncing..."
  return { isOnline, pendingOps, lastSynced, syncNow }
}

// Modify existing project-task-store.ts to read from IndexedDB first
// Then overlay with WebSocket updates when online
```

### 3.10 Backend New Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/orgs/:orgId/sync` | Pull delta ops since cursor |
| POST | `/api/v1/orgs/:orgId/sync` | Push local ops, get confirmations + conflicts |
| GET | `/api/v1/orgs/:orgId/sync/status` | Get sync health (pending ops count, last sync) |

### 3.11 New Go Packages

```
internal/
├── sync/
│   ├── engine.go          # Sync coordinator
│   ├── conflict.go        # Conflict resolution logic
│   ├── hlc.go             # Hybrid Logical Clock
│   ├── oplog.go           # Operation log reader/writer
│   └── handler.go         # HTTP handlers for sync endpoints
```

---

## 4. Role-Based Approval System

### 4.1 Current State Analysis

OrbisPM already has a **basic review pipeline**:
- `task_change_requests` table exists with status (pending/approved/rejected)
- `task_service.go` has `partitionChanges()` that splits direct vs. reviewable field changes
- Projects have `settings JSONB` with `reviewable_fields` config
- `RequirePermission` middleware exists for RBAC checks

**What's missing**:
- No multi-stage approval chains (e.g., lead → manager → director)
- No approval rules beyond "reviewable fields" (no deadline-based, budget-based triggers)
- No configurable workflow engine (hard-coded in Go)
- No approval delegation/escalation
- No SLA/timeout on approvals
- No approval for non-task entities (project settings, team changes, role assignments)

### 4.2 Universal Approval Engine Design

```
┌──────────────────────────────────────────────┐
│              Approval Engine                   │
│                                                │
│  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Trigger Rules│  │ Approval Definitions │   │
│  │ (when to     │  │ (who approves, how   │   │
│  │  require     │  │  many stages, SLA)   │   │
│  │  approval)   │  │                      │   │
│  └──────┬───────┘  └──────────┬───────────┘   │
│         │                     │                │
│  ┌──────┴─────────────────────┴───────────┐   │
│  │        Approval Request Pipeline        │   │
│  │                                         │   │
│  │  Trigger → Create Request → Notify →    │   │
│  │  Wait for Votes → Evaluate → Execute    │   │
│  │  or Escalate or Timeout                 │   │
│  └─────────────────────────────────────────┘   │
│                                                │
│  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Notification  │  │ Audit Log            │   │
│  │ Dispatcher    │  │ (who approved what)  │   │
│  └──────────────┘  └──────────────────────┘   │
└──────────────────────────────────────────────┘
```

### 4.3 Approval Trigger Rules

Triggers define **when** an approval is required:

```jsonc
// Stored in approval_policies.trigger_rules JSONB
{
  "entity_type": "task",
  "conditions": [
    {
      "field": "status",
      "operator": "transition",
      "value": { "from": "in_progress", "to": "done" }
    }
  ],
  // OR condition-based triggers:
  "conditions": [
    {
      "field": "priority",
      "operator": "eq",
      "value": "critical"
    },
    {
      "field": "estimated_hours",
      "operator": "gt",
      "value": 40
    }
  ],
  "condition_logic": "any"  // "all" = AND, "any" = OR
}
```

**Trigger categories**:
| Category | Examples |
|---|---|
| Status transitions | Any → Done, Any → Cancelled, Draft → Active |
| Field changes | Priority change, deadline change, assignee change |
| Threshold-based | Estimated hours > X, budget > $Y |
| Entity lifecycle | Task creation (for critical priority), project creation, team role assignment |
| Time-based | Deadline within 24h and not "in_progress" |
| Scope-based | Applies to specific project, team, or entire org |

### 4.4 Approval Definitions (Multi-Stage)

```jsonc
// Stored in approval_policies.approval_chain JSONB
{
  "stages": [
    {
      "stage": 1,
      "name": "Team Lead Review",
      "approvers": {
        "type": "role",                    // "role", "specific_users", "dynamic"
        "role": "project_lead",
        "scope": "project"                 // Resolve from current project
      },
      "required_approvals": 1,             // How many approvers needed
      "sla_hours": 24,                     // Auto-escalate after 24h
      "on_timeout": "escalate",            // "escalate", "auto_approve", "auto_reject"
      "allow_self_approval": false
    },
    {
      "stage": 2,
      "name": "Manager Approval",
      "approvers": {
        "type": "role",
        "role": "org_admin",
        "scope": "org"
      },
      "required_approvals": 1,
      "sla_hours": 48,
      "on_timeout": "auto_approve"
    }
  ],
  "on_rejection": "revert",               // "revert", "block", "notify_only"
  "allow_bypass_roles": ["org_owner"],     // Roles that can skip approval
  "notify_on_create": true,
  "notify_on_complete": true
}
```

### 4.5 Database Schema for Approvals

```sql
-- approval_policies: Configurable per org/project/team
CREATE TABLE IF NOT EXISTS approval_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = org-wide
    team_id         UUID REFERENCES teams(id) ON DELETE CASCADE,     -- NULL = not team-scoped
    name            TEXT NOT NULL,
    description     TEXT,
    entity_type     TEXT NOT NULL,                    -- 'task', 'project', 'team_member', etc.
    trigger_rules   JSONB NOT NULL,                   -- When to trigger approval
    approval_chain  JSONB NOT NULL,                   -- Multi-stage approval config
    is_active       BOOLEAN NOT NULL DEFAULT true,
    priority        INT NOT NULL DEFAULT 0,           -- Higher = evaluated first
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- approval_requests: Individual approval instances
CREATE TABLE IF NOT EXISTS approval_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    policy_id       UUID NOT NULL REFERENCES approval_policies(id) ON DELETE CASCADE,
    entity_type     TEXT NOT NULL,
    entity_id       UUID NOT NULL,
    requested_by    UUID NOT NULL,         -- User who triggered the change
    current_stage   INT NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'pending',
                    -- 'pending', 'stage_approved', 'approved', 'rejected', 'cancelled', 'expired'
    changes         JSONB NOT NULL,         -- The proposed changes
    metadata        JSONB,                  -- Additional context
    expires_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- approval_votes: Individual approver decisions
CREATE TABLE IF NOT EXISTS approval_votes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    request_id      UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
    stage           INT NOT NULL,
    voter_id        UUID NOT NULL,          -- User (or agent!) who voted
    decision        TEXT NOT NULL,           -- 'approved', 'rejected', 'abstained'
    comment         TEXT,
    voted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(request_id, stage, voter_id)
);

-- Enable RLS on all three tables
ALTER TABLE approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_approval_policies ON approval_policies
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY tenant_isolation_approval_requests ON approval_requests
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY tenant_isolation_approval_votes ON approval_votes
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
```

### 4.6 Approval Service (Go)

```go
// internal/service/approval_service.go

type ApprovalService struct {
    policyRepo      repository.ApprovalPolicyRepository
    requestRepo     repository.ApprovalRequestRepository
    voteRepo        repository.ApprovalVoteRepository
    txManager       *repository.TxManager
    eventBus        eventbus.EventBus
    notificationSvc *NotificationService
    permResolver    *PermissionResolver
}

// EvaluateTrigger checks if a change requires approval
func (s *ApprovalService) EvaluateTrigger(ctx context.Context, params EvaluateTriggerParams) (*ApprovalRequired, error) {
    // 1. Load active policies for this org/project/entity_type
    // 2. Evaluate trigger_rules against the proposed changes
    // 3. If match found, return the policy + required approval chain
    // 4. If user has bypass role, return ApprovalRequired{Bypass: true}
}

// CreateRequest creates a new approval request
func (s *ApprovalService) CreateRequest(ctx context.Context, params CreateApprovalRequestParams) (*domain.ApprovalRequest, error) {
    // 1. Create approval_request with status=pending, stage=1
    // 2. Resolve approvers for stage 1
    // 3. Notify approvers (in-app + configured channels)
    // 4. Set SLA timer (Asynq delayed job)
    // 5. Publish event: approval.requested
}

// Vote records an approver's decision
func (s *ApprovalService) Vote(ctx context.Context, params VoteParams) error {
    // 1. Validate voter has permission for current stage
    // 2. Record vote in approval_votes
    // 3. Check if stage threshold met (required_approvals reached)
    // 4. If stage complete:
    //    a. If more stages → advance to next stage, notify new approvers
    //    b. If final stage approved → execute changes, mark request approved
    //    c. If rejected → revert or block based on policy
    // 5. Publish events: approval.voted, approval.stage_complete, approval.completed
}
```

### 4.7 Entities Covered by Approval System

| Entity | Triggerable Actions | Example Policy |
|---|---|---|
| **Task** | Create, update any field, status transition, delete | "Critical tasks need lead approval" |
| **Task Deadline** | Extend, shorten, remove | "Deadline extensions need manager approval" |
| **Task Assignment** | Assign, reassign, unassign | "Reassignment needs lead approval" |
| **Task Status** | Any transition | "Done transition needs reviewer approval" |
| **Project** | Create, archive, settings change | "Project creation needs org admin approval" |
| **Project Settings** | Change reviewable fields, workflow | "Settings changes need lead approval" |
| **Team Membership** | Add member, remove member, change role | "Role changes need team lead approval" |
| **Project Membership** | Add/remove, role change | "Adding external members needs approval" |
| **Budget/Hours** | Estimate changes above threshold | "Estimates > 40h need manager approval" |
| **Org Settings** | Billing, integrations, security | "Org settings need owner approval" |

### 4.8 API Endpoints for Approvals

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/orgs/:orgId/approval-policies` | List approval policies |
| POST | `/api/v1/orgs/:orgId/approval-policies` | Create approval policy |
| PATCH | `/api/v1/orgs/:orgId/approval-policies/:policyId` | Update policy |
| DELETE | `/api/v1/orgs/:orgId/approval-policies/:policyId` | Delete policy |
| GET | `/api/v1/orgs/:orgId/approval-requests` | List approval requests (filterable) |
| GET | `/api/v1/orgs/:orgId/approval-requests/my-pending` | My pending approvals |
| GET | `/api/v1/orgs/:orgId/approval-requests/:requestId` | Get request details + votes |
| POST | `/api/v1/orgs/:orgId/approval-requests/:requestId/vote` | Vote on request |
| POST | `/api/v1/orgs/:orgId/approval-requests/:requestId/cancel` | Cancel request |

### 4.9 Integration with Existing Task Service

```go
// Modify existing task_service.go Update method:

func (s *TaskService) Update(ctx context.Context, id uuid.UUID, params UpdateTaskParams) (*domain.Task, error) {
    task, err := s.taskRepo.GetByID(ctx, id)
    if err != nil { return nil, err }

    // NEW: Check if any changes require approval
    approvalResult, err := s.approvalSvc.EvaluateTrigger(ctx, EvaluateTriggerParams{
        EntityType: "task",
        EntityID:   id,
        Changes:    params.ToChangeMap(),
        ProjectID:  task.ProjectID,
    })
    if err != nil { return nil, err }

    if approvalResult.Required && !approvalResult.Bypass {
        // Create approval request instead of applying changes directly
        request, err := s.approvalSvc.CreateRequest(ctx, CreateApprovalRequestParams{
            EntityType:  "task",
            EntityID:    id,
            Changes:     params.ToChangeMap(),
            RequestedBy: tenant.UserID(ctx),
            PolicyID:    approvalResult.PolicyID,
        })
        if err != nil { return nil, err }

        // Return task unchanged but with pending approval info
        return task, domain.NewAppError(http.StatusAccepted, "changes pending approval").
            WithData("approval_request_id", request.ID)
    }

    // No approval needed — apply directly (existing logic)
    // ...
}
```

---

## 5. MCP Server & Agentic Architecture

### 5.1 Vision: Agents as First-Class Team Members

In OrbisPM, AI agents are not bolt-on tools — they are **team members** with:
- Organization membership (agent appears in member list)
- Assigned roles (contributor, reviewer, observer, etc.)
- Fine-grained permissions (same RBAC as humans)
- Activity audit trails (every action logged)
- Rate limits and quotas per agent tier
- Dedicated API keys with scoped access

### 5.2 MCP Server Architecture

```
┌─────────────────────────────────────────────────┐
│              External AI Agents                   │
│  (Claude, GPT, Custom Agents, n8n, LangGraph)   │
└──────────────────────┬──────────────────────────┘
                       │ MCP Protocol (JSON-RPC 2.0)
                       │ Transport: HTTP+SSE / stdio
┌──────────────────────┴──────────────────────────┐
│              OrbisPM MCP Server                   │
│              (cmd/mcp/main.go)                    │
│                                                   │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────┐ │
│  │ Tool        │ │ Resource     │ │ Prompt     │ │
│  │ Registry    │ │ Registry     │ │ Registry   │ │
│  │ (actions)   │ │ (read data)  │ │ (templates)│ │
│  └──────┬──────┘ └──────┬───────┘ └─────┬─────┘ │
│         │               │               │        │
│  ┌──────┴───────────────┴───────────────┴─────┐  │
│  │           Auth + RBAC Layer                 │  │
│  │   (API key → agent identity → permissions)  │  │
│  └──────────────────────┬─────────────────────┘  │
│                         │                         │
│  ┌──────────────────────┴─────────────────────┐  │
│  │        OrbisPM Service Layer (reuse)        │  │
│  │  TaskService, ProjectService, OrgService... │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 5.3 MCP Tools (Agent Actions)

```go
// internal/mcp/tools.go

// TASK MANAGEMENT
"task.create"           // Create a task or subtask
"task.update"           // Update task fields (title, description, priority, etc.)
"task.update_status"    // Change task status (validates state machine)
"task.assign"           // Assign/unassign users to task
"task.add_comment"      // Add a comment to a task
"task.add_checklist"    // Add checklist items
"task.toggle_checklist" // Toggle checklist item completion
"task.search"           // Full-text search across tasks
"task.get_tree"         // Get task hierarchy tree
"task.list"             // List tasks with filters (status, priority, assignee, date range)
"task.get_dependencies" // Get task dependencies
"task.add_dependency"   // Add dependency between tasks
"task.estimate"         // Set time estimate
"task.log_time"         // Log time spent
"task.duplicate"        // Duplicate a task (with/without subtasks)
"task.bulk_update"      // Update multiple tasks at once

// PROJECT MANAGEMENT
"project.list"          // List projects in org
"project.get"           // Get project details + settings
"project.create"        // Create new project (if permitted)
"project.get_stats"     // Get project statistics (completion %, overdue, etc.)
"project.list_members"  // List project members and their roles

// APPROVAL WORKFLOW
"approval.list_pending"     // List pending approvals for the agent
"approval.get_request"      // Get approval request details
"approval.vote"             // Approve or reject a request
"approval.list_policies"    // List approval policies

// TEAM MANAGEMENT
"team.list"             // List teams
"team.list_members"     // List team members

// ANALYTICS
"analytics.project_velocity"    // Get velocity metrics
"analytics.burndown"            // Get burndown data
"analytics.workload"            // Get team workload distribution
"analytics.overdue_tasks"       // Get overdue task report

// NOTIFICATIONS
"notification.list"     // List notifications for the agent
"notification.mark_read" // Mark notifications as read
```

### 5.4 MCP Resources (Read-Only Data)

```go
// internal/mcp/resources.go

// Resources provide read-only context for agents
"orbispm://org/{orgId}"                          // Org overview
"orbispm://org/{orgId}/projects"                 // All projects
"orbispm://org/{orgId}/project/{projectId}"      // Project details
"orbispm://org/{orgId}/project/{projectId}/tasks" // All tasks in project
"orbispm://org/{orgId}/teams"                    // All teams
"orbispm://org/{orgId}/members"                  // All members
"orbispm://org/{orgId}/activity"                 // Recent activity feed
```

### 5.5 MCP Prompts (Reusable Templates)

```go
// internal/mcp/prompts.go

"sprint_planning"       // "Help plan the next sprint for project {projectId}"
"task_breakdown"        // "Break down this task into subtasks: {description}"
"status_report"         // "Generate a status report for project {projectId}"
"code_review_summary"   // "Summarize pending code review tasks"
"risk_assessment"       // "Identify risks for tasks due in next 7 days"
"workload_balance"      // "Suggest workload rebalancing for team {teamId}"
```

### 5.6 Agent Identity & Authentication

```sql
-- Agents are stored as special members in the users + org_members tables
-- Distinguished by user_type column

ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'human';
  -- Values: 'human', 'agent', 'service_account'

ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_config JSONB;
  -- For agents: { "framework": "claude", "model": "claude-4", "capabilities": [...] }

-- API keys already exist (api_keys table) — agents authenticate via API key
-- The API key resolves to a user_id → which resolves to org_member → which has a role
```

### 5.7 Bidirectional Webhooks

**Outbound (OrbisPM → External)**:
OrbisPM sends events to registered webhook URLs when things happen.

**Inbound (External → OrbisPM)**:
External agents/services send commands to OrbisPM via authenticated webhook endpoints.

```sql
-- Webhook configurations
CREATE TABLE IF NOT EXISTS webhook_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    direction       TEXT NOT NULL,           -- 'outbound', 'inbound', 'bidirectional'
    
    -- Outbound config
    target_url      TEXT,                    -- Where to send events
    events          TEXT[] NOT NULL DEFAULT '{}', -- Which events to send
    secret          TEXT,                    -- HMAC signing secret (hashed)
    
    -- Inbound config  
    source_type     TEXT,                    -- 'github', 'slack', 'n8n', 'custom'
    verification    JSONB,                   -- Verification config per source type
    allowed_actions TEXT[] DEFAULT '{}',     -- Which MCP tools this webhook can invoke
    
    -- Common
    is_active       BOOLEAN NOT NULL DEFAULT true,
    headers         JSONB,                   -- Custom headers to send
    retry_policy    JSONB,                   -- { max_retries: 3, backoff: "exponential" }
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    webhook_id      UUID NOT NULL REFERENCES webhook_configs(id) ON DELETE CASCADE,
    direction       TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    response_status INT,
    response_body   TEXT,
    attempt         INT NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending, delivered, failed, retrying
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_webhook_configs ON webhook_configs
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY tenant_isolation_webhook_deliveries ON webhook_deliveries
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
```

### 5.8 Inbound Webhook Handler

```go
// internal/handler/webhook_inbound_handler.go

// POST /api/v1/orgs/:orgId/webhooks/inbound/:webhookId
func (h *WebhookInboundHandler) Handle(w http.ResponseWriter, r *http.Request) {
    // 1. Load webhook config
    // 2. Verify signature (HMAC-SHA256, Slack signing, GitHub signature, etc.)
    // 3. Parse payload based on source_type
    // 4. Map external event → MCP tool invocation
    // 5. Check allowed_actions — reject if tool not in allowlist
    // 6. Execute via service layer (same as MCP tool handler)
    // 7. Log delivery in webhook_deliveries
    // 8. Return response
}
```

### 5.9 Event-to-Webhook Mapping (Outbound)

```go
// internal/worker/webhook_worker.go

// Asynq job: "webhook:deliver"
// Triggered by eventbus when domain events occur

var eventToWebhookMap = map[string]string{
    domain.EventTaskCreated:    "task.created",
    domain.EventTaskUpdated:    "task.updated",
    domain.EventTaskDeleted:    "task.deleted",
    domain.EventCommentCreated: "comment.created",
    domain.EventApprovalRequested: "approval.requested",
    domain.EventApprovalCompleted: "approval.completed",
    // ... all domain events
}

func (w *WebhookWorker) Handle(ctx context.Context, t *asynq.Task) error {
    // 1. Get all active outbound webhooks for this org + event type
    // 2. For each matching webhook, deliver payload with retry
    // 3. Sign payload with webhook secret (HMAC-SHA256)
    // 4. Log delivery attempt in webhook_deliveries
}
```

### 5.10 MCP Server New Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/mcp` | MCP protocol endpoint (JSON-RPC 2.0 over HTTP) |
| GET | `/api/v1/mcp/sse` | MCP SSE transport (server-sent events) |
| GET | `/api/v1/orgs/:orgId/agents` | List agent members |
| POST | `/api/v1/orgs/:orgId/agents` | Register new agent member |
| PATCH | `/api/v1/orgs/:orgId/agents/:agentId` | Update agent config |
| DELETE | `/api/v1/orgs/:orgId/agents/:agentId` | Remove agent |
| GET | `/api/v1/orgs/:orgId/webhooks` | List webhook configs |
| POST | `/api/v1/orgs/:orgId/webhooks` | Create webhook config |
| PATCH | `/api/v1/orgs/:orgId/webhooks/:id` | Update webhook config |
| DELETE | `/api/v1/orgs/:orgId/webhooks/:id` | Delete webhook config |
| POST | `/api/v1/orgs/:orgId/webhooks/inbound/:id` | Inbound webhook receiver |
| GET | `/api/v1/orgs/:orgId/webhooks/:id/deliveries` | Webhook delivery log |
| POST | `/api/v1/orgs/:orgId/webhooks/:id/test` | Test webhook delivery |

### 5.11 New Go Packages

```
cmd/
├── mcp/
│   └── main.go              # MCP server binary (separate from API)

internal/
├── mcp/
│   ├── server.go            # MCP protocol server setup
│   ├── tools.go             # Tool registry + handlers
│   ├── resources.go         # Resource providers
│   ├── prompts.go           # Prompt templates
│   └── transport.go         # HTTP+SSE and stdio transport
├── webhook/
│   ├── outbound.go          # Outbound webhook delivery
│   ├── inbound.go           # Inbound webhook processing
│   ├── signature.go         # HMAC signing + verification
│   └── mapper.go            # Event ↔ action mapping
```

---

## 6. Third-Party Integrations

### 6.1 Integration Framework Architecture

Rather than building each integration separately, we build a **unified integration framework** that all connectors plug into.

```
┌─────────────────────────────────────────────────────┐
│                 Integration Framework                 │
│                                                       │
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ Connection Store  │  │ Integration Registry     │  │
│  │ (OAuth tokens,   │  │ (available connectors,   │  │
│  │  API keys, per   │  │  capabilities, config)   │  │
│  │  org + user)     │  │                          │  │
│  └────────┬─────────┘  └────────────┬─────────────┘  │
│           │                         │                 │
│  ┌────────┴─────────────────────────┴─────────────┐  │
│  │            Connector Interface                   │  │
│  │  type Connector interface {                      │  │
│  │    ID() string                                   │  │
│  │    Setup(config) error                           │  │
│  │    HandleEvent(event) error     // outbound      │  │
│  │    HandleInbound(payload) error // inbound       │  │
│  │    HealthCheck() error                           │  │
│  │  }                                               │  │
│  └──────────────────────────────────────────────────┘  │
│                                                       │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌───────────┐  │
│  │Slack │ │Teams │ │GitHub│ │Notion│ │Google Meet│  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └───────────┘  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌───────────┐  │
│  │ n8n  │ │Zapier│ │GitLab│ │ Zoom │ │  Discord  │  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └───────────┘  │
└─────────────────────────────────────────────────────┘
```

### 6.2 Database Schema

```sql
-- Integration connections (per org, stores OAuth tokens)
CREATE TABLE IF NOT EXISTS integration_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,           -- 'slack', 'github', 'notion', 'google_meet', etc.
    name            TEXT NOT NULL,           -- User-friendly name
    config          JSONB NOT NULL,          -- Provider-specific config (encrypted at rest)
    credentials     JSONB NOT NULL,          -- OAuth tokens, API keys (encrypted at rest)
    status          TEXT NOT NULL DEFAULT 'active',  -- 'active', 'expired', 'error', 'disconnected'
    connected_by    UUID NOT NULL,
    scopes          TEXT[],                  -- OAuth scopes granted
    metadata        JSONB,                   -- Provider-specific metadata
    last_synced_at  TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,            -- Token expiry
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Integration sync mappings (maps external entities to OrbisPM entities)
CREATE TABLE IF NOT EXISTS integration_mappings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    connection_id       UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    external_id         TEXT NOT NULL,       -- ID in external system
    external_type       TEXT NOT NULL,       -- 'github_issue', 'slack_channel', etc.
    internal_id         UUID NOT NULL,       -- OrbisPM entity ID
    internal_type       TEXT NOT NULL,       -- 'task', 'project', 'comment'
    sync_direction      TEXT NOT NULL DEFAULT 'bidirectional',  -- 'inbound', 'outbound', 'bidirectional'
    last_synced_at      TIMESTAMPTZ,
    sync_state          JSONB,               -- Provider-specific sync cursor
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(connection_id, external_id, external_type)
);

-- Integration event log (audit trail)
CREATE TABLE IF NOT EXISTS integration_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    connection_id   UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    direction       TEXT NOT NULL,           -- 'inbound', 'outbound'
    event_type      TEXT NOT NULL,
    payload         JSONB,
    status          TEXT NOT NULL DEFAULT 'processed',  -- 'processed', 'failed', 'skipped'
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_integration_connections ON integration_connections
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY tenant_isolation_integration_mappings ON integration_mappings
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY tenant_isolation_integration_events ON integration_events
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
```

### 6.3 Individual Integration Designs

#### 6.3.1 Slack Integration

**Capabilities**:
- Post task updates to Slack channels
- Create tasks from Slack messages (slash command: `/orbis create`)
- Receive Slack notifications for mentions, approvals, deadlines
- Link Slack channels to OrbisPM projects
- Interactive message buttons (approve/reject from Slack)

**Implementation**:
```
Slack App (Bot + Slash Commands + Interactive Messages)
├── OAuth2 flow for workspace install
├── Slash commands: /orbis create, /orbis status, /orbis list
├── Event API: message reactions → toggle task status
├── Interactive components: approval buttons in messages
├── Incoming webhook: Slack → OrbisPM
└── Outgoing: OrbisPM events → Slack channel messages
```

**Go Connector**: `internal/integration/slack/`

#### 6.3.2 Microsoft Teams Integration

**Capabilities**:
- Bot in Teams channels for task management
- Adaptive Cards for rich task displays
- Meeting integration (link Teams meetings to tasks/projects)
- Tab app for OrbisPM dashboard embedded in Teams

**Implementation**:
```
Teams Bot Framework + Tab App
├── Bot: receives messages, creates tasks, shows status
├── Adaptive Cards: task cards with action buttons
├── Message Extensions: search OrbisPM tasks from compose box
├── Tab App: iframe OrbisPM dashboard
└── Meeting integration: auto-create meeting notes task
```

**Go Connector**: `internal/integration/teams/`

#### 6.3.3 Google Meet Integration

**Capabilities**:
- Create/schedule meetings linked to tasks or projects
- Auto-generate meeting notes task after meeting ends
- Meeting attendance tracking for project members

**Implementation**:
```
Google Calendar API + Meet API
├── OAuth2 with calendar + meet scopes
├── Create meeting → linked to task/project via integration_mappings
├── Calendar webhook: meeting ended → create meeting-notes task
└── Meeting URL stored as task metadata
```

#### 6.3.4 GitHub Integration

**Capabilities**:
- **Bidirectional sync**: GitHub Issues ↔ OrbisPM Tasks
- Link PRs to tasks (auto-update task status when PR merged)
- GitHub Actions webhook → update task status
- Branch naming from task IDs
- Commit references to tasks

**Implementation**:
```
GitHub App (not OAuth App — better for orgs)
├── Installation webhook: org installs GitHub App
├── Issue sync: GitHub Issue created → OrbisPM task created (and vice versa)
├── PR events: PR opened/merged/closed → update linked task
├── Status checks: CI pass/fail → task metadata update
├── Branch helper: "Create branch" button on task → creates feature/TASK-123
└── Commit parsing: "fixes TASK-123" in commit → auto-close task
```

**Go Connector**: `internal/integration/github/`

#### 6.3.5 Notion Integration

**Capabilities**:
- Sync Notion databases ↔ OrbisPM projects
- Link Notion pages to tasks (as documentation)
- Import Notion databases as projects
- Export project data to Notion

**Implementation**:
```
Notion API (OAuth2)
├── Database sync: Notion DB ↔ OrbisPM project (bidirectional)
├── Page linking: attach Notion page URL to task
├── Import: read Notion DB rows → create OrbisPM tasks
└── Export: serialize project tasks → create Notion DB
```

#### 6.3.6 n8n Integration (Automation Platform)

**Capabilities**:
- OrbisPM as n8n trigger node (webhooks)
- OrbisPM as n8n action node (API calls)
- Custom automation workflows (e.g., "when task marked done → send invoice")

**Implementation**:
```
n8n Community Node Package (@orbispm/n8n-nodes-orbispm)
├── Trigger node: subscribes to OrbisPM webhooks
├── Action node: calls OrbisPM API (CRUD for all entities)
├── Credential type: API key authentication
└── Published to npm for n8n community
```

This is the easiest integration — n8n just needs our webhooks (already in plan) + REST API (already exists).

#### 6.3.7 Zoom Integration

Similar to Google Meet:
```
Zoom Marketplace App (OAuth2)
├── Create meetings linked to tasks
├── Meeting ended webhook → create notes task
└── Recording links stored as task attachments
```

### 6.4 Integration API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/orgs/:orgId/integrations` | List available integrations |
| GET | `/api/v1/orgs/:orgId/integrations/connections` | List connected integrations |
| POST | `/api/v1/orgs/:orgId/integrations/:provider/connect` | Start OAuth2 flow |
| GET | `/api/v1/orgs/:orgId/integrations/:provider/callback` | OAuth2 callback |
| DELETE | `/api/v1/orgs/:orgId/integrations/connections/:id` | Disconnect integration |
| GET | `/api/v1/orgs/:orgId/integrations/connections/:id/mappings` | List entity mappings |
| POST | `/api/v1/orgs/:orgId/integrations/connections/:id/sync` | Trigger manual sync |
| GET | `/api/v1/orgs/:orgId/integrations/connections/:id/events` | Integration event log |

### 6.5 New Go Packages

```
internal/
├── integration/
│   ├── framework.go       # Connector interface, registry, connection manager
│   ├── oauth.go           # Shared OAuth2 flow handler
│   ├── encryption.go      # Credential encryption at rest
│   ├── slack/
│   │   ├── connector.go   # Slack connector implementation
│   │   ├── commands.go    # Slash command handlers
│   │   └── messages.go    # Message formatting
│   ├── github/
│   │   ├── connector.go   # GitHub App connector
│   │   ├── sync.go        # Issue ↔ Task sync logic
│   │   └── webhooks.go    # GitHub webhook handlers
│   ├── teams/
│   │   ├── connector.go   # Teams Bot connector
│   │   └── cards.go       # Adaptive Card templates
│   ├── notion/
│   │   ├── connector.go   # Notion API connector
│   │   └── sync.go        # DB ↔ Project sync
│   ├── google/
│   │   ├── meet.go        # Meet integration
│   │   └── calendar.go    # Calendar integration
│   ├── zoom/
│   │   └── connector.go   # Zoom integration
│   └── n8n/
│       └── connector.go   # n8n webhook setup helpers
```

---

## 7. Role-Based Dashboards

### 7.1 Dashboard Hierarchy

Three levels of dashboards, each scoped by role:

```
Org Dashboard        ← Owner, Admin, Billing Admin
├── Team Dashboard   ← Team Lead, Team Member
│   └── Project Dashboard  ← Project Lead, Contributor, Reviewer, Observer
```

### 7.2 Org-Level Dashboard

**Audience**: Org Owner, Org Admin, Billing Admin

| Widget | Description | Roles |
|---|---|---|
| **Org Health Score** | Composite metric: on-time %, team velocity, overdue ratio | Owner, Admin |
| **Projects Overview** | Card grid: each project with completion %, status, lead | Owner, Admin |
| **Cross-Project Timeline** | Gantt-like view of all project milestones | Owner, Admin |
| **Team Workload** | Heatmap: team members × assigned tasks (over/under loaded) | Owner, Admin |
| **Approval Queue** | Pending approvals across all projects | Owner, Admin |
| **Overdue Tasks** | Tasks past deadline grouped by project | Owner, Admin |
| **Activity Feed** | Org-wide activity stream | Owner, Admin |
| **Member Analytics** | Active members, contributions, last active | Admin |
| **Billing Overview** | Plan, usage, costs, next invoice | Billing Admin |
| **Agent Activity** | AI agent actions, tool usage, approvals | Owner, Admin |
| **Integration Health** | Connected integrations, sync status, errors | Admin |

**API Endpoints**:
```
GET /api/v1/orgs/:orgId/dashboard
GET /api/v1/orgs/:orgId/dashboard/health-score
GET /api/v1/orgs/:orgId/dashboard/workload
GET /api/v1/orgs/:orgId/dashboard/overdue
GET /api/v1/orgs/:orgId/dashboard/activity
GET /api/v1/orgs/:orgId/dashboard/agent-activity
```

### 7.3 Team-Level Dashboard

**Audience**: Team Lead, Team Member

| Widget | Description | Roles |
|---|---|---|
| **Team Velocity** | Sprint velocity chart (story points/tasks per sprint) | Lead, Member |
| **Sprint Burndown** | Burndown chart for current sprint/iteration | Lead, Member |
| **Member Workload** | Tasks assigned per member, capacity bars | Lead |
| **Upcoming Deadlines** | Tasks due this week/next week | Lead, Member |
| **Team Projects** | Projects this team is assigned to, with progress | Lead, Member |
| **Blockers** | Tasks marked blocked, with context | Lead, Member |
| **Pending Reviews** | Change requests awaiting team review | Lead |
| **My Tasks** | Personal task list with due dates | Member |
| **Team Activity** | Activity feed scoped to team | Lead, Member |

**API Endpoints**:
```
GET /api/v1/orgs/:orgId/teams/:teamId/dashboard
GET /api/v1/orgs/:orgId/teams/:teamId/dashboard/velocity
GET /api/v1/orgs/:orgId/teams/:teamId/dashboard/burndown
GET /api/v1/orgs/:orgId/teams/:teamId/dashboard/workload
```

### 7.4 Project-Level Dashboard

**Audience**: Project Lead, Contributor, Reviewer, Observer

| Widget | Description | Roles |
|---|---|---|
| **Project Progress** | Overall completion %, task status distribution | All |
| **Task Status Board** | Kanban overview (counts per status column) | All |
| **Burndown Chart** | Tasks remaining vs. time | Lead, Contributor |
| **Priority Distribution** | Pie/bar chart of tasks by priority | All |
| **Assignee Distribution** | Who has how many tasks | Lead |
| **Overdue Tasks** | Past-deadline tasks with assignee | Lead, Contributor |
| **Recent Activity** | Project activity feed | All |
| **Upcoming Deadlines** | Calendar view of upcoming due dates | All |
| **Pending Approvals** | Approval requests for this project | Lead, Reviewer |
| **Dependencies** | Task dependency graph (blocked/blocking) | Lead, Contributor |
| **Change Requests** | Pending change requests with review status | Reviewer |
| **My Tasks** | Personal task list within this project | Contributor |
| **Agent Contributions** | What AI agents have done in this project | Lead |

**API Endpoints**:
```
GET /api/v1/orgs/:orgId/projects/:projectId/dashboard
GET /api/v1/orgs/:orgId/projects/:projectId/dashboard/progress
GET /api/v1/orgs/:orgId/projects/:projectId/dashboard/burndown
GET /api/v1/orgs/:orgId/projects/:projectId/dashboard/workload
GET /api/v1/orgs/:orgId/projects/:projectId/dashboard/timeline
```

### 7.5 Dashboard Backend Service

```go
// internal/service/dashboard_service.go

type DashboardService struct {
    taskRepo       repository.TaskRepository
    projectRepo    repository.ProjectRepository
    teamRepo       repository.TeamRepository
    orgRepo        repository.OrgRepository
    activityRepo   repository.ActivityRepository
    approvalRepo   repository.ApprovalRequestRepository
    txManager      *repository.TxManager
}

type OrgDashboard struct {
    HealthScore      float64                `json:"health_score"`
    Projects         []ProjectSummary       `json:"projects"`
    OverdueTasks     int                    `json:"overdue_tasks"`
    PendingApprovals int                    `json:"pending_approvals"`
    MemberCount      int                    `json:"member_count"`
    AgentCount       int                    `json:"agent_count"`
    TaskStats        TaskStatusDistribution `json:"task_stats"`
    RecentActivity   []Activity             `json:"recent_activity"`
    Workload         []MemberWorkload       `json:"workload"`
}

type ProjectDashboard struct {
    Progress         float64                `json:"progress"`
    TaskStats        TaskStatusDistribution `json:"task_stats"`
    PriorityStats    PriorityDistribution   `json:"priority_stats"`
    BurndownData     []BurndownPoint        `json:"burndown"`
    OverdueTasks     []TaskSummary          `json:"overdue_tasks"`
    UpcomingDeadlines []TaskSummary         `json:"upcoming_deadlines"`
    PendingApprovals int                    `json:"pending_approvals"`
    RecentActivity   []Activity             `json:"recent_activity"`
}

// Optimized queries — single SQL with aggregations, not N+1
func (s *DashboardService) GetOrgDashboard(ctx context.Context) (*OrgDashboard, error) {
    // Uses materialized view or pre-aggregated query for performance
}
```

### 7.6 Dashboard Caching Strategy

```
Dashboard data freshness requirements:
├── Real-time (WebSocket push): Activity feed, approval count
├── Near-real-time (30s cache): Task stats, overdue counts
├── Periodic (5min cache): Burndown data, velocity, workload
└── On-demand (15min cache): Health score, cross-project timeline

Implementation:
├── Redis cache with TTL per widget type
├── Cache invalidation on relevant domain events
├── WebSocket push for critical widgets (approval count, activity)
└── Asynq periodic job for expensive aggregations (hourly)
```

### 7.7 Frontend Dashboard Components

```
frontend/src/components/dashboard/
├── org/
│   ├── org-dashboard.tsx       # Main org dashboard layout
│   ├── health-score-card.tsx   # Composite health metric
│   ├── project-grid.tsx        # Project cards grid
│   ├── workload-heatmap.tsx    # Team workload visualization
│   ├── approval-queue.tsx      # Pending approvals list
│   └── agent-activity.tsx      # Agent action log
├── team/
│   ├── team-dashboard.tsx      # Team dashboard layout
│   ├── velocity-chart.tsx      # Sprint velocity
│   ├── burndown-chart.tsx      # Sprint burndown
│   └── member-capacity.tsx     # Team member workload
├── project/
│   ├── project-dashboard.tsx   # Project dashboard layout
│   ├── progress-ring.tsx       # Circular progress indicator
│   ├── status-distribution.tsx # Status bar/pie chart
│   ├── priority-chart.tsx      # Priority distribution
│   ├── deadline-calendar.tsx   # Calendar view of deadlines
│   └── dependency-graph.tsx    # Task dependency visualization
└── shared/
    ├── activity-feed.tsx       # Reusable activity stream
    ├── stat-card.tsx           # Numbers with trend indicator
    ├── chart-wrapper.tsx       # Recharts container with loading state
    └── dashboard-skeleton.tsx  # Loading skeleton for dashboard
```

### 7.8 Permission-Gated Widget Rendering

```tsx
// Dashboard renders only widgets the user's role allows
function ProjectDashboard({ projectId }: { projectId: string }) {
  const { role, hasPermission } = usePermissions()

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* All roles see these */}
      <ProgressRing />
      <StatusDistribution />
      <RecentActivity />

      {/* Lead + Contributor only */}
      {hasPermission('dashboard', 'view_burndown') && <BurndownChart />}
      {hasPermission('dashboard', 'view_workload') && <AssigneeDistribution />}

      {/* Lead + Reviewer only */}
      {hasPermission('approvals', 'view') && <PendingApprovals />}
      {role === 'lead' && <AgentContributions />}
    </div>
  )
}
```

---

## 8. Database Schema Changes (Summary)

### 8.1 New Tables

| Table | Feature Area | Purpose |
|---|---|---|
| `operation_log` | Offline-First | Operation log for sync (CRDT-inspired) |
| `approval_policies` | Approvals | Configurable approval rules per org/project |
| `approval_requests` | Approvals | Individual approval instances |
| `approval_votes` | Approvals | Per-stage approver decisions |
| `webhook_configs` | MCP/Agentic | Outbound + inbound webhook configurations |
| `webhook_deliveries` | MCP/Agentic | Delivery attempts + response log |
| `integration_connections` | Integrations | OAuth2 connections per org |
| `integration_mappings` | Integrations | External ↔ internal entity links |
| `integration_events` | Integrations | Integration event audit log |

### 8.2 Table Modifications

| Table | Change | Feature Area |
|---|---|---|
| `users` | Add `user_type TEXT` (human/agent/service_account) | MCP/Agentic |
| `users` | Add `agent_config JSONB` | MCP/Agentic |
| `tasks` | Add `version BIGINT` (monotonic counter for sync) | Offline-First |
| `projects` | Add `version BIGINT` | Offline-First |

### 8.3 New Indexes

All new tables get:
- RLS policy with `org_id = current_setting('app.current_org_id')::uuid`
- Primary index on `org_id`
- Composite indexes based on query patterns

Key performance indexes:
```sql
-- Operation log: fetch ops since cursor
CREATE INDEX idx_oplog_org_seq ON operation_log(org_id, server_seq);
-- Approval requests: find pending for user
CREATE INDEX idx_approval_requests_status ON approval_requests(org_id, status, current_stage);
-- Webhook deliveries: find pending retries
CREATE INDEX idx_webhook_deliveries_retry ON webhook_deliveries(status, next_retry_at);
-- Integration mappings: find by external ID
CREATE INDEX idx_integration_mappings_external ON integration_mappings(connection_id, external_id, external_type);
```

### 8.4 Migration Sequence

```
000010_offline_operation_log.up.sql          # operation_log table + indexes + RLS
000011_approval_system.up.sql                # approval_policies, requests, votes + RLS
000012_agent_support.up.sql                  # users.user_type, agent_config columns
000013_webhook_system.up.sql                 # webhook_configs, deliveries + RLS
000014_integration_framework.up.sql          # connections, mappings, events + RLS
000015_dashboard_materialized_views.up.sql   # Materialized views for dashboard aggregations
000016_entity_versioning.up.sql              # Add version columns to tasks, projects
```

---

## 9. Implementation Phases

### Phase 1: Foundation (4-6 weeks)
**Goal**: Core infrastructure that other features depend on.

| Week | Task | Deliverable |
|---|---|---|
| 1-2 | Approval Engine (backend) | approval_policies, requests, votes tables + service + handler |
| 2-3 | Approval Engine (frontend) | Approval policy config UI, pending approval list, vote UI |
| 3-4 | Webhook System (outbound) | webhook_configs table, outbound delivery via Asynq |
| 4-5 | Webhook System (inbound) | Inbound webhook handler, signature verification |
| 5-6 | Integration Framework | Connector interface, connection store, OAuth2 flow |

**Dependencies**: None (builds on existing codebase)
**Risk**: Approval engine complexity — keep initial scope to task approvals only, expand later.

### Phase 2: MCP + Agentic (4-5 weeks)
**Goal**: Make OrbisPM agent-ready.

| Week | Task | Deliverable |
|---|---|---|
| 1-2 | MCP Server core | cmd/mcp binary, tool/resource/prompt registry, transports |
| 2-3 | MCP Tools (CRUD) | Task/project/team CRUD tools, search tools |
| 3-4 | Agent Identity | user_type column, agent registration API, agent RBAC |
| 4-5 | MCP Tools (advanced) | Approval tools, analytics tools, notification tools |

**Dependencies**: Phase 1 (approval system, webhook system)
**Risk**: MCP spec changes — pin to specific spec version, abstract transport layer.

### Phase 3: Offline-First (5-7 weeks)
**Goal**: Full offline capability for supported operations.

| Week | Task | Deliverable |
|---|---|---|
| 1-2 | Backend sync engine | operation_log table, HLC, sync endpoints, conflict resolver |
| 2-3 | Frontend IndexedDB | Dexie.js setup, offline DB schema, op queue |
| 3-4 | Sync protocol | Push/pull sync, delta ops, conflict handling |
| 4-5 | Service Worker | Background sync, periodic sync, offline detection |
| 5-6 | Offline UI | Offline indicator, pending changes badge, conflict resolution dialog |
| 6-7 | Testing + hardening | Edge cases, network simulation, data integrity tests |

**Dependencies**: None (parallel with Phase 2)
**Risk**: Highest complexity feature. CRDT-inspired approach (not full CRDT) reduces risk. Start with tasks only, expand to comments/checklists later.

### Phase 4: Integrations (6-8 weeks)
**Goal**: Connect OrbisPM to the tools teams already use.

| Week | Task | Deliverable |
|---|---|---|
| 1-2 | GitHub Integration | GitHub App, issue sync, PR linking |
| 2-3 | Slack Integration | Slack App, slash commands, channel notifications |
| 3-4 | n8n Integration | n8n community node package, webhook triggers |
| 4-5 | Notion Integration | OAuth2, database sync, page linking |
| 5-6 | Google Meet + Zoom | Meeting creation, auto-notes tasks |
| 6-7 | Microsoft Teams | Bot framework, adaptive cards |
| 7-8 | Testing + polish | Cross-integration testing, error handling |

**Dependencies**: Phase 1 (webhook system, integration framework)
**Risk**: External API changes. Abstract behind connector interface to isolate.

### Phase 5: Dashboards (3-4 weeks)
**Goal**: Role-scoped analytics at all levels.

| Week | Task | Deliverable |
|---|---|---|
| 1 | Dashboard backend | Dashboard service, aggregation queries, caching |
| 1-2 | Org Dashboard | Health score, project grid, workload, approvals |
| 2-3 | Team Dashboard | Velocity, burndown, member capacity |
| 3-4 | Project Dashboard | Progress, status distribution, dependencies, timeline |

**Dependencies**: Phase 1 (approvals for approval widgets), Phase 2 (agents for agent widgets)
**Risk**: Low. Mostly read-only aggregations. Performance risk with large orgs → use materialized views.

### Phase Summary Timeline

```
Month 1-2:  Phase 1 (Approvals + Webhooks + Integration Framework)
Month 2-3:  Phase 2 (MCP + Agentic) ‖ Phase 3 begins (Offline backend)
Month 3-4:  Phase 3 continues (Offline frontend + sync) ‖ Phase 4 begins (GitHub, Slack)
Month 4-5:  Phase 4 continues (Notion, Meet, Teams) ‖ Phase 5 (Dashboards)
Month 5-6:  Phase 5 + Integration testing + hardening + documentation
```

---

## 10. Technology Decisions

### 10.1 Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Offline storage (client) | **Dexie.js** (IndexedDB wrapper) | Typed, reactive, works with React, large community |
| Rich text offline | **Yjs** (already via Tiptap) | CRDT built into Tiptap, proven production use |
| Conflict resolution | **Per-field LWW + HLC** | Simpler than full CRDT, covers 95% of PM cases |
| Sync protocol | **Custom op-log** | Full control, PostgreSQL-native, RLS-compatible |
| Approval definitions | **JSONB policies** | Flexible, no external workflow engine needed |
| MCP implementation | **Go + mark3labs/mcp-go** | Native Go MCP SDK, matches our backend stack |
| MCP transport | **HTTP+SSE** (primary) + **stdio** (local) | HTTP+SSE for remote agents, stdio for local CLI |
| Webhook signing | **HMAC-SHA256** | Industry standard (GitHub, Stripe, Slack all use it) |
| Integration credentials | **AES-256-GCM encrypted JSONB** | Encrypted at rest in DB, decrypted at service layer |
| Dashboard charts | **Recharts** (existing) | Already in project, sufficient for all planned charts |
| n8n node | **TypeScript npm package** | n8n nodes are TypeScript, published to npm |

### 10.2 New Go Dependencies

```go
// go.mod additions
require (
    github.com/mark3labs/mcp-go v0.17.0     // MCP protocol SDK
    github.com/slack-go/slack v0.14.0        // Slack API client
    github.com/google/go-github/v60 v60.0.0  // GitHub API client
    golang.org/x/oauth2 v0.25.0              // OAuth2 client flows
    github.com/jomei/notionapi v1.13.0       // Notion API client
    github.com/microsoftgraph/msgraph-sdk-go v1.30.0 // MS Graph (Teams)
)
```

### 10.3 New Frontend Dependencies

```json
// package.json additions
{
  "dexie": "^4.0.0",           // IndexedDB wrapper for offline
  "dexie-react-hooks": "^1.1.0", // React hooks for Dexie
  "idb-keyval": "^6.2.0"        // Simple KV store for sync metadata
}
```

### 10.4 Files/Directories to Create (Summary)

**Backend**:
```
cmd/mcp/main.go                           # MCP server entry point
internal/sync/                             # Offline sync engine (5 files)
internal/mcp/                              # MCP server implementation (5 files)
internal/webhook/                          # Webhook system (4 files)
internal/integration/                      # Integration framework + connectors (15+ files)
internal/service/approval_service.go       # Approval engine
internal/service/dashboard_service.go      # Dashboard aggregations
internal/handler/approval_handler.go       # Approval API endpoints
internal/handler/dashboard_handler.go      # Dashboard API endpoints
internal/handler/webhook_inbound_handler.go # Inbound webhook receiver
internal/handler/integration_handler.go    # Integration management endpoints
internal/handler/sync_handler.go           # Sync API endpoints
internal/handler/agent_handler.go          # Agent management endpoints
internal/repository/approval_repo.go       # Approval DB operations
internal/repository/webhook_repo.go        # Webhook DB operations
internal/repository/integration_repo.go    # Integration DB operations
internal/repository/oplog_repo.go          # Operation log DB operations
internal/repository/dashboard_repo.go      # Dashboard aggregation queries
internal/worker/approval_sla_worker.go     # SLA timeout escalation
internal/worker/integration_sync_worker.go # Periodic integration sync
db/migrations/000010-000016_*.sql          # 7 migration pairs (up + down)
```

**Frontend**:
```
src/lib/offline/                           # Offline engine (5 files)
src/hooks/use-offline.ts                   # Offline status hook
src/hooks/use-sync.ts                      # Sync management hook
src/components/dashboard/                  # Dashboard components (20+ files)
src/components/approval/                   # Approval UI components
src/components/integration/                # Integration management UI
src/components/offline/                    # Offline indicator, conflict dialog
src/app/(app)/[orgSlug]/dashboard/         # Org dashboard page
src/app/(app)/[orgSlug]/settings/integrations/ # Integration settings page
src/app/(app)/[orgSlug]/settings/approvals/    # Approval policy config page
src/app/(app)/[orgSlug]/approvals/         # Approval queue page
```

---

## Appendix A: Key Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Offline sync data loss | High | Comprehensive integration tests with network simulation; operation log is append-only (recoverable) |
| Approval engine blocking workflows | High | Always provide bypass for org owner; SLA timeouts with auto-approve option |
| MCP spec breaking changes | Medium | Pin to spec v2024-11 (stable); abstract behind interface |
| Integration OAuth token expiry | Medium | Background job to refresh tokens before expiry; graceful degradation |
| Dashboard performance at scale | Medium | Materialized views for heavy aggregations; Redis cache with TTL; pagination |
| CRDT complexity spiral | High | Use per-field LWW (not full CRDT); keep append-only where possible; rich text uses Yjs (proven) |
| Agent security (over-permissioned) | High | Agents have explicit RBAC roles; rate limiting per agent; all actions in audit log |

## Appendix B: Glossary

| Term | Definition |
|---|---|
| **HLC** | Hybrid Logical Clock — timestamp that combines wall clock + logical counter for causal ordering |
| **LWW** | Last-Write-Wins — conflict resolution where the most recent write takes precedence |
| **CRDT** | Conflict-free Replicated Data Type — data structure that can be merged without conflicts |
| **MCP** | Model Context Protocol — Anthropic's standard for AI agent ↔ tool communication |
| **Op-log** | Operation Log — append-only log of all data mutations for sync and audit |
| **RLS** | Row-Level Security — PostgreSQL feature for tenant data isolation |
| **SSE** | Server-Sent Events — HTTP-based one-way real-time data push |

---

*End of document*
