import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title:
    "Simplify Projects Alternatives – Best Jira, Asana & Trello Alternatives in 2026",
  description:
    "Compare Simplify Projects with Jira, Asana, and Trello. See why engineering teams choose Simplify Projects for AI-powered project management, real-time collaboration, and enterprise RBAC.",
  alternates: { canonical: "/alternatives" },
  keywords: [
    "project management alternatives",
    "Jira alternative",
    "Asana alternative",
    "Trello alternative",
    "best project management tool 2026",
    "AI project management comparison",
    "Simplify Projects vs competitors",
  ],
  openGraph: {
    title:
      "Simplify Projects Alternatives – Best Jira, Asana & Trello Alternatives in 2026",
    description:
      "Compare Simplify Projects with Jira, Asana, and Trello. AI-powered features, real-time collaboration, and enterprise RBAC at a fraction of the cost.",
    url: "/alternatives",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Simplify Projects Alternatives – Compare with Jira, Asana, Trello",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Simplify Projects Alternatives – Jira, Asana & Trello Comparisons",
    description:
      "See why engineering teams switch from Jira, Asana, and Trello to Simplify Projects. AI-powered, real-time, enterprise-ready.",
    images: ["/og-image.png"],
  },
};

const alternatives = [
  {
    slug: "jira",
    name: "Jira",
    headline: "Simplify Projects vs Jira",
    tagline: "Modern AI-powered workflows without the Jira complexity tax",
    description:
      "Jira is powerful but notoriously complex and expensive for modern teams. Simplify Projects gives you AI sprint planning, real-time collaboration, and enterprise RBAC — with a setup that takes minutes, not days.",
    highlights: [
      "AI sprint planning & smart estimation",
      "Real-time WebSocket sync (not polling)",
      "Transparent pricing — no add-on fees",
      "Row-level database security",
    ],
  },
  {
    slug: "asana",
    name: "Asana",
    headline: "Simplify Projects vs Asana",
    tagline: "Engineering-first project management with AI built-in",
    description:
      "Asana is great for marketing teams but leaves engineering teams wanting more. Simplify Projects is built for developers: granular RBAC, change request workflows, API-first design, and AI-powered automation.",
    highlights: [
      "Custom roles & granular RBAC",
      "Change request approval workflows",
      "Predictive burndown charts",
      "Full REST API + webhooks",
    ],
  },
  {
    slug: "trello",
    name: "Trello",
    headline: "Simplify Projects vs Trello",
    tagline: "Kanban and much more — with AI, hierarchy, and real-time sync",
    description:
      "Trello's simple kanban boards are great for small projects, but growing engineering teams hit limitations fast. Simplify Projects adds subtask hierarchies, AI automation, enterprise security, and real-time sync while keeping the visual simplicity.",
    highlights: [
      "Subtask hierarchy (up to 4 levels)",
      "AI-powered task estimation",
      "Enterprise RBAC & audit logs",
      "On-premise deployment option",
    ],
  },
];

export default function AlternativesPage() {
  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Simplify Projects Alternatives – Compare with Jira, Asana & Trello",
          description:
            "Detailed comparisons of Simplify Projects versus popular project management tools including Jira, Asana, and Trello.",
          url: "https://simplifyai.id/alternatives",
          breadcrumb: {
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: "https://simplifyai.id",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Alternatives",
                item: "https://simplifyai.id/alternatives",
              },
            ],
          },
        }}
      />
      <MarketingHeader />

      <section className="pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="badge badge-primary badge-outline mb-4">
              Comparisons
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              The Best Jira, Asana & Trello{" "}
              <span className="text-primary">Alternatives</span> in 2026
            </h1>
            <p className="mt-4 text-lg text-base-content/60">
              See how Simplify Projects compares with the most popular project management
              tools. AI-native, real-time, and built for engineering teams.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {alternatives.map((alt) => (
              <div
                key={alt.slug}
                className="card bg-base-100 border border-base-300 hover:border-primary/50 hover:shadow-lg transition-all"
              >
                <div className="card-body">
                  <div className="badge badge-ghost mb-2">{alt.name}</div>
                  <h2 className="card-title text-xl">{alt.headline}</h2>
                  <p className="text-sm font-medium text-primary mb-2">
                    {alt.tagline}
                  </p>
                  <p className="text-base-content/60 text-sm leading-relaxed mb-4">
                    {alt.description}
                  </p>
                  <ul className="space-y-1.5 mb-6">
                    {alt.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm">
                        <span className="text-success mt-0.5">✓</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="card-actions mt-auto">
                    <Link
                      href={`/alternatives/${alt.slug}`}
                      className="btn btn-primary btn-sm w-full"
                    >
                      See Full Comparison <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
