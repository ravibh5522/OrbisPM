package service

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// TemplateService handles task template business logic.
type TemplateService struct {
	templateRepo repository.TemplateRepository
	txm          *repository.TxManager
}

// NewTemplateService creates a new TemplateService.
func NewTemplateService(templateRepo repository.TemplateRepository, txm *repository.TxManager) *TemplateService {
	return &TemplateService{templateRepo: templateRepo, txm: txm}
}

// CreateTemplateParams holds parameters for creating a template.
type CreateTemplateParams struct {
	OrgID       uuid.UUID
	Name        string `json:"name" validate:"required,min=2,max=100"`
	Description string `json:"description,omitempty"`
	Structure   map[string]any `json:"structure" validate:"required"`
	IsShared    bool   `json:"is_shared"`
	UserID      uuid.UUID
}

// Create creates a new task template.
func (s *TemplateService) Create(ctx context.Context, params CreateTemplateParams) (*domain.TaskTemplate, error) {
	t := &domain.TaskTemplate{
		OrgID:       params.OrgID,
		Name:        strings.TrimSpace(params.Name),
		Description: strings.TrimSpace(params.Description),
		Structure:   params.Structure,
		IsShared:    params.IsShared,
		CreatedBy:   params.UserID,
	}

	var created *domain.TaskTemplate
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.templateRepo.Create(ctx, tx, t)
		return err
	})
	return created, err
}

// Get returns a template by ID.
func (s *TemplateService) Get(ctx context.Context, id uuid.UUID) (*domain.TaskTemplate, error) {
	return s.templateRepo.GetByID(ctx, id)
}

// UpdateTemplateParams holds parameters for updating a template.
type UpdateTemplateParams struct {
	Name        *string         `json:"name,omitempty"`
	Description *string         `json:"description,omitempty"`
	Structure   *map[string]any `json:"structure,omitempty"`
	IsShared    *bool           `json:"is_shared,omitempty"`
}

// Update updates a task template.
func (s *TemplateService) Update(ctx context.Context, id uuid.UUID, params UpdateTemplateParams) (*domain.TaskTemplate, error) {
	t, err := s.templateRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if params.Name != nil {
		t.Name = strings.TrimSpace(*params.Name)
	}
	if params.Description != nil {
		t.Description = strings.TrimSpace(*params.Description)
	}
	if params.Structure != nil {
		t.Structure = *params.Structure
	}
	if params.IsShared != nil {
		t.IsShared = *params.IsShared
	}

	var updated *domain.TaskTemplate
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.templateRepo.Update(ctx, tx, t)
		return err
	})
	return updated, err
}

// Delete removes a template.
func (s *TemplateService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.templateRepo.Delete(ctx, tx, id)
	})
}

// ListByOrg returns all templates for an org.
func (s *TemplateService) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.TaskTemplate, error) {
	return s.templateRepo.ListByOrg(ctx, orgID)
}
