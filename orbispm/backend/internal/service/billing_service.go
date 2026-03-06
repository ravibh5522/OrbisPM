package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/subscription"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// StripeSubscriptionInfo holds relevant subscription data from Stripe.
type StripeSubscriptionInfo struct {
	CustomerID  string
	PlanID      string
	Status      string
	PeriodStart time.Time
	PeriodEnd   time.Time
}

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
// If no subscription exists, a free-plan subscription is automatically created.
func (s *BillingService) GetSubscription(ctx context.Context, orgID uuid.UUID) (*domain.OrgSubscription, error) {
	sub, err := s.subRepo.GetByOrgID(ctx, orgID)
	if err == nil {
		return sub, nil
	}
	if !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	// Auto-provision a free subscription so the UI never sees a 404.
	now := time.Now()
	sub = &domain.OrgSubscription{
		ID:                 uuid.New(),
		OrgID:              orgID,
		PlanID:             "free",
		Status:             "active",
		CurrentPeriodStart: &now,
	}
	return s.subRepo.Upsert(ctx, sub)
}

// GetStripeSubscription fetches subscription details from Stripe.
func (s *BillingService) GetStripeSubscription(ctx context.Context, stripeSubID string) (*StripeSubscriptionInfo, error) {
	sub, err := subscription.Get(stripeSubID, nil)
	if err != nil {
		return nil, fmt.Errorf("get stripe subscription: %w", err)
	}

	// Period info is on SubscriptionItem in Stripe SDK v82+
	var periodStart, periodEnd time.Time
	if len(sub.Items.Data) > 0 {
		periodStart = time.Unix(sub.Items.Data[0].CurrentPeriodStart, 0)
		periodEnd = time.Unix(sub.Items.Data[0].CurrentPeriodEnd, 0)
	}

	return &StripeSubscriptionInfo{
		CustomerID:  sub.Customer.ID,
		Status:      string(sub.Status),
		PeriodStart: periodStart,
		PeriodEnd:   periodEnd,
	}, nil
}

// HandleCheckoutCompleted processes checkout.session.completed webhook events.
func (s *BillingService) HandleCheckoutCompleted(ctx context.Context, sess *stripe.CheckoutSession) error {
	orgIDStr, ok := sess.Metadata["org_id"]
	if !ok || orgIDStr == "" {
		return fmt.Errorf("missing org_id in session metadata")
	}
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		return fmt.Errorf("invalid org_id: %w", err)
	}

	// Get subscription details
	subID := sess.Subscription.ID
	stripeSub, err := subscription.Get(subID, nil)
	if err != nil {
		return fmt.Errorf("get subscription: %w", err)
	}

	// Find plan by price ID
	priceID := ""
	if len(stripeSub.Items.Data) > 0 {
		priceID = stripeSub.Items.Data[0].Price.ID
	}
	plan, err := s.planRepo.GetByPriceID(ctx, priceID)
	if err != nil {
		log.Warn().Str("price_id", priceID).Msg("plan not found for price, using first plan")
		// Fallback: just use any plan ID (not ideal but prevents errors)
		plans, _ := s.planRepo.List(ctx)
		if len(plans) > 0 {
			plan = plans[0]
		} else {
			return fmt.Errorf("no billing plans configured")
		}
	}

	// Get period from items
	var periodStart, periodEnd *time.Time
	if len(stripeSub.Items.Data) > 0 {
		ps := time.Unix(stripeSub.Items.Data[0].CurrentPeriodStart, 0)
		pe := time.Unix(stripeSub.Items.Data[0].CurrentPeriodEnd, 0)
		periodStart = &ps
		periodEnd = &pe
	}

	sub := &domain.OrgSubscription{
		OrgID:              orgID,
		PlanID:             plan.ID,
		StripeSubID:        &subID,
		Status:             string(stripeSub.Status),
		CurrentPeriodStart: periodStart,
		CurrentPeriodEnd:   periodEnd,
	}

	_, err = s.subRepo.Upsert(ctx, sub)
	if err != nil {
		return fmt.Errorf("upsert subscription: %w", err)
	}

	log.Info().Str("org_id", orgIDStr).Str("sub_id", subID).Msg("subscription created from checkout")
	return nil
}

// HandleSubscriptionUpdated processes customer.subscription.updated webhook events.
func (s *BillingService) HandleSubscriptionUpdated(ctx context.Context, stripeSub *stripe.Subscription) error {
	// Find existing subscription by stripe_sub_id
	sub, err := s.subRepo.GetByStripeSubID(ctx, stripeSub.ID)
	if err != nil {
		log.Warn().Str("stripe_sub_id", stripeSub.ID).Msg("subscription not found for update")
		return nil
	}

	sub.Status = string(stripeSub.Status)
	if len(stripeSub.Items.Data) > 0 {
		ps := time.Unix(stripeSub.Items.Data[0].CurrentPeriodStart, 0)
		pe := time.Unix(stripeSub.Items.Data[0].CurrentPeriodEnd, 0)
		sub.CurrentPeriodStart = &ps
		sub.CurrentPeriodEnd = &pe
	}

	_, err = s.subRepo.Upsert(ctx, sub)
	if err != nil {
		return fmt.Errorf("update subscription: %w", err)
	}

	log.Info().Str("stripe_sub_id", stripeSub.ID).Str("status", sub.Status).Msg("subscription updated")
	return nil
}

// HandleSubscriptionDeleted processes customer.subscription.deleted webhook events.
func (s *BillingService) HandleSubscriptionDeleted(ctx context.Context, stripeSub *stripe.Subscription) error {
	sub, err := s.subRepo.GetByStripeSubID(ctx, stripeSub.ID)
	if err != nil {
		log.Warn().Str("stripe_sub_id", stripeSub.ID).Msg("subscription not found for deletion")
		return nil
	}

	sub.Status = "canceled"
	_, err = s.subRepo.Upsert(ctx, sub)
	if err != nil {
		return fmt.Errorf("cancel subscription: %w", err)
	}

	log.Info().Str("stripe_sub_id", stripeSub.ID).Msg("subscription canceled")
	return nil
}

// HandlePaymentFailed processes invoice.payment_failed webhook events.
func (s *BillingService) HandlePaymentFailed(ctx context.Context, inv *stripe.Invoice) error {
	// In Stripe SDK v82, subscription info is in Parent.SubscriptionDetails
	if inv.Parent == nil || inv.Parent.SubscriptionDetails == nil || inv.Parent.SubscriptionDetails.Subscription == nil {
		return nil
	}

	stripeSub := inv.Parent.SubscriptionDetails.Subscription
	sub, err := s.subRepo.GetByStripeSubID(ctx, stripeSub.ID)
	if err != nil {
		log.Warn().Str("stripe_sub_id", stripeSub.ID).Msg("subscription not found for payment failure")
		return nil
	}

	sub.Status = "past_due"
	_, err = s.subRepo.Upsert(ctx, sub)
	if err != nil {
		return fmt.Errorf("mark subscription past_due: %w", err)
	}

	log.Warn().Str("stripe_sub_id", stripeSub.ID).Msg("subscription payment failed")
	return nil
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

// ─── Team Dashboard ──────────────────────────────────────────

// MemberWorkload represents task load for a single team member.
type MemberWorkload struct {
	UserID      uuid.UUID `json:"user_id"`
	DisplayName string    `json:"display_name"`
	Email       string    `json:"email"`
	AvatarURL   string    `json:"avatar_url,omitempty"`
	Total       int       `json:"total"`
	Todo        int       `json:"todo"`
	InProgress  int       `json:"in_progress"`
	Done        int       `json:"done"`
	Blocked     int       `json:"blocked"`
	Overdue     int       `json:"overdue"`
}

// TeamDashboardStats holds aggregated analytics for a team.
type TeamDashboardStats struct {
	TotalProjects   int              `json:"total_projects"`
	TotalTasks      int              `json:"total_tasks"`
	TotalMembers    int              `json:"total_members"`
	OverdueTasks    int              `json:"overdue_tasks"`
	TasksByStatus   map[string]int   `json:"tasks_by_status"`
	TasksByPriority map[string]int   `json:"tasks_by_priority"`
	MemberWorkload  []MemberWorkload `json:"member_workload"`
	RecentTasks     []*domain.Task   `json:"recent_tasks,omitempty"`
	CompletedLast7  int              `json:"completed_last_7_days"`
	CreatedLast7    int              `json:"created_last_7_days"`
}

// GetTeamDashboard returns aggregated analytics for a specific team.
func (s *DashboardService) GetTeamDashboard(ctx context.Context, teamID uuid.UUID) (*TeamDashboardStats, error) {
	pool := s.txm.Pool()
	stats := &TeamDashboardStats{
		TasksByStatus:   make(map[string]int),
		TasksByPriority: make(map[string]int),
	}
	now := time.Now()
	sevenDaysAgo := now.AddDate(0, 0, -7)

	// Total projects for this team
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM projects WHERE team_id = $1`, teamID,
	).Scan(&stats.TotalProjects); err != nil {
		return nil, fmt.Errorf("team projects count: %w", err)
	}

	// Total tasks for this team (via projects)
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.team_id = $1`, teamID,
	).Scan(&stats.TotalTasks); err != nil {
		return nil, fmt.Errorf("team tasks count: %w", err)
	}

	// Total members
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM team_members WHERE team_id = $1`, teamID,
	).Scan(&stats.TotalMembers); err != nil {
		return nil, fmt.Errorf("team members count: %w", err)
	}

	// Overdue tasks
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id
		 WHERE p.team_id = $1 AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < $2`,
		teamID, now,
	).Scan(&stats.OverdueTasks); err != nil {
		return nil, fmt.Errorf("team overdue count: %w", err)
	}

	// Tasks by status
	rows, err := pool.Query(ctx,
		`SELECT t.status, COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id
		 WHERE p.team_id = $1 GROUP BY t.status`, teamID)
	if err != nil {
		return nil, fmt.Errorf("team tasks by status: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var s string
		var c int
		if err := rows.Scan(&s, &c); err != nil {
			return nil, fmt.Errorf("scan status: %w", err)
		}
		stats.TasksByStatus[s] = c
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("status rows: %w", err)
	}

	// Tasks by priority
	rows2, err := pool.Query(ctx,
		`SELECT t.priority, COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id
		 WHERE p.team_id = $1 GROUP BY t.priority`, teamID)
	if err != nil {
		return nil, fmt.Errorf("team tasks by priority: %w", err)
	}
	defer rows2.Close()
	for rows2.Next() {
		var p string
		var c int
		if err := rows2.Scan(&p, &c); err != nil {
			return nil, fmt.Errorf("scan priority: %w", err)
		}
		stats.TasksByPriority[p] = c
	}
	if err := rows2.Err(); err != nil {
		return nil, fmt.Errorf("priority rows: %w", err)
	}

	// Velocity: completed last 7 days
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id
		 WHERE p.team_id = $1 AND t.status = 'done' AND t.updated_at >= $2`,
		teamID, sevenDaysAgo,
	).Scan(&stats.CompletedLast7); err != nil {
		return nil, fmt.Errorf("completed last 7: %w", err)
	}

	// Created last 7 days
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id
		 WHERE p.team_id = $1 AND t.created_at >= $2`,
		teamID, sevenDaysAgo,
	).Scan(&stats.CreatedLast7); err != nil {
		return nil, fmt.Errorf("created last 7: %w", err)
	}

	// Per-member workload
	workloadRows, err := pool.Query(ctx,
		`SELECT tm.user_id,
		        COALESCE(u.display_name,'') AS display_name,
		        COALESCE(u.email,'') AS email,
		        COALESCE(u.avatar_url,'') AS avatar_url,
		        COUNT(t.id) AS total,
		        COUNT(t.id) FILTER (WHERE t.status = 'todo') AS todo,
		        COUNT(t.id) FILTER (WHERE t.status = 'in_progress') AS in_progress,
		        COUNT(t.id) FILTER (WHERE t.status = 'done') AS done,
		        COUNT(t.id) FILTER (WHERE t.status = 'blocked') AS blocked,
		        COUNT(t.id) FILTER (WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < $2) AS overdue
		 FROM team_members tm
		 LEFT JOIN users u ON u.id = tm.user_id
		 LEFT JOIN tasks t ON t.assignee_id = tm.user_id
		     AND t.project_id IN (SELECT id FROM projects WHERE team_id = $1)
		 WHERE tm.team_id = $1
		 GROUP BY tm.user_id, u.display_name, u.email, u.avatar_url
		 ORDER BY total DESC`,
		teamID, now)
	if err != nil {
		return nil, fmt.Errorf("member workload: %w", err)
	}
	defer workloadRows.Close()
	for workloadRows.Next() {
		var mw MemberWorkload
		if err := workloadRows.Scan(
			&mw.UserID, &mw.DisplayName, &mw.Email, &mw.AvatarURL,
			&mw.Total, &mw.Todo, &mw.InProgress, &mw.Done, &mw.Blocked, &mw.Overdue,
		); err != nil {
			return nil, fmt.Errorf("scan workload: %w", err)
		}
		stats.MemberWorkload = append(stats.MemberWorkload, mw)
	}
	if err := workloadRows.Err(); err != nil {
		return nil, fmt.Errorf("workload rows: %w", err)
	}

	// Recent tasks (last 10)
	rows3, err := pool.Query(ctx,
		`SELECT t.id, t.org_id, t.project_id, t.parent_task_id, t.title, t.description,
		        t.status, t.priority, t.assignee_id, t.reporter_id, t.depth, t.position,
		        t.due_date, t.start_date, t.estimated_hours, t.actual_hours,
		        t.labels, t.metadata, t.review_status, t.created_at, t.updated_at
		 FROM tasks t JOIN projects p ON t.project_id = p.id
		 WHERE p.team_id = $1 ORDER BY t.updated_at DESC LIMIT 10`, teamID)
	if err != nil {
		return nil, fmt.Errorf("team recent tasks: %w", err)
	}
	defer rows3.Close()
	for rows3.Next() {
		var tk domain.Task
		var desc *string
		if err := rows3.Scan(
			&tk.ID, &tk.OrgID, &tk.ProjectID, &tk.ParentTaskID, &tk.Title, &desc,
			&tk.Status, &tk.Priority, &tk.AssigneeID, &tk.ReporterID,
			&tk.Depth, &tk.Position, &tk.DueDate, &tk.StartDate,
			&tk.EstimatedHours, &tk.ActualHours, &tk.Labels, &tk.Metadata,
			&tk.ReviewStatus, &tk.CreatedAt, &tk.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan recent task: %w", err)
		}
		if desc != nil {
			tk.Description = *desc
		}
		if tk.Labels == nil {
			tk.Labels = []string{}
		}
		if tk.Metadata == nil {
			tk.Metadata = map[string]any{}
		}
		stats.RecentTasks = append(stats.RecentTasks, &tk)
	}
	if err := rows3.Err(); err != nil {
		return nil, fmt.Errorf("recent tasks rows: %w", err)
	}

	return stats, nil
}

// ─── Project Dashboard ──────────────────────────────────────────

// DailyCount represents a single day's count for time-series charts.
type DailyCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// LabelCount represents a label with its task count.
type LabelCount struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

// ProjectDashboardStats holds aggregated analytics for a project.
type ProjectDashboardStats struct {
	TotalTasks      int              `json:"total_tasks"`
	TotalMembers    int              `json:"total_members"`
	OverdueTasks    int              `json:"overdue_tasks"`
	CompletionRate  float64          `json:"completion_rate"`
	EstimatedHours  float64          `json:"estimated_hours"`
	ActualHours     float64          `json:"actual_hours"`
	TasksByStatus   map[string]int   `json:"tasks_by_status"`
	TasksByPriority map[string]int   `json:"tasks_by_priority"`
	MemberWorkload  []MemberWorkload `json:"member_workload"`
	CompletedLast7  int              `json:"completed_last_7_days"`
	CreatedLast7    int              `json:"created_last_7_days"`
	BurndownData    []DailyCount     `json:"burndown_data"`
	CreatedOverTime []DailyCount     `json:"created_over_time"`
	LabelCounts     []LabelCount     `json:"label_counts"`
	RecentTasks     []*domain.Task   `json:"recent_tasks,omitempty"`
	DueSoonTasks    []*domain.Task   `json:"due_soon_tasks,omitempty"`
}

// GetProjectDashboard returns aggregated analytics for a specific project.
func (s *DashboardService) GetProjectDashboard(ctx context.Context, projectID uuid.UUID) (*ProjectDashboardStats, error) {
	pool := s.txm.Pool()
	stats := &ProjectDashboardStats{
		TasksByStatus:   make(map[string]int),
		TasksByPriority: make(map[string]int),
	}
	now := time.Now()
	sevenDaysAgo := now.AddDate(0, 0, -7)
	thirtyDaysAgo := now.AddDate(0, 0, -30)

	// Total tasks
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks WHERE project_id = $1`, projectID,
	).Scan(&stats.TotalTasks); err != nil {
		return nil, fmt.Errorf("project tasks count: %w", err)
	}

	// Total members
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM project_members WHERE project_id = $1`, projectID,
	).Scan(&stats.TotalMembers); err != nil {
		return nil, fmt.Errorf("project members count: %w", err)
	}

	// Overdue tasks
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status != 'done' AND due_date IS NOT NULL AND due_date < $2`,
		projectID, now,
	).Scan(&stats.OverdueTasks); err != nil {
		return nil, fmt.Errorf("project overdue count: %w", err)
	}

	// Completion rate
	var doneCount int
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status = 'done'`, projectID,
	).Scan(&doneCount); err != nil {
		return nil, fmt.Errorf("done count: %w", err)
	}
	if stats.TotalTasks > 0 {
		stats.CompletionRate = float64(doneCount) / float64(stats.TotalTasks) * 100
	}

	// Time tracking (estimated vs actual hours)
	if err := pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(estimated_hours), 0), COALESCE(SUM(actual_hours), 0) FROM tasks WHERE project_id = $1`, projectID,
	).Scan(&stats.EstimatedHours, &stats.ActualHours); err != nil {
		return nil, fmt.Errorf("time tracking: %w", err)
	}

	// Tasks by status
	statusRows, err := pool.Query(ctx,
		`SELECT status, COUNT(*) FROM tasks WHERE project_id = $1 GROUP BY status`, projectID)
	if err != nil {
		return nil, fmt.Errorf("tasks by status: %w", err)
	}
	defer statusRows.Close()
	for statusRows.Next() {
		var st string
		var c int
		if err := statusRows.Scan(&st, &c); err != nil {
			return nil, fmt.Errorf("scan status: %w", err)
		}
		stats.TasksByStatus[st] = c
	}
	if err := statusRows.Err(); err != nil {
		return nil, fmt.Errorf("status rows: %w", err)
	}

	// Tasks by priority
	priorityRows, err := pool.Query(ctx,
		`SELECT priority, COUNT(*) FROM tasks WHERE project_id = $1 GROUP BY priority`, projectID)
	if err != nil {
		return nil, fmt.Errorf("tasks by priority: %w", err)
	}
	defer priorityRows.Close()
	for priorityRows.Next() {
		var p string
		var c int
		if err := priorityRows.Scan(&p, &c); err != nil {
			return nil, fmt.Errorf("scan priority: %w", err)
		}
		stats.TasksByPriority[p] = c
	}
	if err := priorityRows.Err(); err != nil {
		return nil, fmt.Errorf("priority rows: %w", err)
	}

	// Velocity: completed last 7 days
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status = 'done' AND updated_at >= $2`,
		projectID, sevenDaysAgo,
	).Scan(&stats.CompletedLast7); err != nil {
		return nil, fmt.Errorf("completed last 7: %w", err)
	}

	// Created last 7 days
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND created_at >= $2`,
		projectID, sevenDaysAgo,
	).Scan(&stats.CreatedLast7); err != nil {
		return nil, fmt.Errorf("created last 7: %w", err)
	}

	// Burndown data: tasks remaining per day over last 30 days
	burnRows, err := pool.Query(ctx,
		`SELECT d::date AS day, COUNT(t.id)
		 FROM generate_series($2::date, $3::date, '1 day'::interval) d
		 LEFT JOIN tasks t ON t.project_id = $1 AND t.status = 'done'
		     AND t.updated_at::date = d::date
		 GROUP BY d::date ORDER BY d::date`,
		projectID, thirtyDaysAgo, now)
	if err != nil {
		return nil, fmt.Errorf("burndown data: %w", err)
	}
	defer burnRows.Close()
	remaining := stats.TotalTasks
	for burnRows.Next() {
		var completedToday int
		var day time.Time
		if err := burnRows.Scan(&day, &completedToday); err != nil {
			return nil, fmt.Errorf("scan burndown: %w", err)
		}
		remaining -= completedToday
		stats.BurndownData = append(stats.BurndownData, DailyCount{
			Date:  day.Format("Jan 02"),
			Count: remaining,
		})
	}
	if err := burnRows.Err(); err != nil {
		return nil, fmt.Errorf("burndown rows: %w", err)
	}

	// Created over time: tasks created per day over last 30 days
	createdRows, err := pool.Query(ctx,
		`SELECT d::date AS day, COUNT(t.id)
		 FROM generate_series($2::date, $3::date, '1 day'::interval) d
		 LEFT JOIN tasks t ON t.project_id = $1 AND t.created_at::date = d::date
		 GROUP BY d::date ORDER BY d::date`,
		projectID, thirtyDaysAgo, now)
	if err != nil {
		return nil, fmt.Errorf("created over time: %w", err)
	}
	defer createdRows.Close()
	for createdRows.Next() {
		var dc DailyCount
		var day time.Time
		if err := createdRows.Scan(&day, &dc.Count); err != nil {
			return nil, fmt.Errorf("scan created: %w", err)
		}
		dc.Date = day.Format("Jan 02")
		stats.CreatedOverTime = append(stats.CreatedOverTime, dc)
	}
	if err := createdRows.Err(); err != nil {
		return nil, fmt.Errorf("created rows: %w", err)
	}

	// Label distribution
	labelRows, err := pool.Query(ctx,
		`SELECT lbl, COUNT(*) FROM tasks, LATERAL unnest(labels) AS lbl
		 WHERE project_id = $1 GROUP BY lbl ORDER BY COUNT(*) DESC LIMIT 10`, projectID)
	if err != nil {
		return nil, fmt.Errorf("label counts: %w", err)
	}
	defer labelRows.Close()
	for labelRows.Next() {
		var lc LabelCount
		if err := labelRows.Scan(&lc.Label, &lc.Count); err != nil {
			return nil, fmt.Errorf("scan label: %w", err)
		}
		stats.LabelCounts = append(stats.LabelCounts, lc)
	}
	if err := labelRows.Err(); err != nil {
		return nil, fmt.Errorf("label rows: %w", err)
	}

	// Per-member workload
	workloadRows, err := pool.Query(ctx,
		`SELECT pm.user_id,
		        COALESCE(u.display_name,'') AS display_name,
		        COALESCE(u.email,'') AS email,
		        COALESCE(u.avatar_url,'') AS avatar_url,
		        COUNT(t.id) AS total,
		        COUNT(t.id) FILTER (WHERE t.status = 'todo') AS todo,
		        COUNT(t.id) FILTER (WHERE t.status = 'in_progress') AS in_progress,
		        COUNT(t.id) FILTER (WHERE t.status = 'done') AS done,
		        COUNT(t.id) FILTER (WHERE t.status = 'blocked') AS blocked,
		        COUNT(t.id) FILTER (WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < $2) AS overdue
		 FROM project_members pm
		 LEFT JOIN users u ON u.id = pm.user_id
		 LEFT JOIN tasks t ON t.assignee_id = pm.user_id AND t.project_id = $1
		 WHERE pm.project_id = $1
		 GROUP BY pm.user_id, u.display_name, u.email, u.avatar_url
		 ORDER BY total DESC`,
		projectID, now)
	if err != nil {
		return nil, fmt.Errorf("member workload: %w", err)
	}
	defer workloadRows.Close()
	for workloadRows.Next() {
		var mw MemberWorkload
		if err := workloadRows.Scan(
			&mw.UserID, &mw.DisplayName, &mw.Email, &mw.AvatarURL,
			&mw.Total, &mw.Todo, &mw.InProgress, &mw.Done, &mw.Blocked, &mw.Overdue,
		); err != nil {
			return nil, fmt.Errorf("scan workload: %w", err)
		}
		stats.MemberWorkload = append(stats.MemberWorkload, mw)
	}
	if err := workloadRows.Err(); err != nil {
		return nil, fmt.Errorf("workload rows: %w", err)
	}

	// Recent tasks (last 10)
	recentRows, err := pool.Query(ctx,
		`SELECT id, org_id, project_id, parent_task_id, title, description,
		        status, priority, assignee_id, reporter_id, depth, position,
		        due_date, start_date, estimated_hours, actual_hours,
		        labels, metadata, review_status, created_at, updated_at
		 FROM tasks WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 10`, projectID)
	if err != nil {
		return nil, fmt.Errorf("recent tasks: %w", err)
	}
	defer recentRows.Close()
	for recentRows.Next() {
		var tk domain.Task
		var desc *string
		if err := recentRows.Scan(
			&tk.ID, &tk.OrgID, &tk.ProjectID, &tk.ParentTaskID, &tk.Title, &desc,
			&tk.Status, &tk.Priority, &tk.AssigneeID, &tk.ReporterID,
			&tk.Depth, &tk.Position, &tk.DueDate, &tk.StartDate,
			&tk.EstimatedHours, &tk.ActualHours, &tk.Labels, &tk.Metadata,
			&tk.ReviewStatus, &tk.CreatedAt, &tk.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan recent task: %w", err)
		}
		if desc != nil {
			tk.Description = *desc
		}
		if tk.Labels == nil {
			tk.Labels = []string{}
		}
		if tk.Metadata == nil {
			tk.Metadata = map[string]any{}
		}
		stats.RecentTasks = append(stats.RecentTasks, &tk)
	}
	if err := recentRows.Err(); err != nil {
		return nil, fmt.Errorf("recent tasks rows: %w", err)
	}

	// Due soon tasks (next 7 days, not done)
	dueSoonRows, err := pool.Query(ctx,
		`SELECT id, org_id, project_id, parent_task_id, title, description,
		        status, priority, assignee_id, reporter_id, depth, position,
		        due_date, start_date, estimated_hours, actual_hours,
		        labels, metadata, review_status, created_at, updated_at
		 FROM tasks WHERE project_id = $1 AND status != 'done'
		   AND due_date IS NOT NULL AND due_date BETWEEN $2 AND $3
		 ORDER BY due_date ASC LIMIT 10`,
		projectID, now, now.AddDate(0, 0, 7))
	if err != nil {
		return nil, fmt.Errorf("due soon tasks: %w", err)
	}
	defer dueSoonRows.Close()
	for dueSoonRows.Next() {
		var tk domain.Task
		var desc *string
		if err := dueSoonRows.Scan(
			&tk.ID, &tk.OrgID, &tk.ProjectID, &tk.ParentTaskID, &tk.Title, &desc,
			&tk.Status, &tk.Priority, &tk.AssigneeID, &tk.ReporterID,
			&tk.Depth, &tk.Position, &tk.DueDate, &tk.StartDate,
			&tk.EstimatedHours, &tk.ActualHours, &tk.Labels, &tk.Metadata,
			&tk.ReviewStatus, &tk.CreatedAt, &tk.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan due soon task: %w", err)
		}
		if desc != nil {
			tk.Description = *desc
		}
		if tk.Labels == nil {
			tk.Labels = []string{}
		}
		if tk.Metadata == nil {
			tk.Metadata = map[string]any{}
		}
		stats.DueSoonTasks = append(stats.DueSoonTasks, &tk)
	}
	if err := dueSoonRows.Err(); err != nil {
		return nil, fmt.Errorf("due soon tasks rows: %w", err)
	}

	return stats, nil
}
