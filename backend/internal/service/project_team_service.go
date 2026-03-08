package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/worker"
)

// ProjectTeamService manages project-team associations.
type ProjectTeamService struct {
	projectTeamRepo   repository.ProjectTeamRepository
	projectRepo       repository.ProjectRepository
	teamRepo          repository.TeamRepository
	projectMemberRepo repository.ProjectMemberRepository
	txm               *repository.TxManager
	workerSrv         *worker.Server
	publisher         EventPublisher
}

func NewProjectTeamService(
	projectTeamRepo repository.ProjectTeamRepository,
	projectRepo repository.ProjectRepository,
	teamRepo repository.TeamRepository,
	projectMemberRepo repository.ProjectMemberRepository,
	txm *repository.TxManager,
	workerSrv *worker.Server,
	publisher ...EventPublisher,
) *ProjectTeamService {
	s := &ProjectTeamService{
		projectTeamRepo:   projectTeamRepo,
		projectRepo:       projectRepo,
		teamRepo:          teamRepo,
		projectMemberRepo: projectMemberRepo,
		txm:               txm,
		workerSrv:         workerSrv,
	}
	if len(publisher) > 0 {
		s.publisher = publisher[0]
	}
	return s
}

// LinkTeamsParams defines params for linking teams to a project.
type LinkTeamsParams struct {
	ProjectID uuid.UUID   `json:"-"`
	TeamIDs   []uuid.UUID `json:"team_ids" validate:"required,min=1"`
}

// LinkTeams links one or more teams to a project.
func (s *ProjectTeamService) LinkTeams(ctx context.Context, params LinkTeamsParams) error {
	project, err := s.projectRepo.GetByID(ctx, params.ProjectID)
	if err != nil {
		return err
	}

	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		for _, teamID := range params.TeamIDs {
			// Verify team belongs to same org
			team, err := s.teamRepo.GetByID(ctx, teamID)
			if err != nil {
				return fmt.Errorf("team %s not found: %w", teamID, err)
			}
			if team.OrgID != project.OrgID {
				return domain.ErrBadRequest.WithDetail("team does not belong to the same organization")
			}
			if err := s.projectTeamRepo.Link(ctx, tx, params.ProjectID, teamID); err != nil {
				return err
			}
		}
		return nil
	})
}

// UnlinkTeam unlinks a team from a project (min 1 must remain).
func (s *ProjectTeamService) UnlinkTeam(ctx context.Context, projectID, teamID uuid.UUID) error {
	count, err := s.projectTeamRepo.Count(ctx, projectID)
	if err != nil {
		return err
	}
	if count <= 1 {
		return domain.ErrBadRequest.WithDetail("project must have at least one team")
	}

	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.projectTeamRepo.Unlink(ctx, tx, projectID, teamID)
	})
}

// ListTeams returns all teams linked to a project.
func (s *ProjectTeamService) ListTeams(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectTeam, error) {
	return s.projectTeamRepo.ListByProject(ctx, projectID)
}

// ListEligibleMembers returns union of direct + team-inherited members.
func (s *ProjectTeamService) ListEligibleMembers(ctx context.Context, projectID uuid.UUID) ([]*domain.EffectiveMember, error) {
	return s.projectMemberRepo.ListEffectiveMembers(ctx, projectID)
}

func (s *ProjectTeamService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
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
		log.Warn().Err(err).Str("type", eventType).Msg("failed to publish event")
	}
}
