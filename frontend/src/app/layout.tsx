import { Providers } from "@/components/providers";
import { getBaseUrl } from "@/lib/base-url";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = await getBaseUrl();
  return {
    metadataBase: new URL(siteUrl),
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
    authors: [{ name: "OrbisPM Team", url: siteUrl }],
    creator: "OrbisPM",
    publisher: "OrbisPM",
    formatDetection: { email: false, telephone: false, address: false },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: siteUrl,
      siteName: "OrbisPM",
      title: "OrbisPM – AI-Powered Project Management for Engineering Teams",
      description:
        "AI-native project management with real-time collaboration, enterprise RBAC, change request workflows, AI sprint planning, and powerful automation. The #1 Jira alternative for modern teams.",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: "OrbisPM – AI-Powered Project Management for Engineering Teams",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "OrbisPM – AI-Powered Project Management",
      description:
        "AI-native project management with real-time collaboration, enterprise RBAC, AI sprint planning, and workflow automation. Built for engineering teams.",
      creator: "@orbispm",
      images: ["/og-image.png"],
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
      canonical: siteUrl,
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/icon.png", type: "image/png", sizes: "32x32" },
      ],
      apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
      shortcut: "/favicon.ico",
    },
    category: "technology",
    classification: "Business Software",
    other: {
      "application-name": "OrbisPM",
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="orbis-light" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans min-h-screen bg-base-200`}>
        {/* Inline script runs synchronously before first paint, preventing
            the glass-theme FOUC where data-theme="orbis-light" briefly
            shows before React's ThemeInitializer useEffect fires. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var v=['glass-light','glass-dark','orbis-light','orbis-dark'];if(v.indexOf(t)!==-1&&t!=='orbis-light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
