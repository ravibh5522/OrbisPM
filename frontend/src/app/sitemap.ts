import { getBaseUrl } from "@/lib/base-url";
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getBaseUrl();
  const now = new Date();

  return [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${siteUrl}/features`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.6 },
    { url: `${siteUrl}/alternatives/jira`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${siteUrl}/alternatives/asana`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${siteUrl}/alternatives/trello`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${siteUrl}/blog/ai-sprint-planning-complete-guide`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/blog/real-time-collaboration-engineering-teams`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/blog/change-request-workflows-compliance`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
