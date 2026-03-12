# LinkedIn Post — OrbisPM Launch

---

🚀 I just built an enterprise-grade project management platform from scratch — and here's why.

Most PM tools are either too simple or way too bloated. I wanted something in between: powerful enough for real engineering teams, clean enough that you actually want to use it.

So I built OrbisPM.

Here's what's under the hood:

⚡ Backend: Go 1.24 + Chi v5 — 80+ REST API endpoints
🎨 Frontend: Next.js 15, React 19, TypeScript strict, Tailwind CSS 4, DaisyUI 5
🗄️ Database: PostgreSQL 16 with Row-Level Security for true multi-tenant isolation
🔒 Auth: Zitadel OIDC with JWT RS256 — zero-trust by design
📡 Real-time: WebSocket sync powered by Redis Pub/Sub
🔍 Search: Meilisearch for instant full-text search
🗂️ Storage: MinIO (S3-compatible) with pre-signed URLs
🌐 Gateway: Kong API Gateway with rate limiting

What makes it different?

→ Strict 4-layer architecture (Handler → Service → Repository → Domain)
→ DB-driven RBAC at org, team, and project levels
→ PostgreSQL RLS — Org A literally cannot see Org B's data
→ Subtask trees up to 4 levels deep with drag-and-drop
→ Background job processing with Asynq workers
→ Swagger auto-docs, Prometheus metrics, and audit logging

67 features planned. v0.2.0 is complete with:
✅ Task boards (Kanban + Miller Columns + Tree View)
✅ Review Pipeline with approval workflows
✅ Modular RBAC with custom roles
✅ Rich text editing (Tiptap)
✅ Real-time WebSocket updates
✅ Team & project dashboards with analytics

What's next?
🧠 v0.3 — MCP Server for AI/LLM integration + PWA offline mode
💬 v0.4 — Slack, Discord & Teams integration
📊 v0.5 — Gantt charts & custom dashboard widgets
🏢 v1.0 — SSO, Kubernetes, multi-region, SOC 2

This isn't a weekend project. It's 12 database migrations, 29 repositories, 25 services, 31 handlers, 18 frontend routes, and thousands of lines of production-grade code.

Built with Go, React, and a whole lot of caffeine ☕

Would love your feedback — what features would you want in a modern PM tool?

Swipe through the slides to see the architecture, dashboard, and roadmap →

#ProjectManagement #SaaS #GoLang #NextJS #React #TypeScript #PostgreSQL #OpenSource #BuildInPublic #StartupLife #AI #WebDevelopment #SoftwareEngineering #IndianStartup #TechFounder

---

## Slide Descriptions (for alt text / accessibility)

1. **Cover**: OrbisPM branding with key stats (80+ APIs, 67 features, 10+ services, 6 teams) and a dashboard preview
2. **Architecture**: Enterprise tech stack breakdown — Backend, Frontend, Data Layer, Infrastructure — with project board screenshot
3. **Dashboard**: Live dashboard showing 110 tasks, 9 projects, 6 teams with donut charts for status and priority distribution
4. **Teams & RBAC**: Multi-team management with Row-Level Security, custom roles, and project isolation — showing teams, projects, and task views
5. **Roadmap**: Version timeline from v0.2 (complete) to v1.0 (production) with CTA
