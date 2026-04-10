import {
  clearAuth,
  getRefreshToken,
  isTokenExpired,
  saveTokens,
} from "@/lib/auth";
import type { AuthUser } from "@/types/domain";

// API response shapes
export interface ListResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ErrorResponse {
  message: string;
  detail?: string;
}

class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export { ApiError };

import { API_BASE } from "@/lib/api-base";
const V1 = "/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

/** Get auth headers for direct fetch calls */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const orgId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("current_org_id")
      : null;
  if (orgId) {
    headers["X-Org-ID"] = orgId;
  }
  return headers;
}

// Pages that should never trigger an auto-redirect to /login
const AUTH_PATHS = ["/login", "/signup", "/auth"];

function isOnAuthPage(): boolean {
  if (typeof window === "undefined") return false;
  return AUTH_PATHS.some((p) => window.location.pathname.startsWith(p));
}

// Track refresh in progress to avoid concurrent refreshes
let refreshPromise: Promise<boolean> | null = null;
let isRedirecting = false;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}${V1}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const tokens = await res.json();
    saveTokens(tokens);
    return true;
  } catch {
    return false;
  }
}

async function ensureValidToken(): Promise<void> {
  if (!getToken() || !isTokenExpired()) return;

  if (!refreshPromise) {
    refreshPromise = tryRefreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  const success = await refreshPromise;
  if (!success) {
    clearAuth();
    if (typeof window !== "undefined" && !isOnAuthPage() && !isRedirecting) {
      isRedirecting = true;
      window.location.href = "/login";
    }
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  skipAutoRefresh = false,
): Promise<T> {
  // Auto-refresh token before request if close to expiry (skip for auth endpoints)
  if (!skipAutoRefresh) {
    await ensureValidToken();
  }

  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Include org context on ALL authenticated API calls so the backend RLS
  // TxManager can set app.current_org_id for every request, not just chat.
  const orgId = localStorage.getItem("current_org_id");
  if (orgId) {
    headers["X-Org-ID"] = orgId;
  }

  // Remove Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const method = options.method || "GET";
  if (process.env.NODE_ENV === "development") {
    console.log(`[API] ${method} ${path}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    // Bypass the browser's HTTP cache so React Query refetches always hit
    // the server. Without this, backend Cache-Control max-age headers cause
    // the browser to serve stale list responses after mutations, making it
    // look like newly created items don't appear.
    cache: "no-store",
  });

  if (res.status === 204) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[API] ${method} ${path} → 204 (no content)`);
    }
    return undefined as T;
  }

  // On 401, try refresh once then retry
  if (res.status === 401 && !skipAutoRefresh) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return request<T>(path, options, true);
    }
    clearAuth();
    if (typeof window !== "undefined" && !isOnAuthPage() && !isRedirecting) {
      isRedirecting = true;
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    let msg = "Request failed";
    let detail: string | undefined;
    try {
      const body: ErrorResponse = await res.json();
      msg = body.message || msg;
      detail = body.detail;
    } catch {
      // ignore parse error
    }
    if (process.env.NODE_ENV === "development") {
      console.error(
        `[API] ${method} ${path} → ${res.status} ERROR: ${msg}`,
        detail || "",
      );
    }
    throw new ApiError(res.status, msg, detail);
  }

  const data = await res.json();
  if (process.env.NODE_ENV === "development") {
    console.log(`[API] ${method} ${path} → ${res.status}`, data);
  }
  return data;
}

function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

function patch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
}

function del<T = void>(path: string, opts?: RequestInit): Promise<T> {
  return request<T>(path, { method: "DELETE", ...opts });
}

function upload<T>(path: string, formData: FormData): Promise<T> {
  return request<T>(path, { method: "POST", body: formData });
}

async function downloadBlob(path: string, filename: string): Promise<void> {
  await ensureValidToken();
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// API namespaces
import type {
  ActivityLog,
  Announcement,
  APIKey,
  Attachment,
  AuthTokens,
  BackupCodesResponse,
  BillingPlan,
  CFDPoint,
  ChatBookmark,
  ChatChannel,
  ChatChannelMember,
  ChatMessage,
  ChatPinnedMessage,
  Checklist,
  Comment,
  CustomRole,
  DashboardAnalytics,
  DashboardStats,
  EffectiveMember,
  IDPInfo,
  IDPStartResponse,
  ImportJob,
  MemberAnalytics,
  MetricAlert,
  MFAStatus,
  Notification,
  NotificationPreference,
  OIDCAuthorizeResponse,
  Org,
  OrgAnalytics,
  OrgMember,
  OrgSubscription,
  OrgThemeConfig,
  PerformanceReport,
  Permission,
  ProcessExcelResult,
  Project,
  ProjectAnalytics,
  ProjectDashboardStats,
  ProjectMember,
  ProjectTeam,
  RiskScore,
  Role,
  ScopePermissionsResponse,
  SheetImportConfig,
  SheetInfo,
  StickyNote,
  StickyNoteStats,
  Task,
  TaskChangeRequest,
  TaskDependency,
  TaskRule,
  TaskTemplate,
  TaskTree,
  TaskUpdateResult,
  TaskWatcher,
  Team,
  TeamAnalytics,
  TeamDashboardStats,
  TeamMember,
  TOTPRegistration,
  UnlinkPreview,
  VelocityPoint,
  Webhook,
} from "@/types/domain";

export const api = {
  // Auth (Zitadel via backend) — all /auth/* endpoints are public, skip auto-refresh
  auth: {
    signup(
      email: string,
      password: string,
      name?: string,
    ): Promise<AuthTokens> {
      return request<AuthTokens>(
        `${V1}/auth/signup`,
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            name: name || undefined,
            data: name ? { name } : undefined,
          }),
        },
        true,
      );
    },
    login(email: string, password: string): Promise<AuthTokens> {
      return request<AuthTokens>(
        `${V1}/auth/login`,
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
        true,
      );
    },
    refresh(refreshToken: string): Promise<AuthTokens> {
      return request<AuthTokens>(
        `${V1}/auth/refresh`,
        {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
        true,
      );
    },
    getUser(): Promise<AuthUser> {
      return get(`${V1}/auth/user`);
    },
    updateUser(data: {
      data?: Record<string, unknown>;
      email?: string;
      phone?: string;
    }): Promise<AuthUser> {
      return request<AuthUser>(`${V1}/auth/user`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    logout(): Promise<void> {
      return request<void>(`${V1}/auth/logout`, { method: "POST" }, true);
    },

    // OIDC PKCE flow (public — called pre-auth)
    oidcAuthorize(
      redirectUri: string,
      state: string,
    ): Promise<OIDCAuthorizeResponse> {
      return request(
        `${V1}/auth/oidc/authorize`,
        {
          method: "POST",
          body: JSON.stringify({ redirect_uri: redirectUri, state }),
        },
        true,
      );
    },
    oidcCallback(
      code: string,
      redirectUri: string,
      codeVerifier: string,
    ): Promise<AuthTokens> {
      return request(
        `${V1}/auth/oidc/callback`,
        {
          method: "POST",
          body: JSON.stringify({
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        },
        true,
      );
    },
    oidcRefresh(refreshToken: string): Promise<AuthTokens> {
      return request(
        `${V1}/auth/oidc/refresh`,
        {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
        true,
      );
    },

    verifyLoginMFA(
      sessionId: string,
      sessionToken: string,
      method: string,
      code: string,
    ): Promise<AuthTokens> {
      return request(
        `${V1}/auth/mfa/login-verify`,
        {
          method: "POST",
          body: JSON.stringify({
            session_id: sessionId,
            session_token: sessionToken,
            method,
            code,
          }),
        },
        true,
      );
    },
    sendOTPChallenge(
      sessionId: string,
      sessionToken: string,
      method: string,
    ): Promise<void> {
      return request(
        `${V1}/auth/mfa/send-otp-challenge`,
        {
          method: "POST",
          body: JSON.stringify({
            session_id: sessionId,
            session_token: sessionToken,
            method,
          }),
        },
        true,
      );
    },

    // Password management
    changePassword(
      oldPassword: string,
      newPassword: string,
    ): Promise<{ status: string }> {
      return post(`${V1}/auth/password/change`, {
        old_password: oldPassword,
        new_password: newPassword,
      });
    },
    forgotPassword(email: string): Promise<{ status: string }> {
      return request(
        `${V1}/auth/password/forgot`,
        { method: "POST", body: JSON.stringify({ email }) },
        true,
      );
    },
    resetPassword(
      email: string,
      code: string,
      newPassword: string,
    ): Promise<{ status: string }> {
      return request(
        `${V1}/auth/password/reset`,
        {
          method: "POST",
          body: JSON.stringify({ email, code, new_password: newPassword }),
        },
        true,
      );
    },

    // Social / IDP (public — no auth required)
    listIDPs(): Promise<{ idps: IDPInfo[] }> {
      return request(`${V1}/auth/idps`, { method: "GET" }, true);
    },
    startIDPLogin(
      idpId: string,
      successUrl: string,
      failureUrl: string,
    ): Promise<IDPStartResponse> {
      return request(
        `${V1}/auth/idp/start`,
        {
          method: "POST",
          body: JSON.stringify({
            idp_id: idpId,
            success_url: successUrl,
            failure_url: failureUrl,
          }),
        },
        true,
      );
    },
  },

  // MFA
  mfa: {
    registerTOTP(): Promise<TOTPRegistration> {
      return post(`${V1}/auth/mfa/totp/register`);
    },
    verifyTOTP(code: string): Promise<MFAStatus> {
      return post(`${V1}/auth/mfa/totp/verify`, { code });
    },
    removeTOTP(): Promise<void> {
      return del(`${V1}/auth/mfa/totp`);
    },
    enableOTPEmail(): Promise<MFAStatus> {
      return post(`${V1}/auth/mfa/otp-email/enable`);
    },
    disableOTPEmail(): Promise<void> {
      return del(`${V1}/auth/mfa/otp-email`);
    },
    enableOTPSMS(): Promise<MFAStatus> {
      return post(`${V1}/auth/mfa/otp-sms/enable`);
    },
    disableOTPSMS(): Promise<void> {
      return del(`${V1}/auth/mfa/otp-sms`);
    },
    generateRecoveryCodes(): Promise<BackupCodesResponse> {
      return post(`${V1}/auth/mfa/recovery-codes`);
    },
    removeRecoveryCodes(): Promise<void> {
      return del(`${V1}/auth/mfa/recovery-codes`);
    },
  },

  // Orgs
  orgs: {
    list: () => get<ListResponse<Org>>(`${V1}/orgs`),
    get: (id: string) => get<Org>(`${V1}/orgs/${id}`),
    create: (data: { name: string; slug: string }) =>
      post<Org>(`${V1}/orgs`, data),
    update: (id: string, data: Partial<Org>) =>
      patch<Org>(`${V1}/orgs/${id}`, data),
    delete: (id: string) => del(`${V1}/orgs/${id}`),
    me: (orgId: string) => get<OrgMember>(`${V1}/orgs/${orgId}/me`),
  },

  // File uploads (avatars, logos — stores in MinIO, returns URL)
  uploads: {
    upload: (orgId: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return upload<{
        url: string;
        filename: string;
        mime_type: string;
        object: string;
      }>(`${V1}/orgs/${orgId}/uploads`, fd);
    },
  },

  // Org Members
  members: {
    list: (
      orgId: string,
      params?: {
        limit?: number;
        offset?: number;
        search?: string;
        role?: string;
        sort_by?: string;
        sort_order?: string;
      },
    ) => {
      const qs = params
        ? "?" +
          new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v != null)
              .map(([k, v]) => [k, String(v)]),
          ).toString()
        : "";
      return get<ListResponse<OrgMember>>(`${V1}/orgs/${orgId}/members${qs}`);
    },
    add: (
      orgId: string,
      data: { email?: string; user_id?: string; role: string },
    ) => post<OrgMember>(`${V1}/orgs/${orgId}/members`, data),
    update: (orgId: string, userId: string, data: { role: string }) =>
      patch<OrgMember>(`${V1}/orgs/${orgId}/members/${userId}`, data),
    remove: (orgId: string, userId: string) =>
      del(`${V1}/orgs/${orgId}/members/${userId}`),
    resetPassword: (
      orgId: string,
      userId: string,
      data: { new_password: string },
    ) =>
      post<void>(`${V1}/orgs/${orgId}/members/${userId}/reset-password`, data),
    updateEmail: (orgId: string, userId: string, data: { new_email: string }) =>
      post<void>(`${V1}/orgs/${orgId}/members/${userId}/update-email`, data),
    deactivate: (orgId: string, userId: string) =>
      post<void>(`${V1}/orgs/${orgId}/members/${userId}/deactivate`, {}),
    reactivate: (orgId: string, userId: string) =>
      post<void>(`${V1}/orgs/${orgId}/members/${userId}/reactivate`, {}),
    forceMfa: (orgId: string, userId: string) =>
      post<void>(`${V1}/orgs/${orgId}/members/${userId}/force-mfa`, {}),
    deleteAccount: (orgId: string, userId: string) =>
      del(`${V1}/orgs/${orgId}/members/${userId}/account`),
  },

  // Teams
  teams: {
    list: (
      orgId: string,
      params?: {
        limit?: number;
        offset?: number;
        search?: string;
        status?: string;
        mine?: string;
        sort_by?: string;
        sort_order?: string;
      },
    ) =>
      get<ListResponse<Team>>(
        `${V1}/orgs/${orgId}/teams${
          params
            ? "?" +
              new URLSearchParams(
                Object.entries(params)
                  .filter(([_, v]) => v != null)
                  .map(([k, v]) => [k, String(v)]),
              ).toString()
            : ""
        }`,
      ),
    get: (orgId: string, id: string) =>
      get<Team>(`${V1}/orgs/${orgId}/teams/${id}`),
    create: (orgId: string, data: { name: string; description?: string }) =>
      post<Team>(`${V1}/orgs/${orgId}/teams`, data),
    update: (orgId: string, id: string, data: Partial<Team>) =>
      patch<Team>(`${V1}/orgs/${orgId}/teams/${id}`, data),
    delete: (orgId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/teams/${id}`),
    dashboard: (orgId: string, teamId: string) =>
      get<TeamDashboardStats>(`${V1}/orgs/${orgId}/teams/${teamId}/dashboard`),
    myPermissions: (orgId: string, teamId: string) =>
      get<ScopePermissionsResponse>(
        `${V1}/orgs/${orgId}/teams/${teamId}/my-permissions`,
      ),
  },

  // Team members
  teamMembers: {
    list: (
      orgId: string,
      teamId: string,
      params?: {
        limit?: number;
        offset?: number;
        search?: string;
        role?: string;
        sort_by?: string;
        sort_order?: string;
      },
    ) =>
      get<ListResponse<TeamMember>>(
        `${V1}/orgs/${orgId}/teams/${teamId}/members${
          params
            ? "?" +
              new URLSearchParams(
                Object.entries(params)
                  .filter(([_, v]) => v != null)
                  .map(([k, v]) => [k, String(v)]),
              ).toString()
            : ""
        }`,
      ),
    add: (
      orgId: string,
      teamId: string,
      data: { user_id: string; role: string },
    ) => post<TeamMember>(`${V1}/orgs/${orgId}/teams/${teamId}/members`, data),
    update: (
      orgId: string,
      teamId: string,
      userId: string,
      data: { role: string },
    ) =>
      patch<TeamMember>(
        `${V1}/orgs/${orgId}/teams/${teamId}/members/${userId}`,
        data,
      ),
    remove: (orgId: string, teamId: string, userId: string) =>
      del(`${V1}/orgs/${orgId}/teams/${teamId}/members/${userId}`),
  },

  // Projects
  projects: {
    list: (
      orgId: string,
      params?: {
        limit?: number;
        offset?: number;
        search?: string;
        status?: string;
        team_id?: string;
        mine?: string;
        sort_by?: string;
        sort_order?: string;
      },
    ) =>
      get<ListResponse<Project>>(
        `${V1}/orgs/${orgId}/projects${
          params
            ? "?" +
              new URLSearchParams(
                Object.entries(params)
                  .filter(([_, v]) => v != null)
                  .map(([k, v]) => [k, String(v)]),
              ).toString()
            : ""
        }`,
      ),
    get: (orgId: string, id: string) =>
      get<Project>(`${V1}/orgs/${orgId}/projects/${id}`),
    create: (
      orgId: string,
      data: {
        name: string;
        team_id?: string;
        team_ids?: string[];
        description?: string;
      },
    ) => post<Project>(`${V1}/orgs/${orgId}/projects`, data),
    update: (orgId: string, id: string, data: Partial<Project>) =>
      patch<Project>(`${V1}/orgs/${orgId}/projects/${id}`, data),
    delete: (orgId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/projects/${id}`),
    dashboard: (orgId: string, projId: string) =>
      get<ProjectDashboardStats>(
        `${V1}/orgs/${orgId}/projects/${projId}/dashboard`,
      ),
    myPermissions: (orgId: string, projId: string) =>
      get<ScopePermissionsResponse>(
        `${V1}/orgs/${orgId}/projects/${projId}/my-permissions`,
      ),
  },

  // Project members
  projectMembers: {
    list: (
      orgId: string,
      projId: string,
      params?: {
        limit?: number;
        offset?: number;
        search?: string;
        role?: string;
      },
    ) =>
      get<ListResponse<ProjectMember>>(
        `${V1}/orgs/${orgId}/projects/${projId}/members${
          params
            ? "?" +
              new URLSearchParams(
                Object.entries(params)
                  .filter(([_, v]) => v != null)
                  .map(([k, v]) => [k, String(v)]),
              ).toString()
            : ""
        }`,
      ),
    add: (
      orgId: string,
      projId: string,
      data: { user_id: string; role: string; source_team_id?: string },
    ) =>
      post<ProjectMember>(
        `${V1}/orgs/${orgId}/projects/${projId}/members`,
        data,
      ),
    update: (
      orgId: string,
      projId: string,
      userId: string,
      data: { role: string },
    ) =>
      patch<ProjectMember>(
        `${V1}/orgs/${orgId}/projects/${projId}/members/${userId}`,
        data,
      ),
    remove: (
      orgId: string,
      projId: string,
      userId: string,
      reassignTo?: string,
    ) =>
      request<void>(
        `${V1}/orgs/${orgId}/projects/${projId}/members/${userId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reassignTo ? { reassign_to: reassignTo } : {}),
        },
      ),
    previewRemove: (orgId: string, projId: string, userId: string) =>
      get<{ task_count: number }>(
        `${V1}/orgs/${orgId}/projects/${projId}/members/${userId}/preview`,
      ),
  },

  // Tasks
  tasks: {
    list: (orgId: string, projId: string, params?: string) =>
      get<ListResponse<Task>>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks${params ? `?${params}` : ""}`,
      ),
    get: (orgId: string, projId: string, id: string) =>
      get<Task>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${id}`),
    create: (orgId: string, projId: string, data: Partial<Task>) =>
      post<Task>(`${V1}/orgs/${orgId}/projects/${projId}/tasks`, data),
    update: (orgId: string, projId: string, id: string, data: Partial<Task>) =>
      patch<TaskUpdateResult>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${id}`,
        data,
      ),
    delete: (orgId: string, projId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${id}`),
    tree: (orgId: string, projId: string) =>
      get<TaskTree[]>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/tree`),
    move: (
      orgId: string,
      projId: string,
      id: string,
      data: { parent_task_id?: string; position: number },
    ) =>
      post<void>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${id}/move`,
        data,
      ),
    bulkUpdate: (
      orgId: string,
      projId: string,
      data: { task_ids: string[]; changes: Partial<Task> },
    ) => post<void>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/bulk`, data),
    reorder: (
      orgId: string,
      projId: string,
      items: { id: string; position: number; parent_id?: string }[],
    ) =>
      patch<void>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/reorder`, {
        items,
      }),
    duplicate: (orgId: string, projId: string, id: string) =>
      post<Task>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${id}/duplicate`,
      ),
    export: (orgId: string, projId: string) =>
      downloadBlob(
        `${V1}/orgs/${orgId}/projects/${projId}/imports/export/csv`,
        "tasks_export.csv",
      ),
    exportCalendar: (orgId: string, projId: string) =>
      downloadBlob(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/calendar.ics`,
        "tasks.ics",
      ),
  },

  // Task dependencies
  dependencies: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<TaskDependency>>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/dependencies`,
      ),
    add: (
      orgId: string,
      projId: string,
      taskId: string,
      data: { depends_on_id: string; type?: string },
    ) =>
      post<TaskDependency>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/dependencies`,
        data,
      ),
    remove: (orgId: string, projId: string, taskId: string, depId: string) =>
      del(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/dependencies/${depId}`,
      ),
  },

  // Checklists
  checklists: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<Checklist>>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/checklists`,
      ),
    create: (
      orgId: string,
      projId: string,
      taskId: string,
      data: { title: string },
    ) =>
      post<Checklist>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/checklists`,
        data,
      ),
    update: (
      orgId: string,
      projId: string,
      taskId: string,
      id: string,
      data: Partial<Checklist>,
    ) =>
      patch<Checklist>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/checklists/${id}`,
        data,
      ),
    delete: (orgId: string, projId: string, taskId: string, id: string) =>
      del(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/checklists/${id}`,
      ),
  },

  // Comments
  comments: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<Comment>>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/comments`,
      ),
    create: (
      orgId: string,
      projId: string,
      taskId: string,
      data: { body: string; parent_id?: string },
    ) =>
      post<Comment>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/comments`,
        data,
      ),
    // Note: Backend does not support comment updates
    delete: (orgId: string, projId: string, taskId: string, id: string) =>
      del(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/comments/${id}`,
      ),
  },

  // Task rules
  rules: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<TaskRule>>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/rules`,
      ),
    create: (
      orgId: string,
      projId: string,
      taskId: string,
      data: Partial<TaskRule>,
    ) =>
      post<TaskRule>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/rules`,
        data,
      ),
    delete: (orgId: string, projId: string, taskId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/rules/${id}`),
  },

  // Notifications (user-scoped, no org prefix)
  notifications: {
    list: (_orgId: string, params?: string) =>
      get<ListResponse<Notification>>(
        `${V1}/notifications${params ? `?${params}` : ""}`,
      ),
    markRead: (_orgId: string, id: string) =>
      patch<void>(`${V1}/notifications/${id}/read`, {}),
    markAllRead: (_orgId: string) =>
      post<void>(`${V1}/notifications/mark-all-read`, {}),
  },

  // Notification preferences
  notificationPreferences: {
    list: (orgId: string) =>
      get<ListResponse<NotificationPreference>>(
        `${V1}/orgs/${orgId}/notification-preferences`,
      ),
    upsert: (orgId: string, data: Partial<NotificationPreference>) =>
      put<void>(`${V1}/orgs/${orgId}/notification-preferences`, data),
  },

  // Sticky Notes (user-scoped, no org prefix)
  stickyNotes: {
    list: (params?: string) =>
      get<ListResponse<StickyNote>>(
        `${V1}/sticky-notes${params ? `?${params}` : ""}`,
      ),
    get: (id: string) => get<StickyNote>(`${V1}/sticky-notes/${id}`),
    create: (data: Partial<StickyNote>) =>
      post<StickyNote>(`${V1}/sticky-notes`, data),
    update: (id: string, data: Partial<StickyNote>) =>
      put<StickyNote>(`${V1}/sticky-notes/${id}`, data),
    delete: (id: string) => del(`${V1}/sticky-notes/${id}`),
    stats: () => get<StickyNoteStats>(`${V1}/sticky-notes/stats`),
  },

  // Activity logs
  activity: {
    list: (orgId: string, params?: string) =>
      get<ListResponse<ActivityLog>>(
        `${V1}/orgs/${orgId}/activity${params ? `?${params}` : ""}`,
      ),
  },

  // Templates
  templates: {
    list: (
      orgId: string,
      params?: {
        limit?: number;
        offset?: number;
        search?: string;
        shared?: string;
        sort_by?: string;
        sort_order?: string;
      },
    ) => {
      const qs = params
        ? "?" +
          new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v != null)
              .map(([k, v]) => [k, String(v)]),
          ).toString()
        : "";
      return get<ListResponse<TaskTemplate>>(
        `${V1}/orgs/${orgId}/templates${qs}`,
      );
    },
    get: (orgId: string, id: string) =>
      get<TaskTemplate>(`${V1}/orgs/${orgId}/templates/${id}`),
    create: (orgId: string, data: Partial<TaskTemplate>) =>
      post<TaskTemplate>(`${V1}/orgs/${orgId}/templates`, data),
    update: (orgId: string, id: string, data: Partial<TaskTemplate>) =>
      patch<TaskTemplate>(`${V1}/orgs/${orgId}/templates/${id}`, data),
    delete: (orgId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/templates/${id}`),
    apply: (orgId: string, projId: string, templateId: string) =>
      post<void>(`${V1}/orgs/${orgId}/projects/${projId}/apply-template`, {
        template_id: templateId,
      }),
    export: (orgId: string, id: string, name: string) =>
      downloadBlob(
        `${V1}/orgs/${orgId}/templates/${id}/export`,
        `template_${name}.json`,
      ),
    import: (
      orgId: string,
      data: {
        name: string;
        description?: string;
        structure: Record<string, unknown>;
        is_shared?: boolean;
      },
    ) => post<TaskTemplate>(`${V1}/orgs/${orgId}/templates/import`, data),
  },

  // Webhooks
  webhooks: {
    list: (orgId: string) =>
      get<ListResponse<Webhook>>(`${V1}/orgs/${orgId}/webhooks`),
    create: (orgId: string, data: Partial<Webhook>) =>
      post<Webhook>(`${V1}/orgs/${orgId}/webhooks`, data),
    update: (orgId: string, id: string, data: Partial<Webhook>) =>
      patch<Webhook>(`${V1}/orgs/${orgId}/webhooks/${id}`, data),
    delete: (orgId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/webhooks/${id}`),
  },

  // API Keys
  apiKeys: {
    list: (orgId: string) =>
      get<ListResponse<APIKey>>(`${V1}/orgs/${orgId}/api-keys`),
    create: (
      orgId: string,
      data: { name: string; scopes: string[]; expires_at?: string },
    ) => post<APIKey>(`${V1}/orgs/${orgId}/api-keys`, data),
    revoke: (orgId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/api-keys/${id}`),
  },

  // Attachments
  attachments: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<Attachment>>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/attachments`,
      ),
    /** Direct multipart upload through the backend (avoids S3 CORS issues). */
    upload: (
      orgId: string,
      projId: string,
      taskId: string,
      file: File,
    ): Promise<Attachment> => {
      const fd = new FormData();
      fd.append("file", file);
      return upload<Attachment>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/attachments/upload`,
        fd,
      );
    },
    download: (orgId: string, projId: string, taskId: string, id: string) =>
      get<{ attachment: Attachment; download_url: string }>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/attachments/${id}/download`,
      ),
    /** Returns a URL that streams the file content through the backend (avoids S3 CORS). */
    contentUrl: (orgId: string, projId: string, taskId: string, id: string) =>
      `${API_BASE}${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/attachments/${id}/content`,
    /** Fetches the file content with auth headers and returns a blob URL for use in <img>/<video> tags. */
    fetchBlobUrl: async (
      orgId: string,
      projId: string,
      taskId: string,
      id: string,
    ): Promise<string> => {
      const path = `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/attachments/${id}/content`;
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const orgHeader =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("current_org_id")
          : null;
      if (orgHeader) headers["X-Org-ID"] = orgHeader;
      const res = await fetch(`${API_BASE}${path}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch attachment content");
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    delete: (orgId: string, projId: string, taskId: string, id: string) =>
      del(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/attachments/${id}`,
      ),
  },

  // Watchers
  watchers: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<TaskWatcher>>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/watchers`,
      ),
    watch: (orgId: string, projId: string, taskId: string) =>
      post<void>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/watchers`,
        {},
      ),
    unwatch: (orgId: string, projId: string, taskId: string) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/watchers`),
  },

  // Billing
  billing: {
    plans: (orgId: string) =>
      get<ListResponse<BillingPlan>>(`${V1}/orgs/${orgId}/billing/plans`),
    subscription: (orgId: string) =>
      get<OrgSubscription>(`${V1}/orgs/${orgId}/billing/subscription`),
    checkout: (
      orgId: string,
      data: { price_id: string; success_url?: string; cancel_url?: string },
    ) =>
      post<{ checkout_url: string; session_id: string }>(
        `${V1}/orgs/${orgId}/billing/checkout`,
        data,
      ),
    portal: (orgId: string) =>
      post<{ portal_url: string }>(`${V1}/orgs/${orgId}/billing/portal`, {}),
  },

  // Custom Roles
  customRoles: {
    list: (orgId: string) =>
      get<ListResponse<CustomRole>>(`${V1}/orgs/${orgId}/roles`),
    create: (orgId: string, data: Partial<CustomRole>) =>
      post<CustomRole>(`${V1}/orgs/${orgId}/roles`, data),
    update: (orgId: string, id: string, data: Partial<CustomRole>) =>
      patch<CustomRole>(`${V1}/orgs/${orgId}/roles/${id}`, data),
    delete: (orgId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/roles/${id}`),
  },

  // Import
  import: {
    start: (
      orgId: string,
      projId: string,
      file: File,
      columnMapping: Record<string, string>,
    ) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("column_mapping", JSON.stringify(columnMapping));
      return upload<ImportJob>(
        `${V1}/orgs/${orgId}/projects/${projId}/imports`,
        fd,
      );
    },
    analyze: (orgId: string, projId: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return upload<SheetInfo[]>(
        `${V1}/orgs/${orgId}/projects/${projId}/imports/analyze`,
        fd,
      );
    },
    importExcel: (
      orgId: string,
      projId: string,
      file: File,
      config: SheetImportConfig[],
    ) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("config", JSON.stringify(config));
      return upload<ProcessExcelResult>(
        `${V1}/orgs/${orgId}/projects/${projId}/imports/excel`,
        fd,
      );
    },
    exportExcel: (orgId: string, projId: string) =>
      downloadBlob(
        `${V1}/orgs/${orgId}/projects/${projId}/imports/export`,
        "tasks_export.xlsx",
      ),
    status: (orgId: string, projId: string, jobId: string) =>
      get<ImportJob>(`${V1}/orgs/${orgId}/projects/${projId}/imports/${jobId}`),
    list: (orgId: string, projId: string) =>
      get<ListResponse<ImportJob>>(
        `${V1}/orgs/${orgId}/projects/${projId}/imports`,
      ),
  },

  // Search
  search: {
    tasks: (orgId: string, query: string, limit = 20, offset = 0) =>
      get<ListResponse<Task>>(
        `${V1}/orgs/${orgId}/search/tasks?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
      ),
    projects: (orgId: string, query: string, limit = 20, offset = 0) =>
      get<ListResponse<Project>>(
        `${V1}/orgs/${orgId}/search/projects?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
      ),
  },

  // Dashboard
  dashboard: {
    stats: (orgId: string) =>
      get<DashboardStats>(`${V1}/orgs/${orgId}/dashboard/stats`),
    myTasks: (
      orgId: string,
      params: {
        limit?: number;
        offset?: number;
        status?: string;
        priority?: string;
        search?: string;
        sort_by?: string;
        sort_order?: string;
      } = {},
    ) => {
      const {
        limit = 50,
        offset = 0,
        status,
        priority,
        search,
        sort_by,
        sort_order,
      } = params;
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (status) qs.set("status", status);
      if (priority) qs.set("priority", priority);
      if (search) qs.set("search", search);
      if (sort_by) qs.set("sort_by", sort_by);
      if (sort_order) qs.set("sort_order", sort_order);
      return get<ListResponse<Task>>(
        `${V1}/orgs/${orgId}/dashboard/my-tasks?${qs.toString()}`,
      );
    },
  },

  // Analytics & Performance
  analytics: {
    dashboard: (orgId: string, days = 30) =>
      get<DashboardAnalytics>(
        `${V1}/orgs/${orgId}/analytics/dashboard?days=${days}`,
      ),
    org: (orgId: string, days = 30) =>
      get<OrgAnalytics>(`${V1}/orgs/${orgId}/analytics/org?days=${days}`),
    project: (orgId: string, projectId: string, days = 30) =>
      get<ProjectAnalytics>(
        `${V1}/orgs/${orgId}/projects/${projectId}/analytics?days=${days}`,
      ),
    projectVelocity: (orgId: string, projectId: string, days = 90) =>
      get<VelocityPoint[]>(
        `${V1}/orgs/${orgId}/projects/${projectId}/analytics/velocity?days=${days}`,
      ),
    projectCFD: (orgId: string, projectId: string, days = 30) =>
      get<CFDPoint[]>(
        `${V1}/orgs/${orgId}/projects/${projectId}/analytics/cfd?days=${days}`,
      ),
    team: (orgId: string, teamId: string, days = 30) =>
      get<TeamAnalytics>(
        `${V1}/orgs/${orgId}/teams/${teamId}/analytics?days=${days}`,
      ),
    member: (orgId: string, userId: string, days = 30) =>
      get<MemberAnalytics>(
        `${V1}/orgs/${orgId}/analytics/members/${userId}?days=${days}`,
      ),
    velocity: (orgId: string, days = 90) =>
      get<VelocityPoint[]>(
        `${V1}/orgs/${orgId}/analytics/velocity?days=${days}`,
      ),
    alerts: (orgId: string) =>
      get<MetricAlert[]>(`${V1}/orgs/${orgId}/analytics/alerts`),
    acknowledgeAlert: (orgId: string, alertId: string) =>
      post<void>(
        `${V1}/orgs/${orgId}/analytics/alerts/${alertId}/acknowledge`,
        {},
      ),
    risks: (orgId: string) =>
      get<RiskScore[]>(`${V1}/orgs/${orgId}/analytics/risks`),
    reports: {
      list: (orgId: string) =>
        get<ListResponse<PerformanceReport>>(
          `${V1}/orgs/${orgId}/analytics/reports`,
        ),
      create: (
        orgId: string,
        params: {
          report_type: string;
          scope_type: string;
          scope_id: string;
          parameters?: Record<string, unknown>;
        },
      ) =>
        post<PerformanceReport>(
          `${V1}/orgs/${orgId}/analytics/reports`,
          params,
        ),
      get: (orgId: string, reportId: string) =>
        get<PerformanceReport>(
          `${V1}/orgs/${orgId}/analytics/reports/${reportId}`,
        ),
    },
  },

  // Presence (real-time indicators)
  presence: {
    heartbeat: (
      orgId: string,
      params: {
        resource_type: "task" | "project";
        resource_id: string;
        display_name?: string;
        avatar_url?: string;
      },
    ) => post<void>(`${V1}/orgs/${orgId}/presence/heartbeat`, params),

    get: (
      orgId: string,
      resourceType: "task" | "project",
      resourceId: string,
    ) =>
      get<
        {
          user_id: string;
          display_name?: string;
          avatar_url?: string;
          viewing_since: string;
        }[]
      >(
        `${V1}/orgs/${orgId}/presence?resource_type=${resourceType}&resource_id=${resourceId}`,
      ),
  },

  // --- Permission System ---
  permissions: {
    list: (orgId: string, scope?: string) =>
      get<Permission[]>(
        `${V1}/orgs/${orgId}/permissions${scope ? `?scope=${scope}` : ""}`,
      ),
    myPermissions: (orgId: string) =>
      get<ScopePermissionsResponse>(`${V1}/orgs/${orgId}/my-permissions`),
    roles: {
      list: (orgId: string, scope?: string) =>
        get<Role[]>(
          `${V1}/orgs/${orgId}/permissions/roles${scope ? `?scope=${scope}` : ""}`,
        ),
      get: (orgId: string, roleId: string) =>
        get<Role>(`${V1}/orgs/${orgId}/permissions/roles/${roleId}`),
      create: (
        orgId: string,
        data: {
          scope: string;
          slug: string;
          name: string;
          description?: string;
        },
      ) => post<Role>(`${V1}/orgs/${orgId}/permissions/roles`, data),
      update: (
        orgId: string,
        roleId: string,
        data: { name?: string; description?: string },
      ) => patch<Role>(`${V1}/orgs/${orgId}/permissions/roles/${roleId}`, data),
      delete: (orgId: string, roleId: string) =>
        del(`${V1}/orgs/${orgId}/permissions/roles/${roleId}`),
      setPermissions: (
        orgId: string,
        roleId: string,
        permissionIds: string[],
      ) =>
        put<void>(
          `${V1}/orgs/${orgId}/permissions/roles/${roleId}/permissions`,
          { permission_ids: permissionIds },
        ),
    },
    teamProjectRoleMap: {
      get: (orgId: string) =>
        get<Record<string, string>>(
          `${V1}/orgs/${orgId}/permissions/team-project-role-map`,
        ),
      set: (orgId: string, roleMap: Record<string, string>) =>
        put<void>(
          `${V1}/orgs/${orgId}/permissions/team-project-role-map`,
          roleMap,
        ),
    },
  },

  // --- Project Teams ---
  projectTeams: {
    list: (orgId: string, projId: string) =>
      get<ProjectTeam[]>(`${V1}/orgs/${orgId}/projects/${projId}/teams`),
    link: (orgId: string, projId: string, teamIds: string[]) =>
      post<void>(`${V1}/orgs/${orgId}/projects/${projId}/teams`, {
        team_ids: teamIds,
      }),
    unlink: (
      orgId: string,
      projId: string,
      teamId: string,
      reassignTo?: string,
    ) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/teams/${teamId}`, {
        body: JSON.stringify(reassignTo ? { reassign_to: reassignTo } : {}),
        headers: { "Content-Type": "application/json" },
      }),
    unlinkPreview: (orgId: string, projId: string, teamId: string) =>
      get<UnlinkPreview>(
        `${V1}/orgs/${orgId}/projects/${projId}/teams/${teamId}/unlink-preview`,
      ),
    eligibleMembers: (orgId: string, projId: string) =>
      get<EffectiveMember[]>(
        `${V1}/orgs/${orgId}/projects/${projId}/teams/eligible-members`,
      ),
  },

  // --- Email Templates (via email service, proxied through backend) ---
  emailTemplates: {
    listDefaults: (orgId: string) =>
      get<{ defaults: string[] }>(
        `${V1}/orgs/${orgId}/email-templates/defaults`,
      ),
    listCustom: (orgId: string) =>
      get<{ templates: string[] }>(`${V1}/orgs/${orgId}/email-templates`),
    get: (orgId: string, templateName: string) =>
      get<{
        template_name: string;
        html: string;
        design?: Record<string, unknown> | null;
      }>(`${V1}/orgs/${orgId}/email-templates/${templateName}`),
    upsert: (
      orgId: string,
      templateName: string,
      html: string,
      design?: Record<string, unknown> | null,
    ) =>
      put<{ status: string }>(
        `${V1}/orgs/${orgId}/email-templates/${templateName}`,
        { html, design },
      ),
    delete: (orgId: string, templateName: string) =>
      del(`${V1}/orgs/${orgId}/email-templates/${templateName}`),
    preview: (
      orgId: string,
      data: { template: string; context: Record<string, string> },
    ) =>
      post<{ html: string }>(
        `${V1}/orgs/${orgId}/email-templates/preview`,
        data,
      ),
  },

  // --- Announcements ---
  announcements: {
    list: (orgId: string, params?: string) =>
      get<ListResponse<Announcement>>(
        `${V1}/orgs/${orgId}/announcements${params ? `?${params}` : ""}`,
      ),
    get: (orgId: string, id: string) =>
      get<Announcement>(`${V1}/orgs/${orgId}/announcements/${id}`),
    create: (
      orgId: string,
      data: {
        title: string;
        body: string;
        priority: string;
        pinned?: boolean;
        project_id?: string;
        published_at?: string;
        expires_at?: string;
      },
    ) => post<Announcement>(`${V1}/orgs/${orgId}/announcements`, data),
    update: (
      orgId: string,
      id: string,
      data: Partial<{
        title: string;
        body: string;
        priority: string;
        pinned: boolean;
        published_at: string;
        expires_at: string;
      }>,
    ) => patch<Announcement>(`${V1}/orgs/${orgId}/announcements/${id}`, data),
    delete: (orgId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/announcements/${id}`),
    markRead: (orgId: string, id: string) =>
      post<void>(`${V1}/orgs/${orgId}/announcements/${id}/read`, {}),
    unreadCount: (orgId: string) =>
      get<{ unread_count: number }>(
        `${V1}/orgs/${orgId}/announcements/unread-count`,
      ),
  },

  // --- Change Requests ---
  changeRequests: {
    listByTask: (
      orgId: string,
      projId: string,
      taskId: string,
      status?: string,
    ) =>
      get<TaskChangeRequest[]>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/change-requests${status ? `?status=${status}` : ""}`,
      ),
    create: (
      orgId: string,
      projId: string,
      taskId: string,
      data: { changes: Record<string, unknown>; reason?: string },
    ) =>
      post<TaskChangeRequest>(
        `${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/change-requests`,
        data,
      ),
    listByProject: (
      orgId: string,
      projId: string,
      params?: {
        status?: string;
        search?: string;
        proposer_id?: string;
        limit?: number;
        offset?: number;
      },
    ) => {
      const qs = params
        ? new URLSearchParams(
            Object.fromEntries(
              Object.entries(params)
                .filter(([, v]) => v !== undefined && v !== "")
                .map(([k, v]) => [k, String(v)]),
            ),
          ).toString()
        : "";
      return get<ListResponse<TaskChangeRequest>>(
        `${V1}/orgs/${orgId}/projects/${projId}/change-requests${qs ? `?${qs}` : ""}`,
      );
    },
    approve: (orgId: string, crId: string, note?: string) =>
      post<TaskChangeRequest>(
        `${V1}/orgs/${orgId}/change-requests/${crId}/approve`,
        { note: note || "" },
      ),
    reject: (orgId: string, crId: string, note?: string) =>
      post<TaskChangeRequest>(
        `${V1}/orgs/${orgId}/change-requests/${crId}/reject`,
        { note: note || "" },
      ),
    attachments: {
      list: (orgId: string, crId: string) =>
        get<ListResponse<Attachment>>(
          `${V1}/orgs/${orgId}/change-requests/${crId}/attachments`,
        ),
      create: (
        orgId: string,
        crId: string,
        data: { filename: string; file_size: number; mime_type: string },
      ) =>
        post<{ attachment: Attachment; upload_url: string }>(
          `${V1}/orgs/${orgId}/change-requests/${crId}/attachments`,
          data,
        ),
      /** Multipart upload through the backend — avoids S3/MinIO CORS issues. */
      directUpload: (
        orgId: string,
        crId: string,
        file: File,
      ): Promise<Attachment> => {
        const fd = new FormData();
        fd.append("file", file);
        return upload<Attachment>(
          `${V1}/orgs/${orgId}/change-requests/${crId}/attachments/upload`,
          fd,
        );
      },
      /** URL that streams file content through the backend. */
      contentUrl: (orgId: string, crId: string, id: string) =>
        `${API_BASE}${V1}/orgs/${orgId}/change-requests/${crId}/attachments/${id}/content`,
      /** Fetches file content via backend with auth headers and returns a blob URL safe for <img>/<video>. */
      fetchBlobUrl: async (
        orgId: string,
        crId: string,
        id: string,
      ): Promise<string> => {
        const path = `${V1}/orgs/${orgId}/change-requests/${crId}/attachments/${id}/content`;
        const token = getToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const orgHeader =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("current_org_id")
            : null;
        if (orgHeader) headers["X-Org-ID"] = orgHeader;
        const res = await fetch(`${API_BASE}${path}`, { headers });
        if (!res.ok) throw new Error("Failed to fetch attachment content");
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      },
      download: (orgId: string, crId: string, attachmentId: string) =>
        get<{ attachment: Attachment; download_url: string }>(
          `${V1}/orgs/${orgId}/change-requests/${crId}/attachments/${attachmentId}/download`,
        ),
      delete: (orgId: string, crId: string, attachmentId: string) =>
        del(
          `${V1}/orgs/${orgId}/change-requests/${crId}/attachments/${attachmentId}`,
        ),
    },
  },

  // --- Chat / Messaging (via messaging-service through Kong) ---
  chat: {
    channels: {
      list: (limit = 50, offset = 0) =>
        get<ListResponse<ChatChannel>>(
          `${V1}/chat/channels?limit=${limit}&offset=${offset}`,
        ),
      get: (channelId: string) =>
        get<ChatChannel>(`${V1}/chat/channels/${channelId}`),
      create: (data: {
        name: string;
        description?: string;
        type: string;
        team_id?: string;
        project_id?: string;
      }) => post<ChatChannel>(`${V1}/chat/channels`, data),
      update: (
        channelId: string,
        data: { name?: string; description?: string; avatar_url?: string },
      ) => put<ChatChannel>(`${V1}/chat/channels/${channelId}`, data),
      delete: (channelId: string) => del(`${V1}/chat/channels/${channelId}`),
      archive: (channelId: string) =>
        post<void>(`${V1}/chat/channels/${channelId}/archive`, {}),
      getOrCreateDM: (userId: string) =>
        post<ChatChannel>(`${V1}/chat/channels/dm`, { user_id: userId }),
      markRead: (channelId: string) =>
        post<void>(`${V1}/chat/channels/${channelId}/read`, {}),
      updateSettings: (
        channelId: string,
        data: { is_muted?: boolean; is_pinned?: boolean },
      ) => put<void>(`${V1}/chat/channels/${channelId}/settings`, data),
    },
    members: {
      list: (channelId: string) =>
        get<ChatChannelMember[]>(`${V1}/chat/channels/${channelId}/members`),
      add: (channelId: string, userId: string) =>
        post<void>(`${V1}/chat/channels/${channelId}/members`, {
          user_id: userId,
        }),
      remove: (channelId: string, userId: string) =>
        del(`${V1}/chat/channels/${channelId}/members/${userId}`),
      updateRole: (channelId: string, userId: string, role: string) =>
        put<void>(`${V1}/chat/channels/${channelId}/members/${userId}/role`, {
          role,
        }),
    },
    messages: {
      list: (channelId: string, limit = 50, before?: string) =>
        get<ChatMessage[]>(
          `${V1}/chat/channels/${channelId}/messages?limit=${limit}${before ? `&before=${before}` : ""}`,
        ),
      send: (
        channelId: string,
        data: {
          body: string;
          body_format?: string;
          parent_message_id?: string;
          mentions?: string[];
        },
      ) => post<ChatMessage>(`${V1}/chat/channels/${channelId}/messages`, data),
      edit: (messageId: string, data: { body: string; body_format?: string }) =>
        put<ChatMessage>(`${V1}/chat/messages/${messageId}`, data),
      delete: (messageId: string) => del(`${V1}/chat/messages/${messageId}`),
      search: (channelId: string, query: string, limit = 20, offset = 0) =>
        get<ListResponse<ChatMessage>>(
          `${V1}/chat/channels/${channelId}/messages/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
        ),
      thread: (messageId: string, limit = 50, offset = 0) =>
        get<ListResponse<ChatMessage>>(
          `${V1}/chat/messages/${messageId}/thread?limit=${limit}&offset=${offset}`,
        ),
      forward: (messageId: string, targetChannelId: string) =>
        post<ChatMessage>(`${V1}/chat/messages/${messageId}/forward`, {
          target_channel_id: targetChannelId,
        }),
    },
    reactions: {
      toggle: (messageId: string, emoji: string) =>
        post<{ added: boolean }>(`${V1}/chat/messages/${messageId}/reactions`, {
          emoji,
        }),
    },
    pins: {
      list: (channelId: string) =>
        get<ChatPinnedMessage[]>(`${V1}/chat/channels/${channelId}/pins`),
      pin: (channelId: string, messageId: string) =>
        post<void>(`${V1}/chat/channels/${channelId}/pins/${messageId}`, {}),
      unpin: (channelId: string, messageId: string) =>
        del(`${V1}/chat/channels/${channelId}/pins/${messageId}`),
    },
    bookmarks: {
      list: (limit = 50, offset = 0) =>
        get<ListResponse<ChatBookmark>>(
          `${V1}/chat/bookmarks?limit=${limit}&offset=${offset}`,
        ),
      add: (messageId: string, note?: string) =>
        post<void>(`${V1}/chat/messages/${messageId}/bookmark`, {
          note: note || "",
        }),
      remove: (messageId: string) =>
        del(`${V1}/chat/messages/${messageId}/bookmark`),
    },
    // Sidebar (hierarchical channels view)
    sidebar: {
      get: () =>
        get<import("@/types/domain").SidebarData>(`${V1}/chat/sidebar`),
    },
    // Categories
    categories: {
      list: () =>
        get<import("@/types/domain").ChannelCategory[]>(
          `${V1}/chat/categories`,
        ),
      create: (data: { name: string; position?: number }) =>
        post<import("@/types/domain").ChannelCategory>(
          `${V1}/chat/categories`,
          data,
        ),
      update: (categoryId: string, data: { name: string; position: number }) =>
        put<void>(`${V1}/chat/categories/${categoryId}`, data),
      delete: (categoryId: string) =>
        del(`${V1}/chat/categories/${categoryId}`),
      toggleCollapsed: (categoryId: string, collapsed: boolean) =>
        put<void>(`${V1}/chat/categories/${categoryId}/collapsed`, {
          collapsed,
        }),
      setChannelCategory: (
        channelId: string,
        categoryId: string | null,
        position?: number,
      ) =>
        put<void>(`${V1}/chat/categories/channel/${channelId}`, {
          category_id: categoryId,
          position: position ?? 0,
        }),
    },
    // User search for DMs and mentions
    users: {
      search: (query: string, limit = 20) =>
        get<import("@/types/domain").OrgMemberInfo[]>(
          `${V1}/chat/users?q=${encodeURIComponent(query)}&limit=${limit}`,
        ),
    },
    // Presence
    presence: {
      get: () =>
        get<{
          online_users: string[];
          users: Record<
            string,
            { user_id: string; online: boolean; last_seen?: string }
          >;
        }>(`${V1}/chat/presence`),
    },
    // File upload
    upload: {
      file: async (
        channelId: string,
        file: File,
        body?: string,
      ): Promise<import("@/types/domain").ChatMessageAttachment> => {
        const formData = new FormData();
        formData.append("file", file);
        if (body) formData.append("body", body);
        const response = await fetch(
          `${API_BASE}${V1}/chat/channels/${channelId}/upload`,
          {
            method: "POST",
            headers: getAuthHeaders(),
            body: formData,
          },
        );
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(
            errData.message || `Upload failed: ${response.status}`,
          );
        }
        return response.json();
      },
    },
    // Attachment URL
    attachments: {
      getUrl: (attachmentId: string) =>
        get<import("@/types/domain").ChatMessageAttachment>(
          `${V1}/chat/attachments/${attachmentId}/url`,
        ),
    },
    // Channel Roles & Permissions
    roles: {
      list: () =>
        get<import("@/types/domain").ChannelRolePermissions[]>(
          `${V1}/chat/roles`,
        ),
      myPermissions: (channelId: string) =>
        get<import("@/types/domain").ChannelRolePermissions>(
          `${V1}/chat/channels/${channelId}/my-permissions`,
        ),
    },
  },

  // Org theme config
  orgTheme: {
    get: (orgId: string) => get<OrgThemeConfig>(`${V1}/orgs/${orgId}/theme`),
    update: (
      orgId: string,
      data: {
        base_theme: string;
        custom_colors: Record<string, string>;
        locked: boolean;
      },
    ) => put<OrgThemeConfig>(`${V1}/orgs/${orgId}/theme`, data),
  },
};
