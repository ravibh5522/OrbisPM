import { api } from "@/lib/api";
import {
  clearAuth,
  getAccessToken,
  getIDToken,
  getRefreshToken,
  getStoredUser,
  isTokenExpired,
  saveTokens,
  saveUser,
} from "@/lib/auth";
import type { AuthTokens, AuthUser, Org, OrgMember } from "@/types/domain";
import { create } from "zustand";

interface AuthState {
  user: AuthUser | null;
  orgs: Org[];
  currentOrg: Org | null;
  currentMembership: OrgMember | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mfaEnabled: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginComplete: (tokens: AuthTokens) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  setCurrentOrg: (org: Org) => Promise<void>;
  refreshOrgs: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  orgs: [],
  currentOrg: null,
  currentMembership: null,
  isLoading: true,
  isAuthenticated: false,
  mfaEnabled: false,

  initialize: async () => {
    const token = getAccessToken();
    const storedUser = getStoredUser();
    if (!token || !storedUser) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    // If token is expired, try refresh before proceeding
    if (isTokenExpired()) {
      const refreshed = await get().refreshToken();
      if (!refreshed) {
        clearAuth();
        set({ isLoading: false, isAuthenticated: false });
        return;
      }
    }

    set({
      user: storedUser,
      isAuthenticated: true,
      mfaEnabled: storedUser.mfa_enabled ?? false,
    });
    // Refresh user from backend in background so profile/avatar are always fresh
    api.auth
      .getUser()
      .then((freshUser) => {
        saveUser(freshUser);
        set({ user: freshUser, mfaEnabled: freshUser.mfa_enabled ?? false });
      })
      .catch(() => {});
    try {
      const orgsRes = await api.orgs.list();
      const orgs = orgsRes.data || [];
      // Try to restore last selected org
      const lastOrgId = localStorage.getItem("current_org_id");
      const currentOrg =
        orgs.find((o) => o.id === lastOrgId) || orgs[0] || null;
      let membership: OrgMember | null = null;
      if (currentOrg) {
        try {
          membership = await api.orgs.me(currentOrg.id);
        } catch {
          // ignore
        }
      }
      set({
        orgs,
        currentOrg,
        currentMembership: membership,
        isLoading: false,
      });
    } catch {
      // Token may be invalid
      clearAuth();
      set({
        user: null,
        orgs: [],
        currentOrg: null,
        isAuthenticated: false,
        isLoading: false,
        mfaEnabled: false,
      });
    }
  },

  login: async (email: string, password: string) => {
    const tokens: AuthTokens = await api.auth.login(email, password);
    if (tokens.mfa_required) {
      // Surface the MFA challenge to the caller (login page handles step-2)
      throw Object.assign(new Error("MFA verification required"), tokens);
    }
    await get().loginComplete(tokens);
  },

  loginComplete: async (tokens: AuthTokens) => {
    saveTokens(tokens);
    // Keep isLoading:true until orgs are fetched so redirect guards
    // (useRedirectIfAuth / useRequireAuth) don't fire while orgs:[].
    set({
      user: tokens.user,
      isAuthenticated: true,
      isLoading: true,
      mfaEnabled: tokens.user?.mfa_enabled ?? false,
    });
    try {
      // Load orgs
      const orgsRes = await api.orgs.list();
      const orgs = orgsRes.data || [];
      const currentOrg = orgs[0] || null;
      let membership: OrgMember | null = null;
      if (currentOrg) {
        localStorage.setItem("current_org_id", currentOrg.id);
        try {
          membership = await api.orgs.me(currentOrg.id);
        } catch {
          // ignore
        }
      }
      set({
        orgs,
        currentOrg,
        currentMembership: membership,
        isLoading: false,
      });
    } catch {
      // Orgs fetch failed after login — still mark loading done so UI unblocks
      set({ isLoading: false });
    }
  },

  signup: async (email: string, password: string, name?: string) => {
    const tokens: AuthTokens = await api.auth.signup(email, password, name);
    saveTokens(tokens);
    set({
      user: tokens.user,
      isAuthenticated: true,
      orgs: [],
      currentOrg: null,
      mfaEnabled: false,
    });
  },

  logout: async () => {
    // Captured before clearAuth() wipes it — only ever set for the real
    // OIDC/SSO path (see saveTokens), never the demo/native-password path.
    const idToken = getIDToken();

    try {
      await api.auth.logout();
    } catch {
      // ignore logout failure — clear local state anyway
    }
    clearAuth();
    localStorage.removeItem("current_org_id");
    set({
      user: null,
      orgs: [],
      currentOrg: null,
      currentMembership: null,
      isAuthenticated: false,
      mfaEnabled: false,
    });

    // Real RP-initiated logout: without this, "logout" only ever meant
    // "forget OrbisPM's own token" — the browser's shared Zitadel session
    // (what makes SSO across every Crewsity app possible) stayed alive, so
    // signing out here never actually signed you out anywhere else. No
    // id_token means this was a demo/native-password sign-in, which never
    // touched Zitadel's browser session in the first place — plain
    // redirect is correct for that case.
    if (idToken) {
      try {
        // Zitadel requires an exact match against the app's registered
        // postLogoutRedirectUris — only the bare origin is registered
        // (no /login path), so that's what has to be sent here.
        const { logout_url } = await api.auth.oidcLogoutUrl(idToken, window.location.origin);
        window.location.href = logout_url;
        return;
      } catch {
        // fall through to the plain redirect below
      }
    }
    window.location.href = "/login";
  },

  refreshToken: async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const tokens = await api.auth.refresh(refreshToken);
      saveTokens(tokens);
      set({
        user: tokens.user,
        isAuthenticated: true,
        mfaEnabled: tokens.user?.mfa_enabled ?? false,
      });
      return true;
    } catch {
      return false;
    }
  },

  updateUser: (user: AuthUser) => {
    saveUser(user);
    set({ user, mfaEnabled: user.mfa_enabled ?? false });
  },

  setCurrentOrg: async (org: Org) => {
    localStorage.setItem("current_org_id", org.id);
    let membership: OrgMember | null = null;
    try {
      membership = await api.orgs.me(org.id);
    } catch {
      // ignore
    }
    set({ currentOrg: org, currentMembership: membership });
  },

  refreshOrgs: async () => {
    try {
      const orgsRes = await api.orgs.list();
      const orgs = orgsRes.data || [];
      const currentOrg = get().currentOrg;
      // If current org was deleted, switch to first
      const stillExists =
        currentOrg && orgs.find((o) => o.id === currentOrg.id);
      set({
        orgs,
        currentOrg: stillExists ? currentOrg : orgs[0] || null,
      });
    } catch {
      // ignore
    }
  },
}));
