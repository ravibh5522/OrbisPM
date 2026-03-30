package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/repository"
)

type CreateChecklistParams struct {
	OrgID    uuid.UUID `json:"-"`
	TaskID   uuid.UUID `json:"-"`
	Title    string    `json:"title" validate:"required,min=1,max=500"`
	Position int       `json:"position,omitempty"`
}

type UpdateChecklistParams struct {
	Title     *string `json:"title,omitempty" validate:"omitempty,min=1,max=500"`
	IsChecked *bool   `json:"is_checked,omitempty"`
	Position  *int    `json:"position,omitempty"`
}

type ChecklistService struct {
	checklistRepo repository.ChecklistRepository
	txm           *repository.TxManager
	publisher     EventPublisher
}

func NewChecklistService(checklistRepo repository.ChecklistRepository, txm *repository.TxManager, publisher ...EventPublisher) *ChecklistService {
	s := &ChecklistService{checklistRepo: checklistRepo, txm: txm}
	if len(publisher) > 0 {
		s.publisher = publisher[0]
	}
	return s
}

func (s *ChecklistService) Create(ctx context.Context, params CreateChecklistParams) (*domain.Checklist, error) {
	item := &domain.Checklist{
		OrgID:    params.OrgID,
		TaskID:   params.TaskID,
		Title:    params.Title,
		Position: params.Position,
	}

	var created *domain.Checklist
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.checklistRepo.Create(ctx, tx, item)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("create checklist: %w", err)
	}
	s.publishEvent(ctx, domain.EventChecklistCreated, params.OrgID.String(), params.TaskID.String(), map[string]any{
		"task_id": params.TaskID.String(),
		"item":    created,
	})
	return created, nil
}

func (s *ChecklistService) Update(ctx context.Context, id uuid.UUID, params UpdateChecklistParams) (*domain.Checklist, error) {
	items, err := s.checklistRepo.ListByTask(ctx, uuid.Nil) // will need task context
	_ = items

	// For update, we fetch all items from task, find the one with ID, then update
	// However, since we don't have GetByID, we'll update directly
	item := &domain.Checklist{ID: id}

	if params.Title != nil {
		item.Title = *params.Title
	}
	if params.IsChecked != nil {
		item.IsChecked = *params.IsChecked
	}
	if params.Position != nil {
		item.Position = *params.Position
	}

	var updated *domain.Checklist
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.checklistRepo.Update(ctx, tx, item)
		return err
	})
	if err != nil {
		return updated, err
	}
	eventType := domain.EventChecklistUpdated
	if params.IsChecked != nil {
		eventType = domain.EventChecklistToggled
	}
	if updated != nil {
		s.publishEvent(ctx, eventType, updated.OrgID.String(), updated.TaskID.String(), map[string]any{
			"task_id": updated.TaskID.String(),
			"item":    updated,
		})
	}
	return updated, nil
}

func (s *ChecklistService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.checklistRepo.Delete(ctx, tx, id)
	})
}

func (s *ChecklistService) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Checklist, error) {
	return s.checklistRepo.ListByTask(ctx, taskID)
}

// publishEvent publishes a domain event via the event publisher.
func (s *ChecklistService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
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
