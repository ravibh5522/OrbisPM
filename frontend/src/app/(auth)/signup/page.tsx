"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRedirectIfAuth } from "@/hooks/use-auth-guard";
import { parseAuthError } from "@/lib/auth-errors";
import { startOIDCRedirect } from "@/lib/oidc-redirect";
import Link from "next/link";
import { useState } from "react";

// SSO identity provider IDs configured in Zitadel
const GOOGLE_IDP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_IDP_ID ?? "371632718112358914";
const GITHUB_IDP_ID =
  process.env.NEXT_PUBLIC_GITHUB_IDP_ID ?? "371633241645384194";

export default function SignupPage() {
  useRedirectIfAuth();
  const [error, setError] = useState("");
  const [ssoLoading, setSsoLoading] = useState<string | null>(null);

  // Account creation lives at the centralized Crewsity login UI (its
  // /register screen), not here. With no idpId this lands on
  // login.crewsity.localhost/login, where "Register" continues the flow;
  // with an idpId Zitadel creates the account via that identity provider
  // directly. The callback page (app/auth/callback) completes either flow.
  const handleRedirect = async (idpId?: string) => {
    setError("");
    setSsoLoading(idpId ?? "crewsity");
    try {
      // No idpId means Zitadel routes to the centralized login UI, where
      // prompt=create is what actually lands the user on /register instead
      // of /login — an idpId skips our login UI entirely (straight to
      // Google/GitHub), so it doesn't need or use this.
      await startOIDCRedirect(idpId, idpId ? undefined : "create");
    } catch (err) {
      setError(parseAuthError(err));
      setSsoLoading(null);
    }
  };

  return (
    <div className="card bg-base-100 shadow-2xl rounded-2xl">
      <div className="card-body p-8">
        <div className="text-center mb-7">
          <h1 className="text-2xl font-bold text-base-content">
            Create account
          </h1>
          <p className="text-base-content/55 mt-1.5 text-sm">
            Get started with OrbisPM for free
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
          Continue to create account
        </Button>

        <div className="divider text-xs text-base-content/40 my-4">OR</div>

        <div className="space-y-2.5">
          {/* Google */}
          <Button
            type="button"
            className="btn-outline w-full gap-3 border-base-300 hover:border-base-content/30"
            onClick={() => handleRedirect(GOOGLE_IDP_ID)}
            disabled={ssoLoading !== null}
            loading={ssoLoading === GOOGLE_IDP_ID}
          >
            {ssoLoading !== GOOGLE_IDP_ID && (
              <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            Continue with Google
          </Button>

          {/* GitHub */}
          <Button
            type="button"
            className="btn-neutral w-full gap-3"
            onClick={() => handleRedirect(GITHUB_IDP_ID)}
            disabled={ssoLoading !== null}
            loading={ssoLoading === GITHUB_IDP_ID}
          >
            {ssoLoading !== GITHUB_IDP_ID && (
              <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0 fill-current" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
            )}
            Continue with GitHub
          </Button>
        </div>

        <p className="text-center text-sm mt-5 text-base-content/60">
          Already have an account?{" "}
          <Link href="/login" className="link link-primary font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
