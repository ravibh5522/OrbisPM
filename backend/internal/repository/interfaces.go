package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
)

// ListFilter defines common filter/pagination parameters.
type ListFilter struct {
	Limit  int
	Offset int
}

// TaskFilter extends ListFilter with task-specific filters.
type TaskFilter struct {
	ListFilter
	Status      *string     // single status (backward compat)
	Statuses    []string    // multi-status filter
	Priority    *string     // single priority (backward compat)
	Priorities  []string    // multi-priority filter
	AssigneeID  *uuid.UUID  // single assignee (backward compat)
	AssigneeIDs []uuid.UUID // multi-assignee filter
	Search      *string
	ParentID    *string // "root" for root tasks (parent IS NULL), UUID for children of a specific task, nil for all
	Labels      []string
	DueDateFrom *string // "YYYY-MM-DD"
	DueDateTo   *string // "YYYY-MM-DD"
	SortBy      string  // column to sort by (title, status, priority, due_date, created_at, updated_at, position)
	SortOrder   string  // "asc" or "desc"
}

// TeamFilter for paginated team listing.
type TeamFilter struct {
	ListFilter
	Search    *string
	Status    *string    // active, archived, closed
	UserID    *uuid.UUID // when set, only teams where this user is a member
	SortBy    string     // name, member_count, created_at, status
	SortOrder string     // asc, desc
}

// ProjectFilter for paginated project listing.
type ProjectFilter struct {
	ListFilter
	Search    *string
	Status    *string
	TeamID    *uuid.UUID
	UserID    *uuid.UUID // when set, only projects where this user is a member (direct or via team)
	SortBy    string     // name, status, created_at, updated_at
	SortOrder string     // asc, desc
}

// MemberFilter for paginated member listing.
type MemberFilter struct {
	ListFilter
	Search    *string
	Role      *string
	SortBy    string // display_name, email, role, joined_at
	SortOrder string // asc, desc
}

// TemplateFilter for paginated template listing.
type TemplateFilter struct {
	ListFilter
	Search    *string
	Shared    *bool  // nil = all, true = shared only, false = private only
	SortBy    string // name, created_at, updated_at
	SortOrder string // asc, desc
}

// NotificationFilter for paginated notification listing.
type NotificationFilter struct {
	ListFilter
	Status    string // "" (all), "read", "unread"
	SortBy    string // created_at, read_at
	SortOrder string // asc, desc
}

// ActivityFilter for paginated activity listing.
type ActivityFilter struct {
	ListFilter
	Search     *string
	Action     *string // e.g., "created", "updated", "deleted"
	EntityType *string // e.g., "task", "project"
	SortBy     string  // created_at
	SortOrder  string  // asc, desc
}

// --- Organisation ---

type OrgRepository interface {
	Create(ctx context.Context, tx pgx.Tx, org *domain.Org) (*domain.Org, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Org, error)
	GetBySlug(ctx context.Context, slug string) (*domain.Org, error)
	Update(ctx context.Context, tx pgx.Tx, org *domain.Org) (*domain.Org, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByUser(ctx context.Context, userID uuid.UUID) ([]*domain.Org, error)
}

type OrgMemberRepository interface {
	Add(ctx context.Context, tx pgx.Tx, m *domain.OrgMember) error
	Remove(ctx context.Context, tx pgx.Tx, orgID, userID uuid.UUID) error
	Get(ctx context.Context, orgID, userID uuid.UUID) (*domain.OrgMember, error)
	ListByOrg(ctx context.Context, orgID uuid.UUID, filter MemberFilter) ([]*domain.OrgMember, int, error)
	UpdateRole(ctx context.Context, tx pgx.Tx, orgID, userID uuid.UUID, role string) error
	FindUserByEmail(ctx context.Context, email string) (uuid.UUID, error)
}

// --- Team ---

type TeamRepository interface {
	Create(ctx context.Context, tx pgx.Tx, team *domain.Team) (*domain.Team, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Team, error)
	Update(ctx context.Context, tx pgx.Tx, team *domain.Team) (*domain.Team, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Team, error)
	ListByOrgPaginated(ctx context.Context, orgID uuid.UUID, f TeamFilter) ([]*domain.Team, int, error)
	SetManager(ctx context.Context, tx pgx.Tx, teamID uuid.UUID, managerID *uuid.UUID) error
}

type TeamMemberRepository interface {
	Add(ctx context.Context, tx pgx.Tx, m *domain.TeamMember) error
	Remove(ctx context.Context, tx pgx.Tx, teamID, userID uuid.UUID) error
	UpdateRole(ctx context.Context, tx pgx.Tx, teamID, userID uuid.UUID, role string) error
	ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*domain.TeamMember, error)
	ListByTeamPaginated(ctx context.Context, teamID uuid.UUID, f MemberFilter) ([]*domain.TeamMember, int, error)
	GetByTeamAndUser(ctx context.Context, teamID, userID uuid.UUID) (*domain.TeamMember, error)
}

// --- Project ---

type ProjectRepository interface {
	Create(ctx context.Context, tx pgx.Tx, project *domain.Project) (*domain.Project, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Project, error)
	Update(ctx context.Context, tx pgx.Tx, project *domain.Project) (*domain.Project, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByOrg(ctx context.Context, orgID uuid.UUID, teamID *uuid.UUID) ([]*domain.Project, error)
	ListByOrgPaginated(ctx context.Context, orgID uuid.UUID, f ProjectFilter) ([]*domain.Project, int, error)
}

type ProjectMemberRepository interface {
	Add(ctx context.Context, tx pgx.Tx, m *domain.ProjectMember) error
	Remove(ctx context.Context, tx pgx.Tx, projectID, userID uuid.UUID) error
	UpdateRole(ctx context.Context, tx pgx.Tx, projectID, userID uuid.UUID, role string) error
	ListByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectMember, error)
	ListByProjectPaginated(ctx context.Context, projectID uuid.UUID, limit, offset int) ([]*domain.ProjectMember, int, error)
	GetByProjectAndUser(ctx context.Context, projectID, userID uuid.UUID) (*domain.ProjectMember, error)
	ListEffectiveMembers(ctx context.Context, projectID uuid.UUID) ([]*domain.EffectiveMember, error)
	RemoveBySourceTeam(ctx context.Context, tx pgx.Tx, projectID, sourceTeamID uuid.UUID) error
	RemoveBySourceTeamAndUser(ctx context.Context, tx pgx.Tx, projectID, sourceTeamID, userID uuid.UUID) error
}

// --- Task ---

type TaskRepository interface {
	Create(ctx context.Context, tx pgx.Tx, task *domain.Task) (*domain.Task, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Task, error)
	GetByIDTx(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*domain.Task, error)
	GetTree(ctx context.Context, rootTaskID uuid.UUID) ([]*domain.Task, error)
	GetTreeTx(ctx context.Context, tx pgx.Tx, rootTaskID uuid.UUID) ([]*domain.Task, error)
	GetAncestors(ctx context.Context, taskID uuid.UUID) ([]*domain.Task, error)
	GetAncestorsTx(ctx context.Context, tx pgx.Tx, taskID uuid.UUID) ([]*domain.Task, error)
	ListTreeByProject(ctx context.Context, projectID uuid.UUID, limit int) ([]*domain.Task, error)
	ListTreeByProjectLight(ctx context.Context, projectID uuid.UUID, limit int) ([]*domain.Task, error)
	List(ctx context.Context, projectID uuid.UUID, filter TaskFilter) ([]*domain.Task, int, error)
	ListByOrgAndAssignee(ctx context.Context, orgID, assigneeID uuid.UUID, filter TaskFilter) ([]*domain.Task, int, error)
	Update(ctx context.Context, tx pgx.Tx, task *domain.Task) (*domain.Task, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	CountByProject(ctx context.Context, projectID uuid.UUID) (int, error)
	UpdatePosition(ctx context.Context, tx pgx.Tx, id uuid.UUID, position int) error
	Reparent(ctx context.Context, tx pgx.Tx, id uuid.UUID, newParentID *uuid.UUID, position int) error
	ReassignOrUnassignTasks(ctx context.Context, tx pgx.Tx, projectID uuid.UUID, oldUserIDs []uuid.UUID, newUserID *uuid.UUID) (int64, error)
	CountByAssigneesInProject(ctx context.Context, projectID uuid.UUID, userIDs []uuid.UUID) (map[uuid.UUID]int, error)
}

// --- Checklist ---

type ChecklistRepository interface {
	Create(ctx context.Context, tx pgx.Tx, item *domain.Checklist) (*domain.Checklist, error)
	Update(ctx context.Context, tx pgx.Tx, item *domain.Checklist) (*domain.Checklist, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Checklist, error)
	CountChecked(ctx context.Context, taskID uuid.UUID) (checked int, total int, err error)
}

// --- Task Rule ---

type TaskRuleRepository interface {
	Create(ctx context.Context, tx pgx.Tx, rule *domain.TaskRule) (*domain.TaskRule, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskRule, error)
}

// --- Comment ---

type CommentRepository interface {
	Create(ctx context.Context, tx pgx.Tx, comment *domain.Comment) (*domain.Comment, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Comment, error)
	ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Comment, error)
	ListByTaskPaginated(ctx context.Context, taskID uuid.UUID, limit, offset int) ([]*domain.Comment, int, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
}

// --- Activity ---

type ActivityRepository interface {
	Create(ctx context.Context, tx pgx.Tx, log *domain.ActivityLog) error
	ListByEntity(ctx context.Context, entityType string, entityID uuid.UUID, filter ListFilter) ([]*domain.ActivityLog, error)
	ListByOrg(ctx context.Context, orgID uuid.UUID, filter ActivityFilter) ([]*domain.ActivityLog, int, error)
}

// --- Notification ---

type NotificationRepository interface {
	Create(ctx context.Context, tx pgx.Tx, n *domain.Notification) (*domain.Notification, error)
	ListByUser(ctx context.Context, userID uuid.UUID, filter NotificationFilter) ([]*domain.Notification, int, error)
	MarkRead(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	MarkAllRead(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error
	CountUnread(ctx context.Context, userID uuid.UUID) (int, error)
}

// --- Sticky Note ---

type StickyNoteRepository interface {
	Create(ctx context.Context, tx pgx.Tx, n *domain.StickyNote) (*domain.StickyNote, error)
	GetByID(ctx context.Context, id, userID uuid.UUID) (*domain.StickyNote, error)
	Update(ctx context.Context, tx pgx.Tx, n *domain.StickyNote) (*domain.StickyNote, error)
	Delete(ctx context.Context, tx pgx.Tx, id, userID uuid.UUID) error
	ListByUser(ctx context.Context, userID uuid.UUID, filter ListFilter) ([]*domain.StickyNote, int, error)
	Stats(ctx context.Context, userID uuid.UUID) (*domain.StickyNoteStats, error)
}

// --- Attachment ---

type AttachmentRepository interface {
	Create(ctx context.Context, tx pgx.Tx, a *domain.Attachment) (*domain.Attachment, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Attachment, error)
	ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Attachment, error)
	ListByChangeRequest(ctx context.Context, crID uuid.UUID) ([]*domain.Attachment, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
}

// --- Task Template ---

type TemplateRepository interface {
	Create(ctx context.Context, tx pgx.Tx, t *domain.TaskTemplate) (*domain.TaskTemplate, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.TaskTemplate, error)
	Update(ctx context.Context, tx pgx.Tx, t *domain.TaskTemplate) (*domain.TaskTemplate, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByOrg(ctx context.Context, orgID uuid.UUID, filter TemplateFilter) ([]*domain.TaskTemplate, int, error)
}

// --- Task Dependency ---

type TaskDependencyRepository interface {
	Add(ctx context.Context, tx pgx.Tx, dep *domain.TaskDependency) error
	Remove(ctx context.Context, tx pgx.Tx, taskID, dependsOnID uuid.UUID) error
	ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskDependency, error)
	ListDependents(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskDependency, error)
	HasCycle(ctx context.Context, taskID, dependsOnID uuid.UUID) (bool, error)
}

// --- Task Watcher ---

type TaskWatcherRepository interface {
	Add(ctx context.Context, tx pgx.Tx, taskID, userID uuid.UUID) error
	Remove(ctx context.Context, tx pgx.Tx, taskID, userID uuid.UUID) error
	ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskWatcher, error)
	IsWatching(ctx context.Context, taskID, userID uuid.UUID) (bool, error)
}

// --- Webhook ---

type WebhookRepository interface {
	Create(ctx context.Context, tx pgx.Tx, w *domain.Webhook) (*domain.Webhook, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Webhook, error)
	Update(ctx context.Context, tx pgx.Tx, w *domain.Webhook) (*domain.Webhook, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Webhook, error)
	ListByOrgAndEvent(ctx context.Context, orgID uuid.UUID, eventType string) ([]*domain.Webhook, error)
}

// --- API Key ---

type APIKeyRepository interface {
	Create(ctx context.Context, tx pgx.Tx, k *domain.APIKey) (*domain.APIKey, error)
	GetByHash(ctx context.Context, keyHash string) (*domain.APIKey, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.APIKey, error)
}

// --- Import Job ---

type ImportJobRepository interface {
	Create(ctx context.Context, tx pgx.Tx, j *domain.ImportJob) (*domain.ImportJob, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.ImportJob, error)
	Update(ctx context.Context, tx pgx.Tx, j *domain.ImportJob) (*domain.ImportJob, error)
	ListByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.ImportJob, error)
}

// --- Notification Preference ---

type NotificationPrefRepository interface {
	Upsert(ctx context.Context, tx pgx.Tx, pref *domain.NotificationPreference) error
	ListByUser(ctx context.Context, userID, orgID uuid.UUID) ([]*domain.NotificationPreference, error)
	IsEnabled(ctx context.Context, userID, orgID uuid.UUID, eventType, channel string) (bool, error)
}

// --- Billing ---

type BillingPlanRepository interface {
	GetByID(ctx context.Context, id string) (*domain.BillingPlan, error)
	GetByPriceID(ctx context.Context, priceID string) (*domain.BillingPlan, error)
	List(ctx context.Context) ([]*domain.BillingPlan, error)
}

type OrgSubscriptionRepository interface {
	GetByOrgID(ctx context.Context, orgID uuid.UUID) (*domain.OrgSubscription, error)
	GetByStripeSubID(ctx context.Context, stripeSubID string) (*domain.OrgSubscription, error)
	Upsert(ctx context.Context, sub *domain.OrgSubscription) (*domain.OrgSubscription, error)
}

// --- Custom Role ---

type CustomRoleRepository interface {
	Create(ctx context.Context, tx pgx.Tx, role *domain.CustomRole) (*domain.CustomRole, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.CustomRole, error)
	Update(ctx context.Context, tx pgx.Tx, role *domain.CustomRole) (*domain.CustomRole, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.CustomRole, error)
}

// --- Permission ---

type PermissionRepository interface {
	List(ctx context.Context, scope *string) ([]*domain.Permission, error)
	ListByRole(ctx context.Context, roleID uuid.UUID) ([]*domain.Permission, error)
	GetByResourceAction(ctx context.Context, resource, action, scope string) (*domain.Permission, error)
}

// --- Role ---

type RoleRepository interface {
	Create(ctx context.Context, tx pgx.Tx, role *domain.Role) (*domain.Role, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Role, error)
	GetBySlug(ctx context.Context, orgID uuid.UUID, scope, slug string) (*domain.Role, error)
	Update(ctx context.Context, tx pgx.Tx, role *domain.Role) (*domain.Role, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByOrg(ctx context.Context, orgID uuid.UUID, scope *string) ([]*domain.Role, error)
	SetPermissions(ctx context.Context, tx pgx.Tx, roleID uuid.UUID, permIDs []uuid.UUID) error
	GetPermissions(ctx context.Context, roleID uuid.UUID) ([]*domain.Permission, error)
}

// --- Project Team ---

type ProjectTeamRepository interface {
	Link(ctx context.Context, tx pgx.Tx, projectID, teamID uuid.UUID) error
	Unlink(ctx context.Context, tx pgx.Tx, projectID, teamID uuid.UUID) error
	ListByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectTeam, error)
	ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*domain.ProjectTeam, error)
	Count(ctx context.Context, projectID uuid.UUID) (int, error)
}

// --- Announcement ---

type AnnouncementRepository interface {
	Create(ctx context.Context, tx pgx.Tx, a *domain.Announcement) (*domain.Announcement, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Announcement, error)
	Update(ctx context.Context, tx pgx.Tx, a *domain.Announcement) (*domain.Announcement, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	List(ctx context.Context, orgID uuid.UUID, projectID *uuid.UUID, userID uuid.UUID, limit, offset int) ([]*domain.Announcement, int, error)
	MarkRead(ctx context.Context, announcementID, userID uuid.UUID) error
	CountUnread(ctx context.Context, orgID, userID uuid.UUID) (int, error)
}

// --- Task Change Request ---

type TaskChangeRequestRepository interface {
	Create(ctx context.Context, tx pgx.Tx, cr *domain.TaskChangeRequest) (*domain.TaskChangeRequest, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.TaskChangeRequest, error)
	Update(ctx context.Context, tx pgx.Tx, cr *domain.TaskChangeRequest) (*domain.TaskChangeRequest, error)
	ListByTask(ctx context.Context, taskID uuid.UUID, status *string) ([]*domain.TaskChangeRequest, error)
	ListByProject(ctx context.Context, projectID uuid.UUID, status *string, search *string, proposerID *uuid.UUID, limit, offset int) ([]*domain.TaskChangeRequest, int, error)
	CountPendingByTask(ctx context.Context, taskID uuid.UUID) (int, error)
}

// --- Analytics ---

type AnalyticsRepository interface {
	// Events
	CreateEvent(ctx context.Context, tx pgx.Tx, e *domain.AnalyticsEvent) error
	ListEvents(ctx context.Context, orgID uuid.UUID, eventType string, from, to time.Time, limit, offset int) ([]*domain.AnalyticsEvent, int, error)

	// Task State Transitions
	CreateTransition(ctx context.Context, tx pgx.Tx, t *domain.TaskStateTransition) error
	ListTransitionsByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskStateTransition, error)
	ListTransitionsByProject(ctx context.Context, projectID uuid.UUID, from, to time.Time) ([]*domain.TaskStateTransition, error)

	// Task Status Snapshots
	UpsertSnapshot(ctx context.Context, tx pgx.Tx, s *domain.TaskStatusSnapshot) error
	ListSnapshots(ctx context.Context, projectID uuid.UUID, from, to time.Time) ([]*domain.TaskStatusSnapshot, error)

	// Daily Metrics
	UpsertDailyMetric(ctx context.Context, tx pgx.Tx, m *domain.DailyMetric) error
	ListDailyMetrics(ctx context.Context, scopeType string, scopeID uuid.UUID, from, to time.Time) ([]*domain.DailyMetric, error)

	// Weekly Metrics
	UpsertWeeklyMetric(ctx context.Context, tx pgx.Tx, m *domain.WeeklyMetric) error
	ListWeeklyMetrics(ctx context.Context, scopeType string, scopeID uuid.UUID, from, to time.Time) ([]*domain.WeeklyMetric, error)

	// Risk Scores
	UpsertRiskScore(ctx context.Context, tx pgx.Tx, rs *domain.RiskScore) error
	ListRiskScores(ctx context.Context, orgID uuid.UUID, minLevel string, limit int) ([]*domain.RiskScore, error)
	GetRiskScore(ctx context.Context, taskID uuid.UUID) (*domain.RiskScore, error)

	// Alerts
	CreateAlert(ctx context.Context, tx pgx.Tx, a *domain.MetricAlert) error
	ListActiveAlerts(ctx context.Context, orgID uuid.UUID, limit int) ([]*domain.MetricAlert, error)
	AcknowledgeAlert(ctx context.Context, tx pgx.Tx, alertID, userID uuid.UUID) error

	// Reports
	CreateReport(ctx context.Context, tx pgx.Tx, rp *domain.PerformanceReport) (*domain.PerformanceReport, error)
	UpdateReport(ctx context.Context, tx pgx.Tx, rp *domain.PerformanceReport) error
	GetReport(ctx context.Context, id uuid.UUID) (*domain.PerformanceReport, error)
	ListReports(ctx context.Context, orgID uuid.UUID, limit, offset int) ([]*domain.PerformanceReport, int, error)

	// Aggregation queries
	CountTasksByStatusForOrg(ctx context.Context, orgID uuid.UUID) (map[string]int, error)
	CountTasksByStatusForProject(ctx context.Context, projectID uuid.UUID) (map[string]int, error)
	CountCompletedInRange(ctx context.Context, projectID uuid.UUID, from, to time.Time) (int, error)
	CountCreatedInRange(ctx context.Context, projectID uuid.UUID, from, to time.Time) (int, error)
	GetAvgCycleTime(ctx context.Context, projectID uuid.UUID, days int) (float64, error)
	GetOverdueTaskCountForOrg(ctx context.Context, orgID uuid.UUID) (int, error)
	GetWorkloadByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.WorkloadDistribution, error)
	GetVelocityTrend(ctx context.Context, projectID uuid.UUID, days int) ([]*domain.VelocityPoint, error)
	GetOrgVelocityTrend(ctx context.Context, orgID uuid.UUID, days int) ([]*domain.VelocityPoint, error)
}
