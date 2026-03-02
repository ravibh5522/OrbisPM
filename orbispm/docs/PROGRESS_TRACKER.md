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

## Future Roadmap

| Version | Feature | Status |
|---------|---------|--------|
| v0.3.0 | AI-powered task review (LLM) | 🔮 Planned |
| v0.3.0 | MCP Server integration | 🔮 Planned |
| v0.4.0 | Slack/Discord/Teams notifications | 🔮 Planned |
| v0.5.0 | Advanced dashboards + widgets | 🔮 Planned |
| v1.0.0 | Production release | 🔮 Planned |

---

## Architecture Decisions Log

| # | Decision | Date | Rationale |
|---|----------|------|-----------|
| ADR-001 | DB-driven roles instead of hardcoded constants | 2026-03 | Allows admin to create/modify roles without code changes |
| ADR-002 | Review pipeline as `task_change_requests` table | 2026-03 | Enables field-level review, audit trail, async approval |
| ADR-003 | Multi-team projects via `project_teams` join table | 2026-03 | Projects can span multiple teams, users inherit highest team role |
| ADR-004 | Permission resolution: project → team → org fallback | 2026-03 | Eliminates need to manually add every team member as project member |
| ADR-005 | Configurable `reviewable_fields` per project | 2026-03 | Review is opt-in, not forced; each project controls its own workflow |
