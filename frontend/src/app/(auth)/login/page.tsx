"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRedirectIfAuth } from "@/hooks/use-auth-guard";
import { parseAuthError } from "@/lib/auth-errors";
import { startOIDCRedirect } from "@/lib/oidc-redirect";
import Link from "next/link";
import { useState } from "react";

// ── SSO identity provider IDs configured in Zitadel ──────────────────────
const GOOGLE_IDP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_IDP_ID ?? "371632718112358914";
const GITHUB_IDP_ID =
  process.env.NEXT_PUBLIC_GITHUB_IDP_ID ?? "371633241645384194";

// ── Demo personas ─────────────────────────────────────────────────────────
interface DemoUser {
  email: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  roleColor: string;
  title: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    email: "sarah.chen@acme.demo",
    name: "Sarah Chen",
    initials: "SC",
    color: "bg-violet-500",
    role: "Owner",
    roleColor: "badge-primary",
    title: "VP of Engineering",
  },
  {
    email: "marcus.johnson@acme.demo",
    name: "Marcus Johnson",
    initials: "MJ",
    color: "bg-blue-500",
    role: "Admin",
    roleColor: "badge-info",
    title: "Engineering Manager",
  },
  {
    email: "priya.patel@acme.demo",
    name: "Priya Patel",
    initials: "PP",
    color: "bg-emerald-500",
    role: "Member",
    roleColor: "badge-success",
    title: "Backend Engineer",
  },
  {
    email: "olivia.brown@acme.demo",
    name: "Olivia Brown",
    initials: "OB",
    color: "bg-rose-500",
    role: "Member",
    roleColor: "badge-success",
    title: "Lead Designer",
  },
  {
    email: "mia.anderson@acme.demo",
    name: "Mia Anderson",
    initials: "MA",
    color: "bg-amber-500",
    role: "Member",
    roleColor: "badge-success",
    title: "QA Lead",
  },
  {
    email: "mason.walker@acme.demo",
    name: "Mason Walker",
    initials: "MW",
    color: "bg-slate-500",
    role: "Billing",
    roleColor: "badge-warning",
    title: "Finance",
  },
];

export default function LoginPage() {
  useRedirectIfAuth();
  const [error, setError] = useState("");
  const [ssoLoading, setSsoLoading] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  // Real sign-in lives at the centralized Crewsity login UI, not here.
  // With no idpId this lands on login.crewsity.localhost; with one it skips
  // straight to that identity provider — same Zitadel instance either way.
  const handleRedirect = async (idpId?: string) => {
    setError("");
    setSsoLoading(idpId ?? "crewsity");
    try {
      await startOIDCRedirect(idpId);
    } catch (err) {
      setError(parseAuthError(err));
      setSsoLoading(null);
    }
  };

  const handleDemoLogin = async (user: DemoUser) => {
    setError("");
    setDemoLoading(user.email);
    try {
      // Goes through the centralized login UI (login_hint = the persona's
      // email) so the browser also gets a core session; the login UI fills in
      // the demo password and signs in on its own.
      await startOIDCRedirect(undefined, undefined, user.email);
    } catch (err) {
      setError(parseAuthError(err));
      setDemoLoading(null);
    }
  };

  return (
    <div className="card bg-base-100 shadow-2xl rounded-2xl">
      <div className="card-body p-8">
        <div className="text-center mb-7">
          <h1 className="text-2xl font-bold text-base-content">Welcome back</h1>
          <p className="text-base-content/55 mt-1.5 text-sm">
            Sign in to your Simplify Projects account
          </p>
        </div>

        {error && (
          <Alert variant="error" className="mb-5 text-sm py-3" onDismiss={() => setError("")}>
            {error}
          </Alert>
        )}

        <Button
          type="button"
          className="w-full mb-2.5"
          onClick={() => handleRedirect()}
          loading={ssoLoading === "crewsity"}
          disabled={ssoLoading !== null}
        >
          Continue to sign in
        </Button>

        <div className="divider text-xs text-base-content/40 my-4">OR</div>

        <div className="space-y-2.5">
          <button
            type="button"
            className="btn btn-outline w-full gap-3 hover:bg-base-200 border-base-300"
            onClick={() => handleRedirect(GOOGLE_IDP_ID)}
            disabled={ssoLoading !== null}
          >
            {ssoLoading === GOOGLE_IDP_ID ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            <span className="font-medium text-sm">Continue with Google</span>
          </button>

          <button
            type="button"
            className="btn btn-outline w-full gap-3 hover:bg-base-200 border-base-300"
            onClick={() => handleRedirect(GITHUB_IDP_ID)}
            disabled={ssoLoading !== null}
          >
            {ssoLoading === GITHUB_IDP_ID ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
                />
              </svg>
            )}
            <span className="font-medium text-sm">Continue with GitHub</span>
          </button>
        </div>

        <p className="text-center text-sm mt-5 text-base-content/60">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="link link-primary font-medium">
            Create one
          </Link>
        </p>

        {/* Demo Login Panel */}
        <div className="mt-6">
          <div className="divider text-xs text-base-content/40 my-0">
            <button
              type="button"
              onClick={() => setShowDemo((v) => !v)}
              className="btn btn-ghost btn-xs gap-1 text-base-content/50 hover:text-base-content"
            >
              <span>Try a demo account</span>
              <span
                className={`transition-transform duration-200 ${showDemo ? "rotate-180" : ""}`}
              >
                ▾
              </span>
            </button>
          </div>

          {showDemo && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-center text-base-content/50 mb-3">
                Click any persona to sign in instantly — no setup needed.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_USERS.map((user) => (
                  <button
                    key={user.email}
                    type="button"
                    onClick={() => handleDemoLogin(user)}
                    disabled={demoLoading !== null}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-base-200 hover:border-primary/40 hover:bg-base-200/60 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed group"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg ${user.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}
                    >
                      {demoLoading === user.email ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        user.initials
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-base-content truncate group-hover:text-primary transition-colors">
                        {user.name}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span
                          className={`badge badge-xs ${user.roleColor} shrink-0`}
                        >
                          {user.role}
                        </span>
                        <span className="text-[10px] text-base-content/50 truncate">
                          {user.title}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
