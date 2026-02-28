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

type CreateTeamParams struct {
	OrgID       uuid.UUID `json:"-"`
	Name        string    `json:"name" validate:"required,min=2,max=100"`
	Description string    `json:"description,omitempty"`
}

type UpdateTeamParams struct {
	Name        *string `json:"name,omitempty" validate:"omitempty,min=2,max=100"`
	Description *string `json:"description,omitempty"`
}

type TeamService struct {
	teamRepo       repository.TeamRepository
	teamMemberRepo repository.TeamMemberRepository
	txm            *repository.TxManager
}

func NewTeamService(teamRepo repository.TeamRepository, teamMemberRepo repository.TeamMemberRepository, txm *repository.TxManager) *TeamService {
	return &TeamService{teamRepo: teamRepo, teamMemberRepo: teamMemberRepo, txm: txm}
}

func (s *TeamService) Create(ctx context.Context, params CreateTeamParams) (*domain.Team, error) {
	team := &domain.Team{
		OrgID:       params.OrgID,
		Name:        strings.TrimSpace(params.Name),
		Description: strings.TrimSpace(params.Description),
	}

	var created *domain.Team
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.teamRepo.Create(ctx, tx, team)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("create team: %w", err)
	}
	return created, nil
}

func (s *TeamService) Get(ctx context.Context, id uuid.UUID) (*domain.Team, error) {
	return s.teamRepo.GetByID(ctx, id)
}

func (s *TeamService) Update(ctx context.Context, id uuid.UUID, params UpdateTeamParams) (*domain.Team, error) {
	team, err := s.teamRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if params.Name != nil {
		team.Name = strings.TrimSpace(*params.Name)
	}
	if params.Description != nil {
		team.Description = strings.TrimSpace(*params.Description)
	}

	var updated *domain.Team
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.teamRepo.Update(ctx, tx, team)
		return err
	})
	return updated, err
}

func (s *TeamService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.teamRepo.Delete(ctx, tx, id)
	})
}

func (s *TeamService) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Team, error) {
	return s.teamRepo.ListByOrg(ctx, orgID)
}

// --- Members ---

func (s *TeamService) AddMember(ctx context.Context, teamID, userID uuid.UUID, role string) error {
	if role == "" {
		role = domain.RoleTeamMember
	}
	m := &domain.TeamMember{TeamID: teamID, UserID: userID, Role: role}
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.teamMemberRepo.Add(ctx, tx, m)
	})
}

func (s *TeamService) RemoveMember(ctx context.Context, teamID, userID uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.teamMemberRepo.Remove(ctx, tx, teamID, userID)
	})
}

func (s *TeamService) ListMembers(ctx context.Context, teamID uuid.UUID) ([]*domain.TeamMember, error) {
	return s.teamMemberRepo.ListByTeam(ctx, teamID)
}
