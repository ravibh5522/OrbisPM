import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact Us – Get in Touch with the OrbisPM Team",
  description:
    "Contact OrbisPM for demos, enterprise inquiries, technical support, or partnership opportunities. Our team responds within 24 hours. Email: hello@orbispm.in",
  alternates: { canonical: "/contact" },
  keywords: [
    "contact OrbisPM",
    "OrbisPM support",
    "project management demo",
    "enterprise project management inquiry",
    "OrbisPM sales team",
  ],
  openGraph: {
    title: "Contact OrbisPM – Sales, Support & Partnerships",
    description:
      "Get in touch with the OrbisPM team. We respond within 24 hours.",
    url: "/contact",
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contact OrbisPM",
          description:
            "Contact the OrbisPM team for sales, support, and partnerships",
          url: "https://orbisom.live/contact",
          mainEntity: {
            "@type": "Organization",
            name: "OrbisPM",
            email: "hello@orbispm.in",
            telephone: "+1-555-123-4567",
          },
        }}
      />
      <MarketingHeader />

      <section className="pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Get in Touch
            </h1>
            <p className="mt-4 text-lg text-base-content/60">
              Whether you need a demo, have a technical question, or want to
              discuss enterprise deployment options — our team is here to help.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            {/* Contact Info */}
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold mb-6">
                  Let&apos;s start a conversation
                </h2>
                <p className="text-base-content/60 leading-relaxed">
                  Looking for a demo? Need help with your deployment? Want to
                  discuss enterprise pricing? Our team responds within 24 hours.
                </p>
              </div>

              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Email</div>
                    <div className="text-base-content/60 text-sm">
                      hello@orbispm.in
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Office</div>
                    <div className="text-base-content/60 text-sm">
                      San Francisco, CA &amp; Bangalore, India
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Phone</div>
                    <div className="text-base-content/60 text-sm">
                      +1 (555) 123-4567
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Business Hours</div>
                    <div className="text-base-content/60 text-sm">
                      Mon–Fri, 9:00 AM – 6:00 PM PST
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-base-100 rounded-xl border border-base-200 p-6">
                <h3 className="font-semibold mb-2">Enterprise Deployment</h3>
                <p className="text-sm text-base-content/60 leading-relaxed">
                  Need on-premise deployment, custom SLAs, or dedicated support?
                  Our enterprise team can help you plan and execute your
                  deployment.{" "}
                  <a
                    href="mailto:enterprise@orbispm.in"
                    className="text-primary hover:underline"
                  >
                    enterprise@orbispm.in
                  </a>
                </p>
              </div>
            </div>

            {/* Contact Form */}
            <ContactForm />
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
