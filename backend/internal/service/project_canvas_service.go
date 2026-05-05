package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// ProjectCanvasService manages project canvas (whiteboard) operations.
type ProjectCanvasService struct {
	repo      repository.ProjectCanvasRepository
	txm       *repository.TxManager
	publisher EventPublisher
}

// NewProjectCanvasService creates a new ProjectCanvasService.
func NewProjectCanvasService(
	repo repository.ProjectCanvasRepository,
	txm *repository.TxManager,
	publisher ...EventPublisher,
) *ProjectCanvasService {
	s := &ProjectCanvasService{repo: repo, txm: txm}
	if len(publisher) > 0 {
		s.publisher = publisher[0]
	}
	return s
}

// CreateCanvasParams holds input for creating a canvas.
type CreateCanvasParams struct {
	OrgID       uuid.UUID
	ProjectID   uuid.UUID
	CreatedBy   uuid.UUID
	Title       string
	Description string
}

// Create creates a new canvas for the given project.
func (s *ProjectCanvasService) Create(ctx context.Context, p CreateCanvasParams) (*domain.ProjectCanvas, error) {
	canvas := &domain.ProjectCanvas{
		OrgID:       p.OrgID,
		ProjectID:   p.ProjectID,
		CreatedBy:   &p.CreatedBy,
		Title:       p.Title,
		Description: p.Description,
	}

	var result *domain.ProjectCanvas
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		result, err = s.repo.Create(ctx, tx, canvas)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("create canvas: %w", err)
	}

	if s.publisher != nil {
		_ = s.publisher.Publish(ctx, domain.DomainEvent{
			Type:     "canvas.created",
			OrgID:    result.OrgID.String(),
			EntityID: result.ID.String(),
		})
	}
	return result, nil
}

// GetByID returns a canvas by ID.
func (s *ProjectCanvasService) GetByID(ctx context.Context, id uuid.UUID) (*domain.ProjectCanvas, error) {
	canvas, err := s.repo.GetByID(ctx, nil, id)
	if err != nil {
		return nil, err
	}
	return canvas, nil
}

// UpdateMetaParams holds input for updating canvas metadata.
type UpdateMetaParams struct {
	ID          uuid.UUID
	Title       string
	Description string
}

// UpdateMeta updates the title and description of a canvas.
func (s *ProjectCanvasService) UpdateMeta(ctx context.Context, p UpdateMetaParams) (*domain.ProjectCanvas, error) {
	var result *domain.ProjectCanvas
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		result, err = s.repo.UpdateMeta(ctx, tx, p.ID, p.Title, p.Description)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("update canvas meta: %w", err)
	}
	return result, nil
}

// SaveStateParams holds input for saving canvas drawing state.
type SaveStateParams struct {
	ID              uuid.UUID
	State           domain.CanvasState
	ExpectedVersion int
}

// SaveState persists the full drawing state using optimistic locking.
func (s *ProjectCanvasService) SaveState(ctx context.Context, p SaveStateParams) (*domain.ProjectCanvas, error) {
	var result *domain.ProjectCanvas
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		result, err = s.repo.UpdateState(ctx, tx, p.ID, p.State, p.ExpectedVersion)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("save canvas state: %w", err)
	}

	if s.publisher != nil {
		_ = s.publisher.Publish(ctx, domain.DomainEvent{
			Type:     "canvas.updated",
			OrgID:    result.OrgID.String(),
			EntityID: result.ID.String(),
		})
	}
	return result, nil
}

// Delete removes a canvas by ID.
func (s *ProjectCanvasService) Delete(ctx context.Context, id uuid.UUID) error {
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.repo.Delete(ctx, tx, id)
	})
	if err != nil {
		return fmt.Errorf("delete canvas: %w", err)
	}
	return nil
}

// List returns all canvases for a project with pagination.
func (s *ProjectCanvasService) List(ctx context.Context, projectID uuid.UUID, limit, offset int) ([]*domain.ProjectCanvas, int, error) {
	return s.repo.ListByProject(ctx, nil, projectID, repository.ListFilter{
		Limit:  limit,
		Offset: offset,
	})
}
