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
	teamMemberRepo    repository.TeamMemberRepository
	taskRepo          repository.TaskRepository
	txm               *repository.TxManager
	workerSrv         *worker.Server
	publisher         EventPublisher
}

func NewProjectTeamService(
	projectTeamRepo repository.ProjectTeamRepository,
	projectRepo repository.ProjectRepository,
	teamRepo repository.TeamRepository,
	projectMemberRepo repository.ProjectMemberRepository,
	teamMemberRepo repository.TeamMemberRepository,
	taskRepo repository.TaskRepository,
	txm *repository.TxManager,
	workerSrv *worker.Server,
	publisher ...EventPublisher,
) *ProjectTeamService {
	s := &ProjectTeamService{
		projectTeamRepo:   projectTeamRepo,
		projectRepo:       projectRepo,
		teamRepo:          teamRepo,
		projectMemberRepo: projectMemberRepo,
		teamMemberRepo:    teamMemberRepo,
		taskRepo:          taskRepo,
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

// UnlinkTeamParams defines params for unlinking a team with optional task reassignment.
type UnlinkTeamParams struct {
	ProjectID  uuid.UUID  `json:"-"`
	TeamID     uuid.UUID  `json:"-"`
	ReassignTo *uuid.UUID `json:"reassign_to,omitempty"` // nil = unassign all tasks
}

// UnlinkTeam unlinks a team from a project (min 1 must remain).
// If the team has members whose tasks are assigned, either reassign to ReassignTo or unassign them.
func (s *ProjectTeamService) UnlinkTeam(ctx context.Context, params UnlinkTeamParams) error {
	count, err := s.projectTeamRepo.Count(ctx, params.ProjectID)
	if err != nil {
		return err
	}
	if count <= 1 {
		return domain.ErrBadRequest.WithDetail("project must have at least one team")
	}

	// Find project members sourced from this team
	allMembers, err := s.projectMemberRepo.ListByProject(ctx, params.ProjectID)
	if err != nil {
		return fmt.Errorf("list project members: %w", err)
	}

	var teamSourcedUserIDs []uuid.UUID
	for _, m := range allMembers {
		if m.SourceTeamID != nil && *m.SourceTeamID == params.TeamID {
			teamSourcedUserIDs = append(teamSourcedUserIDs, m.UserID)
		}
	}

	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		// Reassign or unassign tasks from members sourced from this team
		if len(teamSourcedUserIDs) > 0 {
			affected, err := s.taskRepo.ReassignOrUnassignTasks(ctx, tx, params.ProjectID, teamSourcedUserIDs, params.ReassignTo)
			if err != nil {
				return fmt.Errorf("reassign tasks during team unlink: %w", err)
			}
			log.Info().
				Str("project_id", params.ProjectID.String()).
				Str("team_id", params.TeamID.String()).
				Int64("tasks_affected", affected).
				Msg("tasks reassigned during team unlink")

			// Remove all project members sourced from this team
			if err := s.projectMemberRepo.RemoveBySourceTeam(ctx, tx, params.ProjectID, params.TeamID); err != nil {
				return fmt.Errorf("remove team-sourced members: %w", err)
			}
		}

		return s.projectTeamRepo.Unlink(ctx, tx, params.ProjectID, params.TeamID)
	})
}

// ListTeams returns all teams linked to a project.
func (s *ProjectTeamService) ListTeams(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectTeam, error) {
	return s.projectTeamRepo.ListByProject(ctx, projectID)
}

// PreviewUnlinkTeam returns the impact of unlinking a team: affected members and task counts.
func (s *ProjectTeamService) PreviewUnlinkTeam(ctx context.Context, projectID, teamID uuid.UUID) (*domain.UnlinkPreview, error) {
	team, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil {
		return nil, err
	}

	// Find project members sourced from this team
	allMembers, err := s.projectMemberRepo.ListByProject(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("list project members: %w", err)
	}

	var teamSourcedUserIDs []uuid.UUID
	memberMap := make(map[uuid.UUID]*domain.ProjectMember)
	for _, m := range allMembers {
		if m.SourceTeamID != nil && *m.SourceTeamID == teamID {
			teamSourcedUserIDs = append(teamSourcedUserIDs, m.UserID)
			memberMap[m.UserID] = m
		}
	}

	preview := &domain.UnlinkPreview{
		TeamID:          teamID,
		TeamName:        team.Name,
		AffectedMembers: make([]*domain.UnlinkPreviewMember, 0),
	}

	if len(teamSourcedUserIDs) == 0 {
		return preview, nil
	}

	taskCounts, err := s.taskRepo.CountByAssigneesInProject(ctx, projectID, teamSourcedUserIDs)
	if err != nil {
		return nil, fmt.Errorf("count assignee tasks: %w", err)
	}

	total := 0
	for _, uid := range teamSourcedUserIDs {
		m := memberMap[uid]
		cnt := taskCounts[uid]
		total += cnt
		preview.AffectedMembers = append(preview.AffectedMembers, &domain.UnlinkPreviewMember{
			UserID:      uid,
			Email:       m.Email,
			DisplayName: m.DisplayName,
			AvatarURL:   m.AvatarURL,
			TaskCount:   cnt,
		})
	}
	preview.TotalTasks = total
	return preview, nil
}

// ListEligibleMembers returns all explicitly-added project members.
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
