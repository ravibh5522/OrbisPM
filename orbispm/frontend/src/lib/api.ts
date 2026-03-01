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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Remove Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const method = options.method || "GET";
  console.log(`[API] ${method} ${path}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    console.log(`[API] ${method} ${path} → 204 (no content)`);
    return undefined as T;
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
    console.error(`[API] ${method} ${path} → ${res.status} ERROR: ${msg}`, detail || "");
    throw new ApiError(res.status, msg, detail);
  }

  const data = await res.json();
  console.log(`[API] ${method} ${path} → ${res.status}`, data);
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

function del<T = void>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

function upload<T>(path: string, formData: FormData): Promise<T> {
  return request<T>(path, { method: "POST", body: formData });
}

// API namespaces
import type {
  Org,
  OrgMember,
  Team,
  TeamMember,
  Project,
  ProjectMember,
  Task,
  TaskTree,
  TaskDependency,
  Checklist,
  Comment,
  TaskRule,
  Notification,
  NotificationPreference,
  ActivityLog,
  TaskTemplate,
  Webhook,
  APIKey,
  Attachment,
  BillingPlan,
  OrgSubscription,
  CustomRole,
  ImportJob,
  DashboardStats,
  AuthTokens,
} from "@/types/domain";

const V1 = "/api/v1";

export const api = {
  // Auth (GoTrue)
  auth: {
    signup(email: string, password: string, name?: string): Promise<AuthTokens> {
      return request<AuthTokens>("/auth/v1/signup", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          data: name ? { name } : undefined,
        }),
      });
    },
    login(email: string, password: string): Promise<AuthTokens> {
      return request<AuthTokens>("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },
    refresh(refreshToken: string): Promise<AuthTokens> {
      return request<AuthTokens>("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    },
    getUser(): Promise<{ id: string; email: string; user_metadata?: Record<string, unknown> }> {
      return get("/auth/v1/user");
    },
  },

  // Orgs
  orgs: {
    list: () => get<ListResponse<Org>>(`${V1}/orgs`),
    get: (id: string) => get<Org>(`${V1}/orgs/${id}`),
    create: (data: { name: string; slug: string }) => post<Org>(`${V1}/orgs`, data),
    update: (id: string, data: Partial<Org>) => put<Org>(`${V1}/orgs/${id}`, data),
    delete: (id: string) => del(`${V1}/orgs/${id}`),
    me: (orgId: string) => get<OrgMember>(`${V1}/orgs/${orgId}/me`),
  },

  // Org Members
  members: {
    list: (orgId: string) => get<ListResponse<OrgMember>>(`${V1}/orgs/${orgId}/members`),
    add: (orgId: string, data: { user_id: string; role: string }) =>
      post<OrgMember>(`${V1}/orgs/${orgId}/members`, data),
    update: (orgId: string, userId: string, data: { role: string }) =>
      put<OrgMember>(`${V1}/orgs/${orgId}/members/${userId}`, data),
    remove: (orgId: string, userId: string) =>
      del(`${V1}/orgs/${orgId}/members/${userId}`),
  },

  // Teams
  teams: {
    list: (orgId: string) => get<ListResponse<Team>>(`${V1}/orgs/${orgId}/teams`),
    get: (orgId: string, id: string) => get<Team>(`${V1}/orgs/${orgId}/teams/${id}`),
    create: (orgId: string, data: { name: string; description?: string }) =>
      post<Team>(`${V1}/orgs/${orgId}/teams`, data),
    update: (orgId: string, id: string, data: Partial<Team>) =>
      put<Team>(`${V1}/orgs/${orgId}/teams/${id}`, data),
    delete: (orgId: string, id: string) => del(`${V1}/orgs/${orgId}/teams/${id}`),
  },

  // Team members
  teamMembers: {
    list: (orgId: string, teamId: string) =>
      get<ListResponse<TeamMember>>(`${V1}/orgs/${orgId}/teams/${teamId}/members`),
    add: (orgId: string, teamId: string, data: { user_id: string; role: string }) =>
      post<TeamMember>(`${V1}/orgs/${orgId}/teams/${teamId}/members`, data),
    update: (orgId: string, teamId: string, userId: string, data: { role: string }) =>
      put<TeamMember>(`${V1}/orgs/${orgId}/teams/${teamId}/members/${userId}`, data),
    remove: (orgId: string, teamId: string, userId: string) =>
      del(`${V1}/orgs/${orgId}/teams/${teamId}/members/${userId}`),
  },

  // Projects
  projects: {
    list: (orgId: string) => get<ListResponse<Project>>(`${V1}/orgs/${orgId}/projects`),
    get: (orgId: string, id: string) => get<Project>(`${V1}/orgs/${orgId}/projects/${id}`),
    create: (orgId: string, data: { name: string; team_id: string; description?: string }) =>
      post<Project>(`${V1}/orgs/${orgId}/projects`, data),
    update: (orgId: string, id: string, data: Partial<Project>) =>
      put<Project>(`${V1}/orgs/${orgId}/projects/${id}`, data),
    delete: (orgId: string, id: string) => del(`${V1}/orgs/${orgId}/projects/${id}`),
  },

  // Project members
  projectMembers: {
    list: (orgId: string, projId: string) =>
      get<ListResponse<ProjectMember>>(`${V1}/orgs/${orgId}/projects/${projId}/members`),
    add: (orgId: string, projId: string, data: { user_id: string; role: string }) =>
      post<ProjectMember>(`${V1}/orgs/${orgId}/projects/${projId}/members`, data),
    update: (orgId: string, projId: string, userId: string, data: { role: string }) =>
      put<ProjectMember>(`${V1}/orgs/${orgId}/projects/${projId}/members/${userId}`, data),
    remove: (orgId: string, projId: string, userId: string) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/members/${userId}`),
  },

  // Tasks
  tasks: {
    list: (orgId: string, projId: string, params?: string) =>
      get<ListResponse<Task>>(`${V1}/orgs/${orgId}/projects/${projId}/tasks${params ? `?${params}` : ""}`),
    get: (orgId: string, projId: string, id: string) =>
      get<Task>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${id}`),
    create: (orgId: string, projId: string, data: Partial<Task>) =>
      post<Task>(`${V1}/orgs/${orgId}/projects/${projId}/tasks`, data),
    update: (orgId: string, projId: string, id: string, data: Partial<Task>) =>
      put<Task>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${id}`, data),
    delete: (orgId: string, projId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${id}`),
    tree: (orgId: string, projId: string) =>
      get<TaskTree[]>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/tree`),
    move: (orgId: string, projId: string, id: string, data: { parent_task_id?: string; position: number }) =>
      post<void>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${id}/move`, data),
    bulkUpdate: (orgId: string, projId: string, data: { task_ids: string[]; changes: Partial<Task> }) =>
      post<void>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/bulk`, data),
  },

  // Task dependencies
  dependencies: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<TaskDependency>>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/dependencies`),
    add: (orgId: string, projId: string, taskId: string, data: { depends_on_id: string; type?: string }) =>
      post<TaskDependency>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/dependencies`, data),
    remove: (orgId: string, projId: string, taskId: string, depId: string) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/dependencies/${depId}`),
  },

  // Checklists
  checklists: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<Checklist>>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/checklists`),
    create: (orgId: string, projId: string, taskId: string, data: { title: string }) =>
      post<Checklist>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/checklists`, data),
    update: (orgId: string, projId: string, taskId: string, id: string, data: Partial<Checklist>) =>
      put<Checklist>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/checklists/${id}`, data),
    delete: (orgId: string, projId: string, taskId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/checklists/${id}`),
  },

  // Comments
  comments: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<Comment>>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/comments`),
    create: (orgId: string, projId: string, taskId: string, data: { body: string; parent_id?: string }) =>
      post<Comment>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/comments`, data),
    update: (orgId: string, projId: string, taskId: string, id: string, data: { body: string }) =>
      put<Comment>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/comments/${id}`, data),
    delete: (orgId: string, projId: string, taskId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/comments/${id}`),
  },

  // Task rules
  rules: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<TaskRule>>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/rules`),
    create: (orgId: string, projId: string, taskId: string, data: Partial<TaskRule>) =>
      post<TaskRule>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/rules`, data),
    delete: (orgId: string, projId: string, taskId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/rules/${id}`),
  },

  // Notifications (user-scoped, no org prefix)
  notifications: {
    list: (_orgId: string, params?: string) =>
      get<ListResponse<Notification>>(`${V1}/notifications${params ? `?${params}` : ""}`),
    markRead: (_orgId: string, id: string) =>
      patch<void>(`${V1}/notifications/${id}/read`, {}),
    markAllRead: (_orgId: string) =>
      post<void>(`${V1}/notifications/mark-all-read`, {}),
  },

  // Notification preferences
  notificationPreferences: {
    list: (orgId: string) =>
      get<ListResponse<NotificationPreference>>(`${V1}/orgs/${orgId}/notification-preferences`),
    update: (orgId: string, id: string, data: Partial<NotificationPreference>) =>
      put<NotificationPreference>(`${V1}/orgs/${orgId}/notification-preferences/${id}`, data),
  },

  // Activity logs
  activity: {
    list: (orgId: string, params?: string) =>
      get<ListResponse<ActivityLog>>(`${V1}/orgs/${orgId}/activity${params ? `?${params}` : ""}`),
  },

  // Templates
  templates: {
    list: (orgId: string) => get<ListResponse<TaskTemplate>>(`${V1}/orgs/${orgId}/templates`),
    get: (orgId: string, id: string) => get<TaskTemplate>(`${V1}/orgs/${orgId}/templates/${id}`),
    create: (orgId: string, data: Partial<TaskTemplate>) =>
      post<TaskTemplate>(`${V1}/orgs/${orgId}/templates`, data),
    update: (orgId: string, id: string, data: Partial<TaskTemplate>) =>
      put<TaskTemplate>(`${V1}/orgs/${orgId}/templates/${id}`, data),
    delete: (orgId: string, id: string) => del(`${V1}/orgs/${orgId}/templates/${id}`),
    apply: (orgId: string, projId: string, templateId: string) =>
      post<void>(`${V1}/orgs/${orgId}/projects/${projId}/apply-template`, { template_id: templateId }),
  },

  // Webhooks
  webhooks: {
    list: (orgId: string) => get<ListResponse<Webhook>>(`${V1}/orgs/${orgId}/webhooks`),
    create: (orgId: string, data: Partial<Webhook>) =>
      post<Webhook>(`${V1}/orgs/${orgId}/webhooks`, data),
    update: (orgId: string, id: string, data: Partial<Webhook>) =>
      put<Webhook>(`${V1}/orgs/${orgId}/webhooks/${id}`, data),
    delete: (orgId: string, id: string) => del(`${V1}/orgs/${orgId}/webhooks/${id}`),
  },

  // API Keys
  apiKeys: {
    list: (orgId: string) => get<ListResponse<APIKey>>(`${V1}/orgs/${orgId}/api-keys`),
    create: (orgId: string, data: { name: string; scopes: string[]; expires_at?: string }) =>
      post<APIKey>(`${V1}/orgs/${orgId}/api-keys`, data),
    revoke: (orgId: string, id: string) => del(`${V1}/orgs/${orgId}/api-keys/${id}`),
  },

  // Attachments
  attachments: {
    list: (orgId: string, projId: string, taskId: string) =>
      get<ListResponse<Attachment>>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/attachments`),
    upload: (orgId: string, projId: string, taskId: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return upload<Attachment>(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/attachments`, fd);
    },
    delete: (orgId: string, projId: string, taskId: string, id: string) =>
      del(`${V1}/orgs/${orgId}/projects/${projId}/tasks/${taskId}/attachments/${id}`),
  },

  // Billing
  billing: {
    plans: () => get<ListResponse<BillingPlan>>(`${V1}/billing/plans`),
    subscription: (orgId: string) => get<OrgSubscription>(`${V1}/orgs/${orgId}/subscription`),
    subscribe: (orgId: string, data: { plan_id: string }) =>
      post<OrgSubscription>(`${V1}/orgs/${orgId}/subscription`, data),
    cancel: (orgId: string) => del(`${V1}/orgs/${orgId}/subscription`),
  },

  // Custom Roles
  customRoles: {
    list: (orgId: string) => get<ListResponse<CustomRole>>(`${V1}/orgs/${orgId}/roles`),
    create: (orgId: string, data: Partial<CustomRole>) =>
      post<CustomRole>(`${V1}/orgs/${orgId}/roles`, data),
    update: (orgId: string, id: string, data: Partial<CustomRole>) =>
      patch<CustomRole>(`${V1}/orgs/${orgId}/roles/${id}`, data),
    delete: (orgId: string, id: string) => del(`${V1}/orgs/${orgId}/roles/${id}`),
  },

  // Import
  import: {
    start: (orgId: string, projId: string, file: File, columnMapping: Record<string, string>) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("column_mapping", JSON.stringify(columnMapping));
      return upload<ImportJob>(`${V1}/orgs/${orgId}/projects/${projId}/import`, fd);
    },
    status: (orgId: string, projId: string, jobId: string) =>
      get<ImportJob>(`${V1}/orgs/${orgId}/projects/${projId}/import/${jobId}`),
  },

  // Search
  search: {
    tasks: (orgId: string, query: string, limit = 20) =>
      get<ListResponse<Task>>(`${V1}/orgs/${orgId}/search?q=${encodeURIComponent(query)}&limit=${limit}`),
  },

  // Dashboard
  dashboard: {
    stats: (orgId: string) => get<DashboardStats>(`${V1}/orgs/${orgId}/dashboard/stats`),
    myTasks: (orgId: string, limit = 50, offset = 0) =>
      get<ListResponse<Task>>(`${V1}/orgs/${orgId}/dashboard/my-tasks?limit=${limit}&offset=${offset}`),
  },
};
