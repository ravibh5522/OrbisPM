package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/metrics"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/worker"
)

type CreateProjectParams struct {
	OrgID       uuid.UUID   `json:"-"`
	UserID      uuid.UUID   `json:"-"`
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
	roleRepo          repository.RoleRepository
	txm               *repository.TxManager
	workerSrv         *worker.Server
	publisher         EventPublisher
	cache             CacheInvalidator
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

// SetRoleRepo injects the role repository for role validation.
func (s *ProjectService) SetRoleRepo(rr repository.RoleRepository) { s.roleRepo = rr }

// SetCache injects the cache invalidator.
func (s *ProjectService) SetCache(c CacheInvalidator) { s.cache = c }

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

	// Track creator
	if params.UserID != uuid.Nil {
		project.CreatedBy = &params.UserID
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

		// Auto-add creator as project lead
		if params.UserID != uuid.Nil {
			creatorMember := &domain.ProjectMember{
				ProjectID: created.ID,
				UserID:    params.UserID,
				Role:      domain.RoleProjectLead,
				Source:    "direct",
			}
			if err := s.projectMemberRepo.Add(ctx, tx, creatorMember); err != nil {
				return fmt.Errorf("add creator as lead: %w", err)
			}
		}

		// Sync team members into project_members
		if s.projectTeamRepo != nil && s.teamMemberRepo != nil && len(teamIDs) > 0 {
			for _, tID := range teamIDs {
				teamMembers, tmErr := s.teamMemberRepo.ListByTeam(ctx, tID)
				if tmErr != nil {
					log.Warn().Err(tmErr).Str("team_id", tID.String()).Msg("sync team members: list failed")
					continue
				}
				for _, tm := range teamMembers {
					projectRole := domain.DefaultTeamProjectRoleMap[tm.Role]
					if projectRole == "" {
						projectRole = domain.RoleProjectObserver
					}
					pm := &domain.ProjectMember{
						ProjectID:    created.ID,
						UserID:       tm.UserID,
						Role:         projectRole,
						Source:       "team",
						SourceTeamID: &tID,
					}
					_ = s.projectMemberRepo.Add(ctx, tx, pm) // ON CONFLICT DO NOTHING
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
	metrics.BusinessOpsTotal.WithLabelValues("project", "create").Inc()

	s.publishEvent(ctx, domain.EventProjectCreated, created.OrgID.String(), created.ID.String(), map[string]any{"name": created.Name})

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

	s.publishEvent(ctx, domain.EventProjectUpdated, updated.OrgID.String(), updated.ID.String(), map[string]any{
		"project_id": updated.ID.String(),
		"settings":   updated.Settings,
	})

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

	s.publishEvent(ctx, domain.EventProjectDeleted, project.OrgID.String(), id.String(), map[string]any{"name": project.Name})

	return nil
}

func (s *ProjectService) ListByOrg(ctx context.Context, orgID uuid.UUID, teamID ...*uuid.UUID) ([]*domain.Project, error) {
	var tid *uuid.UUID
	if len(teamID) > 0 {
		tid = teamID[0]
	}
	return s.projectRepo.ListByOrg(ctx, orgID, tid)
}

func (s *ProjectService) ListByOrgPaginated(ctx context.Context, orgID uuid.UUID, f repository.ProjectFilter) ([]*domain.Project, int, error) {
	return s.projectRepo.ListByOrgPaginated(ctx, orgID, f)
}

// --- Members ---

func (s *ProjectService) AddMember(ctx context.Context, projectID, userID uuid.UUID, role string, sourceTeamID *uuid.UUID) error {
	if role == "" {
		role = domain.RoleProjectContributor
	}
	if err := s.validateRole(ctx, projectID, role); err != nil {
		return err
	}
	// Fetch project for orgID (needed for event publishing)
	project, err := s.projectRepo.GetByID(ctx, projectID)
	if err != nil {
		return err
	}
	source := "direct"
	if sourceTeamID != nil {
		source = "team"
		// Validate the team is linked to this project
		if s.projectTeamRepo != nil {
			linked, err := s.projectTeamRepo.ListByProject(ctx, projectID)
			if err != nil {
				return fmt.Errorf("check team link: %w", err)
			}
			found := false
			for _, pt := range linked {
				if pt.TeamID == *sourceTeamID {
					found = true
					break
				}
			}
			if !found {
				return fmt.Errorf("team is not linked to this project")
			}
		}
		// Validate the user is a member of that team
		if s.teamMemberRepo != nil {
			teamMembers, err := s.teamMemberRepo.ListByTeam(ctx, *sourceTeamID)
			if err != nil {
				return fmt.Errorf("check team membership: %w", err)
			}
			found := false
			for _, tm := range teamMembers {
				if tm.UserID == userID {
					found = true
					break
				}
			}
			if !found {
				return fmt.Errorf("user is not a member of the specified team")
			}
		}
	}
	m := &domain.ProjectMember{ProjectID: projectID, UserID: userID, Role: role, Source: source, SourceTeamID: sourceTeamID}
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.projectMemberRepo.Add(ctx, tx, m)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventProjectMemberAdded, project.OrgID.String(), projectID.String(), map[string]any{"user_id": userID.String(), "role": role})
	// Invalidate cached permissions for the added user
	if s.cache != nil {
		_ = s.cache.InvalidateUserPermissions(ctx, userID, project.OrgID)
	}
	return nil
}

func (s *ProjectService) RemoveMember(ctx context.Context, projectID, userID uuid.UUID) error {
	return s.RemoveMemberWithReassign(ctx, projectID, userID, nil)
}

// RemoveMemberWithReassign removes a member and reassigns (or unassigns) all their tasks transactionally.
func (s *ProjectService) RemoveMemberWithReassign(ctx context.Context, projectID, userID uuid.UUID, reassignTo *uuid.UUID) error {
	// Governance: prevent removing the last lead
	if err := s.ensureNotLastLead(ctx, projectID, userID); err != nil {
		return err
	}

	// Fetch project for orgID (needed for event publishing)
	project, err := s.projectRepo.GetByID(ctx, projectID)
	if err != nil {
		return err
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

		return s.projectMemberRepo.Remove(ctx, tx, projectID, userID)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventProjectMemberRemoved, project.OrgID.String(), projectID.String(), map[string]any{"user_id": userID.String()})
	// Invalidate cached permissions for the removed user
	if s.cache != nil {
		_ = s.cache.InvalidateUserPermissions(ctx, userID, project.OrgID)
	}
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
	if err := s.validateRole(ctx, projectID, role); err != nil {
		return err
	}

	// Governance: prevent downgrading the last lead
	if role != domain.RoleProjectLead {
		if err := s.ensureNotLastLead(ctx, projectID, userID); err != nil {
			return err
		}
	}

	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.projectMemberRepo.UpdateRole(ctx, tx, projectID, userID, role)
	})
	if err != nil {
		return err
	}
	orgID := ""
	if p, pErr := s.projectRepo.GetByID(ctx, projectID); pErr == nil {
		orgID = p.OrgID.String()
	}
	s.publishEvent(ctx, "member.role_updated", orgID, projectID.String(), map[string]any{"user_id": userID.String(), "role": role, "scope": "project"})
	// Invalidate cached permissions for the user whose role changed
	if s.cache != nil && orgID != "" {
		orgUUID, pErr := uuid.Parse(orgID)
		if pErr == nil {
			_ = s.cache.InvalidateUserPermissions(ctx, userID, orgUUID)
		}
	}
	return nil
}

func (s *ProjectService) ListMembers(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectMember, error) {
	return s.projectMemberRepo.ListByProject(ctx, projectID)
}

func (s *ProjectService) ListMembersPaginated(ctx context.Context, projectID uuid.UUID, limit, offset int) ([]*domain.ProjectMember, int, error) {
	return s.projectMemberRepo.ListByProjectPaginated(ctx, projectID, limit, offset)
}

// validateRole checks that a role slug is valid for the project scope.
func (s *ProjectService) validateRole(ctx context.Context, projectID uuid.UUID, slug string) error {
	if s.roleRepo == nil {
		return nil
	}
	project, err := s.projectRepo.GetByID(ctx, projectID)
	if err != nil {
		return err
	}
	_, err = s.roleRepo.GetBySlug(ctx, project.OrgID, domain.ScopeProject, slug)
	if err != nil {
		return domain.ErrBadRequest.WithDetail("invalid role: " + slug)
	}
	return nil
}

// ensureNotLastLead prevents removing or downgrading the last project lead.
func (s *ProjectService) ensureNotLastLead(ctx context.Context, projectID, userID uuid.UUID) error {
	members, err := s.projectMemberRepo.ListByProject(ctx, projectID)
	if err != nil {
		return err
	}
	leadCount := 0
	isLead := false
	for _, m := range members {
		if m.Role == domain.RoleProjectLead {
			leadCount++
			if m.UserID == userID {
				isLead = true
			}
		}
	}
	if isLead && leadCount <= 1 {
		return domain.ErrBadRequest.WithDetail("cannot remove or downgrade the last project lead")
	}
	return nil
}

// publishEvent publishes a domain event for real-time propagation via SSE.
func (s *ProjectService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
	if s.publisher == nil {
		return
	}
	event := domain.DomainEvent{
		Type:     eventType,
		OrgID:    orgID,
		ActorID:  tenant.UserID(ctx).String(),
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
