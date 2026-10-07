# OrbisPM — Feature Inventory

Built by reading the actual route tree (`backend/cmd/api/main.go`), the frontend page structure (`frontend/src/app/`), and each feature area's component/service directory — not from marketing copy. This is what's actually wired up in code today.

---

## 1. Organizations
- Create / get / update / delete org
- Member invite (by email or user ID), list, update role, remove
- Org-level dashboard
- Settings: Organisation, Members, Billing, Roles & Permissions, Webhooks, API Keys, Email Templates, Theme (8 tabs)

## 2. Authentication & Identity
- Signup / login / logout (Zitadel-backed)
- Token refresh
- SSO / IDP login (`StartIDPLogin`, OIDC callback page)
- Complete-profile flow (post-SSO)
- Centralized identity resolution (Zitadel ID → internal UUID, shared across services)

## 3. RBAC — Roles & Permissions
- DB-driven roles at 3 scopes: org, team, project
- System roles (5 org / 2 team / 4 project) + unlimited custom roles per scope
- Permission catalog (resource × action, wildcard support)
- Role CRUD, permission assignment per role
- Team → project role inheritance map (configurable per org)
- Per-scope effective-permission self-check (`/my-permissions`)
- Legacy `CustomRoles` sub-system (deprecated, still mounted, not used by the active resolver)

## 4. Teams
- Create / get / update / delete
- Member add / update role / remove
- Team manager assignment
- Team dashboard, team analytics
- Multi-team ↔ project linking (a project can have several teams; eligible-members resolution across linked teams)

## 5. Projects
- Create / get / update / delete
- Members: list / add / update role / remove / preview-remove
- Project dashboard, project analytics
- Project-team linking (link/unlink, eligible members, unlink preview)
- Project settings (statuses, review pipeline config, reviewable fields)
- Project announcements
- Project canvas (freeform canvas per project, create/get/update/delete canvases)
- CSV/XLSX imports into a project (task import jobs)

## 6. Tasks (the core work-item engine)
- CRUD, tree view (hierarchical/sub-tasks), bulk update, reorder, duplicate
- Export: CSV export, iCal (`calendar.ics`) export
- Checklists (sub-items per task)
- Comments (create/list/delete)
- Attachments (upload/list/delete, plus attachments on change requests)
- Dependencies (task-to-task links)
- Watchers (watch/unwatch, self-service)
- Rules engine (`task_rules` — e.g. all-checklists-done, reviewer-approved gating)
- Recurrence (recurring task generation)
- Time tracking
- Three views: Kanban (columns), List, Tree — each with its own drag/reorder/inline-edit behavior
- Review pipeline: submit-for-review, mark-complete, designated approvers
- Change Requests: propose / approve / reject, per-task and per-project change-request queues, diff/changes view, review notes

## 7. Calendar
- Org-wide calendar view, filters, color-coding by project/assignee
- Per-project iCal export/subscription

## 8. Messaging / Chat (separate `messaging-service`)
- Channels: create, list, header/info
- Messages: send, list, forward, saved/pinned messages
- Threads (reply-in-thread panel)
- Presence (online/typing indicators — `presenceHandler`)
- Channel-level permission hierarchy (separate hardcoded 5-tier: owner/admin/moderator/member/viewer — not part of the org/team/project RBAC system)
- Its own event bus (NATS) and WebSocket layer, independent Go service from the main API

## 9. Notifications
- User-scoped notification feed (org-independent)
- Notification preferences (per-user, per-org)
- Notification bell / real-time delivery
- Announcements (org/project-scoped broadcast messages)

## 10. Activity & Audit
- Org activity log/feed
- (Documented gap: no dedicated permission-change audit trail beyond generic activity log — see `RBAC_AUDIT.md` IMP-006)

## 11. Search
- Full-text search (Meilisearch-backed) across tasks/projects/comments
- Org-scoped search page

## 12. Sticky Notes
- Personal/shared sticky notes, CRUD (recently added feature per git history)

## 13. Templates
- Task templates (create/apply), template management page

## 14. Dashboard & Performance / Analytics
- Org dashboard, project dashboard, team dashboard
- Performance section with 4 sub-views: Members, Projects, Teams, Reports
- Charts components (shared charting layer)

## 15. Billing
- Plans/subscription management (Stripe-backed)
- Stripe webhook handling (signature-verified, no-auth endpoint)
- Billing settings tab

## 16. Developer / Integration Surface
- Webhooks: register/list/get/update/delete, event-based delivery
- API Keys: create/list/revoke, scoped access
- Imports: CSV/XLSX job-based import pipeline with column mapping

## 17. Email
- Transactional email (separate `email-service` + `email-worker`)
- Email templates (per-org customizable, settings tab + editor component)

## 18. Real-time Infrastructure
- WebSocket handler for task/CR live updates (per-project rooms)
- SSE endpoint for org-wide event streaming
- Org-level event hub / pub-sub

## 19. Offline Support
- Service worker registration, offline indicator, dedicated `/offline` page (PWA-style)

## 20. Marketing / Public Site
- Landing, About, Features, Pricing, Privacy, Terms, Contact (public form → DB)
- Blog (3 published posts)
- Competitor comparison pages: vs. Asana, Jira, Trello

## 21. Onboarding
- Post-signup onboarding flow (`/onboarding`)

## 22. Platform Operations (separate `monitoring/` stack, not customer-facing)
- Super-admin service (cross-org platform administration)
- Alerting service, collector service, log aggregator, tracing service, analytics DB
- Grafana / Prometheus / Loki / Tempo / cAdvisor / node-exporter — full observability stack

---

## Summary counts

| Layer | Count |
|---|---|
| Top-level feature areas (this list) | 22 |
| Settings sub-tabs | 8 |
| Task sub-features (checklists, comments, attachments, dependencies, watchers, rules, recurrence, time-tracking, change-requests) | 9 |
| Task views | 3 (Kanban / List / Tree) |
| Performance/Analytics sub-views | 4 |
| Separate backend services (beyond the main API) | 4 (messaging-service, email-service, email-worker, monitoring stack) |
| RBAC scopes | 3 (org / team / project) |

**Caveat:** this is a structural inventory (what routes/pages/components exist), not a maturity or quality assessment — some areas (e.g. the legacy `CustomRoles` sub-system, the channel-permission hierarchy) are present but flagged elsewhere as inconsistent with the main RBAC system. If you want a working-vs-broken pass over any of these areas the way we did for RBAC, that's a separate, deeper investigation per feature.
