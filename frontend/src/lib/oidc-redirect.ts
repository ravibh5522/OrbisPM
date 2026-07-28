import { api } from "@/lib/api";

const PKCE_STORAGE_KEY = "oidc_pkce";

/**
 * Kicks off a real browser redirect into Zitadel's OIDC authorize endpoint.
 * With no idpId, Zitadel routes to the centralized Crewsity login UI
 * (login.crewsity.localhost) — the same shared origin every app in the
 * ecosystem signs in through. With an idpId, Zitadel skips its own login
 * page and jumps straight to that identity provider (Google/GitHub).
 * The callback page (app/auth/callback) completes the exchange either way.
 *
 * prompt="create" is how the dedicated /signup page (as opposed to /login)
 * tells the centralized login UI to land on its /register screen instead
 * of defaulting to /login — without it, signup and login are indistinguishable
 * once Zitadel redirects there, since Zitadel itself only ever forwards to
 * one configured login URI and leaves routing to the custom UI.
 */
export async function startOIDCRedirect(idpId?: string, prompt?: string) {
  const redirectUri = `${window.location.origin}/auth/callback`;
  const state = crypto.randomUUID();
  const result = await api.auth.oidcAuthorize(redirectUri, state, idpId, prompt);
  sessionStorage.setItem(
    PKCE_STORAGE_KEY,
    JSON.stringify({
      codeVerifier: result.code_verifier,
      state: result.state,
      redirectUri,
    }),
  );
  window.location.href = result.auth_url;
}
