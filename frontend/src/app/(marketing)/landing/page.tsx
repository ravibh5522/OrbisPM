"use client";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CheckSquare,
  ChevronDown,
  Clock,
  Eye,
  FileText,
  FolderKanban,
  GitBranch,
  Globe,
  Layers,
  Lock,
  Mail, MapPin,
  Menu,
  MessageSquare,
  Phone,
  Search,
  Send,
  Shield,
  Sparkles,
  Star,
  Target, TrendingUp,
  Users,
  Webhook,
  Workflow,
  X,
  Zap
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* ─────────────────── Contact Form State ─────────────────── */
interface ContactForm {
  name: string;
  email: string;
  company: string;
  message: string;
}

/* ─────────────────── Animated Counter ─────────────────── */
function AnimatedCounter({ target, suffix = "", duration = 2000 }: { target: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const step = target / (duration / 16);
          let current = 0;
          const timer = setInterval(() => {
            current += step;
            if (current >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
            }
          }, 16);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <div ref={ref} className="text-4xl md:text-5xl font-bold text-primary">
      {count.toLocaleString()}{suffix}
    </div>
  );
}

/* ─────────────────── Feature Card ─────────────────── */
function FeatureCard({ icon: Icon, title, description, delay }: {
  icon: React.ElementType; title: string; description: string; delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`card bg-base-100 shadow-lg hover:shadow-xl transition-all duration-500 hover:-translate-y-1 border border-base-200 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="card-body">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
          <Icon className="w-6 h-6 text-primary" />
        </div>
        <h3 className="card-title text-lg">{title}</h3>
        <p className="text-base-content/60 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* ─────────────────── Testimonial ─────────────────── */
const testimonials = [
  {
    name: "Sarah Chen",
    role: "VP Engineering, TechScale Inc.",
    avatar: "SC",
    color: "bg-primary",
    text: "OrbisPM transformed how our 200+ engineering team collaborates. The real-time features and granular permissions are game-changers.",
    rating: 5,
  },
  {
    name: "Marcus Johnson",
    role: "CTO, InnovateLab",
    avatar: "MJ",
    color: "bg-secondary",
    text: "We migrated from Jira and saw a 40% improvement in sprint velocity. The AI-native approach to project management is the future.",
    rating: 5,
  },
  {
    name: "Priya Patel",
    role: "Product Manager, DataForge",
    avatar: "PP",
    color: "bg-accent",
    text: "The change request workflow and approval system saved us countless hours. Our compliance audits are now a breeze.",
    rating: 5,
  },
];

/* ─────────────────── Pricing Plans ─────────────────── */
const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Perfect for small teams getting started",
    features: [
      "Up to 5 team members",
      "3 active projects",
      "Basic task management",
      "Kanban & list views",
      "Email notifications",
      "Community support",
    ],
    cta: "Get Started Free",
    popular: false,
  },
  {
    name: "Professional",
    price: "$12",
    period: "/user/mo",
    description: "For growing teams that need more power",
    features: [
      "Unlimited team members",
      "Unlimited projects",
      "Advanced permissions & roles",
      "Custom workflows & rules",
      "Real-time collaboration",
      "Webhooks & API access",
      "Priority support",
      "Activity audit logs",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations with advanced needs",
    features: [
      "Everything in Professional",
      "SSO / SAML authentication",
      "Advanced security & compliance",
      "Custom integrations",
      "Dedicated account manager",
      "SLA guarantee",
      "On-premise deployment",
      "Custom training & onboarding",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

/* ─────────────────── FAQ ─────────────────── */
const faqs = [
  {
    q: "How does OrbisPM differ from other project management tools?",
    a: "OrbisPM is built as an AI-native platform from the ground up. Unlike legacy tools, it features real-time WebSocket collaboration, granular RBAC with custom roles, change request workflows for regulated environments, AI-powered sprint planning, smart task estimation, and a modern DaisyUI interface.",
  },
  {
    q: "Can I migrate from Jira, Asana, or Trello?",
    a: "Yes! OrbisPM supports CSV/XLSX import for tasks, making migration straightforward. Our import system handles bulk data with progress tracking and error reporting.",
  },
  {
    q: "Is my data secure?",
    a: "Absolutely. OrbisPM uses Zitadel for enterprise-grade authentication with MFA support, row-level security in PostgreSQL, encrypted API keys, and granular permission controls. Enterprise plans support on-premise deployment.",
  },
  {
    q: "Does OrbisPM support on-premise deployment?",
    a: "Yes! OrbisPM Enterprise offers on-premise deployment with Docker Compose. The entire stack (PostgreSQL, Redis, MinIO, Meilisearch) runs in containers, giving your team full control over infrastructure.",
  },
  {
    q: "What integrations are available?",
    a: "OrbisPM offers webhooks for real-time event notifications, a REST API with full Swagger documentation, API key management, and Stripe integration for billing. Custom integrations are supported via the API.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes! Our Starter plan is completely free for teams of up to 5 members with 3 active projects. No credit card required to get started.",
  },
];

/* ─────────────────── Main Landing Page ─────────────────── */
export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [contactForm, setContactForm] = useState<ContactForm>({ name: "", email: "", company: "", message: "" });
  const [contactStatus, setContactStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [contactError, setContactError] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus("sending");
    setContactError("");

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${API_BASE}/api/v1/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Failed to send message" }));
        throw new Error(body.message || "Failed to send message");
      }
      setContactStatus("sent");
      setContactForm({ name: "", email: "", company: "", message: "" });
    } catch (err) {
      setContactStatus("error");
      setContactError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "Testimonials", href: "#testimonials" },
    { label: "FAQ", href: "#faq" },
    { label: "Contact", href: "#contact" },
  ];

  return (
    <div className="min-h-screen bg-base-200" data-theme="orbis">
      {/* ─────────── Navbar ─────────── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-base-100/95 backdrop-blur-md shadow-lg border-b border-base-200" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
                <Layers className="w-5 h-5 text-primary-content" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                OrbisPM
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 text-sm font-medium text-base-content/70 hover:text-primary transition-colors rounded-lg hover:bg-base-200"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {/* CTA Buttons */}
            <div className="hidden lg:flex items-center gap-3">
              <Link href="/login" className="btn btn-ghost btn-sm">
                Sign In
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm gap-1">
                Get Started <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="lg:hidden btn btn-ghost btn-sm btn-square"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden pb-4 border-t border-base-200 bg-base-100/95 backdrop-blur-md">
              <nav className="flex flex-col gap-1 pt-3">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="px-3 py-2 text-sm font-medium text-base-content/70 hover:text-primary rounded-lg hover:bg-base-200"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
                <div className="flex gap-2 pt-3 px-3">
                  <Link href="/login" className="btn btn-ghost btn-sm flex-1">Sign In</Link>
                  <Link href="/signup" className="btn btn-primary btn-sm flex-1">Get Started</Link>
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* ─────────── Hero Section ─────────── */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-secondary/5 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-accent/3 blur-3xl" />
        </div>

        <div className="relative w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <Sparkles className="w-4 h-4" />
              AI-Native Project Management
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight">
              Ship Faster with{" "}
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Intelligent
              </span>{" "}
              Project Management
            </h1>

            <p className="mt-6 text-lg md:text-xl text-base-content/60 max-w-2xl mx-auto leading-relaxed">
              OrbisPM brings real-time collaboration, granular permissions, change request workflows,
              and powerful automation to modern engineering teams. AI-powered & enterprise-ready.
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup" className="btn btn-primary btn-lg gap-2 shadow-lg shadow-primary/25">
                Start Free — No Card Required <ArrowRight className="w-5 h-5" />
              </Link>
              <a href="#features" className="btn btn-ghost btn-lg gap-2">
                <Eye className="w-5 h-5" /> Explore Features
              </a>
            </div>

            {/* Trust badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-base-content/40 text-sm">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> Enterprise-grade security
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4" /> On-premise deployment
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4" /> Real-time collaboration
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="w-4 h-4" /> Free to get started
              </div>
            </div>
          </div>

          {/* Hero Screenshot / App Preview */}
          <div className="mt-16 relative max-w-5xl mx-auto">
            <div className="rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-base-200 bg-base-100">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-error/60" />
                  <div className="w-3 h-3 rounded-full bg-warning/60" />
                  <div className="w-3 h-3 rounded-full bg-success/60" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="bg-base-200 rounded-lg px-4 py-1 text-xs text-base-content/40 min-w-[200px] text-center">
                    app.orbispm.dev
                  </div>
                </div>
              </div>
              {/* App mockup content */}
              <div className="p-6 bg-base-200/50">
                <div className="grid grid-cols-12 gap-4 min-h-[350px]">
                  {/* Sidebar mockup */}
                  <div className="col-span-2 bg-base-100 rounded-xl p-3 space-y-3">
                    <div className="w-8 h-8 bg-primary rounded-lg" />
                    <div className="space-y-2">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className={`h-8 rounded-lg ${i === 2 ? "bg-primary/20 border border-primary/30" : "bg-base-200"}`} />
                      ))}
                    </div>
                  </div>
                  {/* Main content mockup */}
                  <div className="col-span-10 space-y-4">
                    {/* Header bar */}
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-40 bg-base-100 rounded-lg" />
                      <div className="flex-1" />
                      <div className="h-8 w-24 bg-primary/20 rounded-lg" />
                      <div className="h-8 w-8 bg-base-100 rounded-lg" />
                    </div>
                    {/* Kanban columns */}
                    <div className="grid grid-cols-4 gap-3">
                      {["To Do", "In Progress", "Review", "Done"].map((col, ci) => (
                        <div key={col} className="bg-base-100 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-2 h-2 rounded-full ${
                              ci === 0 ? "bg-base-content/30" : ci === 1 ? "bg-info" : ci === 2 ? "bg-warning" : "bg-success"
                            }`} />
                            <span className="text-xs font-medium text-base-content/60">{col}</span>
                            <span className="text-xs text-base-content/30 ml-auto">{3 - ci + 1}</span>
                          </div>
                          {[...Array(3 - ci + 1)].map((_, i) => (
                            <div key={i} className="bg-base-200/60 rounded-lg p-2.5 space-y-1.5 border border-base-200">
                              <div className={`h-2.5 rounded w-${["3/4", "2/3", "full", "1/2"][i % 4]} bg-base-300`} />
                              <div className="h-2 rounded w-1/2 bg-base-300/60" />
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className="w-4 h-4 rounded-full bg-primary/30" />
                                <div className="h-1.5 rounded w-12 bg-base-300/40" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Floating elements */}
            <div className="absolute -top-4 -right-4 bg-success text-success-content rounded-xl px-3 py-2 text-xs font-semibold shadow-lg animate-bounce">
              ✓ Real-time sync
            </div>
            <div className="absolute -bottom-4 -left-4 bg-primary text-primary-content rounded-xl px-3 py-2 text-xs font-semibold shadow-lg">
              🔒 Enterprise RBAC
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Stats Section ─────────── */}
      <section className="py-16 bg-base-100 border-y border-base-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <AnimatedCounter target={10000} suffix="+" />
              <p className="text-base-content/50 mt-1 text-sm font-medium">Active Users</p>
            </div>
            <div>
              <AnimatedCounter target={500} suffix="+" />
              <p className="text-base-content/50 mt-1 text-sm font-medium">Organizations</p>
            </div>
            <div>
              <AnimatedCounter target={1} suffix="M+" />
              <p className="text-base-content/50 mt-1 text-sm font-medium">Tasks Managed</p>
            </div>
            <div>
              <AnimatedCounter target={99} suffix=".9%" />
              <p className="text-base-content/50 mt-1 text-sm font-medium">Uptime SLA</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Features Grid ─────────── */}
      <section id="features" className="py-20 md:py-28">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 text-secondary text-sm font-medium mb-4">
              <Zap className="w-3.5 h-3.5" /> Powerful Features
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">Everything you need to manage projects at scale</h2>
            <p className="mt-4 text-base-content/60 text-lg">
              From task management to team governance — OrbisPM has every feature your team needs, built into one unified platform.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard delay={0} icon={FolderKanban} title="Multi-View Projects" description="Switch between Kanban boards, list views, tree hierarchies, and calendar views. Each project adapts to how your team works best." />
            <FeatureCard delay={100} icon={Users} title="Team Collaboration" description="Real-time WebSocket updates, @mentions in comments, task watchers, and presence indicators. Everyone stays in sync instantly." />
            <FeatureCard delay={200} icon={Shield} title="Enterprise RBAC" description="Granular role-based access with custom roles, org/team/project scopes, and permission inheritance. Control exactly who can do what." />
            <FeatureCard delay={300} icon={GitBranch} title="Change Requests" description="Submit task changes for review before they go live. Requires designated approvers to sign off, giving teams full control over what actually changes." />
            <FeatureCard delay={400} icon={Workflow} title="Custom Rules & Automation" description="Set task completion rules, auto-assign tasks, create dependency chains, and build custom workflows with powerful rule engines." />
            <FeatureCard delay={500} icon={BarChart3} title="Rich Dashboards" description="Organization and project dashboards with real-time charts, task distribution, velocity tracking, and team performance metrics." />
            <FeatureCard delay={600} icon={Bell} title="Smart Notifications" description="Configurable notification preferences per channel. Get notified about what matters — assignments, mentions, reviews, and deadlines." />
            <FeatureCard delay={700} icon={Search} title="Full-Text Search" description="Powered by Meilisearch for instant, typo-tolerant search across all tasks, projects, comments, and documents in your organization." />
            <FeatureCard delay={800} icon={FileText} title="Templates & Import" description="Create task templates for repeatable workflows. Import tasks via CSV/XLSX with progress tracking and validation." />
            <FeatureCard delay={900} icon={CheckSquare} title="Checklists & Subtasks" description="Break tasks into checklists, create unlimited subtask hierarchies, set dependencies, and track completion with progress bars." />
            <FeatureCard delay={1000} icon={Webhook} title="Webhooks & API" description="Connect OrbisPM to your existing tools. Full REST API with Swagger docs, webhook event notifications, and API key management." />
            <FeatureCard delay={1100} icon={Activity} title="Activity Audit Log" description="Complete audit trail of every action in your organization. Track who did what, when, and where — full operational transparency." />
          </div>
        </div>
      </section>

      {/* ─────────── How It Works ─────────── */}
      <section id="how-it-works" className="py-20 md:py-28 bg-base-100">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4">
              <Target className="w-3.5 h-3.5" /> Getting Started
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">Up and running in minutes</h2>
            <p className="mt-4 text-base-content/60 text-lg">
              OrbisPM is designed to get out of your way. Set up your organization, invite your team, and start shipping.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", icon: Globe, title: "Create Organization", desc: "Sign up and create your organization. Customize it with your branding, timezone, and industry settings." },
              { step: "02", icon: Users, title: "Invite Your Team", desc: "Add team members by email. Assign roles (owner, admin, member, viewer) with fine-grained permissions." },
              { step: "03", icon: FolderKanban, title: "Set Up Projects", desc: "Create projects, organize into teams, set up custom rules and workflows. Import existing tasks from CSV." },
              { step: "04", icon: TrendingUp, title: "Ship & Iterate", desc: "Track progress with dashboards, collaborate in real-time, review changes, and ship features faster than ever." },
            ].map((item, i) => (
              <div key={item.step} className="relative text-center group">
                {i < 3 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary/30 to-transparent" />
                )}
                <div className="w-24 h-24 mx-auto rounded-2xl bg-base-200 group-hover:bg-primary/10 transition-colors duration-300 flex items-center justify-center relative">
                  <item.icon className="w-10 h-10 text-primary" />
                  <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-primary-content text-xs font-bold flex items-center justify-center">
                    {item.step}
                  </div>
                </div>
                <h3 className="text-lg font-semibold mt-5">{item.title}</h3>
                <p className="text-base-content/60 text-sm mt-2 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Feature Showcase (alternating) ─────────── */}
      <section className="py-20 md:py-28">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 space-y-24">
          {/* Showcase 1: Real-time Collaboration */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-info/10 text-info text-sm font-medium mb-4">
                <Zap className="w-3.5 h-3.5" /> Real-time
              </div>
              <h3 className="text-2xl md:text-3xl font-bold">Collaborate in Real-time</h3>
              <p className="mt-4 text-base-content/60 leading-relaxed">
                Every change syncs instantly across all connected clients via WebSockets.
                See who&apos;s online, who&apos;s viewing the same task, and collaborate without conflicts.
              </p>
              <ul className="mt-6 space-y-3">
                {["Live cursor & presence indicators", "Instant task updates across all views", "Real-time comment threads with @mentions", "Conflict-free concurrent editing"].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                      <CheckSquare className="w-3 h-3 text-success" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Visual */}
            <div className="bg-base-100 rounded-2xl border border-base-200 p-6 shadow-xl">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-content text-xs font-bold">SC</div>
                  <div className="flex-1 bg-base-200 rounded-lg p-3">
                    <div className="text-xs font-medium">Sarah moved &ldquo;Auth flow refactor&rdquo; to <span className="badge badge-sm badge-info">In Progress</span></div>
                    <div className="text-[10px] text-base-content/40 mt-0.5">Just now</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-secondary-content text-xs font-bold">MJ</div>
                  <div className="flex-1 bg-base-200 rounded-lg p-3">
                    <div className="text-xs font-medium">Marcus commented on &ldquo;API rate limiting&rdquo;: <span className="text-base-content/60">&ldquo;Looks good, approved!&rdquo;</span></div>
                    <div className="text-[10px] text-base-content/40 mt-0.5">2 seconds ago</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-content text-xs font-bold">PP</div>
                  <div className="flex-1 bg-base-200 rounded-lg p-3">
                    <div className="text-xs font-medium">Priya created task &ldquo;Dashboard chart improvements&rdquo; in <span className="font-semibold">Sprint 24</span></div>
                    <div className="text-[10px] text-base-content/40 mt-0.5">5 seconds ago</div>
                  </div>
                </div>
                <div className="border-t border-base-200 pt-3 flex items-center gap-2">
                  <div className="flex -space-x-2">
                    <div className="w-6 h-6 rounded-full bg-primary border-2 border-base-100" />
                    <div className="w-6 h-6 rounded-full bg-secondary border-2 border-base-100" />
                    <div className="w-6 h-6 rounded-full bg-accent border-2 border-base-100" />
                  </div>
                  <span className="text-[10px] text-base-content/40">3 people viewing this project</span>
                  <div className="ml-auto flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-[10px] text-success">Live</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Showcase 2: Permissions */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Visual */}
            <div className="order-2 md:order-1 bg-base-100 rounded-2xl border border-base-200 p-6 shadow-xl">
              <div className="space-y-3">
                <div className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Permission Matrix
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-base-200">
                        <th className="text-left py-2 pr-4 text-base-content/50">Permission</th>
                        <th className="text-center py-2 px-2">Owner</th>
                        <th className="text-center py-2 px-2">Admin</th>
                        <th className="text-center py-2 px-2">Member</th>
                        <th className="text-center py-2 px-2">Viewer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Create Projects", true, true, false, false],
                        ["Manage Members", true, true, false, false],
                        ["Edit Tasks", true, true, true, false],
                        ["View Tasks", true, true, true, true],
                        ["Manage Billing", true, false, false, false],
                        ["API Keys", true, true, false, false],
                      ].map(([perm, ...vals]) => (
                        <tr key={perm as string} className="border-b border-base-200/50">
                          <td className="py-2 pr-4 font-medium">{perm as string}</td>
                          {(vals as boolean[]).map((v, i) => (
                            <td key={i} className="text-center py-2 px-2">
                              {v ? (
                                <span className="text-success">✓</span>
                              ) : (
                                <span className="text-base-content/20">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pt-2 flex items-center gap-2 text-[10px] text-base-content/40">
                  <Lock className="w-3 h-3" />
                  Custom roles can extend these defaults
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-warning/10 text-warning text-sm font-medium mb-4">
                <Shield className="w-3.5 h-3.5" /> Security
              </div>
              <h3 className="text-2xl md:text-3xl font-bold">Enterprise-Grade Permissions</h3>
              <p className="mt-4 text-base-content/60 leading-relaxed">
                Control access at every level — organization, team, project, and task.
                Create custom roles with exact permissions, inherited across scopes.
              </p>
              <ul className="mt-6 space-y-3">
                {["5 built-in roles + unlimited custom roles", "Org → Team → Project permission inheritance", "Row-level security in PostgreSQL", "MFA with TOTP, email, SMS, backup codes"].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
                      <Shield className="w-3 h-3 text-warning" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Showcase 3: Dashboards */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 text-success text-sm font-medium mb-4">
                <BarChart3 className="w-3.5 h-3.5" /> Analytics
              </div>
              <h3 className="text-2xl md:text-3xl font-bold">Insightful Dashboards</h3>
              <p className="mt-4 text-base-content/60 leading-relaxed">
                Get real-time visibility into project health, team performance, and task distribution.
                Interactive charts powered by Recharts with data updated in real-time.
              </p>
              <ul className="mt-6 space-y-3">
                {["Task distribution by status, priority & assignee", "Sprint velocity & burndown charts", "Team workload & capacity planning", "Activity timeline & audit trail"].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                      <BarChart3 className="w-3 h-3 text-success" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Dashboard Visual */}
            <div className="bg-base-100 rounded-2xl border border-base-200 p-6 shadow-xl">
              <div className="text-sm font-semibold mb-4">Sprint Overview</div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Completed", value: "64", color: "text-success" },
                  { label: "In Progress", value: "23", color: "text-info" },
                  { label: "Blocked", value: "3", color: "text-error" },
                ].map((s) => (
                  <div key={s.label} className="bg-base-200 rounded-xl p-3 text-center">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-base-content/50 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
              {/* Chart mockup */}
              <div className="h-32 flex items-end gap-1.5">
                {[40, 65, 45, 80, 60, 90, 75, 85, 70, 95, 88, 92].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end gap-0.5">
                    <div
                      className="bg-primary/70 rounded-t-sm transition-all duration-500 hover:bg-primary"
                      style={{ height: `${h}%` }}
                    />
                    <div className="text-[8px] text-base-content/30 text-center">
                      {["J","F","M","A","M","J","J","A","S","O","N","D"][i]}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-base-200 mt-3 pt-3 flex items-center justify-between">
                <span className="text-[10px] text-base-content/40">Last updated: 2 minutes ago</span>
                <span className="text-[10px] text-success flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> +12% from last sprint
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Tech Stack ─────────── */}
      <section className="py-16 bg-base-100 border-y border-base-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center mb-12">
            <h3 className="text-2xl font-bold">Built with Modern Technology</h3>
            <p className="text-base-content/50 mt-2">Enterprise-grade stack designed for performance, reliability, and developer experience</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-6">
            {[
              { name: "Next.js", desc: "Frontend" },
              { name: "Go", desc: "Backend API" },
              { name: "PostgreSQL", desc: "Database" },
              { name: "Redis", desc: "Cache & PubSub" },
              { name: "Zitadel", desc: "Auth & IAM" },
              { name: "MinIO", desc: "Object Storage" },
              { name: "Meilisearch", desc: "Full-text Search" },
              { name: "Docker", desc: "Deployment" },
            ].map((tech) => (
              <div key={tech.name} className="text-center group cursor-default">
                <div className="w-14 h-14 mx-auto rounded-xl bg-base-200 group-hover:bg-primary/10 transition-colors duration-300 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">{tech.name[0]}</span>
                </div>
                <div className="text-xs font-semibold mt-2">{tech.name}</div>
                <div className="text-[10px] text-base-content/40">{tech.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Testimonials ─────────── */}
      <section id="testimonials" className="py-20 md:py-28">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Star className="w-3.5 h-3.5" /> Testimonials
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">Loved by engineering teams worldwide</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t) => (
              <div key={t.name} className="card bg-base-100 shadow-lg border border-base-200 hover:shadow-xl transition-shadow duration-300">
                <div className="card-body">
                  <div className="flex gap-1 mb-3">
                    {[...Array(t.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-warning text-warning" />
                    ))}
                  </div>
                  <p className="text-base-content/70 text-sm leading-relaxed italic">&ldquo;{t.text}&rdquo;</p>
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-base-200">
                    <div className={`w-10 h-10 rounded-full ${t.color} flex items-center justify-center text-white text-xs font-bold`}>
                      {t.avatar}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-xs text-base-content/50">{t.role}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Pricing ─────────── */}
      <section id="pricing" className="py-20 md:py-28 bg-base-100">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 text-secondary text-sm font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5" /> Pricing
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">Simple, transparent pricing</h2>
            <p className="mt-4 text-base-content/60 text-lg">Start free, scale as you grow. No hidden fees.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`card bg-base-100 border-2 transition-all duration-300 hover:-translate-y-1 ${
                  plan.popular ? "border-primary shadow-xl shadow-primary/10 relative" : "border-base-200 shadow-lg"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-content text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="card-body">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-base-content/50 text-sm">{plan.description}</p>
                  <div className="mt-4 mb-6">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.period && <span className="text-base-content/50 text-sm">{plan.period}</span>}
                  </div>
                  <ul className="space-y-2.5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckSquare className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="card-actions mt-6">
                    <Link
                      href={plan.name === "Enterprise" ? "#contact" : "/signup"}
                      className={`btn w-full ${plan.popular ? "btn-primary" : "btn-outline"}`}
                    >
                      {plan.cta}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── FAQ ─────────── */}
      <section id="faq" className="py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4">
              <MessageSquare className="w-3.5 h-3.5" /> FAQ
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">Frequently asked questions</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="border border-base-200 rounded-xl bg-base-100 overflow-hidden transition-shadow hover:shadow-md"
              >
                <button
                  className="w-full flex items-center justify-between p-5 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-medium text-sm pr-4">{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-base-content/40 flex-shrink-0 transition-transform duration-200 ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === i ? "max-h-96 pb-5" : "max-h-0"
                  }`}
                >
                  <p className="px-5 text-sm text-base-content/60 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Contact Us ─────────── */}
      <section id="contact" className="py-20 md:py-28 bg-base-100">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Mail className="w-3.5 h-3.5" /> Contact Us
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">Get in touch</h2>
            <p className="mt-4 text-base-content/60 text-lg">
              Have a question or want to learn more? We&apos;d love to hear from you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            {/* Contact Info */}
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-semibold mb-6">Let&apos;s start a conversation</h3>
                <p className="text-base-content/60 leading-relaxed">
                  Whether you&apos;re looking for a demo, have a technical question, or want to discuss
                  enterprise deployment options — our team is here to help.
                </p>
              </div>

              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Email</div>
                    <div className="text-base-content/60 text-sm">hello@orbispm.in</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Office</div>
                    <div className="text-base-content/60 text-sm">San Francisco, CA & Bangalore, India</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Phone</div>
                    <div className="text-base-content/60 text-sm">+1 (555) 123-4567</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Business Hours</div>
                    <div className="text-base-content/60 text-sm">Mon–Fri, 9:00 AM – 6:00 PM PST</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div className="card bg-base-100 border border-base-200 shadow-lg">
              <div className="card-body">
                {contactStatus === "sent" ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center mb-4">
                      <CheckSquare className="w-8 h-8 text-success" />
                    </div>
                    <h4 className="text-lg font-semibold">Message Sent!</h4>
                    <p className="text-base-content/60 text-sm mt-2">
                      Thank you for reaching out. We&apos;ll get back to you within 24 hours.
                    </p>
                    <button
                      className="btn btn-ghost btn-sm mt-4"
                      onClick={() => setContactStatus("idle")}
                    >
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} className="space-y-4">
                    <div className="form-control">
                      <label className="label"><span className="label-text text-sm">Full Name *</span></label>
                      <input
                        type="text"
                        className="input input-bordered w-full"
                        placeholder="John Doe"
                        required
                        value={contactForm.name}
                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      />
                    </div>
                    <div className="form-control">
                      <label className="label"><span className="label-text text-sm">Email *</span></label>
                      <input
                        type="email"
                        className="input input-bordered w-full"
                        placeholder="john@company.com"
                        required
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      />
                    </div>
                    <div className="form-control">
                      <label className="label"><span className="label-text text-sm">Company</span></label>
                      <input
                        type="text"
                        className="input input-bordered w-full"
                        placeholder="Acme Inc."
                        value={contactForm.company}
                        onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                      />
                    </div>
                    <div className="form-control">
                      <label className="label"><span className="label-text text-sm">Message *</span></label>
                      <textarea
                        className="textarea textarea-bordered w-full h-28"
                        placeholder="Tell us about your project management needs..."
                        required
                        value={contactForm.message}
                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      />
                    </div>
                    {contactStatus === "error" && (
                      <div className="alert alert-error text-sm py-2">
                        <span>{contactError}</span>
                      </div>
                    )}
                    <button
                      type="submit"
                      className="btn btn-primary w-full gap-2"
                      disabled={contactStatus === "sending"}
                    >
                      {contactStatus === "sending" ? (
                        <span className="loading loading-spinner loading-sm" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {contactStatus === "sending" ? "Sending..." : "Send Message"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── CTA Section ─────────── */}
      <section className="py-20 md:py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-5xl font-bold">Ready to transform your workflow?</h2>
          <p className="mt-6 text-lg text-base-content/60 max-w-2xl mx-auto">
            Join thousands of teams already shipping faster with OrbisPM.
            Get started in minutes — no credit card required.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="btn btn-primary btn-lg gap-2 shadow-lg shadow-primary/25">
              Start Free Today <ArrowRight className="w-5 h-5" />
            </Link>
            <a href="#contact" className="btn btn-outline btn-lg gap-2">
              <MessageSquare className="w-5 h-5" /> Talk to Sales
            </a>
          </div>
        </div>
      </section>

      {/* ─────────── Footer ─────────── */}
      <footer className="bg-base-100 border-t border-base-200 py-12">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Layers className="w-4 h-4 text-primary-content" />
                </div>
                <span className="text-lg font-bold">OrbisPM</span>
              </Link>
              <p className="text-sm text-base-content/50 leading-relaxed">
                AI-native project management for modern engineering teams. Enterprise-ready.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-base-content/50">
                <li><Link href="/features" className="hover:text-primary transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
                <li><Link href="/blog" className="hover:text-primary transition-colors">Blog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-4">Alternatives</h4>
              <ul className="space-y-2 text-sm text-base-content/50">
                <li><Link href="/alternatives/jira" className="hover:text-primary transition-colors">OrbisPM vs Jira</Link></li>
                <li><Link href="/alternatives/asana" className="hover:text-primary transition-colors">OrbisPM vs Asana</Link></li>
                <li><Link href="/alternatives/trello" className="hover:text-primary transition-colors">OrbisPM vs Trello</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-base-content/50">
                <li><a href="#faq" className="hover:text-primary transition-colors">FAQ</a></li>
                <li><Link href="/about" className="hover:text-primary transition-colors">About</Link></li>
                <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-base-content/50">
                <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-base-200 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-base-content/40">&copy; {new Date().getFullYear()} OrbisPM. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="https://github.com/orbispm" target="_blank" rel="noopener noreferrer" className="text-base-content/40 hover:text-primary transition-colors text-sm">GitHub</a>
              <a href="https://twitter.com/orbispm" target="_blank" rel="noopener noreferrer" className="text-base-content/40 hover:text-primary transition-colors text-sm">Twitter</a>
              <a href="https://discord.gg/orbispm" target="_blank" rel="noopener noreferrer" className="text-base-content/40 hover:text-primary transition-colors text-sm">Discord</a>
              <a href="https://linkedin.com/company/orbispm" target="_blank" rel="noopener noreferrer" className="text-base-content/40 hover:text-primary transition-colors text-sm">LinkedIn</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
