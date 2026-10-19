import { Providers } from "@/components/providers";
import { getBaseUrl } from "@/lib/base-url";
import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["700", "800"],
  variable: "--font-jakarta",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = await getBaseUrl();
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: "Simplify Projects – AI-Powered Project Management for Engineering Teams",
      template: "%s | Simplify Projects",
    },
    description:
      "Simplify Projects is the AI-native project management platform built for modern engineering teams. Real-time collaboration, enterprise RBAC, change request workflows, AI sprint planning, smart task estimation, and powerful automation. The best Jira alternative in 2026.",
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
    authors: [{ name: "Simplify Projects Team", url: siteUrl }],
    creator: "Simplify Projects",
    publisher: "Simplify Projects",
    formatDetection: { email: false, telephone: false, address: false },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: siteUrl,
      siteName: "Simplify Projects",
      title: "Simplify Projects – AI-Powered Project Management for Engineering Teams",
      description:
        "AI-native project management with real-time collaboration, enterprise RBAC, change request workflows, AI sprint planning, and powerful automation. The #1 Jira alternative for modern teams.",
      images: [
        {
          url: "/og-image.png",
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
        { url: "/favicon.ico", sizes: "32x32" },
        { url: "/icon.png", type: "image/png" },
        { url: "/icon.png", type: "image/png", sizes: "32x32" },
      ],
      apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
      shortcut: "/favicon.ico",
    },
    category: "technology",
    classification: "Business Software",
    other: {
      "application-name": "Simplify Projects",
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
      <body className={`${geist.variable} ${jakarta.variable} ${jetbrains.variable} font-sans min-h-screen bg-base-200`}>
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
