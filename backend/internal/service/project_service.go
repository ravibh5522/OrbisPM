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
	"github.com/orbispm/orbispm/internal/worker"
)

type CreateProjectParams struct {
	OrgID       uuid.UUID   `json:"-"`
	TeamID      uuid.UUID   `json:"team_id"`            // Legacy: primary team
	TeamIDs     []uuid.UUID `json:"team_ids,omitempty"` // Multi-team: overrides TeamID if non-empty
	Name        string      `json:"name" validate:"required,min=2,max=100"`
	Description string      `json:"description,omitempty"`
}

type UpdateProjectParams struct {
	Name        *string        `json:"name,omitempty" validate:"omitempty,min=2,max=100"`
	Description *string        `json:"description,omitempty"`
	Status      *string        `json:"status,omitempty" validate:"omitempty,oneof=active archived completed"`
	Settings    map[string]any `json:"settings,omitempty"`
}

type ProjectService struct {
	projectRepo       repository.ProjectRepository
	projectMemberRepo repository.ProjectMemberRepository
	projectTeamRepo   repository.ProjectTeamRepository
	taskRepo          repository.TaskRepository
	teamMemberRepo    repository.TeamMemberRepository
	txm               *repository.TxManager
	workerSrv         *worker.Server
	publisher         EventPublisher
}

func NewProjectService(
	projectRepo repository.ProjectRepository,
	projectMemberRepo repository.ProjectMemberRepository,
	txm *repository.TxManager,
	workerSrv *worker.Server,
	publisher ...EventPublisher,
) *ProjectService {
	s := &ProjectService{projectRepo: projectRepo, projectMemberRepo: projectMemberRepo, txm: txm, workerSrv: workerSrv}
	if len(publisher) > 0 {
		s.publisher = publisher[0]
	}
	return s
}

// SetProjectTeamRepo injects the optional multi-team dependency.
func (s *ProjectService) SetProjectTeamRepo(ptr repository.ProjectTeamRepository) {
	s.projectTeamRepo = ptr
}

// SetTaskRepo injects the task repository for task reassignment during member removal.
func (s *ProjectService) SetTaskRepo(tr repository.TaskRepository) {
	s.taskRepo = tr
}

// SetTeamMemberRepo injects the team member repository for removing team-inherited members.
func (s *ProjectService) SetTeamMemberRepo(tmr repository.TeamMemberRepository) {
	s.teamMemberRepo = tmr
}

func (s *ProjectService) Create(ctx context.Context, params CreateProjectParams) (*domain.Project, error) {
	// Determine team IDs — prefer TeamIDs, fall back to single TeamID
	teamIDs := params.TeamIDs
	if len(teamIDs) == 0 && params.TeamID != uuid.Nil {
		teamIDs = []uuid.UUID{params.TeamID}
	}

	project := &domain.Project{
		OrgID:       params.OrgID,
		Name:        strings.TrimSpace(params.Name),
		Description: strings.TrimSpace(params.Description),
		Status:      "active",
		Settings:    map[string]any{"reviewable_fields": []string{}},
	}

	// Set legacy TeamID for backward compat (first team)
	if len(teamIDs) > 0 {
		project.TeamID = &teamIDs[0]
	}

	var created *domain.Project
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.projectRepo.Create(ctx, tx, project)
		if err != nil {
			return err
		}

		// Link teams via project_teams table
		if s.projectTeamRepo != nil && len(teamIDs) > 0 {
			for _, tID := range teamIDs {
				if err := s.projectTeamRepo.Link(ctx, tx, created.ID, tID); err != nil {
					return fmt.Errorf("link team %s: %w", tID, err)
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}

	created.TeamIDs = teamIDs

	// Enqueue activity log
	s.enqueueActivity(created.OrgID.String(), "project", created.ID.String(), "created", "")

	s.publishEvent(ctx, domain.EventProjectCreated, created.OrgID.String(), created.ID.String(), nil)

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
	if params.Settings != nil {
		// Merge settings instead of replacing
		if project.Settings == nil {
			project.Settings = make(map[string]any)
		}
		for k, v := range params.Settings {
			project.Settings[k] = v
		}
	}

	var updated *domain.Project
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.projectRepo.Update(ctx, tx, project)
		return err
	})
	if err != nil {
		return nil, err
	}

	s.enqueueActivity(project.OrgID.String(), "project", project.ID.String(), "updated", "")

	s.publishEvent(ctx, domain.EventProjectUpdated, updated.OrgID.String(), updated.ID.String(), nil)

	return updated, nil
}

func (s *ProjectService) Delete(ctx context.Context, id uuid.UUID) error {
	project, err := s.projectRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.projectRepo.Delete(ctx, tx, id)
	})
	if err != nil {
		return err
	}

	s.enqueueActivity(project.OrgID.String(), "project", id.String(), "deleted", "")

	s.publishEvent(ctx, "project.deleted", project.OrgID.String(), id.String(), nil)

	return nil
}

func (s *ProjectService) ListByOrg(ctx context.Context, orgID uuid.UUID, teamID ...*uuid.UUID) ([]*domain.Project, error) {
	var tid *uuid.UUID
	if len(teamID) > 0 {
		tid = teamID[0]
	}
	return s.projectRepo.ListByOrg(ctx, orgID, tid)
}

// --- Members ---

func (s *ProjectService) AddMember(ctx context.Context, projectID, userID uuid.UUID, role string) error {
	if role == "" {
		role = domain.RoleProjectContributor
	}
	m := &domain.ProjectMember{ProjectID: projectID, UserID: userID, Role: role}
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.projectMemberRepo.Add(ctx, tx, m)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventMemberInvited, "", projectID.String(), map[string]any{"user_id": userID.String(), "scope": "project"})
	return nil
}

func (s *ProjectService) RemoveMember(ctx context.Context, projectID, userID uuid.UUID) error {
	return s.RemoveMemberWithReassign(ctx, projectID, userID, nil)
}

// RemoveMemberWithReassign removes a member and reassigns (or unassigns) all their tasks transactionally.
// For team-inherited members, it removes them from the team instead of the project_members table.
func (s *ProjectService) RemoveMemberWithReassign(ctx context.Context, projectID, userID uuid.UUID, reassignTo *uuid.UUID) error {
	// Find the member source before the transaction
	effective, err := s.projectMemberRepo.ListEffectiveMembers(ctx, projectID)
	if err != nil {
		return fmt.Errorf("list effective members: %w", err)
	}
	var member *domain.EffectiveMember
	for _, em := range effective {
		if em.UserID == userID {
			member = em
			break
		}
	}
	if member == nil {
		return fmt.Errorf("member not found in project")
	}

	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		// Reassign/unassign tasks
		if s.taskRepo != nil {
			affected, err := s.taskRepo.ReassignOrUnassignTasks(ctx, tx, projectID, []uuid.UUID{userID}, reassignTo)
			if err != nil {
				return fmt.Errorf("reassign tasks: %w", err)
			}
			log.Info().
				Str("project_id", projectID.String()).
				Str("user_id", userID.String()).
				Int64("tasks_affected", affected).
				Msg("tasks reassigned during member removal")
		}

		// Remove from the correct table based on source
		if member.Source == "team" && member.SourceTeamID != nil && s.teamMemberRepo != nil {
			return s.teamMemberRepo.Remove(ctx, tx, *member.SourceTeamID, userID)
		}
		return s.projectMemberRepo.Remove(ctx, tx, projectID, userID)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, "member.removed", "", projectID.String(), map[string]any{"user_id": userID.String(), "scope": "project"})
	return nil
}

// PreviewRemoveMember returns the number of tasks assigned to the member.
func (s *ProjectService) PreviewRemoveMember(ctx context.Context, projectID, userID uuid.UUID) (int, error) {
	if s.taskRepo == nil {
		return 0, nil
	}
	counts, err := s.taskRepo.CountByAssigneesInProject(ctx, projectID, []uuid.UUID{userID})
	if err != nil {
		return 0, err
	}
	return counts[userID], nil
}

func (s *ProjectService) UpdateMemberRole(ctx context.Context, projectID, userID uuid.UUID, role string) error {
	if role == "" {
		return fmt.Errorf("role is required")
	}

	// Find the member source to update in the correct table
	effective, err := s.projectMemberRepo.ListEffectiveMembers(ctx, projectID)
	if err != nil {
		return fmt.Errorf("list effective members: %w", err)
	}
	var member *domain.EffectiveMember
	for _, em := range effective {
		if em.UserID == userID {
			member = em
			break
		}
	}
	if member == nil {
		return fmt.Errorf("member not found in project")
	}

	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		if member.Source == "team" && member.SourceTeamID != nil && s.teamMemberRepo != nil {
			return s.teamMemberRepo.UpdateRole(ctx, tx, *member.SourceTeamID, userID, role)
		}
		return s.projectMemberRepo.UpdateRole(ctx, tx, projectID, userID, role)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, "member.role_updated", "", projectID.String(), map[string]any{"user_id": userID.String(), "role": role, "scope": "project"})
	return nil
}

func (s *ProjectService) ListMembers(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectMember, error) {
	effective, err := s.projectMemberRepo.ListEffectiveMembers(ctx, projectID)
	if err != nil {
		return nil, err
	}
	members := make([]*domain.ProjectMember, 0, len(effective))
	for _, em := range effective {
		members = append(members, &domain.ProjectMember{
			ProjectID:      projectID,
			UserID:         em.UserID,
			Email:          em.Email,
			DisplayName:    em.DisplayName,
			AvatarURL:      em.AvatarURL,
			Role:           em.Role,
			Source:         em.Source,
			SourceTeamID:   em.SourceTeamID,
			SourceTeamName: em.SourceTeamName,
			JoinedAt:       em.JoinedAt,
		})
	}
	return members, nil
}

// publishEvent publishes a domain event for real-time propagation via SSE.
func (s *ProjectService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
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
		_ = err
	}
}

// --- Worker helper ---

func (s *ProjectService) enqueueActivity(orgID, entityType, entityID, action, actorID string) {
	if s.workerSrv == nil {
		return
	}
	task, err := worker.NewActivityLogTask(worker.ActivityLogPayload{
		OrgID:      orgID,
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		ActorID:    actorID,
	})
	if err != nil {
		log.Error().Err(err).Msg("build activity log task")
		return
	}
	if err := s.workerSrv.Enqueue(task); err != nil {
		log.Error().Err(err).Msg("enqueue activity log task")
	}
}
