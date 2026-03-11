import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
    ArrowRight,
    Heart, Lightbulb,
    Shield,
    Target, Users,
    Zap
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About OrbisPM – Our Mission to Reinvent Project Management with AI",
  description:
    "Learn about OrbisPM: our mission to build the most intelligent project management platform for engineering teams. Founded by engineers, powered by AI, trusted by thousands of teams worldwide.",
  alternates: { canonical: "/about" },
  keywords: [
    "about OrbisPM",
    "AI project management company",
    "project management for engineers",
    "OrbisPM team",
    "project management mission",
    "engineering productivity company",
  ],
  openGraph: {
    title: "About OrbisPM – Reinventing Project Management with AI",
    description:
      "Building the most intelligent project management platform for modern engineering teams. Enterprise-ready with AI-powered features.",
    url: "/about",
  },
};

const values = [
  {
    icon: Zap,
    title: "Speed First",
    description:
      "Every interaction should feel instant. Sub-50ms search, real-time WebSocket sync, and optimistic UI updates. We obsess over milliseconds so your team never waits.",
  },
  {
    icon: Shield,
    title: "Security by Design",
    description:
      "Row-level security, enterprise SSO, SHA-256 hashed API keys, and granular RBAC aren't add-ons — they're core architecture decisions. Security is non-negotiable.",
  },
  {
    icon: Lightbulb,
    title: "AI That Actually Helps",
    description:
      "We don't bolt on AI as a chatbot. Intelligence is woven into every workflow — sprint planning, estimation, retrospectives, and backlog grooming. AI should save time, not create busywork.",
  },
  {
    icon: Target,
    title: "Built for Engineers",
    description:
      "We build tools we want to use ourselves. Deep keyboard shortcuts, API-first design, webhook integrations, and a developer experience that respects your intelligence.",
  },
  {
    icon: Users,
    title: "Team-Centric Design",
    description:
      "Great software is built by great teams. Every feature — from real-time presence to workload balancing — is designed to help teams collaborate better and ship faster.",
  },
  {
    icon: Heart,
    title: "Customer Obsession",
    description:
      "Every feature request gets read. Every bug report gets triaged. We build what teams actually need, not what looks good on a feature comparison chart.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "OrbisPM",
          url: "https://orbisom.live",
          logo: "https://orbisom.live/logo.svg",
          description: "AI-powered project management platform for modern engineering teams",
          foundingDate: "2024",
          sameAs: [
            "https://twitter.com/orbispm",
            "https://linkedin.com/company/orbispm",
            "https://discord.gg/orbispm",
          ],
        }}
      />
      <MarketingHeader />

      {/* Hero */}
      <section className="pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight max-w-4xl mx-auto">
            We&apos;re Building the Future of{" "}
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Project Management
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-base-content/60 max-w-3xl mx-auto leading-relaxed">
            OrbisPM was born from frustration with tools that slow teams down.
            We believe project management should be real-time, intelligent, secure,
            and designed specifically for engineering teams.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="pb-16">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { label: "Active Teams", value: "500+", desc: "Organizations worldwide" },
              { label: "Tasks Managed", value: "1M+", desc: "And counting every day" },
              { label: "Uptime", value: "99.9%", desc: "Enterprise-grade reliability" },
              { label: "AI Actions", value: "50K+", desc: "AI-powered decisions monthly" },
            ].map((stat) => (
              <div key={stat.label} className="bg-base-100 rounded-xl border border-base-200 p-6 text-center">
                <div className="text-3xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm font-semibold mt-1">{stat.label}</div>
                <div className="text-xs text-base-content/40 mt-0.5">{stat.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-16 bg-base-100 border-y border-base-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">Our Story</h2>
            <div className="prose prose-lg max-w-none text-base-content/70">
              <p>
                We started OrbisPM because every project management tool we tried fell short
                for engineering teams. Jira was bloated and slow. Asana lacked the permissions
                and compliance features enterprises need. Trello was too simple for complex
                software projects. And none of them had meaningful AI capabilities.
              </p>
              <p>
                So we built OrbisPM from scratch with a clear thesis: <strong>project management
                should be intelligent, real-time, and built for how engineers actually work</strong>.
              </p>
              <p>
                Our tech stack reflects this philosophy. A Go backend for raw performance.
                PostgreSQL with row-level security for bulletproof multi-tenancy.
                Redis-powered WebSockets for instant collaboration. Meilisearch for sub-50ms search.
                And AI woven throughout — not bolted on as an afterthought, but integrated into
                sprint planning, estimation, retrospectives, and backlog grooming.
              </p>
              <p>
                The frontend is built with Next.js 15 and React 19 for server-side rendering
                and instant navigation. Authentication is handled by Zitadel, an enterprise identity
                platform supporting SSO, MFA, and passwordless login.
                File storage uses MinIO (S3-compatible), making deployment flexible and cloud-agnostic.
              </p>
              <p>
                Today, OrbisPM serves hundreds of engineering teams worldwide — from 5-person startups
                to 500+ enterprise organizations. We&apos;re just getting started.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">What We Believe</h2>
            <p className="text-base-content/50 mt-3 text-lg">
              The principles that guide every product decision at OrbisPM
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {values.map((value) => (
              <div key={value.title} className="card bg-base-100 shadow-lg border border-base-200">
                <div className="card-body">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <value.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold">{value.title}</h3>
                  <p className="text-base-content/60 text-sm leading-relaxed">{value.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-base-100 border-t border-base-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">Ready to join the future?</h2>
          <p className="mt-4 text-lg text-base-content/60 max-w-xl mx-auto">
            Start managing your projects with AI-powered intelligence.
            Free to start, scales as you grow.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="btn btn-primary btn-lg gap-2">
              Get Started Free <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/contact" className="btn btn-outline btn-lg">
              Talk to Our Team
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
