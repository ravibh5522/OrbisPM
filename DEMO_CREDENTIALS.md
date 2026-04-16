# OrbisPM — Demo Credentials

## Quick Access

**Demo App URL:** https://orbispm.live  
**Demo Org:** Acme Corp (`/acme-corp`)  
**Direct URL:** https://orbispm.live/acme-corp

---

## 🔑 Active Demo Accounts (6 personas)

All demo accounts share the same password: **`Demo@Acme2026!`**

| Name | Email | Role | Job Title |
|------|-------|------|-----------|
| Sarah Chen | sarah.chen@acme.demo | **Owner** | VP of Engineering |
| Marcus Johnson | marcus.johnson@acme.demo | **Admin** | Engineering Manager |
| Priya Patel | priya.patel@acme.demo | **Member** | Senior Backend Engineer |
| Olivia Brown | olivia.brown@acme.demo | **Member** | Lead Designer |
| Mia Anderson | mia.anderson@acme.demo | **Member** | QA Lead |
| Mason Walker | mason.walker@acme.demo | **Billing Admin** | Finance |

### Persona Details

#### Sarah Chen — Owner
- **Email:** sarah.chen@acme.demo
- **Password:** Demo@Acme2026!
- **Org Role:** Owner (full access)
- **Team:** Backend Platform (Team Lead)
- **Project:** Project Phoenix (Lead)
- **UUID:** `6f7d5a5b-89a0-57ed-9bbf-87abf304b619`

#### Marcus Johnson — Admin
- **Email:** marcus.johnson@acme.demo
- **Password:** Demo@Acme2026!
- **Org Role:** Admin
- **Team:** Backend Platform (Team Lead)
- **Project:** Project Phoenix (Lead)
- **UUID:** `c1e107b4-8940-57cf-807a-f9035b2b69e5`

#### Priya Patel — Developer
- **Email:** priya.patel@acme.demo
- **Password:** Demo@Acme2026!
- **Org Role:** Member
- **Team:** Backend Platform (Member)
- **Project:** Project Phoenix (Contributor)
- **UUID:** `f1aea067-0b64-588e-98d7-bea1fe3dd97b`

#### Olivia Brown — Designer
- **Email:** olivia.brown@acme.demo
- **Password:** Demo@Acme2026!
- **Org Role:** Member
- **Team:** Frontend & Design (Team Lead)
- **Project:** Project Aurora (Lead)
- **UUID:** `eb1eec59-2452-52e0-b747-8582ac0d44a9`

#### Mia Anderson — QA Lead
- **Email:** mia.anderson@acme.demo
- **Password:** Demo@Acme2026!
- **Org Role:** Member
- **Team:** QA & Testing (Team Lead)
- **Project:** Project Aurora (Reviewer)
- **UUID:** `bf811534-5fcd-540b-8615-c56d750fc149`

#### Mason Walker — Billing Admin
- **Email:** mason.walker@acme.demo
- **Password:** Demo@Acme2026!
- **Org Role:** Billing Admin
- **Team:** None
- **Project:** Project Nebula (Observer)
- **UUID:** `fdaf4c29-5e18-5467-891d-4f34bfb22b89`

---

## 📋 Seeded Data Overview

| Resource | Count |
|----------|-------|
| Org | 1 — Acme Corp |
| Users (seeded, non-loginable) | 20 |
| Real loginable demo users | 6 |
| Teams | 5 |
| Projects | 4 |
| Tasks (total) | 200 |
| Tasks (depth 0 — epics) | 27 |
| Tasks (depth 1) | 73 |
| Tasks (depth 2) | 73 |
| Tasks (depth 3 — subtasks) | 27 |

### Teams
| ID | Name |
|----|------|
| `dd000000-0000-4000-a000-000000000201` | Backend Platform |
| `dd000000-0000-4000-a000-000000000202` | Frontend & Design |
| `dd000000-0000-4000-a000-000000000203` | QA & Testing |
| `dd000000-0000-4000-a000-000000000204` | Mobile Engineering |
| `dd000000-0000-4000-a000-000000000205` | DevOps & Infra |

### Projects
| ID | Name | Description |
|----|------|-------------|
| `dd000000-0000-4000-a000-000000000301` | Project Phoenix | Core platform rebuild |
| `dd000000-0000-4000-a000-000000000302` | Project Aurora | Next-gen UI/UX overhaul |
| `dd000000-0000-4000-a000-000000000303` | Project Nebula | ML analytics pipeline |
| `dd000000-0000-4000-a000-000000000304` | Project Sentinel | Security & compliance |

---

## 🗄️ Additional Seeded Users (non-loginable, assignee data only)

These users exist as data only (no Zitadel accounts — cannot log in). They appear as task assignees and in comments to populate realistic demo data.

| # | Name | Email | Org Role |
|---|------|-------|----------|
| 1 | Sarah Chen *(loginable)* | sarah.chen@acme.demo | owner |
| 2 | Marcus Johnson *(loginable)* | marcus.johnson@acme.demo | admin |
| 3 | Priya Patel *(loginable)* | priya.patel@acme.demo | member |
| 4 | James Wilson | james.wilson@acme.demo | member |
| 5 | Emma Garcia | emma.garcia@acme.demo | member |
| 6 | Alex Kim | alex.kim@acme.demo | member |
| 7 | Olivia Brown *(loginable)* | olivia.brown@acme.demo | member |
| 8 | David Martinez | david.martinez@acme.demo | member |
| 9 | Sophia Lee | sophia.lee@acme.demo | member |
| 10 | Ryan Taylor | ryan.taylor@acme.demo | member |
| 11 | Mia Anderson *(loginable)* | mia.anderson@acme.demo | member |
| 12 | Noah Thomas | noah.thomas@acme.demo | member |
| 13 | Ava Jackson | ava.jackson@acme.demo | member |
| 14 | Liam White | liam.white@acme.demo | member |
| 15 | Isabella Harris | isabella.harris@acme.demo | member |
| 16 | Ethan Clark | ethan.clark@acme.demo | member |
| 17 | Charlotte Lewis | charlotte.lewis@acme.demo | member |
| 18 | Mason Walker *(loginable)* | mason.walker@acme.demo | billing_admin |
| 19 | Amelia Hall | amelia.hall@acme.demo | member |
| 20 | Lucas Young | lucas.young@acme.demo | member |

---

## 🛠️ Technical Reference

```
Org ID:    dd000000-0000-4000-a000-000000000001
Org Slug:  acme-corp
Org Plan:  enterprise

DB:        orbispmdev (PostgreSQL 16)
Backend:   http://10.0.6.12:8080 (internal Docker)
API:       https://api.orbispm.in
Frontend:  https://orbispm.live
Zitadel:   https://zitadel.orbispm.in
```

---

*Generated on 2026-04-16. All demo accounts use the same shared password `Demo@Acme2026!`.*
