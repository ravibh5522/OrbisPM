import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { ArrowRight, CheckSquare, Code, DollarSign, Lock, Sparkles, X, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "OrbisPM vs Asana – Best AI-Powered Asana Alternative in 2026",
  description:
    "Compare OrbisPM vs Asana for project management. AI-powered automation, real-time collaboration, enterprise RBAC, and change request workflows. The best Asana alternative for engineering teams.",
  alternates: { canonical: "/alternatives/asana" },
  openGraph: {
    title: "OrbisPM vs Asana – The AI-Powered Asana Alternative",
    description:
      "AI-powered project management with real-time collaboration and enterprise RBAC. The best Asana alternative for engineering teams.",
    url: "/alternatives/asana",
  },
  keywords: [
    "Asana alternative",
    "Asana replacement",
    "AI Asana alternative",
    "best Asana alternative 2026",
    "OrbisPM vs Asana",
    "Asana alternative for developers",
  ],
};

const comparisonData = [
  { feature: "AI-Powered Task Estimation", orbis: true, competitor: false },
  { feature: "AI Sprint Planning", orbis: true, competitor: false },
  { feature: "Real-Time WebSocket Sync", orbis: true, competitor: false },
  { feature: "Kanban Boards", orbis: true, competitor: true },
  { feature: "List & Tree Views", orbis: true, competitor: true },
  { feature: "Subtask Hierarchy (4 levels)", orbis: true, competitor: true },
  { feature: "Custom Roles & Granular RBAC", orbis: true, competitor: false },
  { feature: "Row-Level DB Security", orbis: true, competitor: false },
  { feature: "Change Request Workflows", orbis: true, competitor: false },
  { feature: "Full-Text Search", orbis: true, competitor: true },
  { feature: "Webhooks & REST API", orbis: true, competitor: true },
  { feature: "Complete Audit Trail", orbis: true, competitor: true },
  { feature: "Built-in Time Tracking", orbis: true, competitor: true },
  { feature: "CSV/XLSX Import", orbis: true, competitor: true },
  { feature: "MFA / SSO", orbis: true, competitor: true },
  { feature: "Predictive Burndown Charts", orbis: true, competitor: false },
  { feature: "Natural Language Task Creation", orbis: true, competitor: false },
  { feature: "Custom Workflow Rules", orbis: true, competitor: true },
  { feature: "On-Premise Deployment", orbis: true, competitor: false },
  { feature: "Free Plan Available", orbis: true, competitor: true },
];

export default function AsanaAlternativePage() {
  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "OrbisPM vs Asana – Best AI-Powered Asana Alternative",
          description: "Feature comparison of OrbisPM and Asana project management platforms",
          url: "https://orbispm.dev/alternatives/asana",
          breadcrumb: {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://orbispm.dev" },
              { "@type": "ListItem", position: 2, name: "Alternatives", item: "https://orbispm.dev/alternatives/jira" },
              { "@type": "ListItem", position: 3, name: "OrbisPM vs Asana", item: "https://orbispm.dev/alternatives/asana" },
            ],
          },
        }}
      />
      <MarketingHeader />

      {/* Hero */}
      <section className="pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/10 text-secondary text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Asana Alternative
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            OrbisPM vs Asana:{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Built for Engineers
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-base-content/60 max-w-3xl mx-auto leading-relaxed">
            Asana is great for marketing and operations teams, but engineering teams need more: AI-powered
            sprint planning, real-time sync, granular RBAC, and change request workflows. That&apos;s OrbisPM.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="btn btn-primary btn-lg gap-2 shadow-lg shadow-primary/25">
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
          <h2 className="text-3xl font-bold text-center mb-12">Why Engineering Teams Prefer OrbisPM Over Asana</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {[
              {
                icon: Code,
                title: "Built for Engineering",
                desc: "OrbisPM understands developer workflows — subtask hierarchies, dependency chains, sprint velocity, and code-friendly interfaces. Not adapted from a marketing tool.",
              },
              {
                icon: Sparkles,
                title: "AI-Powered Intelligence",
                desc: "AI task estimation, automated sprint planning, predictive burndowns, and natural language task creation. Capabilities Asana doesn't offer natively.",
              },
              {
                icon: Lock,
                title: "Enterprise Security",
                desc: "Row-level security in PostgreSQL, custom RBAC roles at org/team/project level, and change request workflows for regulated environments.",
              },
              {
                icon: DollarSign,
                title: "Better Value",
                desc: "Asana's Business plan ($24.99/user/mo) costs twice as much as OrbisPM Professional ($12/user/mo), with fewer engineering-specific features.",
              },
            ].map((item) => (
              <article key={item.title} className="text-center">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <item.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-base-content/60 leading-relaxed">{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-20 md:py-28">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">Feature-by-Feature Comparison</h2>
            <p className="text-center text-base-content/60 mb-12">
              OrbisPM vs Asana — see exactly how they compare for engineering teams.
            </p>
            <div className="overflow-x-auto">
              <table className="table w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-base-200">
                    <th className="text-left py-3 w-1/2">Feature</th>
                    <th className="text-center py-3 text-primary font-bold">OrbisPM</th>
                    <th className="text-center py-3">Asana</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((row) => (
                    <tr key={row.feature} className="border-b border-base-200/50">
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
          <h2 className="text-3xl md:text-4xl font-bold">Ready to switch from Asana?</h2>
          <p className="mt-4 text-lg text-base-content/60">
            Import your tasks via CSV and get your team up and running in minutes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="btn btn-primary btn-lg gap-2">
              Start Free Migration <ArrowRight className="w-5 h-5" />
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
