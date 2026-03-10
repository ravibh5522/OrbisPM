package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

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
	teamRepo          repository.TeamRepository
	teamMemberRepo    repository.TeamMemberRepository
	projectTeamRepo   repository.ProjectTeamRepository
	projectMemberRepo repository.ProjectMemberRepository
	taskRepo          repository.TaskRepository
	txm               *repository.TxManager
	publisher         EventPublisher
}

// SetProjectDeps injects optional project-related dependencies for membership lifecycle hooks.
func (s *TeamService) SetProjectDeps(ptRepo repository.ProjectTeamRepository, pmRepo repository.ProjectMemberRepository, tRepo repository.TaskRepository) {
	s.projectTeamRepo = ptRepo
	s.projectMemberRepo = pmRepo
	s.taskRepo = tRepo
}

func NewTeamService(teamRepo repository.TeamRepository, teamMemberRepo repository.TeamMemberRepository, txm *repository.TxManager, publisher ...EventPublisher) *TeamService {
	s := &TeamService{teamRepo: teamRepo, teamMemberRepo: teamMemberRepo, txm: txm}
	if len(publisher) > 0 {
		s.publisher = publisher[0]
	}
	return s
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
	s.publishEvent(ctx, domain.EventTeamCreated, created.OrgID.String(), created.ID.String(), nil)
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
	if err == nil && updated != nil {
		s.publishEvent(ctx, domain.EventTeamUpdated, updated.OrgID.String(), updated.ID.String(), nil)
	}
	return updated, err
}

func (s *TeamService) Delete(ctx context.Context, id uuid.UUID) error {
	team, err := s.teamRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.teamRepo.Delete(ctx, tx, id)
	})
	if err == nil {
		s.publishEvent(ctx, "team.deleted", team.OrgID.String(), id.String(), nil)
	}
	return err
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
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		if err := s.teamMemberRepo.Add(ctx, tx, m); err != nil {
			return err
		}
		// Auto-demote: if this user is a direct (external) member of any project linked
		// to this team, remove the direct membership so they appear as internal (team-inherited).
		if s.projectTeamRepo != nil && s.projectMemberRepo != nil {
			linkedProjects, lErr := s.projectTeamRepo.ListByTeam(ctx, teamID)
			if lErr != nil {
				log.Warn().Err(lErr).Msg("auto-demote: failed to list linked projects")
			} else {
				for _, pt := range linkedProjects {
					_ = s.projectMemberRepo.Remove(ctx, tx, pt.ProjectID, userID)
				}
			}
		}
		return nil
	})
	if err == nil {
		s.publishEvent(ctx, domain.EventMemberInvited, "", teamID.String(), map[string]any{"user_id": userID.String(), "scope": "team"})
	}
	return err
}

func (s *TeamService) RemoveMember(ctx context.Context, teamID, userID uuid.UUID) error {
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		if err := s.teamMemberRepo.Remove(ctx, tx, teamID, userID); err != nil {
			return err
		}
		// Auto-promote: if this user has any tasks assigned in projects linked to this team,
		// add them as a direct (external) project member so their tasks aren't orphaned.
		if s.projectTeamRepo != nil && s.projectMemberRepo != nil && s.taskRepo != nil {
			linkedProjects, lErr := s.projectTeamRepo.ListByTeam(ctx, teamID)
			if lErr != nil {
				log.Warn().Err(lErr).Msg("auto-promote: failed to list linked projects")
			} else {
				for _, pt := range linkedProjects {
					counts, cErr := s.taskRepo.CountByAssigneesInProject(ctx, pt.ProjectID, []uuid.UUID{userID})
					if cErr != nil {
						log.Warn().Err(cErr).Msg("auto-promote: failed to count tasks")
						continue
					}
					if counts[userID] > 0 {
						// User has tasks — promote to direct member
						dm := &domain.ProjectMember{
							ProjectID: pt.ProjectID,
							UserID:    userID,
							Role:      domain.RoleProjectContributor,
						}
						if aErr := s.projectMemberRepo.Add(ctx, tx, dm); aErr != nil {
							log.Warn().Err(aErr).Str("project_id", pt.ProjectID.String()).Msg("auto-promote: failed to add direct member")
						} else {
							log.Info().
								Str("user_id", userID.String()).
								Str("project_id", pt.ProjectID.String()).
								Msg("auto-promoted team member to direct project member")
						}
					}
				}
			}
		}
		return nil
	})
	if err == nil {
		s.publishEvent(ctx, "member.removed", "", teamID.String(), map[string]any{"user_id": userID.String(), "scope": "team"})
	}
	return err
}

func (s *TeamService) UpdateMemberRole(ctx context.Context, teamID, userID uuid.UUID, role string) error {
	if role == "" {
		return fmt.Errorf("role is required")
	}
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.teamMemberRepo.UpdateRole(ctx, tx, teamID, userID, role)
	})
	if err == nil {
		s.publishEvent(ctx, "member.role_updated", "", teamID.String(), map[string]any{"user_id": userID.String(), "role": role, "scope": "team"})
	}
	return err
}

func (s *TeamService) ListMembers(ctx context.Context, teamID uuid.UUID) ([]*domain.TeamMember, error) {
	return s.teamMemberRepo.ListByTeam(ctx, teamID)
}

// publishEvent publishes a domain event for real-time propagation via SSE.
func (s *TeamService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
	if s.publisher == nil {
		return
	}
	event := domain.DomainEvent{
		Type:     eventType,
		OrgID:    orgID,
		EntityID: entityID,
		Payload:  payload,
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		// Log but don't fail the operation
		_ = err
	}
}
