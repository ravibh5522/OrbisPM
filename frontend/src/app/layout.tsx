import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "OrbisPM – Project Management",
  description: "Modern project management platform",
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
