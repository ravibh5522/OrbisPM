# RBAC Permission Matrix — Live Seeded Data + Custom Roles

Generated 2026-08-02 12:49:00 against `http://localhost:8000/api/v1`. Includes all system roles plus 6 representative custom roles created by this script (Template Manager, Read Only Auditor, Task Runner, Silent Observer, Field Tester, QA Approver), to confirm custom roles slot into the exact same permission model with no special-casing.

**Total canonical permissions:** 81


## Org scope

Custom roles in this scope:
- **Read Only Auditor** — Multi-resource read-only, hand-picked (not the seeded 'viewer' shape)
- **Template Manager** — Full CRUD on templates only — nothing else, not even tasks

| Resource | Action | Admin | Billing Admin | Member | Owner | Viewer | Read Only Auditor *(Custom)* | Template Manager *(Custom)* |
|---|---|---|---|---|---|---|---|---|
| announcements | create | ✅ | — | — | ✅ | — | — | — |
| announcements | delete | ✅ | — | — | ✅ | — | — | — |
| announcements | read | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| announcements | update | ✅ | — | — | ✅ | — | — | — |
| api_keys | manage | ✅ | — | — | ✅ | — | — | — |
| attachments | create | ✅ | — | ✅ | ✅ | — | — | — |
| attachments | delete | ✅ | — | ✅ | ✅ | — | — | — |
| attachments | read | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| billing | manage | ✅ | ✅ | — | ✅ | — | — | — |
| billing | read | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| checklists | create | ✅ | — | ✅ | ✅ | — | — | — |
| checklists | delete | ✅ | — | ✅ | ✅ | — | — | — |
| checklists | read | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| checklists | update | ✅ | — | ✅ | ✅ | — | — | — |
| comments | create | ✅ | — | ✅ | ✅ | — | — | — |
| comments | delete | ✅ | — | ✅ | ✅ | — | — | — |
| comments | read | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| comments | update | ✅ | — | ✅ | ✅ | — | — | — |
| imports | manage | ✅ | — | — | ✅ | — | — | — |
| org | delete | — | — | — | ✅ | — | — | — |
| org | manage_members | ✅ | — | — | ✅ | — | — | — |
| org | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| org | transfer_ownership | — | — | — | ✅ | — | — | — |
| org | update | ✅ | — | — | ✅ | — | — | — |
| projects | create | ✅ | — | — | ✅ | — | — | — |
| projects | delete | ✅ | — | — | ✅ | — | — | — |
| projects | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| projects | update | ✅ | — | — | ✅ | — | — | — |
| roles | create | ✅ | — | — | ✅ | — | — | — |
| roles | delete | ✅ | — | — | ✅ | — | — | — |
| roles | read | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| roles | update | ✅ | — | — | ✅ | — | — | — |
| tasks | create | ✅ | — | ✅ | ✅ | — | — | — |
| tasks | delete | ✅ | — | ✅ | ✅ | — | — | — |
| tasks | direct_update | ✅ | — | ✅ | ✅ | — | — | — |
| tasks | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| tasks | review | ✅ | — | ✅ | ✅ | — | — | — |
| tasks | update | ✅ | — | ✅ | ✅ | — | — | — |
| teams | create | ✅ | — | — | ✅ | — | — | — |
| teams | delete | ✅ | — | — | ✅ | — | — | — |
| teams | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| teams | update | ✅ | — | — | ✅ | — | — | — |
| templates | create | ✅ | — | — | ✅ | — | — | ✅ |
| templates | delete | ✅ | — | — | ✅ | — | — | ✅ |
| templates | read | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| templates | update | ✅ | — | — | ✅ | — | — | ✅ |
| webhooks | manage | ✅ | — | — | ✅ | — | — | — |

## Team scope

Custom roles in this scope:
- **Silent Observer** — Can see the team exists, nothing else — not even tasks:read
- **Task Runner** — Can work tasks, cannot see team settings or comment

| Resource | Action | Member | Team Lead | Viewer | Silent Observer *(Custom)* | Task Runner *(Custom)* |
|---|---|---|---|---|---|---|
| comments | create | ✅ | ✅ | — | — | — |
| comments | read | ✅ | ✅ | ✅ | — | — |
| projects | create | ✅ | ✅ | — | — | — |
| projects | read | ✅ | ✅ | ✅ | — | — |
| tasks | create | ✅ | ✅ | — | — | ✅ |
| tasks | delete | — | ✅ | — | — | — |
| tasks | direct_update | — | ✅ | — | — | — |
| tasks | read | ✅ | ✅ | ✅ | — | ✅ |
| tasks | review | — | ✅ | — | — | — |
| tasks | update | ✅ | ✅ | — | — | ✅ |
| team | manage_members | — | ✅ | — | — | — |
| team | read | ✅ | ✅ | ✅ | ✅ | — |
| team | update | ✅ | ✅ | — | — | — |

## Project scope

Custom roles in this scope:
- **Field Tester** — Has create, deliberately NO read — the my-permissions self-check edge case
- **QA Approver** — Narrower than the system 'reviewer' — no direct_update

| Resource | Action | Contributor | Observer | Project Lead | Reviewer | Field Tester *(Custom)* | QA Approver *(Custom)* |
|---|---|---|---|---|---|---|---|
| attachments | create | ✅ | — | ✅ | — | — | — |
| attachments | delete | ✅ | — | ✅ | — | — | — |
| attachments | read | ✅ | ✅ | ✅ | ✅ | — | — |
| checklists | create | ✅ | — | ✅ | — | — | — |
| checklists | delete | ✅ | — | ✅ | — | — | — |
| checklists | read | ✅ | ✅ | ✅ | ✅ | — | — |
| checklists | update | ✅ | — | ✅ | — | — | — |
| comments | create | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| comments | delete | ✅ | — | ✅ | — | — | — |
| comments | read | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| comments | update | ✅ | — | ✅ | — | — | — |
| members | manage | — | — | ✅ | — | — | — |
| project | delete | — | — | ✅ | — | — | — |
| project | read | ✅ | ✅ | ✅ | ✅ | — | — |
| project | update | — | — | ✅ | — | — | — |
| tasks | create | ✅ | — | ✅ | — | ✅ | — |
| tasks | delete | — | — | ✅ | — | — | — |
| tasks | direct_update | — | — | ✅ | ✅ | — | — |
| tasks | read | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| tasks | review | — | — | ✅ | ✅ | — | ✅ |
| tasks | update | ✅ | — | ✅ | — | — | — |
