package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/repository"
)

// DependencyService handles task dependency business logic.
type DependencyService struct {
	depRepo   repository.TaskDependencyRepository
	taskRepo  repository.TaskRepository
	txm       *repository.TxManager
	publisher EventPublisher
}

// NewDependencyService creates a new DependencyService.
func NewDependencyService(depRepo repository.TaskDependencyRepository, taskRepo repository.TaskRepository, txm *repository.TxManager, publisher ...EventPublisher) *DependencyService {
	s := &DependencyService{depRepo: depRepo, taskRepo: taskRepo, txm: txm}
	if len(publisher) > 0 {
		s.publisher = publisher[0]
	}
	return s
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
	task, err := s.taskRepo.GetByID(ctx, params.TaskID)
	if err != nil {
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

	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.depRepo.Add(ctx, tx, dep)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventDependencyAdded, task.OrgID.String(), params.TaskID.String(), map[string]any{
		"task_id":       params.TaskID.String(),
		"depends_on_id": params.DependsOnID.String(),
		"type":          params.Type,
		"project_id":    task.ProjectID.String(),
	})
	return nil
}

// Remove removes a dependency between two tasks.
func (s *DependencyService) Remove(ctx context.Context, taskID, dependsOnID uuid.UUID) error {
	task, _ := s.taskRepo.GetByID(ctx, taskID)
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.depRepo.Remove(ctx, tx, taskID, dependsOnID)
	})
	if err != nil {
		return err
	}
	if task != nil {
		s.publishEvent(ctx, domain.EventDependencyRemoved, task.OrgID.String(), taskID.String(), map[string]any{
			"task_id":       taskID.String(),
			"depends_on_id": dependsOnID.String(),
			"project_id":    task.ProjectID.String(),
		})
	}
	return nil
}

// ListByTask returns all dependencies for a task.
func (s *DependencyService) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskDependency, error) {
	return s.depRepo.ListByTask(ctx, taskID)
}

// ListDependents returns all tasks that depend on the given task.
func (s *DependencyService) ListDependents(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskDependency, error) {
	return s.depRepo.ListDependents(ctx, taskID)
}

// publishEvent publishes a domain event via the event publisher.
func (s *DependencyService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
	if s.publisher == nil {
		return
	}
	event := domain.DomainEvent{
		Type:     eventType,
		OrgID:    orgID,
		ActorID:  tenant.UserID(ctx).String(),
		EntityID: entityID,
		Payload:  payload,
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		_ = err
	}
}
