import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OrbisPM – AI-Powered Project Management",
    short_name: "OrbisPM",
    description:
      "AI-native project management platform for modern engineering teams. Real-time collaboration, enterprise RBAC, AI sprint planning, and workflow automation.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f5",
    theme_color: "#6366f1",
    icons: [
      { src: "/logo-mark.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
