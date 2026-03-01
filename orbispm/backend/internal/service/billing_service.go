package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// BillingService handles billing/subscription business logic.
type BillingService struct {
	planRepo repository.BillingPlanRepository
	subRepo  repository.OrgSubscriptionRepository
	txm      *repository.TxManager
}

// NewBillingService creates a new BillingService.
func NewBillingService(planRepo repository.BillingPlanRepository, subRepo repository.OrgSubscriptionRepository, txm *repository.TxManager) *BillingService {
	return &BillingService{planRepo: planRepo, subRepo: subRepo, txm: txm}
}

// ListPlans returns all available billing plans.
func (s *BillingService) ListPlans(ctx context.Context) ([]*domain.BillingPlan, error) {
	return s.planRepo.List(ctx)
}

// GetPlan returns a billing plan by ID.
func (s *BillingService) GetPlan(ctx context.Context, id string) (*domain.BillingPlan, error) {
	return s.planRepo.GetByID(ctx, id)
}

// GetSubscription returns the current subscription for an org.
func (s *BillingService) GetSubscription(ctx context.Context, orgID uuid.UUID) (*domain.OrgSubscription, error) {
	return s.subRepo.GetByOrgID(ctx, orgID)
}

// DashboardService handles dashboard/analytics queries.
type DashboardService struct {
	taskRepo    repository.TaskRepository
	projectRepo repository.ProjectRepository
	txm         *repository.TxManager
}

// NewDashboardService creates a new DashboardService.
func NewDashboardService(taskRepo repository.TaskRepository, projectRepo repository.ProjectRepository, txm *repository.TxManager) *DashboardService {
	return &DashboardService{taskRepo: taskRepo, projectRepo: projectRepo, txm: txm}
}

// DashboardStats holds aggregated dashboard statistics.
type DashboardStats struct {
	TotalProjects   int            `json:"total_projects"`
	TotalTasks      int            `json:"total_tasks"`
	TotalTeams      int            `json:"total_teams"`
	TotalMembers    int            `json:"total_members"`
	OverdueTasks    int            `json:"overdue_tasks"`
	TasksByStatus   map[string]int `json:"tasks_by_status"`
	TasksByPriority map[string]int `json:"tasks_by_priority"`
	RecentTasks     []*domain.Task `json:"recent_tasks,omitempty"`
}

// GetStats returns aggregated dashboard statistics for an organization.
func (s *DashboardService) GetStats(ctx context.Context, orgID uuid.UUID) (*DashboardStats, error) {
	pool := s.txm.Pool()
	stats := &DashboardStats{
		TasksByStatus:   make(map[string]int),
		TasksByPriority: make(map[string]int),
	}

	// Total projects
	err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM projects WHERE org_id = $1`, orgID).Scan(&stats.TotalProjects)
	if err != nil {
		return nil, fmt.Errorf("count projects: %w", err)
	}

	// Total tasks
	err = pool.QueryRow(ctx, `SELECT COUNT(*) FROM tasks WHERE org_id = $1`, orgID).Scan(&stats.TotalTasks)
	if err != nil {
		return nil, fmt.Errorf("count tasks: %w", err)
	}

	// Total teams
	err = pool.QueryRow(ctx, `SELECT COUNT(*) FROM teams WHERE org_id = $1`, orgID).Scan(&stats.TotalTeams)
	if err != nil {
		return nil, fmt.Errorf("count teams: %w", err)
	}

	// Total members
	err = pool.QueryRow(ctx, `SELECT COUNT(*) FROM org_members WHERE org_id = $1`, orgID).Scan(&stats.TotalMembers)
	if err != nil {
		return nil, fmt.Errorf("count members: %w", err)
	}

	// Overdue tasks (not done, due_date in the past)
	err = pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks WHERE org_id = $1 AND status != 'done' AND due_date IS NOT NULL AND due_date < $2`,
		orgID, time.Now(),
	).Scan(&stats.OverdueTasks)
	if err != nil {
		return nil, fmt.Errorf("count overdue tasks: %w", err)
	}

	// Tasks by status
	rows, err := pool.Query(ctx, `SELECT status, COUNT(*) FROM tasks WHERE org_id = $1 GROUP BY status`, orgID)
	if err != nil {
		return nil, fmt.Errorf("tasks by status: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, fmt.Errorf("scan tasks by status: %w", err)
		}
		stats.TasksByStatus[status] = count
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("tasks by status rows: %w", err)
	}

	// Tasks by priority
	rows2, err := pool.Query(ctx, `SELECT priority, COUNT(*) FROM tasks WHERE org_id = $1 GROUP BY priority`, orgID)
	if err != nil {
		return nil, fmt.Errorf("tasks by priority: %w", err)
	}
	defer rows2.Close()
	for rows2.Next() {
		var priority string
		var count int
		if err := rows2.Scan(&priority, &count); err != nil {
			return nil, fmt.Errorf("scan tasks by priority: %w", err)
		}
		stats.TasksByPriority[priority] = count
	}
	if err := rows2.Err(); err != nil {
		return nil, fmt.Errorf("tasks by priority rows: %w", err)
	}

	// Recent tasks (last 5)
	rows3, err := pool.Query(ctx,
		`SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, created_at, updated_at
		 FROM tasks WHERE org_id = $1 ORDER BY created_at DESC LIMIT 5`, orgID)
	if err != nil {
		return nil, fmt.Errorf("recent tasks: %w", err)
	}
	defer rows3.Close()
	for rows3.Next() {
		var t domain.Task
		var desc *string
		if err := rows3.Scan(
			&t.ID, &t.OrgID, &t.ProjectID, &t.ParentTaskID, &t.Title, &desc,
			&t.Status, &t.Priority, &t.AssigneeID, &t.ReporterID,
			&t.Depth, &t.Position, &t.DueDate, &t.StartDate,
			&t.EstimatedHours, &t.ActualHours, &t.Labels, &t.Metadata,
			&t.ReviewStatus, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan recent task: %w", err)
		}
		if desc != nil {
			t.Description = *desc
		}
		if t.Labels == nil {
			t.Labels = []string{}
		}
		if t.Metadata == nil {
			t.Metadata = map[string]any{}
		}
		stats.RecentTasks = append(stats.RecentTasks, &t)
	}
	if err := rows3.Err(); err != nil {
		return nil, fmt.Errorf("recent tasks rows: %w", err)
	}

	return stats, nil
}
