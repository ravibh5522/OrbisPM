import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
    Activity,
    ArrowRight,
    BarChart3,
    Bell,
    Bot,
    Brain,
    CalendarDays,
    CheckSquare,
    Cpu,
    Eye,
    FileText,
    FolderKanban,
    Gauge,
    GitBranch,
    Globe,
    LineChart,
    Lock,
    MessageCircle, Network,
    Puzzle, Repeat,
    Search,
    Settings2,
    Shield,
    Sparkles,
    SquareStack, Table2,
    Timer,
    Users,
    Webhook,
    Workflow
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Features – AI-Powered Project Management Tools for Engineering Teams",
  description:
    "Explore 30+ OrbisPM features: AI sprint planning, smart task estimation, real-time collaboration, kanban boards, enterprise RBAC, change request workflows, automated retrospectives, dependency intelligence, burndown predictions, time tracking, and more. The most complete project management platform for developers in 2026.",
  alternates: { canonical: "/features" },
  keywords: [
    "AI project management features",
    "smart task estimation",
    "AI sprint planning",
    "automated retrospectives",
    "real-time collaboration tool",
    "kanban board software features",
    "enterprise RBAC permissions",
    "change request workflow",
    "project management automation",
    "burndown chart prediction",
    "dependency intelligence",
    "project management for developers",
    "best project management features 2026",
    "workflow automation engine",
    "intelligent backlog grooming",
  ],
  openGraph: {
    title: "OrbisPM Features – 30+ AI-Powered Tools to Ship Faster",
    description:
      "AI sprint planning, smart estimation, real-time collaboration, enterprise RBAC, change requests, webhooks & API. The most feature-rich project management platform for engineering teams.",
    url: "/features",
  },
};

const features = [
  {
    icon: FolderKanban,
    title: "Multi-View Task Management",
    description:
      "Switch between Kanban boards, list views, tree hierarchies, and customizable column layouts. Every project adapts to how your team prefers to work. Drag-and-drop reordering, inline editing, and bulk actions make task management effortless.",
    badge: null,
  },
  {
    icon: Users,
    title: "Real-Time Team Collaboration",
    description:
      "Every change syncs instantly via WebSockets. See who is online, who is viewing the same task, and collaborate without conflicts. @mentions in comments, task watchers, and presence indicators keep everyone in sync.",
    badge: null,
  },
  {
    icon: Shield,
    title: "Enterprise-Grade RBAC",
    description:
      "Granular role-based access control at organization, team, and project levels. 5 built-in roles plus unlimited custom roles. Permission inheritance ensures consistent security across all scopes. Row-level security in PostgreSQL for true tenant isolation.",
    badge: null,
  },
  {
    icon: GitBranch,
    title: "Change Request Workflows",
    description:
      "Submit task modifications for review before they go live. Requires designated approvers to sign off before changes take effect. Reviewers can approve, reject, or request changes on any field modification.",
    badge: null,
  },
  {
    icon: Brain,
    title: "AI Sprint Planning",
    description:
      "Let AI analyze your team's velocity, historical data, and task complexity to automatically suggest optimal sprint compositions. Balance workload across team members, identify bottlenecks before they happen, and plan sprints that your team can actually deliver.",
    badge: "AI-Powered",
  },
  {
    icon: Bot,
    title: "Smart Task Estimation",
    description:
      "AI analyzes similar past tasks, team capacity, and complexity patterns to suggest accurate story point estimates. Stop guessing — let machine learning predict effort based on your team's real performance data. Continuously improves as your team delivers.",
    badge: "AI-Powered",
  },
  {
    icon: Sparkles,
    title: "Natural Language Task Creation",
    description:
      "Create tasks by describing them in plain English. AI automatically extracts title, description, priority, labels, assignee suggestions, and estimated effort. Paste a Slack message or email and OrbisPM converts it into a structured, actionable task.",
    badge: "AI-Powered",
  },
  {
    icon: LineChart,
    title: "Predictive Burndown Charts",
    description:
      "Go beyond static burndown charts. OrbisPM uses ML models trained on your team's history to forecast sprint completion probability, predict delays before they occur, and suggest scope adjustments to hit deadlines.",
    badge: "AI-Powered",
  },
  {
    icon: MessageCircle,
    title: "AI Automated Retrospectives",
    description:
      "After each sprint, AI analyzes task completion patterns, blockers, and collaboration data to generate insightful retrospective reports. Highlights what went well, what slowed the team down, and actionable improvement suggestions.",
    badge: "AI-Powered",
  },
  {
    icon: Network,
    title: "Cross-Project Dependency Intelligence",
    description:
      "Automatically detect and visualize dependencies between tasks across different projects and teams. Get alerted when upstream changes impact your deliverables. Interactive dependency graphs show the critical path and potential risks.",
    badge: "Unique",
  },
  {
    icon: Workflow,
    title: "Visual Workflow Automation Engine",
    description:
      "Build sophisticated automation without code using a visual rule builder. Auto-assign tasks, trigger status changes, send notifications, escalate blockers, and create custom workflow pipelines. Supports conditional logic, loops, and external webhook triggers.",
    badge: null,
  },
  {
    icon: BarChart3,
    title: "Rich Analytics Dashboards",
    description:
      "Organization and project dashboards with real-time interactive charts. Track task distribution by status, priority, and assignee. Monitor sprint velocity, burndown charts, cycle time, lead time, and team performance metrics.",
    badge: null,
  },
  {
    icon: Timer,
    title: "Integrated Time Tracking",
    description:
      "Built-in time tracking with one-click start/stop timers, manual time entry, and automatic idle detection. Track billable hours per task, generate client-ready timesheets, and compare estimated vs actual effort for better planning.",
    badge: null,
  },
  {
    icon: Repeat,
    title: "Recurring Tasks & Automations",
    description:
      "Set up recurring tasks with flexible scheduling — daily, weekly, monthly, or custom cron patterns. Auto-create sprint ceremonies, standup reminders, and maintenance tasks. Each recurrence inherits templates with customizable overrides.",
    badge: null,
  },
  {
    icon: Bell,
    title: "Smart Notification System",
    description:
      "Configurable notification preferences for each channel and event type. Get notified about task assignments, @mentions, review requests, and approaching deadlines. AI-powered notification batching prevents alert fatigue.",
    badge: null,
  },
  {
    icon: Search,
    title: "Instant Full-Text Search",
    description:
      "Powered by Meilisearch for sub-50ms, typo-tolerant search across all tasks, projects, comments, and documents. Find anything in your organization instantly with faceted filtering and search-as-you-type suggestions.",
    badge: null,
  },
  {
    icon: Gauge,
    title: "Team Workload Balancing",
    description:
      "Visualize team capacity and workload distribution in real-time. See who is overloaded and who has bandwidth. AI suggests task reassignments to balance workload and prevent burnout. Capacity planning with configurable work hours per member.",
    badge: "AI-Powered",
  },
  {
    icon: FileText,
    title: "Templates & One-Click Migration",
    description:
      "Create reusable task and project templates for repeatable workflows. Import from CSV/XLSX with progress tracking. One-click migration from Jira, Asana, and Trello with automatic field mapping and relationship preservation.",
    badge: null,
  },
  {
    icon: CheckSquare,
    title: "Checklists & Subtask Hierarchy",
    description:
      "Break complex tasks into checklists and subtask hierarchies up to 4 levels deep. Set dependencies between tasks, track completion with progress bars, and manage complex project structures with automatic rollup calculations.",
    badge: null,
  },
  {
    icon: Webhook,
    title: "Webhooks & REST API",
    description:
      "Connect OrbisPM to your existing toolchain. Full REST API with Swagger/OpenAPI documentation, webhook event notifications for 20+ event types, secure API key management with SHA-256 hashing, and rate-limited endpoints.",
    badge: null,
  },
  {
    icon: Activity,
    title: "Complete Audit Trail",
    description:
      "Every action in your organization is logged with who, what, when, and where. Filter by user, action type, or resource. Export audit logs for full operational transparency and accountability.",
    badge: null,
  },
  {
    icon: Lock,
    title: "Enterprise Authentication",
    description:
      "Powered by Zitadel for enterprise-grade identity management. Support for MFA (TOTP, email, SMS, backup codes), SSO/SAML, social login providers, passwordless authentication, and session management.",
    badge: null,
  },
  {
    icon: Puzzle,
    title: "Custom Fields & Metadata",
    description:
      "Extend tasks with custom fields — text, number, date, dropdown, multi-select, user picker, and URL. Create field templates for consistency across projects. Custom fields are searchable, filterable, and available in dashboard analytics.",
    badge: null,
  },
  {
    icon: CalendarDays,
    title: "Calendar & Timeline Views",
    description:
      "Visualize tasks on a calendar with drag-and-drop rescheduling. Gantt-style timeline view shows task durations, dependencies, and milestones. Filter by team, assignee, or project for focused planning sessions.",
    badge: "Coming Soon",
  },
  {
    icon: Cpu,
    title: "AI Meeting Notes → Tasks",
    description:
      "Paste meeting notes or standup summaries and AI extracts action items as draft tasks with suggested assignees, priorities, and due dates. Integrates with meeting tools to automatically capture and organize action items.",
    badge: "AI-Powered",
  },
  {
    icon: SquareStack,
    title: "Intelligent Backlog Grooming",
    description:
      "AI prioritizes your backlog by analyzing business impact, technical debt signals, dependency chains, and team velocity. Get weekly AI-generated grooming suggestions that surface the most impactful work items.",
    badge: "AI-Powered",
  },
  {
    icon: Settings2,
    title: "Custom Status Workflows",
    description:
      "Define custom status columns per project with transition rules. Enforce status progression (e.g., tasks must pass review before moving to done). Visual workflow designer makes it easy to model your exact process.",
    badge: null,
  },
  {
    icon: Globe,
    title: "On-Premise Deployment",
    description:
      "Deploy OrbisPM on your own infrastructure with Docker Compose. The entire stack — PostgreSQL, Redis, MinIO, Meilisearch — runs in containers. Enterprise customers get dedicated deployment support and custom SLAs.",
    badge: "Enterprise",
  },
  {
    icon: Eye,
    title: "Progressive Web App",
    description:
      "Install OrbisPM as a native-like app on any device. Offline-ready with intelligent caching — continue working when your connection drops and sync automatically when connectivity returns.",
    badge: null,
  },
  {
    icon: Table2,
    title: "Spreadsheet-Style Bulk Editing",
    description:
      "Edit multiple tasks simultaneously in a spreadsheet-like interface. Update statuses, assignees, priorities, dates, and custom fields in bulk. Copy-paste from Excel, filter and sort inline, and save custom views.",
    badge: "Coming Soon",
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "OrbisPM Features – 30+ AI-Powered Project Management Tools",
          description: "Complete feature overview of OrbisPM project management platform with AI sprint planning, smart estimation, and 30+ tools for engineering teams",
          url: "https://orbisom.live/features",
          breadcrumb: {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://orbisom.live" },
              { "@type": "ListItem", position: 2, name: "Features", item: "https://orbisom.live/features" },
            ],
          },
        }}
      />
      <MarketingHeader />

      {/* Hero */}
      <section className="pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            30+ Powerful Features
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight max-w-5xl mx-auto">
            Every Feature Your Team Needs to{" "}
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Ship 10x Faster
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-base-content/60 max-w-3xl mx-auto leading-relaxed">
            OrbisPM combines enterprise-grade project management with AI-powered intelligence.
            From AI sprint planning to predictive analytics — features no other platform offers.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="btn btn-primary btn-lg gap-2 shadow-lg shadow-primary/25">
              Start Free Today <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/pricing" className="btn btn-ghost btn-lg gap-2">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Categories */}
      <section className="py-8">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {["AI-Powered", "Collaboration", "Security", "Automation", "Analytics", "Enterprise"].map((cat) => (
              <span key={cat} className="badge badge-lg badge-outline badge-primary">{cat}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-8">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="card bg-base-100 shadow-lg border border-base-200 hover:shadow-xl transition-shadow duration-300"
              >
                <div className="card-body">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-xl font-bold">{feature.title}</h2>
                        {feature.badge && (
                          <span className={`badge badge-sm ${
                            feature.badge === "AI-Powered" ? "badge-primary" :
                            feature.badge === "Unique" ? "badge-secondary" :
                            feature.badge === "Enterprise" ? "badge-accent" :
                            "badge-warning"
                          }`}>
                            {feature.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-base-content/60 leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* AI Highlights Section */}
      <section className="py-16 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 border-y border-base-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Brain className="w-4 h-4" />
              AI That Actually Helps
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">8 AI Features No Other PM Tool Has</h2>
            <p className="text-base-content/50 mt-3 text-lg max-w-2xl mx-auto">
              OrbisPM doesn&apos;t just bolt on AI as a chatbot. Intelligence is woven into every workflow — from planning to retrospectives.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Brain, title: "Sprint Planning", desc: "AI suggests optimal sprint compositions based on velocity and capacity" },
              { icon: Bot, title: "Task Estimation", desc: "ML predicts story points from historical patterns and complexity analysis" },
              { icon: Sparkles, title: "Natural Language Input", desc: "Create tasks from plain text, Slack messages, or meeting notes" },
              { icon: LineChart, title: "Burndown Prediction", desc: "Forecast sprint completion and suggest scope adjustments" },
              { icon: MessageCircle, title: "Auto-Retrospectives", desc: "AI-generated sprint reports with actionable improvement suggestions" },
              { icon: Gauge, title: "Workload Balancing", desc: "Real-time capacity analysis with AI reassignment recommendations" },
              { icon: SquareStack, title: "Backlog Grooming", desc: "AI prioritizes work items by business impact and dependency analysis" },
              { icon: Cpu, title: "Meeting → Tasks", desc: "Extract action items from notes with assignees, priorities, and dates" },
            ].map((item) => (
              <div key={item.title} className="bg-base-100 rounded-xl p-6 border border-base-200 hover:border-primary/30 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-bold mb-1">{item.title}</h3>
                <p className="text-sm text-base-content/60">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-16 bg-base-100">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Built on Modern, Battle-Tested Technology</h2>
            <p className="text-base-content/50 mt-3 text-lg">
              Enterprise-grade infrastructure designed for performance, reliability, and scale
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-6">
            {[
              { name: "Next.js 15", desc: "React Framework" },
              { name: "Go 1.24", desc: "Backend API" },
              { name: "PostgreSQL", desc: "Database + RLS" },
              { name: "Redis", desc: "Cache & Pub/Sub" },
              { name: "Zitadel", desc: "Auth & IAM" },
              { name: "MinIO", desc: "Object Storage" },
              { name: "Meilisearch", desc: "Search Engine" },
              { name: "Docker", desc: "Deployment" },
            ].map((tech) => (
              <div key={tech.name} className="text-center">
                <div className="w-14 h-14 mx-auto rounded-xl bg-base-200 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">{tech.name[0]}</span>
                </div>
                <div className="text-xs font-semibold mt-2">{tech.name}</div>
                <div className="text-[10px] text-base-content/40">{tech.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5" />
        <div className="relative w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <h2 className="text-3xl md:text-5xl font-bold">Ready to supercharge your workflow?</h2>
          <p className="mt-6 text-lg text-base-content/60 max-w-2xl mx-auto">
            Join thousands of engineering teams shipping faster with OrbisPM.
            Start free — no credit card required.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="btn btn-primary btn-lg gap-2 shadow-lg shadow-primary/25">
              Get Started Free <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/alternatives/jira" className="btn btn-outline btn-lg">
              Compare with Jira
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
