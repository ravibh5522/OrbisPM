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

	// Get team members who will lose access (team-only, not also direct members)
	teamMembers, err := s.teamMemberRepo.ListByTeam(ctx, params.TeamID)
	if err != nil {
		return fmt.Errorf("list team members: %w", err)
	}

	// Get direct project members so we can exclude them
	directMembers, err := s.projectMemberRepo.ListByProject(ctx, params.ProjectID)
	if err != nil {
		return fmt.Errorf("list direct members: %w", err)
	}
	directSet := make(map[uuid.UUID]bool, len(directMembers))
	for _, dm := range directMembers {
		directSet[dm.UserID] = true
	}

	// Collect team-only user IDs (those who will lose project access)
	var teamOnlyUserIDs []uuid.UUID
	for _, tm := range teamMembers {
		if !directSet[tm.UserID] {
			teamOnlyUserIDs = append(teamOnlyUserIDs, tm.UserID)
		}
	}

	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		// Reassign or unassign tasks from team-only members
		if len(teamOnlyUserIDs) > 0 {
			affected, err := s.taskRepo.ReassignOrUnassignTasks(ctx, tx, params.ProjectID, teamOnlyUserIDs, params.ReassignTo)
			if err != nil {
				return fmt.Errorf("reassign tasks during team unlink: %w", err)
			}
			log.Info().
				Str("project_id", params.ProjectID.String()).
				Str("team_id", params.TeamID.String()).
				Int64("tasks_affected", affected).
				Msg("tasks reassigned during team unlink")
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

	teamMembers, err := s.teamMemberRepo.ListByTeam(ctx, teamID)
	if err != nil {
		return nil, fmt.Errorf("list team members: %w", err)
	}

	directMembers, err := s.projectMemberRepo.ListByProject(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("list direct members: %w", err)
	}
	directSet := make(map[uuid.UUID]bool, len(directMembers))
	for _, dm := range directMembers {
		directSet[dm.UserID] = true
	}

	var teamOnlyUserIDs []uuid.UUID
	teamMemberMap := make(map[uuid.UUID]*domain.TeamMember)
	for _, tm := range teamMembers {
		if !directSet[tm.UserID] {
			teamOnlyUserIDs = append(teamOnlyUserIDs, tm.UserID)
			teamMemberMap[tm.UserID] = tm
		}
	}

	preview := &domain.UnlinkPreview{
		TeamID:          teamID,
		TeamName:        team.Name,
		AffectedMembers: make([]*domain.UnlinkPreviewMember, 0),
	}

	if len(teamOnlyUserIDs) == 0 {
		return preview, nil
	}

	taskCounts, err := s.taskRepo.CountByAssigneesInProject(ctx, projectID, teamOnlyUserIDs)
	if err != nil {
		return nil, fmt.Errorf("count assignee tasks: %w", err)
	}

	total := 0
	for _, uid := range teamOnlyUserIDs {
		tm := teamMemberMap[uid]
		cnt := taskCounts[uid]
		total += cnt
		preview.AffectedMembers = append(preview.AffectedMembers, &domain.UnlinkPreviewMember{
			UserID:      uid,
			Email:       tm.Email,
			DisplayName: tm.DisplayName,
			AvatarURL:   tm.AvatarURL,
			TaskCount:   cnt,
		})
	}
	preview.TotalTasks = total
	return preview, nil
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
