// Domain types matching the Go backend models exactly

export interface Org {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  plan: string;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  org_id: string;
  user_id: string;
  email: string;
  display_name?: string;
  phone?: string;
  avatar_url?: string;
  role: OrgRole;
  joined_at: string;
}

export type OrgRole = "owner" | "admin" | "member" | "viewer" | "billing_admin";

export interface Team {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  role: string;
  joined_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  team_id?: string | null;
  team_ids?: string[];
  name: string;
  description?: string;
  status: ProjectStatus;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = "active" | "archived" | "completed";

// Custom task status configuration (stored in project.settings.task_statuses)
export interface TaskStatusConfig {
  id: string;        // e.g. "todo", "in_progress", "review", "done"
  label: string;     // Display name
  color: string;     // DaisyUI color: primary, secondary, accent, info, success, warning, error
  done?: boolean;    // Marks task as completed (for burndown/progress calculations)
}

// Default statuses used when project has none configured
export const DEFAULT_TASK_STATUSES: TaskStatusConfig[] = [
  { id: "todo", label: "To Do", color: "secondary" },
  { id: "in_progress", label: "In Progress", color: "info" },
  { id: "done", label: "Done", color: "success", done: true },
  { id: "blocked", label: "Blocked", color: "error" },
];

export interface ProjectMember {
  project_id: string;
  user_id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  role: string;
  source?: string;
  source_team_id?: string | null;
  source_team_name?: string;
  joined_at: string;
}

// --- Permission System Types ---

export type PermissionScope = "org" | "team" | "project";

export interface Permission {
  id: string;
  resource: string;
  action: string;
  scope: PermissionScope;
  description?: string;
}

export interface Role {
  id: string;
  org_id: string;
  scope: PermissionScope;
  slug: string;
  name: string;
  description?: string;
  is_system: boolean;
  permissions?: Permission[];
  created_at: string;
  updated_at: string;
}

export interface ProjectTeam {
  project_id: string;
  team_id: string;
  team_name?: string;
  added_at: string;
}

export interface EffectiveMember {
  user_id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  role: string;
  source: string;
  source_team_id?: string | null;
  source_team_name?: string;
}

export type ChangeRequestStatus = "pending" | "approved" | "rejected";

export interface TaskChangeRequest {
  id: string;
  org_id: string;
  task_id: string;
  proposer_id: string;
  reviewer_id?: string | null;
  status: ChangeRequestStatus;
  changes: Record<string, unknown>;
  reason?: string;
  review_note?: string;
  created_at: string;
  reviewed_at?: string | null;
}

export interface TaskUpdateResult {
  task: Task;
  change_request?: TaskChangeRequest | null;
  applied_changes?: Record<string, unknown>;
  pending_review?: boolean;
}

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface Task {
  id: string;
  org_id: string;
  project_id: string;
  parent_task_id?: string | null;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id?: string | null;
  reporter_id?: string | null;
  depth: number;
  position: number;
  due_date?: string | null;
  start_date?: string | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  labels?: string[];
  metadata?: Record<string, unknown>;
  review_status?: string | null;
  recurrence_rule?: string | null;
  recurrence_parent_id?: string | null;
  next_occurrence?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskTree {
  task: Task;
  children?: TaskTree[];
}

export interface TaskDependency {
  task_id: string;
  depends_on_id: string;
  type: string;
}

export interface Checklist {
  id: string;
  org_id: string;
  task_id: string;
  title: string;
  is_checked: boolean;
  position: number;
  created_at: string;
}

export interface Comment {
  id: string;
  org_id: string;
  task_id: string;
  user_id: string;
  body: string;
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRule {
  id: string;
  org_id: string;
  task_id: string;
  rule_type: string;
  rule_config?: Record<string, unknown>;
  is_required: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  org_id: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  read_at?: string | null;
  created_at: string;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  org_id: string;
  event_type: string;
  channel: string;
  enabled: boolean;
}

export interface ActivityLog {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface TaskTemplate {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  structure: Record<string, unknown>;
  is_shared: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Webhook {
  id: string;
  org_id: string;
  url: string;
  events: string[];
  secret?: string;
  is_active: boolean;
  created_at: string;
}

export interface APIKey {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  raw_key?: string; // only returned on creation
}

export interface Attachment {
  id: string;
  org_id: string;
  task_id?: string | null;
  comment_id?: string | null;
  change_request_id?: string | null;
  uploaded_by: string;
  filename: string;
  file_size: number;
  mime_type: string;
  upload_url?: string;
  created_at: string;
}

export interface TaskWatcher {
  task_id: string;
  user_id: string;
}

export interface BillingPlan {
  id: string;
  name: string;
  stripe_price_id?: string | null;
  limits: Record<string, unknown>;
  created_at: string;
}

export interface OrgSubscription {
  id: string;
  org_id: string;
  plan_id: string;
  stripe_sub_id?: string | null;
  status: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomRole {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  permissions: Record<string, unknown>;
  created_at?: string;
}

export interface ImportJob {
  id: string;
  org_id: string;
  project_id: string;
  user_id: string;
  status: string;
  file_name: string;
  column_mapping?: Record<string, unknown>;
  total_rows?: number | null;
  processed_rows: number;
  error_rows: number;
  errors?: Record<string, unknown>[];
  result?: Record<string, unknown>;
  created_at: string;
  completed_at?: string | null;
}

export interface DashboardStats {
  total_projects: number;
  total_tasks: number;
  total_members: number;
  total_teams: number;
  overdue_tasks: number;
  tasks_by_status: Record<TaskStatus, number>;
  tasks_by_priority: Record<TaskPriority, number>;
  recent_tasks: Task[];
}

export interface MemberWorkload {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  total: number;
  todo: number;
  in_progress: number;
  done: number;
  blocked: number;
  overdue: number;
}

export interface TeamDashboardStats {
  total_projects: number;
  total_tasks: number;
  total_members: number;
  overdue_tasks: number;
  tasks_by_status: Record<string, number>;
  tasks_by_priority: Record<string, number>;
  member_workload: MemberWorkload[] | null;
  recent_tasks: Task[];
  completed_last_7_days: number;
  created_last_7_days: number;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface LabelCount {
  label: string;
  count: number;
}

export interface ProjectDashboardStats {
  total_tasks: number;
  total_members: number;
  overdue_tasks: number;
  completion_rate: number;
  estimated_hours: number;
  actual_hours: number;
  tasks_by_status: Record<string, number>;
  tasks_by_priority: Record<string, number>;
  member_workload: MemberWorkload[] | null;
  completed_last_7_days: number;
  created_last_7_days: number;
  burndown_data: DailyCount[] | null;
  created_over_time: DailyCount[] | null;
  label_counts: LabelCount[] | null;
  recent_tasks: Task[] | null;
  due_soon_tasks: Task[] | null;
}

export interface DomainEvent {
  type: string;
  org_id: string;
  actor_id: string;
  entity_id: string;
  payload?: Record<string, unknown>;
}

// Auth types from Zitadel
export interface AuthUser {
  id: string;
  email: string;
  email_confirmed_at?: string;
  phone?: string;
  user_metadata?: {
    name?: string;
    avatar_url?: string;
    bio?: string;
    job_title?: string;
    department?: string;
    timezone?: string;
    language?: string;
    [key: string]: unknown;
  };
  app_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  mfa_enabled: boolean;
  totp_enabled?: boolean;
  otp_email_enabled?: boolean;
  otp_sms_enabled?: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: AuthUser;
  // MFA challenge — set when the password check passed but a second factor is required.
  // access_token will be empty; use session_id + session_token with verifyLoginMFA.
  mfa_required?: boolean;
  session_id?: string;
  session_token?: string;
  available_methods?: string[];
}

export interface BackupCodesResponse {
  codes: string[];
}

// MFA types
export interface TOTPRegistration {
  uri: string;
  secret: string;
}

export interface MFAStatus {
  status: string;
}

// Social / IDP types
export interface IDPInfo {
  id: string;
  name: string;
  type: string;
}

export interface IDPStartResponse {
  auth_url: string;
}

// OIDC PKCE types
export interface OIDCAuthorizeResponse {
  auth_url: string;
  code_verifier: string;
  state: string;
}
