import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy – OrbisPM",
  description:
    "OrbisPM privacy policy. Learn how we collect, use, and protect your data. GDPR compliant, enterprise-grade data protection.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-base-200">
      <MarketingHeader />
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-20 md:py-28">
        <div className="max-w-4xl mx-auto prose prose-lg">
          <h1>Privacy Policy</h1>
          <p className="text-base-content/60">Last updated: March 1, 2026</p>

          <h2>1. Introduction</h2>
          <p>
            OrbisPM (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) operates
            the orbisom.live website and the OrbisPM project management platform
            (the &quot;Service&quot;). This Privacy Policy explains how we
            collect, use, disclose, and protect your personal information when
            you use our Service.
          </p>

          <h2>2. Information We Collect</h2>
          <h3>2.1 Account Information</h3>
          <p>When you create an account, we collect:</p>
          <ul>
            <li>Name and email address</li>
            <li>Organization name</li>
            <li>
              Password (stored as a cryptographic hash — we never store
              plaintext passwords)
            </li>
            <li>Profile picture (optional)</li>
          </ul>

          <h3>2.2 Usage Data</h3>
          <p>We automatically collect:</p>
          <ul>
            <li>Device and browser information</li>
            <li>IP address and approximate location</li>
            <li>Pages visited and features used</li>
            <li>Performance metrics and error logs</li>
          </ul>

          <h3>2.3 Project Data</h3>
          <p>
            Data you create within OrbisPM — tasks, comments, files, dashboards
            — is stored securely and is only accessible by members of your
            organization. We use strict tenant isolation (PostgreSQL Row-Level
            Security) to ensure no other organization can access your data.
          </p>

          <h2>3. How We Use Your Information</h2>
          <ul>
            <li>To provide, maintain, and improve the Service</li>
            <li>
              To personalize your experience and provide AI-powered features
              (task estimation, sprint planning suggestions)
            </li>
            <li>
              To communicate with you about your account, updates, and support
            </li>
            <li>To detect and prevent fraud, abuse, and security incidents</li>
            <li>To comply with legal obligations</li>
          </ul>

          <h2>4. AI Features & Data Processing</h2>
          <p>
            OrbisPM includes AI-powered features such as task estimation, sprint
            planning suggestions, and natural language task creation. When you
            use these features:
          </p>
          <ul>
            <li>
              Your project data may be processed by our AI models to generate
              suggestions
            </li>
            <li>
              We do not use your project data to train AI models shared with
              other customers
            </li>
            <li>AI processing happens within our secure infrastructure</li>
            <li>
              You can disable AI features at the organization level in Settings
            </li>
          </ul>

          <h2>5. Data Sharing</h2>
          <p>We do not sell your personal data. We may share data with:</p>
          <ul>
            <li>
              <strong>Service providers:</strong> hosting (cloud
              infrastructure), email delivery, payment processing (Stripe),
              authentication (Zitadel)
            </li>
            <li>
              <strong>Legal requirements:</strong> when required by law, court
              order, or governmental regulation
            </li>
            <li>
              <strong>Business transfers:</strong> in connection with a merger,
              acquisition, or sale of assets
            </li>
          </ul>

          <h2>6. Data Security</h2>
          <p>We implement industry-standard security measures including:</p>
          <ul>
            <li>Encryption in transit (TLS 1.3) and at rest (AES-256)</li>
            <li>PostgreSQL Row-Level Security for tenant data isolation</li>
            <li>Regular security audits and penetration testing</li>
            <li>
              Role-based access control (RBAC) with principle of least privilege
            </li>
            <li>Automated threat detection and monitoring</li>
          </ul>

          <h2>7. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active. When you
            delete your account or organization, we permanently delete all
            associated data within 30 days. Backups containing your data are
            purged within 90 days.
          </p>

          <h2>8. Your Rights (GDPR & CCPA)</h2>
          <p>You have the right to:</p>
          <ul>
            <li>
              <strong>Access:</strong> Request a copy of your personal data
            </li>
            <li>
              <strong>Rectification:</strong> Correct inaccurate personal data
            </li>
            <li>
              <strong>Deletion:</strong> Request deletion of your personal data
            </li>
            <li>
              <strong>Portability:</strong> Export your data in a
              machine-readable format
            </li>
            <li>
              <strong>Restriction:</strong> Limit how we process your data
            </li>
            <li>
              <strong>Objection:</strong> Object to data processing for specific
              purposes
            </li>
          </ul>
          <p>
            To exercise any of these rights, contact us at{" "}
            <a href="mailto:privacy@orbispm.in">privacy@orbispm.in</a>.
          </p>

          <h2>9. Cookies</h2>
          <p>
            We use essential cookies for authentication and session management.
            We use analytics cookies only with your consent.
          </p>

          <h2>10. International Data Transfers</h2>
          <p>
            Your data may be processed in countries outside your own. We ensure
            appropriate safeguards (Standard Contractual Clauses, adequacy
            decisions) are in place for all international transfers.
          </p>

          <h2>11. Enterprise Deployment</h2>
          <p>
            Enterprise customers with on-premise deployment retain full control
            over their data infrastructure. In these deployments, your data
            never leaves your own network.
          </p>

          <h2>12. Children&apos;s Privacy</h2>
          <p>
            Our Service is not directed to children under 16. We do not
            knowingly collect personal information from children under 16.
          </p>

          <h2>13. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify
            you of material changes via email or a prominent notice within the
            Service.
          </p>

          <h2>14. Contact Us</h2>
          <p>
            For privacy-related questions or concerns, contact us at:{" "}
            <a href="mailto:privacy@orbispm.in">privacy@orbispm.in</a>
          </p>
        </div>
      </div>
      <MarketingFooter />
    </div>
  );
}
