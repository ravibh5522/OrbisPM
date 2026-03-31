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
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/*/messages",
          "/*/projects/*/tasks",
          "/*/settings",
          "/*/members",
          "/*/profile",
          "/*/notifications",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
