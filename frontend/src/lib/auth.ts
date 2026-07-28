import type { AuthTokens, AuthUser } from "@/types/domain";

const TOKEN_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
const USER_KEY = "auth_user";
const EXPIRES_KEY = "token_expires_at";
const ID_TOKEN_KEY = "id_token";

export function saveTokens(tokens: AuthTokens) {
  localStorage.setItem(TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  localStorage.setItem(EXPIRES_KEY, String(tokens.expires_at || Date.now() / 1000 + tokens.expires_in));
  localStorage.setItem(USER_KEY, JSON.stringify(tokens.user));
  // Only ever set by the real OIDC/SSO path — the demo/native-password path
  // has no id_token, since it never goes through Zitadel's OIDC flow at all.
  if (tokens.id_token) {
    localStorage.setItem(ID_TOKEN_KEY, tokens.id_token);
  } else {
    localStorage.removeItem(ID_TOKEN_KEY);
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

// getIDToken is only ever used as proof for real RP-initiated logout
// (end_session's id_token_hint) — never for authorization.
export function getIDToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ID_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isTokenExpired(): boolean {
  const exp = localStorage.getItem(EXPIRES_KEY);
  if (!exp) return true;
  // Refresh if less than 60s remaining
  return Date.now() / 1000 > Number(exp) - 60;
}

export function saveUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(ID_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}
