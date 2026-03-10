import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { ArrowRight, BookOpen, Calendar } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog – Project Management Insights for Engineering Teams",
  description:
    "Expert articles on AI-powered project management, agile best practices, team collaboration strategies, sprint planning optimization, and engineering productivity. Learn how top teams ship faster with OrbisPM.",
  alternates: { canonical: "/blog" },
  keywords: [
    "project management blog",
    "engineering team productivity",
    "agile best practices",
    "AI project management insights",
    "sprint planning tips",
    "team collaboration strategies",
    "software development management",
  ],
  openGraph: {
    title: "OrbisPM Blog – Project Management Insights",
    description:
      "Expert articles on AI-powered project management, agile practices, team collaboration, and engineering productivity.",
    url: "/blog",
  },
};

const articles = [
  {
    slug: "ai-sprint-planning-complete-guide",
    title: "AI Sprint Planning: The Complete Guide for Engineering Teams in 2026",
    excerpt:
      "How AI is revolutionizing sprint planning — from velocity prediction and capacity analysis to automatic task allocation. Learn how modern teams plan sprints that actually deliver on time.",
    date: "2026-03-10",
    readTime: "10 min",
    category: "AI & Automation",
  },
  {
    slug: "real-time-collaboration-engineering-teams",
    title: "Why Real-Time Collaboration is Non-Negotiable for Engineering Teams",
    excerpt:
      "Async communication has limits. Learn why top engineering teams are switching to real-time project management with WebSocket sync, live cursors, and instant updates — and how it boosts productivity by 35%.",
    date: "2026-02-28",
    readTime: "8 min",
    category: "Collaboration",
  },
  {
    slug: "change-request-workflows-compliance",
    title: "Change Request Workflows: How Engineering Teams Stay in Control",
    excerpt:
      "Uncontrolled task changes create accountability gaps and project chaos. Learn how change request workflows give teams structured approval control while keeping velocity high.",
    date: "2026-02-15",
    readTime: "7 min",
    category: "Enterprise",
  },
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "OrbisPM Blog",
          description: "Expert articles on AI-powered project management, agile practices, and engineering productivity",
          url: "https://orbispm.dev/blog",
          publisher: {
            "@type": "Organization",
            name: "OrbisPM",
            url: "https://orbispm.dev",
          },
        }}
      />
      <MarketingHeader />

      <section className="pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <BookOpen className="w-4 h-4" />
            Engineering Blog
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Project Management Insights
          </h1>
          <p className="mt-4 text-lg text-base-content/60 max-w-2xl mx-auto">
            Deep dives into AI-powered project management, team collaboration strategies,
            agile best practices, and engineering productivity.
          </p>
        </div>
      </section>

      <section className="pb-20">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {articles.map((article) => (
              <article
                key={article.slug}
                className="card bg-base-100 shadow-lg border border-base-200 hover:shadow-xl transition-shadow duration-300"
              >
                <div className="card-body">
                  <div className="flex items-center gap-3 text-xs text-base-content/50 mb-2">
                    <span className="badge badge-sm badge-ghost">{article.category}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(article.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span>{article.readTime} read</span>
                  </div>
                  <h2 className="text-lg font-bold leading-snug">
                    <Link href={`/blog/${article.slug}`} className="hover:text-primary transition-colors">
                      {article.title}
                    </Link>
                  </h2>
                  <p className="text-base-content/60 text-sm leading-relaxed mt-2">{article.excerpt}</p>
                  <div className="card-actions mt-4">
                    <Link
                      href={`/blog/${article.slug}`}
                      className="text-primary text-sm font-medium flex items-center gap-1 hover:gap-2 transition-all"
                    >
                      Read Article <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
