import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service – Simplify Projects",
  description:
    "Simplify Projects terms of service. Read the terms and conditions governing the use of Simplify Projects project management platform.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: false },
  openGraph: {
    title: "Terms of Service – Simplify Projects",
    description:
      "Simplify Projects terms of service. Read the terms and conditions governing the use of the Simplify Projects platform.",
    url: "/terms",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Simplify Projects Terms of Service",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Terms of Service – Simplify Projects",
    description:
      "Simplify Projects terms of service. Read the terms and conditions governing the use of the Simplify Projects platform.",
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-base-200">
      <MarketingHeader />
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-20 md:py-28">
        <div className="max-w-4xl mx-auto prose prose-lg">
          <h1>Terms of Service</h1>
          <p className="text-base-content/60">Last updated: March 1, 2026</p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using Simplify Projects (&quot;the Service&quot;), operated by
            SimplifyAI (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;), you agree
            to be bound by these Terms of Service. If you do not agree, do not
            use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Simplify Projects is an AI-powered project management platform designed for
            engineering teams. The Service includes task management, sprint
            planning, real-time collaboration, AI-powered automation, reporting,
            and related features available through our web application and API.
          </p>

          <h2>3. Account Registration</h2>
          <ul>
            <li>
              You must provide accurate and complete registration information
            </li>
            <li>
              You are responsible for maintaining the security of your account
              credentials
            </li>
            <li>
              You must notify us immediately of any unauthorized access to your
              account
            </li>
            <li>You must be at least 16 years old to create an account</li>
            <li>
              One person or entity may not maintain more than one free account
            </li>
          </ul>

          <h2>4. Subscription Plans & Billing</h2>
          <h3>4.1 Plans</h3>
          <p>
            Simplify Projects offers Free, Professional, and Enterprise plans. Features
            and limits vary by plan as described on our{" "}
            <a href="/pricing">Pricing page</a>.
          </p>
          <h3>4.2 Payment</h3>
          <ul>
            <li>
              Professional and Enterprise plans require a paid subscription
            </li>
            <li>Billing is monthly or annual, as selected at checkout</li>
            <li>Prices are in USD and exclude applicable taxes</li>
            <li>Payment is processed securely via Stripe</li>
          </ul>
          <h3>4.3 Cancellation & Refunds</h3>
          <ul>
            <li>
              You may cancel your subscription at any time from your account
              settings
            </li>
            <li>
              Cancellation takes effect at the end of the current billing period
            </li>
            <li>
              We offer a 14-day money-back guarantee for annual subscriptions
            </li>
          </ul>

          <h2>5. Your Data</h2>
          <h3>5.1 Ownership</h3>
          <p>
            You retain all rights to the data you upload to or create within
            Simplify Projects. We do not claim ownership of your content.
          </p>
          <h3>5.2 License to Us</h3>
          <p>
            You grant us a limited license to store, process, and display your
            data solely for the purpose of providing the Service. This includes
            processing data through our AI features when enabled.
          </p>
          <h3>5.3 Data Export</h3>
          <p>
            You may export your data at any time using our built-in export
            tools. We support export in standard formats (CSV, JSON).
          </p>
          <h3>5.4 Data Deletion</h3>
          <p>
            Upon account or organization deletion, we permanently remove all
            associated data within 30 days. Backups are purged within 90 days.
          </p>

          <h2>6. AI Features</h2>
          <p>
            Simplify Projects includes AI-powered features such as task estimation, sprint
            planning suggestions, and natural language task creation. By using
            these features:
          </p>
          <ul>
            <li>
              You acknowledge that AI suggestions are assistive and may not
              always be accurate
            </li>
            <li>
              You remain responsible for all decisions made based on AI
              suggestions
            </li>
            <li>
              Your data processed by AI features is not used to train models for
              other customers
            </li>
            <li>AI features can be disabled at the organization level</li>
          </ul>

          <h2>7. Acceptable Use</h2>
          <p>You agree NOT to:</p>
          <ul>
            <li>Use the Service for any illegal purpose</li>
            <li>Upload malicious code, viruses, or harmful content</li>
            <li>
              Attempt to gain unauthorized access to other users&apos; accounts
              or data
            </li>
            <li>Interfere with or disrupt the Service&apos;s infrastructure</li>
            <li>
              Scrape, crawl, or use automated tools to extract data from the
              Service
            </li>
            <li>
              Resell or redistribute the Service without written permission
            </li>
            <li>Use the Service to send spam or unsolicited communications</li>
            <li>
              Reverse engineer, decompile, or attempt to extract the source code
              of the Service
            </li>
          </ul>

          <h2>8. Intellectual Property</h2>
          <p>
            The Service, including its design, code, features, documentation,
            and branding, is the proprietary property of Simplify Projects and is
            protected by intellectual property laws. You may not copy, modify,
            distribute, or create derivative works of the Service without our
            written permission.
          </p>

          <h2>9. API Usage</h2>
          <ul>
            <li>
              API access is subject to rate limits as specified in our
              documentation
            </li>
            <li>API keys must be kept confidential and not shared publicly</li>
            <li>
              We reserve the right to throttle or suspend API access for abuse
            </li>
            <li>API integrations must comply with these Terms</li>
          </ul>

          <h2>10. Service Availability</h2>
          <p>
            We strive for 99.9% uptime but do not guarantee uninterrupted
            service. We may perform scheduled maintenance with advance notice.
            We are not liable for downtime caused by factors beyond our
            reasonable control.
          </p>

          <h2>11. Enterprise Agreements</h2>
          <p>
            Enterprise customers may have separate agreements that supplement or
            supersede certain provisions of these Terms. Enterprise deployments,
            including on-premise installations, are governed by the applicable
            Enterprise License Agreement.
          </p>

          <h2>12. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, SIMPLIFY PROJECTS SHALL NOT BE LIABLE
            FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
            DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED
            DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER
            INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE SERVICE.
          </p>

          <h2>13. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless Simplify Projects from any claims,
            damages, losses, or expenses arising from your use of the Service or
            your violation of these Terms.
          </p>

          <h2>14. Termination</h2>
          <p>
            We may suspend or terminate your account if you violate these Terms.
            Upon termination, your right to use the Service ceases immediately.
            Provisions that by their nature should survive termination will
            survive (e.g., Limitation of Liability, Indemnification).
          </p>

          <h2>15. Changes to Terms</h2>
          <p>
            We may modify these Terms at any time. Material changes will be
            communicated via email or in-app notification at least 30 days
            before taking effect. Continued use of the Service after changes
            take effect constitutes acceptance.
          </p>

          <h2>16. Governing Law</h2>
          <p>
            These Terms are governed by and construed in accordance with
            applicable laws. Any disputes shall be resolved through binding
            arbitration.
          </p>

          <h2>17. Contact</h2>
          <p>
            For questions about these Terms, contact us at:{" "}
            <a href="mailto:contact@simplifyai.id">contact@simplifyai.id</a>
          </p>
        </div>
      </div>
      <MarketingFooter />
    </div>
  );
}
