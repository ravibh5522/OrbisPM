import type { Metadata } from "next";
import Link from "next/link";
import { CheckSquare, X, ArrowRight, Zap, Shield, Sparkles, DollarSign } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { JsonLd } from "@/components/marketing/json-ld";

export const metadata: Metadata = {
  title: "OrbisPM vs Jira – Best AI-Powered Jira Alternative in 2026",
  description:
    "Detailed comparison of OrbisPM vs Jira. See why engineering teams switch to OrbisPM: AI-powered sprint planning, real-time collaboration, better RBAC, simpler pricing. The best Jira alternative for modern teams.",
  alternates: { canonical: "/alternatives/jira" },
  openGraph: {
    title: "OrbisPM vs Jira – The Best AI-Powered Jira Alternative",
    description:
      "AI-powered sprint planning, real-time collaboration, granular RBAC. See why teams are switching from Jira to OrbisPM.",
    url: "/alternatives/jira",
  },
  keywords: [
    "Jira alternative",
    "Jira replacement",
    "AI Jira alternative",
    "best Jira alternative 2026",
    "OrbisPM vs Jira",
    "free Jira alternative",
    "Jira alternative for developers",
  ],
};

const comparisonData = [
  { feature: "AI-Powered Task Estimation", orbis: true, competitor: false },
  { feature: "AI Sprint Planning", orbis: true, competitor: false },
  { feature: "Real-Time WebSocket Sync", orbis: true, competitor: false },
  { feature: "Kanban Boards", orbis: true, competitor: true },
  { feature: "List & Tree Views", orbis: true, competitor: true },
  { feature: "Subtask Hierarchy (4 levels)", orbis: true, competitor: true },
  { feature: "Custom Roles & RBAC", orbis: true, competitor: true },
  { feature: "Row-Level Security (DB)", orbis: true, competitor: false },
  { feature: "Change Request Workflows", orbis: true, competitor: false },
  { feature: "Full-Text Search (Meilisearch)", orbis: true, competitor: true },
  { feature: "Webhooks & REST API", orbis: true, competitor: true },
  { feature: "Audit Logs", orbis: true, competitor: true },
  { feature: "Time Tracking (Built-in)", orbis: true, competitor: true },
  { feature: "CSV/XLSX Import", orbis: true, competitor: true },
  { feature: "MFA Authentication", orbis: true, competitor: true },
  { feature: "SSO / SAML", orbis: true, competitor: true },
  { feature: "Predictive Burndown Charts", orbis: true, competitor: false },
  { feature: "Natural Language Task Creation", orbis: true, competitor: false },
  { feature: "Cross-Project Dependencies", orbis: true, competitor: true },
  { feature: "On-Premise Deployment", orbis: true, competitor: false },
  { feature: "Free Plan (5 users)", orbis: true, competitor: true },
  { feature: "Transparent Pricing", orbis: true, competitor: false },
];

export default function JiraAlternativePage() {
  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "OrbisPM vs Jira – Best AI-Powered Jira Alternative",
          description: "Detailed feature comparison of OrbisPM and Jira",
          url: "https://orbispm.dev/alternatives/jira",
          breadcrumb: {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://orbispm.dev" },
              { "@type": "ListItem", position: 2, name: "Alternatives", item: "https://orbispm.dev/alternatives/jira" },
              { "@type": "ListItem", position: 3, name: "OrbisPM vs Jira", item: "https://orbispm.dev/alternatives/jira" },
            ],
          },
        }}
      />
      <MarketingHeader />

      {/* Hero */}
      <section className="pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Jira Alternative
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            OrbisPM vs Jira:{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              AI-Powered &amp; Lightning Fast
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-base-content/60 max-w-3xl mx-auto leading-relaxed">
            Tired of Jira&apos;s complexity, rising prices, and slow UI? OrbisPM delivers the project
            management features engineering teams need — with AI-powered sprint planning, real-time
            collaboration, and a modern interface that doesn&apos;t feel like it was built in 2005.
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
          <h2 className="text-3xl font-bold text-center mb-12">Why Teams Switch from Jira to OrbisPM</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {[
              {
                icon: Sparkles,
                title: "AI-Powered Planning",
                desc: "OrbisPM uses AI for task estimation, sprint planning, velocity prediction, and automatic task allocation. Jira has no native AI capabilities — you need expensive add-ons.",
              },
              {
                icon: Zap,
                title: "Real-Time, Not Polling",
                desc: "Jira refreshes data on page load. OrbisPM uses WebSockets for instant sync — every task update, comment, and status change appears in real-time across all views.",
              },
              {
                icon: Shield,
                title: "Better Security Model",
                desc: "OrbisPM uses PostgreSQL Row-Level Security for true tenant isolation at the database level. Jira relies on application-level checks that have had security vulnerabilities.",
              },
              {
                icon: DollarSign,
                title: "Transparent Pricing",
                desc: "Jira's pricing tiers hide essential features behind expensive plans. OrbisPM offers a generous free tier and straightforward $12/user/mo pricing with all features included.",
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

      {/* Feature Comparison Table */}
      <section className="py-20 md:py-28">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">Feature-by-Feature Comparison</h2>
            <p className="text-center text-base-content/60 mb-12">
              See exactly how OrbisPM and Jira compare across key project management capabilities.
            </p>

            <div className="overflow-x-auto">
              <table className="table w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-base-200">
                    <th className="text-left py-3 w-1/2">Feature</th>
                    <th className="text-center py-3 text-primary font-bold">OrbisPM</th>
                    <th className="text-center py-3">Jira</th>
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

      {/* Pricing Comparison */}
      <section className="py-16 bg-base-100 border-y border-base-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Pricing Comparison</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="card bg-base-100 border-2 border-primary shadow-xl">
                <div className="card-body text-center">
                  <h3 className="text-2xl font-bold text-primary">OrbisPM</h3>
                  <div className="mt-4">
                    <div className="text-sm text-base-content/50 mb-2">Starter</div>
                    <div className="text-4xl font-bold">Free</div>
                    <div className="text-sm text-base-content/50">Up to 5 users, 3 projects</div>
                  </div>
                  <div className="divider">or</div>
                  <div>
                    <div className="text-sm text-base-content/50 mb-2">Professional</div>
                    <div className="text-4xl font-bold">$12<span className="text-lg font-normal">/user/mo</span></div>
                    <div className="text-sm text-base-content/50">Unlimited + AI features</div>
                  </div>
                  <div className="divider">or</div>
                  <div>
                    <div className="text-sm text-base-content/50 mb-2">Enterprise</div>
                    <div className="text-4xl font-bold">Custom</div>
                    <div className="text-sm text-base-content/50">On-premise, SSO, SLA</div>
                  </div>
                </div>
              </div>
              <div className="card bg-base-100 border-2 border-base-200 shadow-lg">
                <div className="card-body text-center">
                  <h3 className="text-2xl font-bold">Jira</h3>
                  <div className="mt-4">
                    <div className="text-sm text-base-content/50 mb-2">Free</div>
                    <div className="text-4xl font-bold">Free</div>
                    <div className="text-sm text-base-content/50">Up to 10 users, limited features</div>
                  </div>
                  <div className="divider">then</div>
                  <div>
                    <div className="text-sm text-base-content/50 mb-2">Standard</div>
                    <div className="text-4xl font-bold">$8.15<span className="text-lg font-normal">/user/mo</span></div>
                    <div className="text-sm text-base-content/50">Basic features</div>
                  </div>
                  <div className="divider">then</div>
                  <div>
                    <div className="text-sm text-base-content/50 mb-2">Premium</div>
                    <div className="text-4xl font-bold">$16<span className="text-lg font-normal">/user/mo</span></div>
                    <div className="text-sm text-base-content/50">Advanced features + analytics</div>
                  </div>
                  <div className="mt-4 text-xs text-base-content/40">No AI features included. Cloud only.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Migration CTA */}
      <section className="py-20 md:py-28">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">Ready to switch from Jira?</h2>
          <p className="mt-4 text-lg text-base-content/60 max-w-2xl mx-auto">
            Migrate your tasks in minutes with CSV import. Start with a free account and see why teams
            love OrbisPM&apos;s modern, AI-powered approach to project management.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="btn btn-primary btn-lg gap-2">
              Start Free Migration <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/pricing" className="btn btn-outline btn-lg">
              Compare Plans
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
