package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

type CreateProjectParams struct {
	OrgID       uuid.UUID `json:"-"`
	TeamID      uuid.UUID `json:"team_id" validate:"required"`
	Name        string    `json:"name" validate:"required,min=2,max=100"`
	Description string    `json:"description,omitempty"`
}

type UpdateProjectParams struct {
	Name        *string `json:"name,omitempty" validate:"omitempty,min=2,max=100"`
	Description *string `json:"description,omitempty"`
	Status      *string `json:"status,omitempty" validate:"omitempty,oneof=active archived completed"`
}

type ProjectService struct {
	projectRepo       repository.ProjectRepository
	projectMemberRepo repository.ProjectMemberRepository
	txm               *repository.TxManager
}

func NewProjectService(
	projectRepo repository.ProjectRepository,
	projectMemberRepo repository.ProjectMemberRepository,
	txm *repository.TxManager,
) *ProjectService {
	return &ProjectService{projectRepo: projectRepo, projectMemberRepo: projectMemberRepo, txm: txm}
}

func (s *ProjectService) Create(ctx context.Context, params CreateProjectParams) (*domain.Project, error) {
	project := &domain.Project{
		OrgID:       params.OrgID,
		TeamID:      params.TeamID,
		Name:        strings.TrimSpace(params.Name),
		Description: strings.TrimSpace(params.Description),
		Status:      "active",
		Settings:    map[string]any{},
	}

	var created *domain.Project
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.projectRepo.Create(ctx, tx, project)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}
	return created, nil
}

func (s *ProjectService) Get(ctx context.Context, id uuid.UUID) (*domain.Project, error) {
	return s.projectRepo.GetByID(ctx, id)
}

func (s *ProjectService) Update(ctx context.Context, id uuid.UUID, params UpdateProjectParams) (*domain.Project, error) {
	project, err := s.projectRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if params.Name != nil {
		project.Name = strings.TrimSpace(*params.Name)
	}
	if params.Description != nil {
		project.Description = strings.TrimSpace(*params.Description)
	}
	if params.Status != nil {
		project.Status = *params.Status
	}

	var updated *domain.Project
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.projectRepo.Update(ctx, tx, project)
		return err
	})
	return updated, err
}

func (s *ProjectService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.projectRepo.Delete(ctx, tx, id)
	})
}

func (s *ProjectService) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Project, error) {
	return s.projectRepo.ListByOrg(ctx, orgID)
}

// --- Members ---

func (s *ProjectService) AddMember(ctx context.Context, projectID, userID uuid.UUID, role string) error {
	if role == "" {
		role = domain.RoleProjectContributor
	}
	m := &domain.ProjectMember{ProjectID: projectID, UserID: userID, Role: role}
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.projectMemberRepo.Add(ctx, tx, m)
	})
}

func (s *ProjectService) RemoveMember(ctx context.Context, projectID, userID uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.projectMemberRepo.Remove(ctx, tx, projectID, userID)
	})
}

func (s *ProjectService) ListMembers(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectMember, error) {
	return s.projectMemberRepo.ListByProject(ctx, projectID)
}
