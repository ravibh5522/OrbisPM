package service

import (
	"context"

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
	TotalProjects int            `json:"total_projects"`
	TotalTasks    int            `json:"total_tasks"`
	TasksByStatus map[string]int `json:"tasks_by_status"`
}
