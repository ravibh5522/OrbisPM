import { getBaseUrl } from "@/lib/base-url";
import type { MetadataRoute } from "next";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getBaseUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/onboarding",
          "/_next/",
          "/*/messages",
          "/*/projects/*/tasks",
          "/*/settings",
          "/*/members",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
