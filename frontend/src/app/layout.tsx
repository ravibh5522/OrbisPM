import { Providers } from "@/components/providers";
import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://orbisom.live";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "OrbisPM – AI-Powered Project Management for Engineering Teams",
    template: "%s | OrbisPM",
  },
  description:
    "OrbisPM is the AI-native project management platform built for modern engineering teams. Real-time collaboration, enterprise RBAC, change request workflows, AI sprint planning, smart task estimation, and powerful automation. The best Jira alternative in 2026.",
  keywords: [
    "project management software",
    "AI project management",
    "task management tool",
    "team collaboration platform",
    "Jira alternative",
    "Asana alternative",
    "Trello alternative",
    "kanban board software",
    "agile project management",
    "sprint planning software",
    "RBAC project management",
    "real-time collaboration tool",
    "project tracking software",
    "engineering project management",
    "software development project management",
    "AI task estimation",
    "automated sprint planning",
    "change request workflow",
    "project management for developers",
    "best project management tool 2026",
    "enterprise project management",
    "team productivity software",
    "workflow automation tool",
    "project analytics dashboard",
    "free project management software",
  ],
  authors: [{ name: "OrbisPM Team", url: SITE_URL }],
  creator: "OrbisPM",
  publisher: "OrbisPM",
  formatDetection: { email: false, telephone: false, address: false },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "OrbisPM",
    title: "OrbisPM – AI-Powered Project Management for Engineering Teams",
    description:
      "AI-native project management with real-time collaboration, enterprise RBAC, change request workflows, AI sprint planning, and powerful automation. The #1 Jira alternative for modern teams.",
  },
  twitter: {
    card: "summary_large_image",
    title: "OrbisPM – AI-Powered Project Management",
    description:
      "AI-native project management with real-time collaboration, enterprise RBAC, AI sprint planning, and workflow automation. Built for engineering teams.",
    creator: "@orbispm",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="orbis-light" suppressHydrationWarning>
      <body className="min-h-screen bg-base-200">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
