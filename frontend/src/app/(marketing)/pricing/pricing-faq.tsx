"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

const faqs = [
  {
    q: "Is the Starter plan really free?",
    a: "Yes, completely free with no credit card required. Starter includes core project management features for up to 5 team members and 3 active projects. No time limits or hidden restrictions.",
  },
  {
    q: "What happens when I exceed my Starter plan limits?",
    a: "You'll be notified when approaching limits. You can upgrade to Professional anytime for unlimited members and projects. Your existing data and settings are preserved during the upgrade.",
  },
  {
    q: "Can I try Professional features before committing?",
    a: "Yes! Every new account gets a 14-day Professional trial with full access to AI features, change request workflows, custom roles, and all advanced capabilities. No credit card required for the trial.",
  },
  {
    q: "How does per-user pricing work?",
    a: "You're billed for active team members only. If you add or remove members mid-cycle, your bill is prorated. Deactivated users don't count toward your billing. Annual plans get a 20% discount.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit and debit cards via Stripe. Enterprise customers can pay via invoice with NET-30 terms. Annual billing is available for all paid plans.",
  },
  {
    q: "Is on-premise deployment available?",
    a: "Yes, Enterprise customers can deploy OrbisPM on their own infrastructure with Docker Compose. The entire stack runs in containers. Contact our sales team for on-premise pricing and deployment support.",
  },
  {
    q: "Can I switch plans anytime?",
    a: "Absolutely. Upgrade or downgrade at any time. When upgrading, you get immediate access to new features. When downgrading, changes take effect at the end of your current billing cycle.",
  },
  {
    q: "Do you offer discounts for nonprofits or education?",
    a: "Yes! We offer 50% off Professional plans for registered nonprofits and educational institutions. Contact us with proof of status to apply the discount.",
  },
];

export function PricingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => (
        <div
          key={i}
          className="border border-base-200 rounded-xl bg-base-100 overflow-hidden transition-shadow hover:shadow-md"
        >
          <button
            className="w-full flex items-center justify-between p-5 text-left"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            <span className="font-medium text-sm pr-4">{faq.q}</span>
            <ChevronDown
              className={`w-5 h-5 text-base-content/40 flex-shrink-0 transition-transform duration-200 ${
                openIndex === i ? "rotate-180" : ""
              }`}
            />
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ${
              openIndex === i ? "max-h-96 pb-5" : "max-h-0"
            }`}
          >
            <p className="px-5 text-sm text-base-content/60 leading-relaxed">{faq.a}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
