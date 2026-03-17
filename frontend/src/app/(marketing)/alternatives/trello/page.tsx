import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
  ArrowRight,
  BarChart3,
  CheckSquare,
  Layers,
  Shield,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "OrbisPM vs Trello – Best AI-Powered Trello Alternative in 2026",
  description:
    "Compare OrbisPM vs Trello for project management. OrbisPM offers everything Trello does plus AI sprint planning, enterprise RBAC, change requests, WebSocket real-time sync, and subtask hierarchies. The best Trello alternative.",
  alternates: { canonical: "/alternatives/trello" },
  openGraph: {
    title: "OrbisPM vs Trello – The AI-Powered Trello Alternative",
    description:
      "Everything Trello does, plus AI automation, enterprise RBAC, real-time sync, and subtasks. The best Trello alternative for growing teams.",
    url: "/alternatives/trello",
  },
  keywords: [
    "Trello alternative",
    "Trello replacement",
    "AI Trello alternative",
    "best Trello alternative 2026",
    "OrbisPM vs Trello",
    "free Trello alternative",
    "Trello alternative for developers",
  ],
};

const comparisonData = [
  { feature: "AI-Powered Task Estimation", orbis: true, competitor: false },
  { feature: "AI Sprint Planning", orbis: true, competitor: false },
  { feature: "Real-Time WebSocket Sync", orbis: true, competitor: false },
  { feature: "Kanban Boards", orbis: true, competitor: true },
  { feature: "List & Tree Views", orbis: true, competitor: false },
  { feature: "Subtask Hierarchy (4 levels)", orbis: true, competitor: false },
  { feature: "Custom Roles & Granular RBAC", orbis: true, competitor: false },
  { feature: "Row-Level DB Security", orbis: true, competitor: false },
  { feature: "Change Request Workflows", orbis: true, competitor: false },
  { feature: "Full-Text Search", orbis: true, competitor: false },
  { feature: "Webhooks & REST API", orbis: true, competitor: true },
  { feature: "Complete Audit Trail", orbis: true, competitor: false },
  { feature: "Built-in Time Tracking", orbis: true, competitor: false },
  { feature: "CSV/XLSX Import", orbis: true, competitor: false },
  { feature: "MFA Authentication", orbis: true, competitor: true },
  { feature: "Rich Text Editor", orbis: true, competitor: false },
  { feature: "Predictive Burndown Charts", orbis: true, competitor: false },
  { feature: "Project Dashboards", orbis: true, competitor: false },
  { feature: "Recurring Tasks", orbis: true, competitor: true },
  { feature: "Free Plan Available", orbis: true, competitor: true },
];

export default function TrelloAlternativePage() {
  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "OrbisPM vs Trello – Best AI-Powered Trello Alternative",
          description:
            "Feature comparison of OrbisPM and Trello project management platforms",
          url: "https://orbisom.live/alternatives/trello",
          breadcrumb: {
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: "https://orbisom.live",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Alternatives",
                item: "https://orbisom.live/alternatives/jira",
              },
              {
                "@type": "ListItem",
                position: 3,
                name: "OrbisPM vs Trello",
                item: "https://orbisom.live/alternatives/trello",
              },
            ],
          },
        }}
      />
      <MarketingHeader />

      {/* Hero */}
      <section className="pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Trello Alternative
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            OrbisPM vs Trello:{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Kanban and Beyond
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-base-content/60 max-w-3xl mx-auto leading-relaxed">
            Trello is great for simple kanban boards, but growing teams quickly
            outgrow it. OrbisPM gives you Trello&apos;s simplicity with
            AI-powered intelligence: sprint planning, task estimation, RBAC,
            subtask hierarchies, real-time sync, and dashboards.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="btn btn-primary btn-lg gap-2 shadow-lg shadow-primary/25"
            >
              Try OrbisPM Free <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/features" className="btn btn-ghost btn-lg">
              See All Features
            </Link>
          </div>
        </div>
      </section>

      {/* Why Switch */}
      <section className="py-16 bg-base-100 border-y border-base-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <h2 className="text-3xl font-bold text-center mb-12">
            When Teams Outgrow Trello, They Choose OrbisPM
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {[
              {
                icon: Layers,
                title: "Beyond Kanban",
                desc: "OrbisPM offers kanban boards, list views, tree hierarchies, and column views. Switch between views without losing context. Trello is kanban-only.",
              },
              {
                icon: Shield,
                title: "Real Permissions",
                desc: "Trello's free plan has minimal access control. OrbisPM offers granular RBAC with custom roles at organization, team, and project levels.",
              },
              {
                icon: Sparkles,
                title: "AI Intelligence",
                desc: "AI-powered task estimation, sprint planning, predictive burndowns, and natural language task creation. Features that Trello doesn't offer at any price.",
              },
              {
                icon: BarChart3,
                title: "Project Intelligence",
                desc: "Dashboards, velocity charts, burndown tracking, and activity audits. Get insights Trello simply cannot provide without expensive Power-Ups.",
              },
            ].map((item) => (
              <article key={item.title} className="text-center">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <item.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-base-content/60 leading-relaxed">
                  {item.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-20 md:py-28">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">
              Feature-by-Feature Comparison
            </h2>
            <p className="text-center text-base-content/60 mb-12">
              OrbisPM vs Trello — a comprehensive comparison for teams ready to
              level up.
            </p>
            <div className="overflow-x-auto">
              <table className="table w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-base-200">
                    <th className="text-left py-3 w-1/2">Feature</th>
                    <th className="text-center py-3 text-primary font-bold">
                      OrbisPM
                    </th>
                    <th className="text-center py-3">Trello</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((row) => (
                    <tr
                      key={row.feature}
                      className="border-b border-base-200/50"
                    >
                      <td className="py-3 font-medium">{row.feature}</td>
                      <td className="text-center py-3">
                        {row.orbis ? (
                          <CheckSquare className="w-5 h-5 text-success inline-block" />
                        ) : (
                          <X className="w-5 h-5 text-base-content/20 inline-block" />
                        )}
                      </td>
                      <td className="text-center py-3">
                        {row.competitor ? (
                          <CheckSquare className="w-5 h-5 text-success inline-block" />
                        ) : (
                          <X className="w-5 h-5 text-base-content/20 inline-block" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-base-100 border-t border-base-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to upgrade from Trello?
          </h2>
          <p className="mt-4 text-lg text-base-content/60">
            Keep the simplicity you love, gain the AI-powered intelligence you
            need. Start free today.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="btn btn-primary btn-lg gap-2">
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
