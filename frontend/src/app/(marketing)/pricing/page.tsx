import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { ArrowRight, CheckSquare, Sparkles, X, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PricingFAQ } from "./pricing-faq";

export const metadata: Metadata = {
  title: "Pricing – Transparent Plans for Teams of Every Size",
  description:
    "OrbisPM pricing: Free starter plan for small teams, Professional at $12/user/mo with AI features and unlimited projects, Enterprise with custom pricing, SSO, and on-premise deployment. No hidden fees. Start free today.",
  alternates: { canonical: "/pricing" },
  keywords: [
    "project management pricing",
    "free project management software",
    "Jira alternative pricing",
    "affordable project management tool",
    "enterprise project management cost",
    "team collaboration pricing",
    "AI project management pricing",
    "project management free tier",
  ],
  openGraph: {
    title: "OrbisPM Pricing – Start Free, Scale as You Grow",
    description:
      "Free starter plan with core features. Professional at $12/user/mo with AI sprint planning and unlimited projects. Enterprise with SSO and on-premise deployment.",
    url: "/pricing",
  },
};

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Perfect for small teams getting started",
    features: [
      "Up to 5 team members",
      "3 active projects",
      "Kanban, list & tree views",
      "Real-time collaboration",
      "Basic RBAC (built-in roles)",
      "Email notifications",
      "Full-text search",
      "REST API access",
      "Community support",
    ],
    notIncluded: [
      "AI sprint planning",
      "Change request workflows",
      "Custom roles & permissions",
    ],
    cta: "Get Started Free",
    popular: false,
  },
  {
    name: "Professional",
    price: "$12",
    period: "/user/mo",
    description: "For growing teams that need AI and advanced workflows",
    features: [
      "Unlimited team members",
      "Unlimited projects",
      "AI sprint planning & estimation",
      "Predictive burndown charts",
      "Natural language task creation",
      "Change request workflows",
      "Custom roles & permissions",
      "Custom workflow automation",
      "Advanced analytics dashboards",
      "Time tracking & timesheets",
      "Webhooks & API keys",
      "Activity audit logs",
      "Priority email support",
    ],
    notIncluded: [],
    cta: "Start 14-Day Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations with advanced needs",
    features: [
      "Everything in Professional",
      "SSO / SAML authentication",
      "Advanced security controls",
      "On-premise deployment option",
      "AI automated retrospectives",
      "Cross-project dependency intelligence",
      "Team workload balancing AI",
      "Intelligent backlog grooming",
      "Custom integrations",
      "Dedicated account manager",
      "99.99% SLA guarantee",
      "Custom training & onboarding",
      "Phone & Slack support",
    ],
    notIncluded: [],
    cta: "Contact Sales",
    popular: false,
  },
];

const comparisonRows = [
  { feature: "Team members", starter: "Up to 5", pro: "Unlimited", enterprise: "Unlimited" },
  { feature: "Active projects", starter: "3", pro: "Unlimited", enterprise: "Unlimited" },
  { feature: "Task views (Kanban, List, Tree)", starter: true, pro: true, enterprise: true },
  { feature: "Real-time collaboration", starter: true, pro: true, enterprise: true },
  { feature: "Full-text search", starter: true, pro: true, enterprise: true },
  { feature: "REST API & webhooks", starter: true, pro: true, enterprise: true },
  { feature: "AI sprint planning", starter: false, pro: true, enterprise: true },
  { feature: "AI task estimation", starter: false, pro: true, enterprise: true },
  { feature: "Predictive burndown", starter: false, pro: true, enterprise: true },
  { feature: "Natural language task creation", starter: false, pro: true, enterprise: true },
  { feature: "Change request workflows", starter: false, pro: true, enterprise: true },
  { feature: "Custom roles & RBAC", starter: false, pro: true, enterprise: true },
  { feature: "Workflow automation", starter: false, pro: true, enterprise: true },
  { feature: "Time tracking", starter: false, pro: true, enterprise: true },
  { feature: "Advanced analytics", starter: false, pro: true, enterprise: true },
  { feature: "Activity audit logs", starter: false, pro: true, enterprise: true },
  { feature: "AI automated retrospectives", starter: false, pro: false, enterprise: true },
  { feature: "Cross-project dependencies", starter: false, pro: false, enterprise: true },
  { feature: "Workload balancing AI", starter: false, pro: false, enterprise: true },
  { feature: "Intelligent backlog grooming", starter: false, pro: false, enterprise: true },
  { feature: "SSO / SAML", starter: false, pro: false, enterprise: true },
  { feature: "On-premise deployment", starter: false, pro: false, enterprise: true },
  { feature: "SLA guarantee", starter: false, pro: false, enterprise: "99.99%" },
  { feature: "Support", starter: "Community", pro: "Priority email", enterprise: "Dedicated + phone" },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "OrbisPM Pricing",
          description: "AI-powered project management platform pricing plans",
          url: "https://orbispm.dev/pricing",
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "OrbisPM",
          description: "AI-powered project management platform for engineering teams",
          url: "https://orbispm.dev",
          brand: { "@type": "Brand", name: "OrbisPM" },
          offers: [
            { "@type": "Offer", price: "0", priceCurrency: "USD", name: "Starter", description: "Free plan for small teams" },
            { "@type": "Offer", price: "12", priceCurrency: "USD", name: "Professional", description: "Per user per month with AI features" },
          ],
        }}
      />
      <MarketingHeader />

      {/* Hero */}
      <section className="pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Simple Pricing
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            Start Free, Scale with{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Confidence
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-base-content/60 max-w-2xl mx-auto">
            Transparent pricing with no hidden fees. Every plan includes real-time collaboration
            and core project management features. Upgrade when you need AI and advanced workflows.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`card bg-base-100 border-2 transition-all duration-300 hover:-translate-y-1 ${
                  plan.popular ? "border-primary shadow-xl shadow-primary/10 relative" : "border-base-200 shadow-lg"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-content text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="card-body">
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  <p className="text-base-content/50 text-sm">{plan.description}</p>
                  <div className="mt-4 mb-6">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.period && <span className="text-base-content/50 text-sm">{plan.period}</span>}
                  </div>
                  <ul className="space-y-2.5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckSquare className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                    {plan.notIncluded.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-base-content/30">
                        <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="card-actions mt-6">
                    <Link
                      href={plan.name === "Enterprise" ? "/contact" : "/signup"}
                      className={`btn w-full ${plan.popular ? "btn-primary" : "btn-outline"}`}
                    >
                      {plan.cta} {plan.popular && <ArrowRight className="w-4 h-4" />}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 bg-base-100 border-y border-base-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Compare Plans Side by Side</h2>
            <p className="text-base-content/50 mt-2">Every detail, no surprises</p>
          </div>
          <div className="overflow-x-auto max-w-5xl mx-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="text-left">Feature</th>
                  <th className="text-center">Starter</th>
                  <th className="text-center bg-primary/5">Professional</th>
                  <th className="text-center">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.feature} className="border-b border-base-200">
                    <td className="font-medium text-sm">{row.feature}</td>
                    {[row.starter, row.pro, row.enterprise].map((val, i) => (
                      <td key={i} className={`text-center text-sm ${i === 1 ? "bg-primary/5" : ""}`}>
                        {val === true ? (
                          <span className="text-success font-bold">✓</span>
                        ) : val === false ? (
                          <span className="text-base-content/20">—</span>
                        ) : (
                          <span>{val}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* On-premise note */}
      <section className="py-12">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="max-w-3xl mx-auto bg-base-100 rounded-2xl border border-base-200 p-8 text-center">
            <div className="inline-flex items-center gap-2 text-primary mb-3">
              <Zap className="w-5 h-5" />
              <span className="font-semibold">Need On-Premise Deployment?</span>
            </div>
            <p className="text-base-content/60 text-sm leading-relaxed">
              Enterprise customers can deploy OrbisPM on their own infrastructure with Docker Compose.
              The entire stack runs in containers for maximum control and data sovereignty. Contact our sales team for pricing and deployment support.
            </p>
            <Link href="/contact" className="btn btn-primary btn-sm mt-4">
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Pricing FAQ</h2>
          </div>
          <PricingFAQ />
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
