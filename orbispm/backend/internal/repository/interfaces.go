package repository

import (
	"context"

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
	Status     *string
	Priority   *string
	AssigneeID *uuid.UUID
	Search     *string
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
	ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.OrgMember, error)
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
}

type TeamMemberRepository interface {
	Add(ctx context.Context, tx pgx.Tx, m *domain.TeamMember) error
	Remove(ctx context.Context, tx pgx.Tx, teamID, userID uuid.UUID) error
	ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*domain.TeamMember, error)
}

// --- Project ---

type ProjectRepository interface {
	Create(ctx context.Context, tx pgx.Tx, project *domain.Project) (*domain.Project, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Project, error)
	Update(ctx context.Context, tx pgx.Tx, project *domain.Project) (*domain.Project, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Project, error)
}

type ProjectMemberRepository interface {
	Add(ctx context.Context, tx pgx.Tx, m *domain.ProjectMember) error
	Remove(ctx context.Context, tx pgx.Tx, projectID, userID uuid.UUID) error
	ListByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectMember, error)
}

// --- Task ---

type TaskRepository interface {
	Create(ctx context.Context, tx pgx.Tx, task *domain.Task) (*domain.Task, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Task, error)
	GetTree(ctx context.Context, rootTaskID uuid.UUID) ([]*domain.Task, error)
	ListTreeByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.Task, error)
	List(ctx context.Context, projectID uuid.UUID, filter TaskFilter) ([]*domain.Task, int, error)
	ListByOrgAndAssignee(ctx context.Context, orgID, assigneeID uuid.UUID, limit, offset int) ([]*domain.Task, int, error)
	Update(ctx context.Context, tx pgx.Tx, task *domain.Task) (*domain.Task, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	CountByProject(ctx context.Context, projectID uuid.UUID) (int, error)
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
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
}

// --- Activity ---

type ActivityRepository interface {
	Create(ctx context.Context, tx pgx.Tx, log *domain.ActivityLog) error
	ListByEntity(ctx context.Context, entityType string, entityID uuid.UUID, filter ListFilter) ([]*domain.ActivityLog, error)
	ListByOrg(ctx context.Context, orgID uuid.UUID, filter ListFilter) ([]*domain.ActivityLog, int, error)
}

// --- Notification ---

type NotificationRepository interface {
	Create(ctx context.Context, tx pgx.Tx, n *domain.Notification) (*domain.Notification, error)
	ListByUser(ctx context.Context, userID uuid.UUID, filter ListFilter) ([]*domain.Notification, int, error)
	MarkRead(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	MarkAllRead(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error
	CountUnread(ctx context.Context, userID uuid.UUID) (int, error)
}

// --- Attachment ---

type AttachmentRepository interface {
	Create(ctx context.Context, tx pgx.Tx, a *domain.Attachment) (*domain.Attachment, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Attachment, error)
	ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Attachment, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
}

// --- Task Template ---

type TemplateRepository interface {
	Create(ctx context.Context, tx pgx.Tx, t *domain.TaskTemplate) (*domain.TaskTemplate, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.TaskTemplate, error)
	Update(ctx context.Context, tx pgx.Tx, t *domain.TaskTemplate) (*domain.TaskTemplate, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.TaskTemplate, error)
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
	List(ctx context.Context) ([]*domain.BillingPlan, error)
}

type OrgSubscriptionRepository interface {
	GetByOrgID(ctx context.Context, orgID uuid.UUID) (*domain.OrgSubscription, error)
	Upsert(ctx context.Context, tx pgx.Tx, sub *domain.OrgSubscription) (*domain.OrgSubscription, error)
}

// --- Custom Role ---

type CustomRoleRepository interface {
	Create(ctx context.Context, tx pgx.Tx, role *domain.CustomRole) (*domain.CustomRole, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.CustomRole, error)
	Update(ctx context.Context, tx pgx.Tx, role *domain.CustomRole) (*domain.CustomRole, error)
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.CustomRole, error)
}
