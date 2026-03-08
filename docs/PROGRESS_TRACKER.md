# OrbisPM — Project Implementation Tracker

> Auto-generated tracking document. Updated as implementation progresses.
> **Base reference**: `docs/PROJECT.md` (architecture & features) · `docs/TEAM_PROJECT_RBAC_IMPLEMENTATION.md` (implementation plan)

---

## Historical Milestones (Completed)

| Date | Milestone | Details |
|------|-----------|---------|
| 2025-12 | **v0.1.0-alpha — Foundation** | Initial schema (000001), RLS policies (000002), seed plans (000003), Go backend with 4-layer DAO, Next.js frontend |
| 2026-01 | **Task depth limit** | Migration 000004 — max depth reduced from 5 to 3 |
| 2026-01 | **Recurring tasks** | Migration 000005 — recurrence_rule, recurrence_parent_id, next_occurrence columns |
| 2026-02 | **Preview panel & permissions** | Fixed preview panel 25% width, column gaps, getAccessControl role mapping |
| 2026-02 | **Billing fix** | Fixed API URLs in frontend api.ts (added /billing/ prefix) |
| 2026-02 | **Avatar/Logo uploads** | Added MinIOPublicURL config, set bucket public-read policy, updated docker-compose |
| 2026-03 | **Implementation plan v2** | Redesigned for review-gated workflows + DB-driven modular RBAC |
| 2026-03 | **v0.2.0 — Review Pipeline & RBAC** | All 38 tasks complete: DB migration 000006, 4 new repos, 4 new services, permission resolver, 3 new handlers, middleware rewrite, full frontend integration, 49 backend tests passing |

---

## v0.2.0: Review Pipeline & Modular RBAC — ✅ COMPLETE

### Phase 1: Database Migration (000006) — ✅
| Task | Status | Files |
|------|--------|-------|
| 1. `permissions` + `roles` + `role_permissions` tables | ✅ Done | `000006_permission_system.up.sql` |
| 2. `project_teams` + `task_change_requests` tables | ✅ Done | Same migration |
| 3. Seed system roles + role_permissions per org | ✅ Done | Same migration |
| 4. Add `reviewable_fields` default to project settings | ✅ Done | Same migration |

### Phase 2: Backend Domain Models — ✅
| Task | Status | Files |
|------|--------|-------|
| 5. `Permission`, `Role`, `RolePermission` types | ✅ Done | `domain/permission.go` |
| 6. `TaskChangeRequest` type + event constants | ✅ Done | `domain/change_request.go`, `domain/events.go` |
| 7. Update `Project`, `ProjectMember`, `roles.go` | ✅ Done | `domain/project.go`, `domain/roles.go` |

### Phase 3: Backend Repository Layer — ✅
| Task | Status | Files |
|------|--------|-------|
| 8. `PermissionRepository` | ✅ Done | `repository/permission_repo.go` |
| 9. `RoleRepository` | ✅ Done | `repository/role_repo.go` |
| 10. `ProjectTeamRepository` | ✅ Done | `repository/project_team_repo.go` |
| 11. `TaskChangeRequestRepository` | ✅ Done | `repository/change_request_repo.go` |
| 12. Update `ProjectRepository` (team filter) | ✅ Done | `repository/project_repo.go` |
| 13. Update `ProjectMemberRepository` (effective members) | ✅ Done | `repository/project_member_repo.go` |

### Phase 4: Backend Service Layer — ✅
| Task | Status | Files |
|------|--------|-------|
| 14. `PermissionService` | ✅ Done | `service/permission_service.go` |
| 15. `PermissionResolver` | ✅ Done | `service/permission_resolver.go` |
| 16. `ProjectTeamService` | ✅ Done | `service/project_team_service.go` |
| 17. `TaskChangeRequestService` | ✅ Done | `service/change_request_service.go` |
| 18. Update `TaskService.Update` (review pipeline) | ✅ Done | `service/task_service.go` |
| 19. Update `ProjectService` (multi-team) | ✅ Done | `service/project_service.go` |
| 20. Wire `PermissionService` (replaces CustomRoleService for new RBAC) | ✅ Done | `cmd/api/main.go` |

### Phase 5: Backend Handlers & Middleware — ✅
| Task | Status | Files |
|------|--------|-------|
| 21. `PermissionHandler` | ✅ Done | `handler/permission_handler.go` |
| 22. `ProjectTeamHandler` | ✅ Done | `handler/project_team_handler.go` |
| 23. `ChangeRequestHandler` | ✅ Done | `handler/change_request_handler.go` |
| 24. Rewrite RBAC middleware | ✅ Done | `middleware/rbac.go` |
| 25. Wire in `main.go` | ✅ Done | `cmd/api/main.go` |

### Phase 6: Frontend — Permission Management — ✅
| Task | Status | Files |
|------|--------|-------|
| 26. API client updates | ✅ Done | `lib/api.ts` |
| 27. TypeScript types | ✅ Done | `types/domain.ts` |
| 28. Permission management page | ✅ Done | `settings/permissions/page.tsx` |

### Phase 7: Frontend — Project & Team — ✅
| Task | Status | Files |
|------|--------|-------|
| 29. Multi-team project creation + team filter | ✅ Done | `projects/page.tsx` |
| 30. Project teams tab + reviewable fields settings | ✅ Done | `projects/[projectId]/page.tsx`, `project-settings.tsx` |
| 31. Effective members with source badges | ✅ Done | `projects/[projectId]/page.tsx` |

### Phase 8: Frontend — Review Pipeline — ✅
| Task | Status | Files |
|------|--------|-------|
| 32. Task inline review toast + sidebar | ✅ Done | `tasks/[taskId]/page.tsx` |
| 33. Task change request components | ✅ Done | `components/tasks/change-requests.tsx` |
| 34. Project reviews tab | ✅ Done | `projects/[projectId]/page.tsx` |

### Phase 9: Permission Hook & Guards — ✅
| Task | Status | Files |
|------|--------|-------|
| 35. Rewrite `usePermissions` hook + PermissionGate/RequireAdmin | ✅ Done | `use-permissions.ts`, `permission-gate.tsx`, 9 page guards |

### Phase 10: Testing & Cleanup — ✅
| Task | Status | Files |
|------|--------|-------|
| 36. Backend unit tests (49 tests passing) | ✅ Done | `service/permission_resolver_test.go`, `service/task_helpers_test.go`, `service/helpers_export_test.go` |
| 37. Frontend guards verified on all pages | ✅ Done | All settings, projects, templates pages |
| 38. `custom_roles` deprecated (new `roles` table active) | ✅ Done | Migration 000006 + `PermissionService` |

---

## Current Architecture Summary (as of v0.2.0)

### Backend (Go)
| Component | Details |
|-----------|---------|
| **Entry point** | `cmd/api/main.go` — single binary serving HTTP, WebSocket, and Asynq worker |
| **Router** | Chi v5 with nested route groups under `/api/v1` |
| **Auth** | Zitadel v4 (OIDC + gRPC) — JWT validation, user sync, MFA (TOTP/OTP/SMS) |
| **Database** | PostgreSQL 16+ with RLS via `set_config('app.current_org_id', ...)` in TxManager |
| **Cache / PubSub** | Redis 7 — rate limiting, event bus (Pub/Sub), Asynq task queue |
| **Storage** | MinIO (S3-compatible) — attachments, avatars, logos via pre-signed URLs |
| **Search** | Meilisearch v1.7 — full-text search indexing for tasks |
| **Email** | SMTP via Mailpit (dev) — notification emails, mention alerts |
| **Realtime** | Org-level WebSocket hub (nhooyr.io/websocket) with project room multiplexing |
| **Metrics** | Prometheus — HTTP duration, request counts, DB pool stats, WebSocket connections |

### Backend Layers
| Layer | Package | Files | Purpose |
|-------|---------|-------|---------|
| Domain | `internal/domain/` | 19 files | Pure structs (Task, Org, Project, etc.), error types, event constants |
| Repository | `internal/repository/` | 29 files | SQL queries (pgx), interfaces, TxManager, no business logic |
| Service | `internal/service/` | 25 files | Business logic, tx orchestration, event publishing, worker enqueue |
| Handler | `internal/handler/` | 31 files | HTTP request/response, validation, route mounting |
| Middleware | `internal/middleware/` | 11 files | Auth, RBAC, RLS tenant, rate limit, CORS, metrics, cache control |
| Auth | `internal/auth/` | 2 files | Zitadel gRPC client, GoTrue client (build-tagged) |
| WebSocket | `internal/websocket/` | 3 files | OrgHub, OrgConn, WritePump, project room management |
| Worker | `internal/worker/` | 2 files | Asynq task types, handler registration (activity, search, email, recurring) |
| EventBus | `internal/eventbus/` | 2 files | Redis Pub/Sub publisher/subscriber |
| Storage | `internal/storage/` | 1 file | MinIO client (upload, download, pre-signed URL, delete) |
| Search | `internal/search/` | 1 file | Meilisearch client (index, search, health) |
| Email | `internal/email/` | 1 file | SMTP sender with HTML template |
| Metrics | `internal/metrics/` | 1 file | Prometheus gauge/histogram/counter definitions |
| Pkg | `internal/pkg/tenant/` | 1 file | Context helpers (SetOrgID, SetUserID, SetEmail) |

### Frontend (Next.js 15)
| Component | Details |
|-----------|---------|
| **Framework** | Next.js 15 App Router, React 19, TypeScript strict |
| **Styling** | Tailwind CSS 4 + DaisyUI 5 |
| **State** | Zustand (auth, project-task, UI stores) + TanStack Query v5 |
| **Forms** | React Hook Form + Zod validation |
| **Editor** | Tiptap (rich text with mentions, code blocks, links) |
| **Charts** | Recharts (dashboard analytics) |
| **DnD** | @dnd-kit (task reordering) |
| **Realtime** | Custom WebSocket client with request-response + broadcasts |
| **Auth** | localStorage JWT tokens, auto-refresh, Zitadel proxy endpoints |

### Frontend Routes (18 pages)
| Route | Purpose |
|-------|---------|
| `/login`, `/signup` | Auth pages (Zitadel-backed) |
| `/onboarding` | First-time org creation |
| `/[orgSlug]` | Org dashboard |
| `/[orgSlug]/projects` | Project list with team filter |
| `/[orgSlug]/projects/[id]` | Project board (tasks, members, settings, teams, reviews, dashboard) |
| `/[orgSlug]/projects/[id]/tasks/[id]` | Task detail (checklists, comments, attachments, dependencies, watchers, change requests) |
| `/[orgSlug]/teams`, `/[orgSlug]/teams/[id]` | Team list and detail |
| `/[orgSlug]/my-tasks` | Personal task view |
| `/[orgSlug]/activity` | Org-wide audit log |
| `/[orgSlug]/search` | Full-text search |
| `/[orgSlug]/templates` | Task templates |
| `/[orgSlug]/notifications` | Notification center |
| `/[orgSlug]/profile` | User profile + MFA settings |
| `/[orgSlug]/settings` | Org settings (members, roles, permissions, webhooks, API keys, billing) |
| `/landing` | Marketing page |

### Database Schema (12 migrations)
| Migration | Tables Created |
|-----------|---------------|
| 000001 | orgs, teams, projects, tasks, checklists, task_rules, task_templates, comments, attachments, activity_log, notifications, org_members, team_members, project_members, task_dependencies, task_watchers, webhooks, api_keys, import_jobs, notification_preferences, billing_plans, org_subscriptions, custom_roles |
| 000002 | RLS policies on all tenant-scoped tables |
| 000003 | Seed billing plans (free, pro, enterprise) |
| 000004 | Task depth limit reduced (CHECK depth >= 0 AND depth <= 3) |
| 000005 | Recurring tasks (recurrence_rule, next_occurrence columns) |
| 000006 | Permission system (permissions, roles, role_permissions, project_teams, task_change_requests) |
| 000007 | Change request attachments (FK on attachments table) |
| 000008 | User profiles (users table for display_name/email caching) |
| 000009 | Extended user profile (avatar_url, bio, job_title, department, timezone, language, theme) |

### API Endpoints (~80 endpoints)
| Category | Count | Examples |
|----------|-------|---------|
| Auth | 12 | signup, login, refresh, logout, getUser, updateUser, MFA (TOTP/OTP), social/IDP |
| Orgs | 7 | CRUD, members, invite, role update |
| Teams | 6 | CRUD, members |
| Projects | 8 | CRUD, members, dashboard, teams |
| Tasks | 14 | CRUD, tree, list, bulk update, reorder, duplicate, review, complete, export, calendar |
| Sub-resources | 15 | Checklists, comments, rules, attachments, dependencies, watchers |
| Change Requests | 5 | Create, list, approve, reject |
| Permissions | 6 | List permissions, roles, CRUD roles, set role permissions |
| Settings | 8 | Webhooks, API keys, custom roles, notification prefs |
| Billing | 3 | Plans, checkout, portal + webhook |
| Search | 1 | Full-text search |
| Dashboard | 3 | Org, project, my-tasks dashboard |
| Realtime | 2 | WebSocket, presence |
| Other | 3 | Health, contact form, uploads |

---

## Future Roadmap

| Version | Feature | Status |
|---------|---------|--------|
| v0.3.0 | AI-powered task review (LLM) | 🔮 Planned |
| v0.3.0 | MCP Server integration | 🔮 Planned |
| v0.3.0 | Offline-first (PWA + IndexedDB) | 🔮 Planned |
| v0.4.0 | Slack/Discord/Teams notifications | 🔮 Planned |
| v0.5.0 | Advanced dashboards + widgets | 🔮 Planned |
| v0.5.0 | Gantt charts & timeline views | 🔮 Planned |
| v1.0.0 | Production release + SSO/SAML | 🔮 Planned |

---

## Architecture Decisions Log

| # | Decision | Date | Rationale |
|---|----------|------|-----------|
| ADR-001 | DB-driven roles instead of hardcoded constants | 2026-03 | Allows admin to create/modify roles without code changes |
| ADR-002 | Review pipeline as `task_change_requests` table | 2026-03 | Enables field-level review, audit trail, async approval |
| ADR-003 | Multi-team projects via `project_teams` join table | 2026-03 | Projects can span multiple teams, users inherit highest team role |
| ADR-004 | Permission resolution: project → team → org fallback | 2026-03 | Eliminates need to manually add every team member as project member |
| ADR-005 | Configurable `reviewable_fields` per project | 2026-03 | Review is opt-in, not forced; each project controls its own workflow |
| ADR-006 | Zitadel v4 over GoTrue/Supabase Auth | 2026-02 | Full OIDC, gRPC management API, built-in MFA, social login |
| ADR-007 | Single org-level WebSocket replacing SSE + per-project WS | 2026-03 | Reduces connection count, single auth check, project rooms via multiplexing |
| ADR-008 | DaisyUI over Shadcn/UI for component library | 2026-02 | Faster prototyping with Tailwind CSS 4 native support |
| ADR-009 | Zustand over React Context for client state | 2026-02 | Simpler API, better performance, no provider nesting |
| ADR-010 | Kong API Gateway for routing and rate limiting | 2026-01 | Cleanly separates API gateway concerns from backend code |
