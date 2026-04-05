# OrbisPM — Future Integration & Expansion Plan

> **Status**: Planning Document  
> **Created**: 2026-04-06  
> **Scope**: OAuth/SSO/SAML · 3rd-Party Integrations · Advanced AI · Public API · MCP Server

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Baseline](#2-current-state-baseline)
3. [OAuth SSO & SAML Enterprise Identity](#3-oauth-sso--saml-enterprise-identity)
4. [Third-Party Integrations](#4-third-party-integrations)
5. [Advanced AI Integration](#5-advanced-ai-integration)
6. [Public API v2](#6-public-api-v2)
7. [MCP Server](#7-mcp-server)
8. [Infrastructure & Platform Changes](#8-infrastructure--platform-changes)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Database Schema Additions](#10-database-schema-additions)

---

## 1. Executive Summary

OrbisPM is a production-grade, multi-tenant project management platform with a solid Go backend, Next.js 15 frontend, PostgreSQL RLS-based multi-tenancy, real-time WebSocket infrastructure, chat (NATS), analytics pipeline, and billing (Stripe). The current auth stack uses **Zitadel** as the identity provider with OIDC PKCE support already wired in.

This document outlines five major expansion pillars that will elevate OrbisPM from a feature-complete PM tool to an **enterprise-grade, AI-native, infinitely extensible platform** — on par with and surpassing Jira, Linear, Asana, Monday.com, and ClickUp — while being fully automatable via MCP and public APIs.

---

## 2. Current State Baseline

| Area | Current State |
|---|---|
| Auth | Zitadel (email/password, TOTP MFA, OIDC PKCE, IDP hooks) |
| SSO | OIDC PKCE framework exists; no pre-built connectors |
| SAML | Not implemented |
| SCIM | Not implemented |
| 3rd Party | None (Stripe billing only) |
| AI | None |
| Public API | Internal REST only; no versioned public API, no SDK |
| MCP | Not implemented |
| GraphQL | Not implemented |
| Webhooks | Outbound webhooks (HMAC signed) — exists |
| API Keys | Exists (scoped, bcrypt-hashed) |

---

## 3. OAuth SSO & SAML Enterprise Identity

### 3.1 Architecture Overview

Zitadel already acts as the IdP broker. The strategy is to configure **Zitadel as the federation hub** — it supports adding upstream OIDC and SAML providers natively. OrbisPM's backend handles the downstream session management. This avoids building raw OAuth/SAML flows from scratch and keeps all identity logic centralized.

```
User Browser
    │
    ▼
OrbisPM Frontend  ──POST /api/v1/auth/sso/start──►  OrbisPM Backend
                                                          │
                                                    Detect org SSO config
                                                          │
                                              ┌───────────┴──────────────┐
                                              │                          │
                                        Zitadel OIDC              Zitadel SAML
                                        Federation                Federation
                                              │                          │
                                      Google / GitHub /           Okta / Azure AD /
                                      Microsoft / GitLab          PingFederate / ADFS
```

### 3.2 Social OAuth Providers

| Provider | Zitadel Template | Use Case |
|---|---|---|
| Google | `google` | B2C, workspace teams |
| GitHub | `github` | Dev teams, OSS orgs |
| Microsoft Entra ID (Azure AD) | `azure_ad` | Enterprise |
| GitLab | `gitlab` | Dev-centric orgs |
| Slack | Custom OIDC | Teams already on Slack |
| Apple | `apple` | Mobile users |
| LinkedIn | Custom OIDC | Professional network |

**Backend changes required** (`backend/internal/handler/auth_handler.go`):
- `POST /api/v1/auth/sso/providers` — list configured providers for an org domain
- `POST /api/v1/auth/sso/{provider}/start` — trigger Zitadel OIDC login, returns redirect URL
- `POST /api/v1/auth/sso/callback` — exchange code, create session, return OrbisPM tokens
- Domain-based auto-routing: detect user's email domain → auto-select SSO provider

**Database additions**:
```sql
CREATE TABLE org_sso_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,          -- google, github, azure_ad, saml, oidc_custom
    zitadel_idp_id  TEXT,                   -- Zitadel IDP ID after provisioning
    config          JSONB NOT NULL DEFAULT '{}',
    email_domains   TEXT[] NOT NULL DEFAULT '{}',  -- ['acme.com','acme.io']
    is_enforced     BOOLEAN DEFAULT FALSE,  -- block password login if TRUE
    jit_provisioning BOOLEAN DEFAULT TRUE, -- auto-create user on first SSO login
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, provider)
);
```

### 3.3 SAML 2.0 Enterprise Federation

Full SAML 2.0 SP-initiated and IdP-initiated flows via Zitadel's SAML federation capability.

**Supported IdPs**:
- Okta
- Microsoft Active Directory Federation Services (ADFS)
- Azure AD / Microsoft Entra External ID
- PingFederate / PingOne
- OneLogin
- Google Workspace (SAML)
- Auth0 (as SAML provider)
- Shibboleth (universities / research)

**Implementation**:

1. **SP Metadata endpoint**: `GET /api/v1/auth/saml/{orgSlug}/metadata` — returns XML SP metadata for enterprise IT teams to configure their IdP
2. **ACS endpoint**: `POST /api/v1/auth/saml/{orgSlug}/acs` — Assertion Consumer Service; validates SAML response, creates Zitadel session
3. **SLO endpoint**: `POST /api/v1/auth/saml/{orgSlug}/slo` — Single Logout
4. **Admin config API**: `POST /api/v1/orgs/{orgId}/sso/saml` — upload IdP metadata XML, configure attribute mapping

**Attribute Mapping** (configurable per org):
```json
{
  "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "display_name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  "groups": "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
  "department": "department",
  "title": "title"
}
```

**Group-to-Role Mapping**: SAML group assertions automatically map to OrbisPM roles:
```sql
CREATE TABLE sso_group_role_mappings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(id),
    sso_config_id UUID REFERENCES org_sso_configs(id),
    group_name  TEXT NOT NULL,      -- SAML group value
    role_id     UUID REFERENCES roles(id),  -- OrbisPM role
    scope       TEXT NOT NULL       -- org | team:{teamId} | project:{projectId}
);
```

### 3.4 SCIM 2.0 — Automated User Provisioning

SCIM 2.0 allows enterprise IdPs (Okta, Azure AD) to automatically provision, update, and deprovision users in OrbisPM.

**Endpoints** (under `/api/v1/scim/v2/`):
```
GET    /ServiceProviderConfig
GET    /Schemas
GET    /Users                    — list users (filtered)
POST   /Users                    — provision user
GET    /Users/{id}               — get user
PUT    /Users/{id}               — replace user
PATCH  /Users/{id}               — update user (OperationList)
DELETE /Users/{id}               — deprovision
GET    /Groups                   — list groups (org teams)
POST   /Groups                   — create group
PUT    /Groups/{id}              — update group
PATCH  /Groups/{id}              — add/remove members
DELETE /Groups/{id}              — delete group
```

**SCIM Auth**: Bearer token (dedicated SCIM API key scope `scim:provision`).

**Deprovisioning policy** (configurable per org):
- `suspend` — deactivate but keep data
- `anonymize` — keep tasks, replace PII
- `delete` — hard delete (requires explicit org config)

### 3.5 Just-In-Time (JIT) Provisioning

When a user authenticates via SSO for the first time:
1. Create Zitadel user profile
2. Cache in `public.users`
3. Auto-add to org based on email domain match in `org_sso_configs.email_domains`
4. Apply default role (configurable)
5. Apply group-to-role mappings from SAML assertions
6. Emit `user.provisioned` event to activity log

### 3.6 Session & Security Policies

```sql
CREATE TABLE org_security_policies (
    org_id                  UUID PRIMARY KEY REFERENCES orgs(id),
    mfa_required            BOOLEAN DEFAULT FALSE,
    mfa_grace_period_days   INT DEFAULT 7,
    session_lifetime_hours  INT DEFAULT 24,
    idle_timeout_minutes    INT DEFAULT 60,
    allowed_ip_ranges       CIDR[] DEFAULT '{}',
    password_policy         JSONB DEFAULT '{"min_length": 8, "require_uppercase": true}',
    sso_enforced            BOOLEAN DEFAULT FALSE  -- blocks password login entirely
);
```

---

## 4. Third-Party Integrations

### 4.1 Integration Architecture

All integrations follow a unified pattern: **OAuth 2.0 credential store + async sync worker + event-driven webhook receiver**.

```
OrbisPM Backend
├── /integrations/          — integration service layer
│   ├── registry.go         — central registry of all integration types
│   ├── oauth_client.go     — generic OAuth 2.0 token management
│   ├── webhook_router.go   — incoming webhook dispatcher
│   └── {provider}/         — per-provider implementation
│       ├── client.go       — API client
│       ├── sync.go         — bidirectional sync logic
│       └── webhook.go      — incoming event handler
└── /worker/tasks/
    └── integration_sync.go — Asynq task processors
```

**Database** (universal integration store):
```sql
CREATE TABLE org_integrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    provider        TEXT NOT NULL,    -- jira, github, slack, google_meet, etc.
    name            TEXT NOT NULL,    -- user-given label
    config          JSONB NOT NULL DEFAULT '{}',  -- provider-specific config
    credentials     JSONB NOT NULL DEFAULT '{}',  -- encrypted OAuth tokens
    status          TEXT DEFAULT 'active',  -- active|paused|error|disconnected
    last_synced_at  TIMESTAMPTZ,
    error_message   TEXT,
    created_by      UUID REFERENCES public.users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, provider, name)
);

CREATE TABLE integration_field_mappings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id  UUID REFERENCES org_integrations(id) ON DELETE CASCADE,
    direction       TEXT NOT NULL,    -- push | pull | bidirectional
    source_field    TEXT NOT NULL,
    target_field    TEXT NOT NULL,
    transform       JSONB             -- optional transform expression
);

CREATE TABLE integration_sync_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id  UUID REFERENCES org_integrations(id),
    direction       TEXT,
    entity_type     TEXT,
    entity_id       TEXT,
    status          TEXT,             -- success|error|skipped
    error           TEXT,
    synced_at       TIMESTAMPTZ DEFAULT NOW()
);
```

**Credential encryption**: All OAuth tokens stored AES-256-GCM encrypted using a KMS-derived key (AWS KMS / Vault / env-based key encryption key).

---

### 4.2 Communication & Video

#### 4.2.1 Google Meet

| Feature | Implementation |
|---|---|
| Create meeting from task | `POST /calendar/v3/calendars/{calId}/events` with conferenceData |
| Meeting link on task | Store `google_meet_link` in task JSONB metadata |
| Auto-create standup meeting | Triggered from project recurrence settings |
| Calendar sync | Sync task due dates ↔ Google Calendar events |
| Recording link | Webhook on meeting end → store recording URL on task |
| Meeting notes → task description | Google Docs API → fetch doc → update task description |
| Transcription → action items | Meeting transcript → AI pipeline → auto-create subtasks |

**OAuth Scopes**: `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/meetings.space.created`

#### 4.2.2 Microsoft Teams

| Feature | Implementation |
|---|---|
| Create Teams meeting from task | Graph API: `POST /me/onlineMeetings` |
| Bot integration | Teams App manifest + Bot Framework; slash commands in Teams channels |
| Adaptive Cards | Task previews as rich cards when OrbisPM links are shared |
| Channel notifications | Post task/project updates to Teams channels via incoming webhooks |
| Teams presence sync | Graph presence API → OrbisPM presence store |
| Meeting recordings | Teams webhook → task attachment |
| SSO with Entra ID | Via SAML/OIDC connector (section 3.3) |

**Graph API Scopes**: `OnlineMeetings.ReadWrite`, `Channel.ReadBasic.All`, `ChannelMessage.Send`, `Presence.Read.All`

#### 4.2.3 Slack

| Feature | Implementation |
|---|---|
| `/orbis` slash commands | Create tasks, update status, list my tasks — all from Slack |
| Task link unfurling | Slack Events API `link_shared` → return Block Kit attachment |
| Channel ↔ project binding | Link a Slack channel to an OrbisPM project; notifications flow there |
| Status sync | OrbisPM presence ↔ Slack status |
| Daily standup digest | Cron worker posts standup summary to channel |
| Approval workflows | Task change requests → interactive Slack messages with Approve/Reject buttons |
| Thread → task comment | Slack thread reply creates OrbisPM comment via reaction or slash command |
| Standup bot | Morning DM to team members collecting standup responses → aggregates to project channel |

**OAuth Scopes**: `channels:read`, `chat:write`, `commands`, `links:read`, `links:write`, `users:read`, `reactions:read`

#### 4.2.4 Zoom

| Feature | Implementation |
|---|---|
| Create Zoom meeting from task | Zoom API `POST /users/me/meetings` |
| Join link on task | Stored in task metadata |
| Webhook on meeting end | Receive recording URL, transcript |
| AI transcript → action items | Transcript → OrbisPM AI pipeline |

---

### 4.3 Project Management & Issue Tracking

#### 4.3.1 Jira (Atlassian)

Full bidirectional sync — OrbisPM can mirror an entire Jira project or selectively import.

| Feature | Direction | Notes |
|---|---|---|
| Import Jira issues as tasks | Jira → OrbisPM | One-time or recurring sync |
| Export OrbisPM tasks as Jira issues | OrbisPM → Jira | Push on demand |
| Bidirectional status sync | Both | Status mapping table (configurable) |
| Bidirectional comment sync | Both | Via webhooks |
| Attachment sync | Both | Download/upload binary |
| Sprint → project milestone | Jira → OrbisPM | |
| Epic → OrbisPM task group | Jira → OrbisPM | |
| Priority mapping | Both | Critical/High/Medium/Low ↔ Jira priority |
| Assignee sync | Both | Matched by email |
| Label / component sync | Both | OrbisPM labels ↔ Jira labels |
| Custom field mapping | Both | Via `integration_field_mappings` |
| Jira webhook receiver | Jira → OrbisPM | Real-time updates |

**Jira API**: Atlassian REST API v3 + Jira Cloud webhooks

**Status mapping config** (stored in `config` JSONB of `org_integrations`):
```json
{
  "status_map": {
    "To Do": "todo",
    "In Progress": "in_progress",
    "Done": "done",
    "Blocked": "blocked"
  },
  "default_project_id": "uuid",
  "sync_interval_minutes": 15,
  "sync_direction": "bidirectional"
}
```

#### 4.3.2 GitHub

| Feature | Implementation |
|---|---|
| Link GitHub repo to project | Store `repo_full_name`, `installation_id` |
| GitHub Issues ↔ OrbisPM tasks | Bidirectional sync with webhook |
| PR linked to task | Parse task ID from PR title/branch; display PR status on task |
| PR merge → task done | GitHub webhook `pull_request.closed` + merged → auto-complete task |
| Commit messages → task updates | `[ORBIS-123] fix login bug` → comment on task |
| Branch creation from task | `POST /api/v1/tasks/{taskId}/github/branch` → GitHub API |
| CI/CD status on task | `check_run` / `workflow_run` events → task metadata |
| Code review requests → task | PR review requested → notify task watchers |
| Release → project milestone | GitHub release → OrbisPM milestone event |
| GitHub Actions trigger | Task status change → trigger workflow dispatch |

**GitHub App** (preferred over OAuth):
- Installation-based; works for orgs
- Webhooks auto-configured on installation
- Permissions: `issues:write`, `pull_requests:write`, `contents:read`, `checks:read`, `actions:write`

#### 4.3.3 GitLab

Same feature set as GitHub, using GitLab REST API v4 and GitLab webhooks. Supports both GitLab.com and self-hosted instances (configurable base URL).

#### 4.3.4 Linear

| Feature | Implementation |
|---|---|
| Import Linear issues | Linear GraphQL API → OrbisPM tasks |
| Bidirectional status sync | Webhook-driven |
| Cycle sync | Linear cycle → project sprint |
| Labels, priority, assignee | Full field mapping |

#### 4.3.5 Asana / Trello / Monday.com / ClickUp / Notion

Import-only connectors (Phase 2):
- Migrate projects, tasks, assignees, due dates, labels from these tools
- Intelligent field mapping with AI-assisted column detection
- One-time migration wizard in UI + ongoing read-only sync option

---

### 4.4 Version Control & CI/CD

#### 4.4.1 GitHub Actions / GitLab CI / Jenkins / CircleCI

| Feature | Implementation |
|---|---|
| CI status badge on task | Webhook receiver + task metadata update |
| Trigger pipeline from task | `POST /api/v1/tasks/{taskId}/ci/trigger` |
| Deployment events → activity log | Receive deploy webhook → log to activity |
| Failed pipeline → task comment | Auto-comment with failure details |
| Test coverage reports | Parse test result artifacts → attach to task |

---

### 4.5 Cloud Storage & Documents

#### 4.5.1 Google Drive

| Feature | Implementation |
|---|---|
| Attach Drive files to tasks | OAuth picker → store file ID + link |
| Sync Drive folder to project | Mirror folder contents as task attachments |
| Create Doc from task template | Google Docs API → generate document |
| Meeting notes doc | Auto-create Docs for meeting-linked tasks |

**OAuth Scopes**: `drive.file` (minimal), `drive.readonly` for full sync

#### 4.5.2 Microsoft OneDrive / SharePoint

Same pattern as Google Drive, using Microsoft Graph API `https://graph.microsoft.com/v1.0/me/drive`.

#### 4.5.3 Dropbox / Box

File picker integration for attaching cloud files to tasks.

#### 4.5.4 Confluence / Notion (Documentation)

| Feature | Implementation |
|---|---|
| Link Confluence page to task | URL stored, metadata fetched via API |
| Import Confluence space as project | Space pages → project tasks (one-time) |
| Create Confluence page from task | Confluence REST API |
| Embed Notion page in task | Notion API → inline preview in task detail |

---

### 4.6 Calendar

#### 4.6.1 Google Calendar

| Feature | Implementation |
|---|---|
| Two-way task ↔ event sync | Task due dates ↔ Google Calendar events |
| Team availability | Read calendar free/busy for scheduling |
| OOO detection | Detect out-of-office events → task auto-reassign suggestion |
| Project milestones as events | Create calendar events for milestones |
| `.ics` export | Already implemented; add Google Calendar direct push |

#### 4.6.2 Microsoft Outlook / Exchange

Same sync via Microsoft Graph Calendar API.

---

### 4.7 Time Tracking

#### 4.7.1 Toggl Track

| Feature | Implementation |
|---|---|
| Start timer from task | `POST https://api.track.toggl.com/api/v9/time_entries` |
| Sync logged time | Toggl entries → OrbisPM task `actual_hours` |
| Reports | Toggl detailed reports → OrbisPM performance metrics |

#### 4.7.2 Harvest

Same feature set using Harvest API v2.

#### 4.7.3 Built-in Time Tracker Enhancement

The existing `time-tracker.tsx` frontend component should be enhanced with:
- Timer integration with Toggl/Harvest push
- Automatic time logging to task `actual_hours` on stop
- Daily time report per user

---

### 4.8 Communication: Email

#### 4.8.1 Inbound Email → Task Creation

- Dedicated per-project email address: `project+{projectId}@mail.orbispm.io`
- Inbound email parsing service (SparkPost Inbound / Postmark Inbound / AWS SES + Lambda)
- Email subject → task title; body → description; attachments → task attachments
- `Reply-to` on notification emails creates comments on the task

#### 4.8.2 Email Digest Upgrades

- AI-generated weekly project summary email
- Personalized digest: "Your tasks expiring this week" + "Blockers assigned to you"
- Unsubscribe management per-project, per-type

---

### 4.9 Analytics & BI

#### 4.9.1 Data Export Integrations

| Target | Method |
|---|---|
| Google Sheets | Sheets API v4; auto-refresh via Asynq cron |
| Microsoft Excel Online | Graph API; live query via OrbisPM ODBC-like connector |
| Tableau / PowerBI | ODATA feed endpoint `GET /api/v2/orgs/{orgId}/odata/$metadata` |
| Looker Studio | Data Studio connector (JSON-based community connector) |
| Metabase | Direct PostgreSQL read replica connection |

---

### 4.10 Notification & Communication Extras

#### Webhook Enhancements (existing feature)

- Add webhook **retry with exponential backoff** (already partially in Asynq worker)
- Webhook **event filtering UI** — select exact events
- Webhook **delivery logs** in org settings (queryable 30-day history)
- Webhook **signature verification** docs/SDK samples

#### PagerDuty / Opsgenie

- Metric alert → PagerDuty incident trigger
- OrbisPM risk score threshold → page on-call team

---

## 5. Advanced AI Integration

> **Design principle**: AI must act as an intelligent layer across the entire product — not as a chat widget. Every AI feature must directly reduce cognitive load, prevent failures, and automate tedious work. The goal is **ambient intelligence**.

### 5.1 AI Architecture

```
OrbisPM Backend
└── internal/ai/
    ├── provider.go          — interface: Complete, Embed, Stream
    ├── anthropic.go         — Claude claude-sonnet-4-6 (primary)
    ├── openai.go            — GPT-4o (fallback / alternative)
    ├── gemini.go            — Gemini 2.0 (Google Workspace context)
    ├── embeddings.go        — Vector embeddings service
    ├── pipeline.go          — Multi-step AI pipeline runner
    ├── context_builder.go   — Assembles rich context from DB for prompts
    └── features/
        ├── task_decomposer.go
        ├── risk_predictor.go
        ├── sprint_planner.go
        ├── meeting_processor.go
        ├── semantic_search.go
        ├── auto_assignment.go
        ├── dependency_detector.go
        ├── pr_linker.go
        ├── review_writer.go
        ├── digest_generator.go
        └── anomaly_detector.go
```

**Model strategy**:
- Primary: `claude-sonnet-4-6` (complex reasoning, long context, code)
- Fast inference: `claude-haiku-4-5` (real-time suggestions, autocomplete)
- Embeddings: `text-embedding-3-large` (OpenAI) or `voyage-3` (Anthropic)
- Vision: `claude-opus-4-6` (screenshot analysis, design-to-task)

**Vector store**: `pgvector` extension on existing PostgreSQL. No additional infrastructure.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_embeddings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    entity_type     TEXT NOT NULL,   -- task | project | comment | document | template
    entity_id       UUID NOT NULL,
    embedding       vector(1536),    -- OpenAI text-embedding-3-small dim
    content_hash    TEXT,            -- detect stale embeddings
    model           TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON ai_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Rate limiting & cost controls**:
```sql
CREATE TABLE org_ai_usage (
    org_id          UUID REFERENCES orgs(id),
    period          DATE,
    input_tokens    BIGINT DEFAULT 0,
    output_tokens   BIGINT DEFAULT 0,
    requests        INT DEFAULT 0,
    cost_usd        NUMERIC(10,4) DEFAULT 0,
    PRIMARY KEY (org_id, period)
);
```

---

### 5.2 Feature: Natural Language Task Creation

**Trigger**: Text input in any context (command palette, quick-add bar, Slack bot, API)

**Flow**:
1. User types: *"Create a task for the backend team to implement Stripe webhooks by next Friday, high priority, assign to Sarah"*
2. AI parses: `title`, `description`, `assignees` (email match), `due_date` (relative → absolute), `priority`, `team_id`, `labels`
3. Preview card shown with parsed fields — user can confirm or edit
4. Task created via normal `TaskService.CreateTask`

**Endpoint**: `POST /api/v1/orgs/{orgId}/ai/parse-task`

**Also handles**:
- Bulk creation: "Create 5 tasks for the mobile release checklist"
- Ambiguity resolution: "Did you mean project 'Mobile App' or 'Mobile API'?" → interactive clarification
- Voice input (browser `SpeechRecognition` API → same endpoint)

---

### 5.3 Feature: Intelligent Task Decomposition

**Trigger**: User clicks "AI Decompose" on any task, OR on project creation with a high-level goal.

**Flow**:
1. Context assembled: task title, description, project type, existing tasks, team skills (from past task patterns)
2. Claude generates: subtask tree with estimated hours, suggested assignees, dependencies, acceptance criteria
3. User reviews in a split-panel: AI suggestions on left, current task on right; accepts/rejects/edits each
4. Accepted subtasks created via `TaskService.CreateTask` with `parent_task_id`

**Endpoint**: `POST /api/v1/orgs/{orgId}/tasks/{taskId}/ai/decompose`

**Advanced variant**: Full sprint planning decomposition — given a milestone or epic, generate a complete work breakdown structure (WBS) with dependency graph, critical path highlighted.

---

### 5.4 Feature: AI Sprint & Iteration Planner

**Flow**:
1. Select backlog items for sprint
2. AI analyzes: team velocity (from `weekly_metrics`), member availability (calendar integration), task complexity (historical completion time vs. estimate), current workload distribution
3. Generates: optimized sprint plan with:
   - Confidence score per task inclusion
   - Risk flags (overscheduled members, dependency conflicts)
   - Suggested capacity buffer
   - Critical path through the sprint
   - Predicted completion date distribution (Monte Carlo)

**Endpoint**: `POST /api/v1/orgs/{orgId}/projects/{projectId}/ai/plan-sprint`

**Output includes**:
```json
{
  "recommended_tasks": [...],
  "excluded_tasks": [...],
  "capacity_utilization": {"Alice": 0.87, "Bob": 1.02},
  "risk_flags": ["Bob is over-allocated", "Task A blocks 3 others"],
  "confidence": 0.78,
  "predicted_completion": "2026-04-25",
  "completion_p10": "2026-04-22",
  "completion_p90": "2026-05-02"
}
```

---

### 5.5 Feature: Predictive Risk Engine

**Always-on** background worker running on a schedule and on task state transitions.

**Signals analyzed**:
- Task overdue probability (Bayesian, based on similar past tasks)
- Blocked dependency chains
- Assignee workload saturation (>90% capacity)
- Stale tasks (no activity in N days relative to due date)
- Historical late-delivery patterns per team/member
- Scope creep detection (subtask count growth rate)
- Comment sentiment analysis (frustration signals)

**Output**:
- Risk score per task (0.0–1.0) stored in `risk_scores` table (already exists)
- Risk score per project, team, org
- Alert generation → existing `metric_alerts` table
- Proactive Slack/email notification: *"Task 'Payment integration' has 78% probability of missing its deadline based on current progress patterns"*
- Visual risk heatmap in project/org dashboard

**Endpoint**: `GET /api/v1/orgs/{orgId}/projects/{projectId}/ai/risk-report`

**ML model approach**: Gradient-boosted classifier (XGBoost) trained on anonymized historical task data. Model served via a lightweight Python inference microservice or directly via ONNX runtime in Go.

---

### 5.6 Feature: Auto-Assignment Intelligence

**Trigger**: Task creation without explicit assignee.

**Algorithm**:
1. Embed task title+description → find semantically similar past tasks
2. Score team members:
   - Skill match (based on past tasks they completed in this domain)
   - Current workload (tasks in-progress, capacity remaining from calendar)
   - Availability (check OOO / calendar integration)
   - Historical performance on similar tasks (cycle time, quality)
3. Return ranked suggestions with explanation: *"Alice has completed 12 similar backend tasks with avg 0.9 days cycle time and has 40% capacity available"*

**Endpoint**: `POST /api/v1/orgs/{orgId}/tasks/{taskId}/ai/suggest-assignees`

---

### 5.7 Feature: Meeting Intelligence

**Trigger**: After a Google Meet / Zoom / Teams meeting linked to a project ends.

**Pipeline**:
1. Receive transcript via webhook (Meet/Zoom/Teams recording webhook)
2. AI processes transcript:
   - Extract action items: *"John will fix the login bug by Friday"*
   - Extract decisions: *"We decided to postpone the mobile release to May"*
   - Extract blockers mentioned
   - Generate meeting summary (3-5 bullet points)
   - Detect who spoke about what (speaker diarization)
3. Create tasks from action items with suggested assignees and due dates
4. Attach summary as comment to meeting-linked task
5. Notify participants with summary + created tasks

**Endpoint**: `POST /api/v1/orgs/{orgId}/ai/process-meeting`

**Also handles**: Text paste of meeting notes (Notion, Confluence, raw text) → same extraction pipeline.

---

### 5.8 Feature: Semantic Search

Replace (or augment) current Meilisearch keyword search with vector semantic search.

**Implementation**:
- On task/comment/document create/update → embed content → store in `ai_embeddings`
- Search endpoint: hybrid = keyword (Meilisearch, fast) + semantic (pgvector, precise)
- Results ranked by combined score: `0.6 * semantic_score + 0.4 * keyword_score`
- Context-aware: understand *"tasks blocked by Alex"*, *"overdue backend work"*, *"decisions from last sprint"*

**Endpoint**: `POST /api/v1/orgs/{orgId}/ai/search`
```json
{
  "query": "authentication issues reported last week",
  "filter": {"entity_types": ["task", "comment"], "date_range": "last_7d"},
  "limit": 20
}
```

---

### 5.9 Feature: AI Code Review Integration (GitHub / GitLab)

**Trigger**: PR opened and linked to an OrbisPM task.

**Pipeline**:
1. Fetch PR diff via GitHub/GitLab API
2. AI reviews diff against task requirements in description and acceptance criteria
3. Posts inline PR comments via GitHub Review API
4. Updates task with review summary:
   - Requirements coverage: which ACs are addressed
   - Potential issues flagged
   - Suggested improvements
5. If all ACs covered → suggest auto-moving task to "In Review" status

---

### 5.10 Feature: AI-Generated Reports & Insights

**Weekly Executive Summary**:
- Generated every Monday 9am (org timezone)
- Input: all project metrics, completed/overdue tasks, team velocity, blockers
- Output: 1-page markdown summary with key wins, risks, recommendations
- Delivered via email digest + pinned announcement in org

**AI Performance Reviews**:
- `GET /api/v1/orgs/{orgId}/members/{userId}/ai/performance-review`
- Input: task completion history, cycle times, quality signals, peer comments
- Output: structured review (strengths, improvement areas, comparison to team baseline)
- **Explicitly not used for performance evaluation without human review** — advisory only

**Retrospective Assistant**:
- `POST /api/v1/orgs/{orgId}/projects/{projectId}/ai/retrospective`
- Analyze sprint: what went well (completed on time, under estimate), what didn't (overdue, re-opened tasks, blocked), patterns
- Generate retrospective agenda with data-backed discussion points

**Anomaly Detection**:
- Detect sudden changes in velocity, unusual spike in blockers, abnormal task re-opening rates
- Real-time alerts via `metric_alerts` table + notification system

---

### 5.11 Feature: AI Document Generation

**Templates → Rich Documents**:
- `POST /api/v1/orgs/{orgId}/projects/{projectId}/ai/generate-doc`
- Types: Project Charter, PRD, Technical Spec, Test Plan, Release Notes, Incident Report
- Input: project tasks, milestones, team, description
- Output: structured markdown document → stored as task attachment or Confluence/Notion page

**Task Description Enhancement**:
- `POST /api/v1/tasks/{taskId}/ai/enhance-description`
- Expands sparse task descriptions with context from project, similar past tasks, acceptance criteria
- Suggests checklists based on task type

---

### 5.12 Feature: Dependency Auto-Detection

**Trigger**: Task creation or bulk import.

**Pipeline**:
1. Embed all existing tasks in project
2. Compare new task embedding to all existing tasks
3. Detect potential dependencies: *"Task 'Deploy API' likely depends on 'Implement API endpoints'"*
4. Suggest dependencies in UI — user confirms

**Endpoint**: `POST /api/v1/orgs/{orgId}/projects/{projectId}/ai/detect-dependencies`

---

### 5.13 Feature: AI-Powered Import Mapping

**Enhancement to existing import feature** (`import_jobs` table):

When importing CSV/XLSX from Jira, Asana, Trello, etc.:
1. AI analyzes column headers and sample data
2. Auto-maps columns to OrbisPM fields
3. Detects data types, priority values, status values
4. Suggests value transformations (e.g., "Priority: P1" → `critical`)
5. Confidence score per mapping; user reviews low-confidence mappings only

---

### 5.14 AI Configuration & Controls

```sql
CREATE TABLE org_ai_settings (
    org_id              UUID PRIMARY KEY REFERENCES orgs(id),
    enabled             BOOLEAN DEFAULT TRUE,
    allowed_features    TEXT[] DEFAULT ARRAY['all'],
    blocked_features    TEXT[] DEFAULT '{}',
    model_preference    TEXT DEFAULT 'claude-sonnet-4-6',
    data_retention_days INT DEFAULT 30,   -- how long AI context is stored
    send_to_external_ai BOOLEAN DEFAULT TRUE,  -- can be disabled for air-gapped
    monthly_token_limit BIGINT DEFAULT 10000000,
    pii_filter_enabled  BOOLEAN DEFAULT FALSE
);
```

---

## 6. Public API v2

### 6.1 API Strategy

OrbisPM needs a **first-class public API** — not just an internal REST API, but a versioned, documented, SDK-backed, rate-limited public surface that enables:
- Integration builders (Zapier, Make, n8n)
- Enterprise customers building custom workflows
- MCP tool calls (section 7)
- Partner ecosystem

### 6.2 REST API v2

**Base URL**: `https://api.orbispm.io/v2`

**Auth methods**:
- `Authorization: Bearer <personal_access_token>` — PATs (long-lived, user-scoped)
- `Authorization: Bearer <oauth_access_token>` — OAuth 2.0 client credentials
- `X-API-Key: <api_key>` — Org API keys (existing, enhanced)
- `Authorization: Bearer <jwt>` — Service account tokens (for integrations)

**Rate Limiting** (Kong gateway + Redis token bucket):
| Plan | Requests/min | Requests/day | Burst |
|---|---|---|---|
| Free | 60 | 10,000 | 100 |
| Pro | 600 | 100,000 | 1,000 |
| Enterprise | 6,000 | 1,000,000 | 10,000 |
| Partner | Unlimited | Unlimited | — |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Versioning strategy**: URL versioning (`/v2/`) with minimum 12-month deprecation window. `Sunset` header on deprecated endpoints.

**Response envelope**:
```json
{
  "data": { ... },
  "meta": {
    "request_id": "req_01j...",
    "api_version": "2026-04-01",
    "deprecation_notice": null
  },
  "pagination": {
    "cursor": "eyJpZCI6...",
    "has_more": true,
    "total": 1523
  }
}
```

**Pagination**: Cursor-based (keyset pagination on `id`+`created_at`) for all list endpoints. Also supports offset for BI tools.

**Filtering**: Standard query params `filter[status]=todo,in_progress`, `filter[assignee_id]=user_uuid`, `filter[due_before]=2026-05-01`. Complex filters via JSON in `filter` param.

**Sorting**: `sort=due_date,-priority` (prefix `-` for descending).

**Field selection**: `fields=id,title,status,assignee_ids` — reduces payload.

**Expansion**: `expand=assignees,project,comments.author` — eager-load relations.

### 6.3 Full API v2 Endpoint Surface

```
# Authentication
POST   /v2/auth/token                    — OAuth 2.0 token exchange
POST   /v2/auth/token/refresh
DELETE /v2/auth/token                    — revoke token
GET    /v2/auth/me                       — current user

# Organizations
GET    /v2/orgs                          — list orgs for authenticated user
GET    /v2/orgs/{orgId}
PATCH  /v2/orgs/{orgId}
GET    /v2/orgs/{orgId}/members
POST   /v2/orgs/{orgId}/members/invite
DELETE /v2/orgs/{orgId}/members/{userId}
PATCH  /v2/orgs/{orgId}/members/{userId}

# Teams
GET    /v2/orgs/{orgId}/teams
POST   /v2/orgs/{orgId}/teams
GET    /v2/orgs/{orgId}/teams/{teamId}
PATCH  /v2/orgs/{orgId}/teams/{teamId}
DELETE /v2/orgs/{orgId}/teams/{teamId}
GET    /v2/orgs/{orgId}/teams/{teamId}/members
POST   /v2/orgs/{orgId}/teams/{teamId}/members
DELETE /v2/orgs/{orgId}/teams/{teamId}/members/{userId}

# Projects
GET    /v2/orgs/{orgId}/projects
POST   /v2/orgs/{orgId}/projects
GET    /v2/orgs/{orgId}/projects/{projectId}
PATCH  /v2/orgs/{orgId}/projects/{projectId}
DELETE /v2/orgs/{orgId}/projects/{projectId}
GET    /v2/orgs/{orgId}/projects/{projectId}/members
POST   /v2/orgs/{orgId}/projects/{projectId}/members
GET    /v2/orgs/{orgId}/projects/{projectId}/analytics
GET    /v2/orgs/{orgId}/projects/{projectId}/export      — CSV/JSON export

# Tasks
GET    /v2/orgs/{orgId}/tasks            — cross-project task list
POST   /v2/orgs/{orgId}/tasks
GET    /v2/orgs/{orgId}/tasks/{taskId}
PATCH  /v2/orgs/{orgId}/tasks/{taskId}
DELETE /v2/orgs/{orgId}/tasks/{taskId}
GET    /v2/orgs/{orgId}/tasks/{taskId}/subtasks
POST   /v2/orgs/{orgId}/tasks/{taskId}/subtasks
GET    /v2/orgs/{orgId}/tasks/{taskId}/comments
POST   /v2/orgs/{orgId}/tasks/{taskId}/comments
GET    /v2/orgs/{orgId}/tasks/{taskId}/attachments
POST   /v2/orgs/{orgId}/tasks/{taskId}/attachments
GET    /v2/orgs/{orgId}/tasks/{taskId}/dependencies
POST   /v2/orgs/{orgId}/tasks/{taskId}/dependencies
DELETE /v2/orgs/{orgId}/tasks/{taskId}/dependencies/{depId}
POST   /v2/orgs/{orgId}/tasks/{taskId}/watchers
DELETE /v2/orgs/{orgId}/tasks/{taskId}/watchers/{userId}
POST   /v2/orgs/{orgId}/tasks/{taskId}/transition        — status change
POST   /v2/orgs/{orgId}/tasks/bulk                       — bulk operations

# AI Endpoints
POST   /v2/orgs/{orgId}/ai/parse-task
POST   /v2/orgs/{orgId}/ai/search
POST   /v2/orgs/{orgId}/ai/risk-report
POST   /v2/orgs/{orgId}/tasks/{taskId}/ai/decompose
POST   /v2/orgs/{orgId}/tasks/{taskId}/ai/suggest-assignees
POST   /v2/orgs/{orgId}/tasks/{taskId}/ai/enhance-description
POST   /v2/orgs/{orgId}/projects/{projectId}/ai/plan-sprint
POST   /v2/orgs/{orgId}/projects/{projectId}/ai/retrospective
POST   /v2/orgs/{orgId}/ai/process-meeting

# Integrations
GET    /v2/orgs/{orgId}/integrations
POST   /v2/orgs/{orgId}/integrations
GET    /v2/orgs/{orgId}/integrations/{integrationId}
PATCH  /v2/orgs/{orgId}/integrations/{integrationId}
DELETE /v2/orgs/{orgId}/integrations/{integrationId}
POST   /v2/orgs/{orgId}/integrations/{integrationId}/sync
GET    /v2/orgs/{orgId}/integrations/{integrationId}/logs

# Webhooks (enhanced existing)
GET    /v2/orgs/{orgId}/webhooks
POST   /v2/orgs/{orgId}/webhooks
PATCH  /v2/orgs/{orgId}/webhooks/{webhookId}
DELETE /v2/orgs/{orgId}/webhooks/{webhookId}
GET    /v2/orgs/{orgId}/webhooks/{webhookId}/deliveries
POST   /v2/orgs/{orgId}/webhooks/{webhookId}/test

# SSO / Identity
GET    /v2/orgs/{orgId}/sso
POST   /v2/orgs/{orgId}/sso
DELETE /v2/orgs/{orgId}/sso/{configId}
GET    /v2/auth/saml/{orgSlug}/metadata
POST   /v2/scim/v2/Users                 — SCIM provisioning
...

# Analytics
GET    /v2/orgs/{orgId}/analytics/overview
GET    /v2/orgs/{orgId}/analytics/velocity
GET    /v2/orgs/{orgId}/analytics/workload
GET    /v2/orgs/{orgId}/analytics/burndown
GET    /v2/orgs/{orgId}/analytics/cumulative-flow
GET    /v2/orgs/{orgId}/members/{userId}/analytics

# Notifications
GET    /v2/notifications
PATCH  /v2/notifications/{id}/read
POST   /v2/notifications/read-all

# Templates
GET    /v2/orgs/{orgId}/templates
POST   /v2/orgs/{orgId}/templates
POST   /v2/orgs/{orgId}/templates/{templateId}/apply

# Search
GET    /v2/orgs/{orgId}/search?q=...
POST   /v2/orgs/{orgId}/search          — advanced search (body with filters)
```

### 6.4 GraphQL API

**Endpoint**: `POST /v2/graphql`

Enables flexible queries — essential for MCP tools and complex dashboards.

**Schema highlights**:
```graphql
type Query {
  me: User!
  org(id: ID!): Organization
  project(id: ID!): Project
  task(id: ID!): Task
  tasks(orgId: ID!, filter: TaskFilter, sort: TaskSort, first: Int, after: String): TaskConnection!
  search(orgId: ID!, query: String!, types: [EntityType!]): SearchResult!
}

type Mutation {
  createTask(input: CreateTaskInput!): Task!
  updateTask(id: ID!, input: UpdateTaskInput!): Task!
  transitionTask(id: ID!, status: TaskStatus!): Task!
  createProject(orgId: ID!, input: CreateProjectInput!): Project!
  inviteMember(orgId: ID!, email: String!, role: String!): OrgMember!
  triggerAI(input: AIInput!): AIResult!
}

type Subscription {
  taskUpdated(projectId: ID!): Task!
  notificationReceived: Notification!
  projectActivityFeed(projectId: ID!): ActivityEvent!
}
```

**Implementation**: `graph-gophers/graphql-go` or `99designs/gqlgen`. Subscriptions via WebSocket (`graphql-ws` protocol).

**DataLoader pattern**: Batch and cache database queries per request to prevent N+1.

### 6.5 OAuth 2.0 Provider (for 3rd-Party Apps)

Allow external developers to build apps that request access to OrbisPM data on behalf of users — similar to GitHub Apps.

**Flows supported**:
- Authorization Code + PKCE (user-facing apps)
- Client Credentials (service-to-service)
- Device Code (CLI tools)

**Scopes**:
```
tasks:read          tasks:write
projects:read       projects:write
org:read            org:write
members:read        members:write
comments:read       comments:write
analytics:read
notifications:read  notifications:write
ai:read             ai:write
admin:*             (superuser scope, requires explicit grant)
```

**Developer portal**: `https://developers.orbispm.io`
- App registration
- OAuth consent screen customization
- API explorer (embedded Swagger/GraphiQL)
- Webhook event tester
- SDK downloads (TypeScript, Python, Go, Ruby)

### 6.6 SDK Generation

Auto-generated from OpenAPI 3.1 spec via `openapi-generator`:

| Language | Package |
|---|---|
| TypeScript/Node.js | `@orbispm/sdk` |
| Python | `orbispm` (PyPI) |
| Go | `github.com/orbispm/go-sdk` |
| Ruby | `orbispm` (RubyGems) |
| PHP | `orbispm/orbispm` (Packagist) |
| .NET / C# | `OrbisPM.SDK` (NuGet) |

### 6.7 Zapier / Make / n8n Connectors

- **Zapier**: Official Zapier app with triggers (task created/updated/completed) and actions (create task, update status, add comment)
- **Make (Integromat)**: Official connector with same trigger/action set
- **n8n**: Community node package `n8n-nodes-orbispm`

These consume the public REST API v2 with OAuth client credentials.

---

## 7. MCP Server

### 7.1 Overview

The OrbisPM **MCP (Model Context Protocol) Server** exposes the entire platform as a structured tool surface for AI assistants (Claude, ChatGPT, Cursor, etc.). This enables users to manage projects, tasks, teams, and analytics entirely through natural language in any MCP-compatible client.

### 7.2 MCP Server Architecture

```
/mcp-server/                     — standalone Go service
├── main.go                      — stdio + HTTP/SSE transport
├── server.go                    — MCP server initialization
├── tools/
│   ├── tasks.go                 — task CRUD tools
│   ├── projects.go              — project tools
│   ├── teams.go                 — team tools
│   ├── members.go               — member management tools
│   ├── analytics.go             — analytics tools
│   ├── search.go                — search tools
│   ├── ai.go                    — AI feature tools
│   ├── notifications.go
│   ├── comments.go
│   ├── attachments.go
│   ├── templates.go
│   ├── integrations.go
│   └── webhooks.go
├── resources/
│   ├── task_resource.go         — task:// URI scheme
│   ├── project_resource.go      — project:// URI scheme
│   └── org_resource.go          — org:// URI scheme
├── prompts/
│   ├── sprint_planning.go       — guided sprint planning prompt
│   ├── risk_review.go
│   ├── standup.go
│   └── retrospective.go
└── auth/
    └── api_key_auth.go          — authenticate via OrbisPM API key
```

**Transport modes**:
- `stdio` — for local Claude Desktop / Cursor integration
- `HTTP + SSE` — for web-based MCP clients, hosted mode
- `WebSocket` — for real-time bidirectional (future)

**Configuration** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "orbispm": {
      "command": "orbispm-mcp",
      "args": [],
      "env": {
        "ORBISPM_API_KEY": "op_live_...",
        "ORBISPM_ORG_SLUG": "acme-corp",
        "ORBISPM_BASE_URL": "https://api.orbispm.io"
      }
    }
  }
}
```

### 7.3 MCP Tools — Complete Specification

#### Task Tools

```typescript
// orbispm_list_tasks
{
  name: "orbispm_list_tasks",
  description: "List tasks in an org or project with filters",
  inputSchema: {
    project_id?: string,
    status?: "todo" | "in_progress" | "done" | "blocked",
    assignee_id?: string,
    priority?: "critical" | "high" | "medium" | "low",
    due_before?: string,  // ISO8601
    due_after?: string,
    labels?: string[],
    search?: string,
    include_subtasks?: boolean,
    limit?: number,       // max 100
    cursor?: string
  }
}

// orbispm_get_task
{
  name: "orbispm_get_task",
  description: "Get full details of a task including subtasks, comments, dependencies",
  inputSchema: {
    task_id: string,
    include?: ("subtasks" | "comments" | "dependencies" | "watchers" | "attachments")[]
  }
}

// orbispm_create_task
{
  name: "orbispm_create_task",
  description: "Create a new task. Can parse natural language for fields.",
  inputSchema: {
    project_id: string,
    title: string,
    description?: string,
    status?: TaskStatus,
    priority?: Priority,
    assignee_ids?: string[],
    due_date?: string,
    start_date?: string,
    estimated_hours?: number,
    labels?: string[],
    parent_task_id?: string,
    checklist_items?: string[]
  }
}

// orbispm_update_task
// orbispm_delete_task
// orbispm_transition_task   — change status with optional comment
// orbispm_assign_task       — assign/unassign members
// orbispm_bulk_update_tasks — update multiple tasks at once

// orbispm_add_comment
{
  name: "orbispm_add_comment",
  description: "Add a comment to a task",
  inputSchema: { task_id: string, content: string, parent_comment_id?: string }
}

// orbispm_create_subtask_tree
{
  name: "orbispm_create_subtask_tree",
  description: "Create a task with a full subtask hierarchy in one call",
  inputSchema: {
    project_id: string,
    title: string,
    subtasks: SubtaskNode[]  // recursive tree
  }
}
```

#### Project Tools

```typescript
// orbispm_list_projects
// orbispm_get_project        — includes dashboard stats
// orbispm_create_project
// orbispm_update_project
// orbispm_archive_project
// orbispm_get_project_analytics  — burndown, velocity, CFD, risk
// orbispm_export_project      — export tasks as CSV or JSON
// orbispm_invite_project_member
```

#### Team Tools

```typescript
// orbispm_list_teams
// orbispm_get_team            — includes members, workload
// orbispm_create_team
// orbispm_add_team_member
// orbispm_get_team_analytics
```

#### Member / People Tools

```typescript
// orbispm_list_members        — list org members
// orbispm_get_member          — profile + current workload + assignments
// orbispm_get_my_tasks        — tasks assigned to the authenticated user
// orbispm_get_member_analytics — performance metrics for a member
// orbispm_invite_member       — send invitation
```

#### Search & Discovery Tools

```typescript
// orbispm_search
{
  name: "orbispm_search",
  description: "Semantic + keyword search across tasks, projects, comments, members",
  inputSchema: {
    query: string,
    types?: ("task" | "project" | "comment" | "member")[],
    project_id?: string,
    date_range?: string,  // "last_7d" | "last_30d" | ISO range
    limit?: number
  }
}

// orbispm_find_tasks_by_description — vector similarity search
// orbispm_get_blocked_tasks
// orbispm_get_overdue_tasks
// orbispm_get_tasks_by_risk_score
```

#### AI Tools

```typescript
// orbispm_ai_decompose_task
{
  name: "orbispm_ai_decompose_task",
  description: "Use AI to decompose a task into subtasks with estimates and dependencies",
  inputSchema: { task_id: string, depth?: number, auto_create?: boolean }
}

// orbispm_ai_plan_sprint
{
  name: "orbispm_ai_plan_sprint",
  description: "Generate an AI-optimized sprint plan from the backlog",
  inputSchema: {
    project_id: string,
    sprint_duration_days?: number,
    team_id?: string,
    include_task_ids?: string[]  // force-include specific tasks
  }
}

// orbispm_ai_parse_natural_language
{
  name: "orbispm_ai_parse_natural_language",
  description: "Parse a natural language description into structured task fields",
  inputSchema: { text: string, project_id?: string }
}

// orbispm_ai_get_risk_report
// orbispm_ai_suggest_assignees
// orbispm_ai_generate_retrospective
// orbispm_ai_detect_dependencies
```

#### Analytics Tools

```typescript
// orbispm_get_org_overview
{
  name: "orbispm_get_org_overview",
  description: "Get org-level health score, velocity, active projects, alerts",
  inputSchema: { org_id?: string }  // defaults to authenticated user's org
}

// orbispm_get_project_burndown
// orbispm_get_team_velocity
// orbispm_get_workload_distribution   — who is over/under-allocated
// orbispm_get_performance_report
// orbispm_get_metric_alerts           — active alerts and risks
```

#### Notification Tools

```typescript
// orbispm_list_notifications
// orbispm_mark_notification_read
// orbispm_create_announcement
```

#### Integration Tools

```typescript
// orbispm_list_integrations
// orbispm_trigger_sync      — manually trigger a provider sync
// orbispm_create_meeting    — create Google Meet/Zoom from a task
```

#### Admin Tools (requires `admin:*` scope)

```typescript
// orbispm_manage_members    — bulk invite, role changes
// orbispm_get_audit_log     — activity log with filters
// orbispm_manage_webhooks
// orbispm_manage_api_keys
// orbispm_get_billing_usage
```

### 7.4 MCP Resources

MCP Resources expose read-only structured data via URI scheme:

```
task://{orgSlug}/{taskId}           — full task object
project://{orgSlug}/{projectId}     — project with stats
team://{orgSlug}/{teamId}           — team roster
member://{orgSlug}/{userId}         — member profile
org://{orgSlug}                     — org overview
sprint://{orgSlug}/{projectId}/current  — current sprint state
```

Example resource content for `task://acme/task_01j...`:
```json
{
  "id": "task_01j...",
  "title": "Implement Stripe webhooks",
  "status": "in_progress",
  "priority": "high",
  "assignees": [{"name": "Alice Chen", "email": "alice@acme.com"}],
  "due_date": "2026-04-15",
  "estimated_hours": 8,
  "actual_hours": 3.5,
  "subtasks": [...],
  "comments": [...],
  "dependencies": [...],
  "risk_score": 0.72,
  "risk_reason": "78% of similar tasks exceeded estimate"
}
```

### 7.5 MCP Prompts

Pre-built guided workflows exposed as MCP prompts:

```typescript
// orbispm://prompts/daily-standup
// "Generate my daily standup based on yesterday's activity and today's tasks"

// orbispm://prompts/sprint-planning
// "Help me plan the next 2-week sprint for project {projectId}"

// orbispm://prompts/risk-review
// "Review the current risk state of all active projects and flag critical issues"

// orbispm://prompts/retrospective
// "Run a sprint retrospective for project {projectId} sprint {sprintId}"

// orbispm://prompts/meeting-to-tasks
// "Extract action items from this meeting transcript and create tasks"

// orbispm://prompts/onboard-member
// "Onboard {name} to project {projectId}: create intro tasks, assign to team"

// orbispm://prompts/project-status-report
// "Generate a status report for project {projectId} for stakeholders"
```

### 7.6 Hosted MCP Server

For teams that don't want to run the CLI locally, host the MCP server as a managed service:

**URL**: `https://mcp.orbispm.io/sse`

**Auth**: OAuth 2.0 Authorization Code flow (user authorizes via browser, token stored in MCP client).

Supports **multi-org context** — one token, all orgs the user has access to.

**Claude.ai integration**: Submit to Anthropic's hosted MCP connector directory for one-click add from Claude.ai settings.

---

## 8. Infrastructure & Platform Changes

### 8.1 API Gateway (Kong) Enhancements

New Kong plugins required:
- `rate-limiting-advanced` (Redis-backed token bucket per org/user)
- `oauth2` (OAuth 2.0 provider for 3rd-party apps)
- `openid-connect` (JWT validation for external IdPs)
- `request-transformer` (add `X-Org-ID` from API key lookup)
- `cors` (granular CORS for public API)
- `prometheus` (API metrics per route)

New Kong routes:
```yaml
# Public API v2
- name: api-v2
  paths: ["/v2"]
  service: orbis-backend-v2
  plugins:
    - rate-limiting-advanced
    - prometheus
    - cors

# GraphQL
- name: graphql
  paths: ["/v2/graphql"]
  service: orbis-backend-graphql

# SCIM
- name: scim
  paths: ["/v2/scim"]
  service: orbis-backend
  plugins:
    - key-auth

# MCP HTTP
- name: mcp
  paths: ["/mcp"]
  service: orbis-mcp-service
```

### 8.2 New Microservices

| Service | Language | Responsibility |
|---|---|---|
| `mcp-server` | Go | MCP server (stdio + HTTP/SSE) |
| `ai-service` | Go | AI pipeline orchestration, embedding management |
| `integration-service` | Go | 3rd-party integration sync workers, webhook receiver |
| `identity-service` | Go | SAML SP, SCIM endpoint, SSO config management |
| `ml-service` | Python | Risk prediction model serving (ONNX/scikit-learn) |

### 8.3 Database Additions Summary

All new tables listed throughout this document, plus:

```sql
-- pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Credential encryption for integrations
-- Encrypted JSONB using pg_sodium or app-level AES-256-GCM

-- Partitioning for high-volume tables
CREATE TABLE ai_embeddings_2026 PARTITION OF ai_embeddings
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE integration_sync_log_2026 PARTITION OF integration_sync_log
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

### 8.4 Security Additions

- **Secrets management**: HashiCorp Vault or AWS Secrets Manager for all integration credentials
- **Audit logging expansion**: All API v2 calls logged to `audit_log` table (actor, ip, user_agent, endpoint, status)
- **SIEM integration**: Audit log stream to Splunk / Datadog / Elastic via syslog
- **CSP headers**: Enhanced Content-Security-Policy for frontend
- **API key rotation**: Automated rotation reminders, zero-downtime rotation flow

---

## 9. Implementation Roadmap

### Phase 1 — Foundation (Q2 2026)
> Build the plumbing that everything else depends on

- [ ] OAuth social login connectors (Google, GitHub, Microsoft) via Zitadel
- [ ] SAML 2.0 SP via Zitadel (Okta + Azure AD priority)
- [ ] SCIM 2.0 provisioning endpoint
- [ ] JIT provisioning + group-to-role mapping
- [ ] Public REST API v2 (tasks, projects, teams, members, search)
- [ ] API key scopes expansion + PAT (Personal Access Token) support
- [ ] OAuth 2.0 authorization server (client credentials + authorization code)
- [ ] Webhook delivery logs + retry UI
- [ ] MCP server v0.1 (core task/project/search tools, stdio transport)
- [ ] pgvector extension + embedding pipeline (Asynq worker)

### Phase 2 — Core Integrations (Q3 2026)
> Connect to the tools teams already use

- [ ] GitHub integration (issues ↔ tasks, PR ↔ task, commit links)
- [ ] GitLab integration (parity with GitHub)
- [ ] Jira bidirectional sync (import + real-time webhook sync)
- [ ] Slack integration (slash commands, link unfurling, notifications)
- [ ] Google Calendar sync (task due dates ↔ events)
- [ ] Google Drive file attachment
- [ ] AI: natural language task creation
- [ ] AI: task decomposition
- [ ] AI: semantic search (hybrid keyword + vector)
- [ ] MCP server v0.5 (all task/project tools, AI tools, HTTP/SSE transport)
- [ ] GraphQL API v2
- [ ] Zapier / Make connectors

### Phase 3 — Advanced AI (Q4 2026)
> Make AI ambient throughout the platform

- [ ] AI sprint planner (with Monte Carlo completion forecast)
- [ ] Predictive risk engine (background worker + ML model)
- [ ] Auto-assignment intelligence
- [ ] Meeting intelligence (transcript → action items)
- [ ] AI code review integration (GitHub + GitLab)
- [ ] Dependency auto-detection
- [ ] AI weekly summary / retrospective generator
- [ ] Anomaly detection in project metrics
- [ ] AI document generation (PRD, spec, release notes)
- [ ] AI-powered import mapping
- [ ] Hosted MCP server (mcp.orbispm.io)
- [ ] MCP server v1.0 (all tools, prompts, resources, OAuth auth)

### Phase 4 — Enterprise & Ecosystem (Q1 2027)
> Complete enterprise feature set and partner ecosystem

- [ ] Microsoft Teams integration (bot, adaptive cards, meetings)
- [ ] Zoom integration
- [ ] Linear / Asana / ClickUp migration wizards
- [ ] Confluence / Notion document linking
- [ ] Microsoft OneDrive / SharePoint
- [ ] Toggl / Harvest time tracking sync
- [ ] ODATA feed (Tableau / Power BI)
- [ ] Google Sheets live export
- [ ] Inbound email → task creation
- [ ] PagerDuty / Opsgenie alerting
- [ ] AI performance reviews (advisory)
- [ ] SDK release (TypeScript, Python, Go)
- [ ] Developer portal (docs, API explorer, app registration)
- [ ] n8n community node
- [ ] Apple / LinkedIn social login
- [ ] IP allowlist + session lifetime policies
- [ ] Air-gapped deployment mode (no external AI calls)
- [ ] SOC 2 Type II controls alignment

---

## 10. Database Schema Additions

Complete list of new tables required (DDL summary):

```sql
-- SSO & Identity
org_sso_configs          — SSO provider config per org
sso_group_role_mappings  — SAML group → OrbisPM role
org_security_policies    — MFA enforcement, session policy
scim_tokens              — SCIM bearer tokens

-- Integrations
org_integrations         — per-org integration registry
integration_field_mappings — custom field mapping
integration_sync_log     — sync audit trail

-- AI
ai_embeddings            — pgvector embeddings (task, project, comment)
org_ai_settings          — per-org AI configuration and feature flags
org_ai_usage             — token usage and cost tracking
ai_suggestions           — pending AI suggestions (decompose, assign, deps)
meeting_transcripts      — stored meeting transcripts for processing

-- API
oauth_clients            — registered OAuth 2.0 apps
oauth_tokens             — access/refresh token store
personal_access_tokens   — PATs (scoped, expirable)
api_rate_limit_overrides — per-org/client rate limit customization
audit_log                — full API access audit trail

-- Enhanced analytics
task_time_logs           — time tracking entries (timer start/stop)
sprint_history           — completed sprint snapshots
```

---

*This document represents the complete future vision for OrbisPM. Implementation should follow the phased roadmap, with each phase building on the foundation of the previous one. All features should be shipped behind feature flags (`org_ai_settings.allowed_features`, `org_integrations.status`) to allow gradual rollout and per-org control.*
