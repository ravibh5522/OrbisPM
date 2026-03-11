import { getBaseUrl } from "@/lib/base-url";
import { AuthRedirect } from "@/components/marketing/auth-redirect";
import { JsonLd } from "@/components/marketing/json-ld";
import type { Metadata } from "next";
import LandingPage from "./(marketing)/landing/page";

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = await getBaseUrl();
  return {
    title: "OrbisPM – AI-Powered Project Management for Engineering Teams",
    description:
      "OrbisPM is the AI-native project management platform built for modern engineering teams. Real-time collaboration, enterprise RBAC, AI sprint planning, smart task estimation, change request workflows, and powerful automation. The best Jira alternative in 2026.",
    alternates: { canonical: siteUrl },
    openGraph: {
      title: "OrbisPM – AI-Powered Project Management for Engineering Teams",
      description:
      "Ship faster with AI-native project management. Real-time collaboration, enterprise RBAC, AI sprint planning, smart estimation, and workflow automation. The #1 Jira alternative.",
      url: siteUrl,
      type: "website",
    },
  };
}

export default async function Home() {
  const siteUrl = await getBaseUrl();
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "OrbisPM",
    url: siteUrl,
    description:
      "AI-native project management platform for modern engineering teams.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "OrbisPM",
    url: siteUrl,
    logo: `${siteUrl}/logo.svg`,
    description:
      "AI-native project management platform built for modern engineering teams.",
    sameAs: [
      "https://github.com/orbispm",
      "https://twitter.com/orbispm",
      "https://linkedin.com/company/orbispm",
    ],
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "OrbisPM",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Docker",
    url: siteUrl,
    description:
      "AI-native project management with real-time collaboration, enterprise RBAC, change requests, AI sprint planning, kanban boards, and workflow automation.",
    offers: [
      {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        name: "Starter",
        description: "Free for up to 5 team members",
      },
      {
        "@type": "Offer",
        price: "12",
        priceCurrency: "USD",
        name: "Professional",
        description: "Per user per month for unlimited teams",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      ratingCount: "247",
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How does OrbisPM differ from other project management tools?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "OrbisPM is built as an AI-native platform from the ground up. Unlike legacy tools, it features real-time WebSocket collaboration, granular RBAC with custom roles, change request workflows for teams that need approval control, AI-powered sprint planning, smart task estimation, and a modern interface.",
        },
      },
      {
        "@type": "Question",
        name: "Can I migrate from Jira, Asana, or Trello?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! OrbisPM supports CSV/XLSX import for tasks, making migration straightforward. Our import system handles bulk data with progress tracking and error reporting.",
        },
      },
      {
        "@type": "Question",
        name: "Is my data secure with OrbisPM?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Absolutely. OrbisPM uses Zitadel for enterprise-grade authentication with MFA support, row-level security in PostgreSQL for tenant isolation, encrypted API keys, and granular permission controls. Enterprise plans support on-premise deployment.",
        },
      },
      {
        "@type": "Question",
        name: "Does OrbisPM support on-premise deployment?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! OrbisPM Enterprise offers on-premise deployment with Docker Compose. The entire stack (PostgreSQL, Redis, MinIO, Meilisearch) runs in containers for easy infrastructure management.",
        },
      },
      {
        "@type": "Question",
        name: "Is there a free plan?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! The Starter plan is completely free for teams of up to 5 members with 3 active projects. No credit card required to get started.",
        },
      },
      {
        "@type": "Question",
        name: "What integrations are available?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "OrbisPM offers webhooks for real-time event notifications, a REST API with full Swagger documentation, API key management, and Stripe integration for billing. Custom integrations are supported via the API.",
        },
      },
    ],
  };

  return (
    <>
      <JsonLd data={websiteSchema} />
      <JsonLd data={organizationSchema} />
      <JsonLd data={softwareSchema} />
      <JsonLd data={faqSchema} />
      <AuthRedirect />
      <LandingPage />
    </>
  );
}
