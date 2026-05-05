"use client";

import { api } from "@/lib/api";
import { parseAuthError } from "@/lib/auth-errors";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PKCE_STORAGE_KEY = "oidc_pkce";

/**
 * OIDC callback page — /auth/callback
 *
 * Zitadel redirects here after the user completes authentication (including via
 * an identity provider such as Google or GitHub when the IDP hint scope is used).
 *
 * Expected URL params: ?code=...&state=...
 *
 * PKCE state stored by the initiating page:
 *   sessionStorage["oidc_pkce"] = JSON.stringify({ codeVerifier, state, redirectUri })
 */
export default function CallbackPage() {
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

    // Handle Zitadel/IDP error redirect (e.g. user denied Google consent)
    if (errorParam) {
      const msg =
        errorDesc ||
        (errorParam === "access_denied"
          ? "You cancelled the sign-in. Please try again."
          : `Authentication failed: ${errorParam}`);
      setError(msg);
      return;
    }

    if (!code || !returnedState) {
      setError("Invalid callback — missing authorization code. Please try signing in again.");
      return;
    }

    // Retrieve PKCE values saved when the auth URL was generated
    let pkce: { codeVerifier: string; state: string; redirectUri: string } | null = null;
    try {
      const raw = sessionStorage.getItem(PKCE_STORAGE_KEY);
      if (raw) pkce = JSON.parse(raw);
    } catch {
      // ignore parse errors
    }

    if (!pkce) {
      setError("Session expired. Please start sign-in again.");
      return;
    }

    // CSRF check — returned state must match what we sent
    if (returnedState !== pkce.state) {
      setError("State mismatch — possible CSRF attack. Please try again.");
      return;
    }

    sessionStorage.removeItem(PKCE_STORAGE_KEY);

    (async () => {
      try {
        const tokens = await api.auth.oidcCallback(
          code,
          pkce!.redirectUri,
          pkce!.codeVerifier,
        );
        await loginComplete(tokens);
        // loginComplete redirects to /dashboard once orgs are loaded
      } catch (err) {
        setError(parseAuthError(err));
      }
    })();
  }, [searchParams, loginComplete]);

  if (error) {
    return (
      <div className="card bg-base-100 shadow-2xl rounded-2xl">
        <div className="card-body p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold mb-2">Sign-in failed</h1>
          <p className="text-base-content/60 text-sm mb-6">{error}</p>
          <a href="/login" className="btn btn-primary w-full">
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-2xl rounded-2xl">
      <div className="card-body p-8 text-center">
        <span className="loading loading-spinner loading-lg text-primary mx-auto mb-4" />
        <p className="text-base-content/60 text-sm">Completing sign-in…</p>
      </div>
    </div>
  );
}
