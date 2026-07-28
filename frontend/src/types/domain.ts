// Domain types matching the Go backend models exactly

export interface OrgThemeConfig {
  org_id: string;
  base_theme: string;
  custom_colors: Record<string, string>;
  locked: boolean;
  updated_at: string;
  updated_by?: string;
}

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

export type TeamStatus = "active" | "archived" | "closed";

export interface Team {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  status: TeamStatus;
  member_count?: number;
  manager_name?: string;
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
  member_count?: number;
  task_count?: number;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = "active" | "archived" | "completed";

// Custom task status configuration (stored in project.settings.task_statuses)
export interface TaskStatusConfig {
  id: string; // e.g. "todo", "in_progress", "review", "done"
  label: string; // Display name
  color: string; // DaisyUI color: primary, secondary, accent, info, success, warning, error
  done?: boolean; // Marks task as completed (for burndown/progress calculations)
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

export interface ScopePermissionsResponse {
  role: string;
  permissions: { resource: string; action: string }[];
}

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

export interface UnlinkPreviewMember {
  user_id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  task_count: number;
}

export interface UnlinkPreview {
  team_id: string;
  team_name: string;
  affected_members: UnlinkPreviewMember[];
  total_tasks: number;
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
  deadline_conflicts?: DeadlineConflict[];
  ancestors_updated?: Task[];
}

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked"
  | "cancelled";
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
  assignee_ids?: string[];
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
  version: number;
  created_at: string;
  updated_at: string;
  progress?: number;
}

export interface DeadlineConflict {
  task_id: string;
  title: string;
  due_date: string | null;
  start_date?: string | null;
  depth: number;
  direction?: "ancestor" | "descendant";
}

export interface TaskCreateResult {
  task?: Task;
  deadline_conflicts?: DeadlineConflict[];
  ancestors_updated?: Task[];
}

export interface TaskTree {
  task: Task;
  children?: TaskTree[];
}

export interface TaskConflict {
  task_id: string;
  server_version: number;
  server_state: Task;
  your_changes: Record<string, unknown>;
  resolution: "auto-merged" | "conflict";
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

export interface StickyNoteCheckpoint {
  id: string;
  text: string;
  checked: boolean;
}

export interface StickyNote {
  id: string;
  user_id: string;
  title: string;
  description: string;
  color: string;
  priority: string;
  start_date?: string | null;
  due_date?: string | null;
  completed: boolean;
  checkpoints: StickyNoteCheckpoint[];
  created_at: string;
  updated_at: string;
}

export interface StickyNoteStats {
  total: number;
  completed: number;
  overdue: number;
  upcoming: number;
}

// ─── Project Canvas (whiteboard) ─────────────────────────────────────────
export type CanvasShapeType =
  | "rect"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "sticky"
  | "text"
  | "task";

export interface CanvasShape {
  id: string;
  type: CanvasShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  fill_color?: string;
  stroke_color?: string;
  stroke_width?: number;
  text?: string;
  linked_task_id?: string | null;
  extra?: Record<string, unknown>;
}

export interface CanvasConnector {
  id: string;
  source_id: string;
  target_id: string;
  mode?: "straight" | "orthogonal" | "curve";
  stroke_color?: string;
  stroke_width?: number;
  label?: string;
}

export interface CanvasState {
  version: number;
  background?: string;
  shapes: CanvasShape[];
  connectors: CanvasConnector[];
}

export interface ProjectCanvas {
  id: string;
  org_id: string;
  project_id: string;
  title: string;
  description: string;
  state: CanvasState;
  version: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
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

// Excel import types
export interface SheetInfo {
  name: string;
  columns: string[];
  row_count: number;
}

export interface ExcelColumnMapping {
  task: number;
  subtask1: number;
  subtask2: number;
  subtask3: number;
  description: number;
  start_date: number;
  end_date: number;
  priority: number;
  status: number;
  assignee_email: number;
}

export interface SheetImportConfig {
  sheet_name: string;
  mapping: ExcelColumnMapping;
}

export interface ImportAssignment {
  email: string;
  user_id: string;
  task_name: string;
}

export interface ProcessExcelResult {
  job: ImportJob;
  assignments?: ImportAssignment[];
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
  internal_id?: string; // UUID derived from Zitadel ID for internal use (matches message user_id)
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
  // Set when an SSO provider (e.g. GitHub with a private account) did not
  // return an email. The frontend must redirect to /auth/complete-profile.
  needs_email?: boolean;
  // Only set by the real OIDC/SSO path — proof for RP-initiated logout.
  id_token?: string;
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

// ─── Chat / Messaging Types ───────────────────────────

export type ChatChannelType = "dm" | "group" | "team" | "project";
export type ChatMemberRole =
  | "owner"
  | "admin"
  | "moderator"
  | "member"
  | "viewer";
export type ChatMessageFormat = "text" | "markdown";

/** Channel permission from the backend. */
export interface ChannelPermission {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

/** Role with its associated permissions. */
export interface ChannelRolePermissions {
  role: ChatMemberRole;
  permissions: ChannelPermission[];
}

export interface ChatChannel {
  id: string;
  org_id: string;
  name: string;
  description: string;
  type: ChatChannelType;
  team_id?: string | null;
  project_id?: string | null;
  is_archived: boolean;
  dm_pair?: string;
  avatar_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count?: number;
  unread_count?: number;
  is_muted?: boolean;
  is_pinned?: boolean;
  last_message?: string;
  last_activity?: string | null;
}

export interface ChatChannelMember {
  channel_id: string;
  user_id: string;
  role: ChatMemberRole;
  last_read_at?: string | null;
  is_muted: boolean;
  is_pinned: boolean;
  joined_at: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

export interface ChatMessage {
  id: string;
  org_id: string;
  channel_id: string;
  user_id: string;
  body: string;
  body_format: ChatMessageFormat;
  parent_message_id?: string | null;
  thread_count: number;
  forwarded_from_id?: string | null;
  mentions?: string[];
  is_deleted: boolean;
  deleted_at?: string | null;
  is_edited: boolean;
  edited_at?: string | null;
  created_at: string;
  updated_at: string;
  sender_name?: string;
  sender_avatar?: string;
  reactions?: ChatReaction[];
  attachments?: ChatMessageAttachment[];
}

export interface ChatReaction {
  emoji: string;
  count: number;
  users: string[];
}

export interface ChatLinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site?: string;
}

export interface ChatMessageAttachment {
  id: string;
  org_id: string;
  message_id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  url?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ChatPinnedMessage {
  channel_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
  message?: ChatMessage;
}

export interface ChatBookmark {
  user_id: string;
  message_id: string;
  note: string;
  created_at: string;
  message?: ChatMessage;
}

// ─── Sidebar Types ────────────────────────────────────

export interface SidebarTeam {
  id: string;
  name: string;
  manager_id?: string | null;
  channels: ChatChannel[];
}

export interface SidebarCategory {
  id: string;
  name: string;
  position: number;
  is_collapsed: boolean;
  auto_source?: string;
  auto_source_id?: string;
  channels: ChatChannel[];
}

export interface ChannelCategory {
  id: string;
  org_id: string;
  name: string;
  position: number;
  auto_source?: string;
  auto_source_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SidebarData {
  categories: SidebarCategory[];
  teams: SidebarTeam[];
  project_channels: ChatChannel[];
  dm_channels: ChatChannel[];
  group_channels: ChatChannel[];
}

export interface OrgMemberInfo {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
}

// Announcements
export type AnnouncementPriority = "low" | "normal" | "high" | "urgent";

export interface Announcement {
  id: string;
  org_id: string;
  project_id?: string | null;
  author_id: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  pinned: boolean;
  published_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
  read_count: number;
  unread: boolean;
}

// ═══════════════════════════════════════════════════════
// Analytics & Performance Types
// ═══════════════════════════════════════════════════════

export interface VelocityPoint {
  [key: string]: unknown;
  date: string;
  completed: number;
  created: number;
}

export interface CFDPoint {
  date: string;
  todo: number;
  in_progress: number;
  blocked: number;
  done: number;
}

export interface HealthScore {
  overall: number;
  velocity_trend: number;
  blocked_ratio: number;
  overdue_ratio: number;
  completion_rate: number;
  estimate_accuracy: number;
}

export interface WorkloadDistribution {
  user_id: string;
  display_name: string;
  task_count: number;
  done_count: number;
  overdue_count: number;
  story_points: number;
}

export interface BurndownPoint {
  [key: string]: unknown;
  date: string;
  remaining: number;
  ideal: number;
}

export interface CycleTimeStats {
  mean: number;
  median: number;
  p75: number;
  p90: number;
  p95: number;
  std_dev: number;
}

export interface LeadTimeStats {
  mean: number;
  median: number;
  p75: number;
  p90: number;
}

export interface ThroughputStats {
  daily_avg: number;
  weekly_avg: number;
  trend: number;
}

export interface RiskScore {
  id: string;
  task_id: string;
  risk_level: "low" | "medium" | "high" | "critical";
  risk_score: number;
  factors: Record<string, unknown>;
  predicted_completion?: string | null;
  updated_at: string;
}

export interface MetricAlert {
  id: string;
  org_id: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  scope_type: string;
  scope_id: string;
  title: string;
  description: string;
  data?: Record<string, unknown>;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  created_at: string;
}

export interface PerformanceReport {
  id: string;
  org_id: string;
  report_type: string;
  scope_type: string;
  scope_id: string;
  parameters: Record<string, unknown>;
  status: "pending" | "generating" | "completed" | "failed";
  storage_path?: string;
  generated_by: string;
  generated_at?: string | null;
  expires_at?: string | null;
  created_at: string;
}

export interface ProjectHealthSummary {
  project_id: string;
  project_name: string;
  health_score: number;
  task_count: number;
  done_count: number;
  overdue_count: number;
  velocity: number;
}

export interface DashboardPredictions {
  completion_forecast?: string | null;
  velocity_forecast: number;
  risk_task_count: number;
}

export interface DashboardAnalytics {
  health: HealthScore;
  velocity: VelocityPoint[];
  predictions: DashboardPredictions;
  warnings: MetricAlert[];
  top_risk_tasks: RiskScore[];
  workload_balance: WorkloadDistribution[];
  completion_trend: VelocityPoint[];
}

export interface OrgAnalytics {
  health: HealthScore;
  velocity: VelocityPoint[];
  project_health: ProjectHealthSummary[];
  workload: WorkloadDistribution[];
  active_alerts: MetricAlert[];
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  avg_cycle_time: number;
}

export interface ProjectAnalytics {
  health: HealthScore;
  velocity: VelocityPoint[];
  cfd: CFDPoint[];
  burndown: BurndownPoint[];
  cycle_time: CycleTimeStats;
  lead_time: LeadTimeStats;
  throughput: ThroughputStats;
  workload: WorkloadDistribution[];
  risk_tasks: RiskScore[];
  estimate_accuracy: number;
  completion_forecast?: string | null;
}

export interface TeamAnalytics {
  health: HealthScore;
  velocity: VelocityPoint[];
  workload: WorkloadDistribution[];
  projects: ProjectHealthSummary[];
}

export interface MemberAnalytics {
  tasks_completed: number;
  tasks_created: number;
  avg_cycle_time: number;
  velocity: VelocityPoint[];
  completion_rate: number;
  overdue_tasks: number;
  active_tasks: number;
}
