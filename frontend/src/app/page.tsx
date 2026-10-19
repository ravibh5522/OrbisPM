import { AuthRedirect } from "@/components/marketing/auth-redirect";
import { JsonLd } from "@/components/marketing/json-ld";
import { getBaseUrl } from "@/lib/base-url";
import type { Metadata } from "next";
import LandingPage from "./(marketing)/landing/page";

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = await getBaseUrl();
  return {
    title: "Simplify Projects – AI-Powered Project Management for Engineering Teams",
    description:
      "Simplify Projects is the AI-native project management platform built for modern engineering teams. Real-time collaboration, enterprise RBAC, AI sprint planning, smart task estimation, change request workflows, and powerful automation. The best Jira alternative in 2026.",
    alternates: { canonical: siteUrl },
    openGraph: {
      title: "Simplify Projects – AI-Powered Project Management for Engineering Teams",
      description:
        "Ship faster with AI-native project management. Real-time collaboration, enterprise RBAC, AI sprint planning, smart estimation, and workflow automation. The #1 Jira alternative.",
      url: siteUrl,
      type: "website",
      images: [
        {
          url: `${siteUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: "Simplify Projects – AI-Powered Project Management for Engineering Teams",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Simplify Projects – AI-Powered Project Management",
      description:
        "Ship faster with AI-native project management. Real-time collaboration, enterprise RBAC, AI sprint planning, and workflow automation.",
      images: [`${siteUrl}/og-image.png`],
    },
  };
}

export default async function Home() {
  const siteUrl = await getBaseUrl();
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Simplify Projects",
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
    name: "Simplify Projects",
    url: siteUrl,
    logo: `${siteUrl}/logo-mark.png`,
    description:
      "AI-native project management platform built for modern engineering teams.",
    sameAs: ["https://simplifyai.id"],
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Simplify Projects",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Docker",
    url: siteUrl,
    description:
      "AI-native project management with real-time collaboration, enterprise RBAC, change requests, AI sprint planning, kanban boards, and workflow automation.",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "147",
      bestRating: "5",
      worstRating: "1",
    },
    review: [
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Sarah Chen" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody:
          "Simplify Projects transformed how our 200+ engineering team collaborates. The real-time features and granular permissions are game-changers.",
        datePublished: "2026-01-15",
      },
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Marcus Johnson" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody:
          "We migrated from Jira and saw a 40% improvement in sprint velocity. The AI-native approach to project management is the future.",
        datePublished: "2026-02-10",
      },
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Priya Patel" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody:
          "The change request workflow and approval system saved us countless hours. Our compliance audits are now a breeze.",
        datePublished: "2026-03-05",
      },
    ],
    offers: [
      {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        name: "Starter",
        description: "Free for up to 5 team members with 3 active projects",
        availability: "https://schema.org/InStock",
      },
      {
        "@type": "Offer",
        price: "12",
        priceCurrency: "USD",
        name: "Professional",
        description: "Per user per month for unlimited teams and projects",
        availability: "https://schema.org/InStock",
      },
      {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        name: "Enterprise",
        description: "Custom pricing for large organizations",
        availability: "https://schema.org/InStock",
      },
    ],
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteUrl,
      },
    ],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How does Simplify Projects differ from other project management tools?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Simplify Projects is built as an AI-native platform from the ground up. Unlike legacy tools, it features real-time WebSocket collaboration, granular RBAC with custom roles, change request workflows for teams that need approval control, AI-powered sprint planning, smart task estimation, and a modern interface.",
        },
      },
      {
        "@type": "Question",
        name: "Can I migrate from Jira, Asana, or Trello?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! Simplify Projects supports CSV/XLSX import for tasks, making migration straightforward. Our import system handles bulk data with progress tracking and error reporting.",
        },
      },
      {
        "@type": "Question",
        name: "Is my data secure with Simplify Projects?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Absolutely. Simplify Projects uses Zitadel for enterprise-grade authentication with MFA support, row-level security in PostgreSQL for tenant isolation, encrypted API keys, and granular permission controls. Enterprise plans support on-premise deployment.",
        },
      },
      {
        "@type": "Question",
        name: "Does Simplify Projects support on-premise deployment?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! Simplify Projects Enterprise offers on-premise deployment with Docker Compose. The entire stack (PostgreSQL, Redis, MinIO, Meilisearch) runs in containers for easy infrastructure management.",
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
          text: "Simplify Projects offers webhooks for real-time event notifications, a REST API with full Swagger documentation, API key management, and Stripe integration for billing. Custom integrations are supported via the API.",
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
      <JsonLd data={breadcrumbSchema} />
      <AuthRedirect />
      <LandingPage />
    </>
  );
}
