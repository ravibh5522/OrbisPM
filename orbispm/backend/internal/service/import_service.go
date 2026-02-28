package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// ImportService handles import job business logic.
type ImportService struct {
	importRepo repository.ImportJobRepository
	txm        *repository.TxManager
}

// NewImportService creates a new ImportService.
func NewImportService(importRepo repository.ImportJobRepository, txm *repository.TxManager) *ImportService {
	return &ImportService{importRepo: importRepo, txm: txm}
}

// CreateImportParams holds parameters for creating an import job.
type CreateImportParams struct {
	OrgID     uuid.UUID
	ProjectID uuid.UUID
	UserID    uuid.UUID
	FilePath  string
	FileName  string
}

// Create creates a new import job.
func (s *ImportService) Create(ctx context.Context, params CreateImportParams) (*domain.ImportJob, error) {
	job := &domain.ImportJob{
		OrgID:     params.OrgID,
		ProjectID: params.ProjectID,
		UserID:    params.UserID,
		Status:    "pending",
		FilePath:  params.FilePath,
		FileName:  params.FileName,
	}

	var created *domain.ImportJob
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.importRepo.Create(ctx, tx, job)
		return err
	})
	return created, err
}

// Get returns an import job by ID.
func (s *ImportService) Get(ctx context.Context, id uuid.UUID) (*domain.ImportJob, error) {
	return s.importRepo.GetByID(ctx, id)
}

// ListByProject returns all import jobs for a project.
func (s *ImportService) ListByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.ImportJob, error) {
	return s.importRepo.ListByProject(ctx, projectID)
}

// CustomRoleService handles custom role business logic.
type CustomRoleService struct {
	roleRepo repository.CustomRoleRepository
	txm      *repository.TxManager
}

// NewCustomRoleService creates a new CustomRoleService.
func NewCustomRoleService(roleRepo repository.CustomRoleRepository, txm *repository.TxManager) *CustomRoleService {
	return &CustomRoleService{roleRepo: roleRepo, txm: txm}
}

// CreateCustomRoleParams holds parameters for creating a custom role.
type CreateCustomRoleParams struct {
	OrgID       uuid.UUID
	Name        string         `json:"name" validate:"required,min=2,max=50"`
	Description string         `json:"description,omitempty"`
	Permissions map[string]any `json:"permissions" validate:"required"`
}

// Create creates a new custom role.
func (s *CustomRoleService) Create(ctx context.Context, params CreateCustomRoleParams) (*domain.CustomRole, error) {
	role := &domain.CustomRole{
		OrgID:       params.OrgID,
		Name:        params.Name,
		Description: params.Description,
		Permissions: params.Permissions,
	}

	var created *domain.CustomRole
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.roleRepo.Create(ctx, tx, role)
		return err
	})
	return created, err
}

// Get returns a custom role by ID.
func (s *CustomRoleService) Get(ctx context.Context, id uuid.UUID) (*domain.CustomRole, error) {
	return s.roleRepo.GetByID(ctx, id)
}

// UpdateCustomRoleParams holds parameters for updating a custom role.
type UpdateCustomRoleParams struct {
	Name        *string         `json:"name,omitempty"`
	Description *string         `json:"description,omitempty"`
	Permissions *map[string]any `json:"permissions,omitempty"`
}

// Update updates a custom role.
func (s *CustomRoleService) Update(ctx context.Context, id uuid.UUID, params UpdateCustomRoleParams) (*domain.CustomRole, error) {
	role, err := s.roleRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if params.Name != nil {
		role.Name = *params.Name
	}
	if params.Description != nil {
		role.Description = *params.Description
	}
	if params.Permissions != nil {
		role.Permissions = *params.Permissions
	}

	var updated *domain.CustomRole
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.roleRepo.Update(ctx, tx, role)
		return err
	})
	return updated, err
}

// Delete removes a custom role.
func (s *CustomRoleService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.roleRepo.Delete(ctx, tx, id)
	})
}

// ListByOrg returns all custom roles for an org.
func (s *CustomRoleService) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.CustomRole, error) {
	return s.roleRepo.ListByOrg(ctx, orgID)
}

// NotificationPrefService handles notification preference business logic.
type NotificationPrefService struct {
	prefRepo repository.NotificationPrefRepository
	txm      *repository.TxManager
}

// NewNotificationPrefService creates a new NotificationPrefService.
func NewNotificationPrefService(prefRepo repository.NotificationPrefRepository, txm *repository.TxManager) *NotificationPrefService {
	return &NotificationPrefService{prefRepo: prefRepo, txm: txm}
}

// UpsertPrefParams holds parameters for upserting a notification preference.
type UpsertPrefParams struct {
	UserID    uuid.UUID
	OrgID     uuid.UUID
	EventType string `json:"event_type" validate:"required"`
	Channel   string `json:"channel" validate:"required,oneof=in_app email slack discord teams"`
	Enabled   bool   `json:"enabled"`
}

// Upsert creates or updates a notification preference.
func (s *NotificationPrefService) Upsert(ctx context.Context, params UpsertPrefParams) error {
	pref := &domain.NotificationPreference{
		UserID:    params.UserID,
		OrgID:     params.OrgID,
		EventType: params.EventType,
		Channel:   params.Channel,
		Enabled:   params.Enabled,
	}
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.prefRepo.Upsert(ctx, tx, pref)
	})
}

// ListByUser returns all notification preferences for a user in an org.
func (s *NotificationPrefService) ListByUser(ctx context.Context, userID, orgID uuid.UUID) ([]*domain.NotificationPreference, error) {
	return s.prefRepo.ListByUser(ctx, userID, orgID)
}
