package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// DependencyService handles task dependency business logic.
type DependencyService struct {
	depRepo  repository.TaskDependencyRepository
	taskRepo repository.TaskRepository
	txm      *repository.TxManager
}

// NewDependencyService creates a new DependencyService.
func NewDependencyService(depRepo repository.TaskDependencyRepository, taskRepo repository.TaskRepository, txm *repository.TxManager) *DependencyService {
	return &DependencyService{depRepo: depRepo, taskRepo: taskRepo, txm: txm}
}

// AddDependencyParams holds parameters for adding a dependency.
type AddDependencyParams struct {
	TaskID      uuid.UUID `json:"task_id" validate:"required"`
	DependsOnID uuid.UUID `json:"depends_on_id" validate:"required"`
	Type        string    `json:"type" validate:"required,oneof=blocked_by blocks relates_to"`
}

// Add creates a dependency between two tasks, checking for cycles.
func (s *DependencyService) Add(ctx context.Context, params AddDependencyParams) error {
	if params.TaskID == params.DependsOnID {
		return domain.ErrBadRequest.WithDetail("task cannot depend on itself")
	}

	// Check both tasks exist
	if _, err := s.taskRepo.GetByID(ctx, params.TaskID); err != nil {
		return domain.ErrNotFound.WithDetail("task not found")
	}
	if _, err := s.taskRepo.GetByID(ctx, params.DependsOnID); err != nil {
		return domain.ErrNotFound.WithDetail("depends_on task not found")
	}

	// Check for cycles
	hasCycle, err := s.depRepo.HasCycle(ctx, params.TaskID, params.DependsOnID)
	if err != nil {
		return err
	}
	if hasCycle {
		return domain.ErrCyclicDep
	}

	dep := &domain.TaskDependency{
		TaskID:      params.TaskID,
		DependsOnID: params.DependsOnID,
		Type:        params.Type,
	}

	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.depRepo.Add(ctx, tx, dep)
	})
}

// Remove removes a dependency between two tasks.
func (s *DependencyService) Remove(ctx context.Context, taskID, dependsOnID uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.depRepo.Remove(ctx, tx, taskID, dependsOnID)
	})
}

// ListByTask returns all dependencies for a task.
func (s *DependencyService) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskDependency, error) {
	return s.depRepo.ListByTask(ctx, taskID)
}

// ListDependents returns all tasks that depend on the given task.
func (s *DependencyService) ListDependents(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskDependency, error) {
	return s.depRepo.ListDependents(ctx, taskID)
}
