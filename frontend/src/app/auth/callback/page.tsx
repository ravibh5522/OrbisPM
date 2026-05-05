"use client";

import { api } from "@/lib/api";
import { parseAuthError } from "@/lib/auth-errors";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

const PKCE_STORAGE_KEY = "oidc_pkce";

/**
 * OIDC callback handler — mounted at /auth/callback
 *
 * Zitadel redirects here after the user finishes authentication (including via
 * Google / GitHub when the IDP-hint scope is used).
 *
 * Lifecycle:
 *   1. Validate state (CSRF) against sessionStorage PKCE payload.
 *   2. Exchange the authorization code for tokens via our backend.
 *   3. Call loginComplete() → fetches orgs.
 *   4a. No orgs  → new user, redirect to /onboarding (create first org).
 *   4b. Has orgs → returning user, redirect to /<orgSlug>.
 */
function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginComplete } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    // Prevent double-execution in React StrictMode
    if (attempted.current) return;
    attempted.current = true;

    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    // Zitadel / IDP redirected back with an error (e.g. user denied Google consent)
    if (errorParam) {
      setError(
        errorDesc ||
          (errorParam === "access_denied"
            ? "You cancelled the sign-in. Please try again."
            : `Authentication failed: ${errorParam}`),
      );
      return;
    }

    if (!code || !returnedState) {
      setError(
        "Invalid callback — missing authorization code. Please try signing in again.",
      );
      return;
    }

    // Read PKCE values saved when the auth URL was generated
    type PkceData = { codeVerifier: string; state: string; redirectUri: string };
    let pkceRaw: PkceData | null = null;
    try {
      const raw = sessionStorage.getItem(PKCE_STORAGE_KEY);
      if (raw) pkceRaw = JSON.parse(raw) as PkceData;
    } catch {
      // ignore JSON parse errors
    }

    if (!pkceRaw) {
      setError("Session expired. Please start sign-in again.");
      return;
    }

    // Capture into a const so TypeScript narrows correctly inside the async closure
    const pkce: PkceData = pkceRaw;

    // CSRF check
    if (returnedState !== pkce.state) {
      setError("State mismatch — possible CSRF attack. Please try again.");
      return;
    }

    // Remove PKCE data immediately — one-time use
    sessionStorage.removeItem(PKCE_STORAGE_KEY);

    void (async () => {
      try {
        const tokens = await api.auth.oidcCallback(
          code,
          pkce.redirectUri,
          pkce.codeVerifier,
        );

        // loginComplete saves tokens and fetches the user's orgs
        await loginComplete(tokens);

        // If the SSO provider didn't supply an email (common with GitHub
        // private accounts), send the user to complete their profile first.
        if (tokens.needs_email || !tokens.user?.email) {
          router.replace("/auth/complete-profile");
          return;
        }

        // Read the freshly-populated store state synchronously
        const { orgs } = useAuthStore.getState();

        if (orgs.length === 0) {
          // New user (SSO account just created) — send them through onboarding
          // so they can create their first organisation.
          router.replace("/onboarding");
        } else {
          // Returning user — land on their first / last-used org.
          router.replace(`/${orgs[0].slug}`);
        }
      } catch (err) {
        setError(parseAuthError(err));
      }
    })();
  }, [searchParams, loginComplete, router]);

  /* ── Error state ──────────────────────────────────────────────────────── */
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 auth-bg">
        <div className="card bg-base-100 shadow-2xl rounded-2xl w-full max-w-md">
          <div className="card-body p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-error"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-base-content">
              Sign-in failed
            </h2>
            <p className="text-base-content/60 text-sm mt-2">{error}</p>
            <a href="/login" className="btn btn-primary mt-6 w-full rounded-xl">
              Back to Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  /* ── Loading state (code exchange in progress) ────────────────────────── */
  return (
    <div className="min-h-screen flex items-center justify-center auth-bg">
      <div className="flex flex-col items-center gap-4">
        <span className="loading loading-spinner loading-lg text-primary" />
        <p className="text-base-content/60 text-sm font-medium">
          Completing sign-in…
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center auth-bg">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
