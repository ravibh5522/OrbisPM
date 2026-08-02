# RBAC Permission Matrix — Live Seeded Data

Generated 2026-08-02 12:37:47 against `http://localhost:8000/api/v1`. Every org gets this same system-role seed — this is the real baseline every custom role is layered on top of.

**Total canonical permissions:** 81


## Org scope

System roles: **Admin**, **Billing Admin**, **Member**, **Owner**, **Viewer**


| Resource | Action | Admin | Billing Admin | Member | Owner | Viewer |
|---|---|---|---|---|---|---|
| announcements | create | ✅ | — | — | ✅ | — |
| announcements | delete | ✅ | — | — | ✅ | — |
| announcements | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| announcements | update | ✅ | — | — | ✅ | — |
| api_keys | manage | ✅ | — | — | ✅ | — |
| attachments | create | ✅ | — | ✅ | ✅ | — |
| attachments | delete | ✅ | — | ✅ | ✅ | — |
| attachments | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| billing | manage | ✅ | ✅ | — | ✅ | — |
| billing | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| checklists | create | ✅ | — | ✅ | ✅ | — |
| checklists | delete | ✅ | — | ✅ | ✅ | — |
| checklists | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| checklists | update | ✅ | — | ✅ | ✅ | — |
| comments | create | ✅ | — | ✅ | ✅ | — |
| comments | delete | ✅ | — | ✅ | ✅ | — |
| comments | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| comments | update | ✅ | — | ✅ | ✅ | — |
| imports | manage | ✅ | — | — | ✅ | — |
| org | delete | — | — | — | ✅ | — |
| org | manage_members | ✅ | — | — | ✅ | — |
| org | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| org | transfer_ownership | — | — | — | ✅ | — |
| org | update | ✅ | — | — | ✅ | — |
| projects | create | ✅ | — | — | ✅ | — |
| projects | delete | ✅ | — | — | ✅ | — |
| projects | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| projects | update | ✅ | — | — | ✅ | — |
| roles | create | ✅ | — | — | ✅ | — |
| roles | delete | ✅ | — | — | ✅ | — |
| roles | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| roles | update | ✅ | — | — | ✅ | — |
| tasks | create | ✅ | — | ✅ | ✅ | — |
| tasks | delete | ✅ | — | ✅ | ✅ | — |
| tasks | direct_update | ✅ | — | ✅ | ✅ | — |
| tasks | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| tasks | review | ✅ | — | ✅ | ✅ | — |
| tasks | update | ✅ | — | ✅ | ✅ | — |
| teams | create | ✅ | — | — | ✅ | — |
| teams | delete | ✅ | — | — | ✅ | — |
| teams | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| teams | update | ✅ | — | — | ✅ | — |
| templates | create | ✅ | — | — | ✅ | — |
| templates | delete | ✅ | — | — | ✅ | — |
| templates | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| templates | update | ✅ | — | — | ✅ | — |
| webhooks | manage | ✅ | — | — | ✅ | — |

## Team scope

System roles: **Member**, **Team Lead**, **Viewer**


| Resource | Action | Member | Team Lead | Viewer |
|---|---|---|---|---|
| comments | create | ✅ | ✅ | — |
| comments | read | ✅ | ✅ | ✅ |
| projects | create | ✅ | ✅ | — |
| projects | read | ✅ | ✅ | ✅ |
| tasks | create | ✅ | ✅ | — |
| tasks | delete | — | ✅ | — |
| tasks | direct_update | — | ✅ | — |
| tasks | read | ✅ | ✅ | ✅ |
| tasks | review | — | ✅ | — |
| tasks | update | ✅ | ✅ | — |
| team | manage_members | — | ✅ | — |
| team | read | ✅ | ✅ | ✅ |
| team | update | ✅ | ✅ | — |

## Project scope

System roles: **Contributor**, **Observer**, **Project Lead**, **Reviewer**


| Resource | Action | Contributor | Observer | Project Lead | Reviewer |
|---|---|---|---|---|---|
| attachments | create | ✅ | — | ✅ | — |
| attachments | delete | ✅ | — | ✅ | — |
| attachments | read | ✅ | ✅ | ✅ | ✅ |
| checklists | create | ✅ | — | ✅ | — |
| checklists | delete | ✅ | — | ✅ | — |
| checklists | read | ✅ | ✅ | ✅ | ✅ |
| checklists | update | ✅ | — | ✅ | — |
| comments | create | ✅ | ✅ | ✅ | ✅ |
| comments | delete | ✅ | — | ✅ | — |
| comments | read | ✅ | ✅ | ✅ | ✅ |
| comments | update | ✅ | — | ✅ | — |
| members | manage | — | — | ✅ | — |
| project | delete | — | — | ✅ | — |
| project | read | ✅ | ✅ | ✅ | ✅ |
| project | update | — | — | ✅ | — |
| tasks | create | ✅ | — | ✅ | — |
| tasks | delete | — | — | ✅ | — |
| tasks | direct_update | — | — | ✅ | ✅ |
| tasks | read | ✅ | ✅ | ✅ | ✅ |
| tasks | review | — | — | ✅ | ✅ |
| tasks | update | ✅ | — | ✅ | — |
