package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/repository"
)

type CreateTeamParams struct {
	OrgID       uuid.UUID  `json:"-"`
	Name        string     `json:"name" validate:"required,min=2,max=100"`
	Description string     `json:"description,omitempty"`
	ManagerID   *uuid.UUID `json:"manager_id,omitempty"`
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
	roleRepo          repository.RoleRepository
	txm               *repository.TxManager
	publisher         EventPublisher
}

// SetProjectDeps injects optional project-related dependencies for membership lifecycle hooks.
func (s *TeamService) SetProjectDeps(ptRepo repository.ProjectTeamRepository, pmRepo repository.ProjectMemberRepository, tRepo repository.TaskRepository) {
	s.projectTeamRepo = ptRepo
	s.projectMemberRepo = pmRepo
	s.taskRepo = tRepo
}

// SetRoleRepo injects the role repository for role validation.
func (s *TeamService) SetRoleRepo(rr repository.RoleRepository) { s.roleRepo = rr }

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
		ManagerID:   params.ManagerID,
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
	payload := map[string]any{
		"name": created.Name,
	}
	if created.ManagerID != nil {
		payload["manager_id"] = created.ManagerID.String()
	}
	s.publishEvent(ctx, domain.EventTeamCreated, created.OrgID.String(), created.ID.String(), payload)
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
		s.publishEvent(ctx, domain.EventTeamDeleted, team.OrgID.String(), id.String(), map[string]any{"name": team.Name})
	}
	return err
}

// SetManager assigns or changes the manager for a team.
func (s *TeamService) SetManager(ctx context.Context, teamID uuid.UUID, managerID *uuid.UUID) (*domain.Team, error) {
	team, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil {
		return nil, err
	}

	oldManagerID := team.ManagerID

	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		if err := s.teamRepo.SetManager(ctx, tx, teamID, managerID); err != nil {
			return err
		}
		// If setting a new manager, ensure they are a team member with team_lead role
		if managerID != nil && *managerID != uuid.Nil {
			members, err := s.teamMemberRepo.ListByTeam(ctx, teamID)
			if err != nil {
				return err
			}
			found := false
			for _, m := range members {
				if m.UserID == *managerID {
					found = true
					if m.Role != domain.RoleTeamLead {
						if err := s.teamMemberRepo.UpdateRole(ctx, tx, teamID, *managerID, domain.RoleTeamLead); err != nil {
							return err
						}
					}
					break
				}
			}
			if !found {
				m := &domain.TeamMember{TeamID: teamID, UserID: *managerID, Role: domain.RoleTeamLead}
				if err := s.teamMemberRepo.Add(ctx, tx, m); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("set manager: %w", err)
	}

	updated, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil {
		return nil, err
	}

	payload := map[string]any{}
	if managerID != nil {
		payload["new_manager_id"] = managerID.String()
	}
	if oldManagerID != nil {
		payload["old_manager_id"] = oldManagerID.String()
	}
	s.publishEvent(ctx, domain.EventTeamManagerChanged, updated.OrgID.String(), teamID.String(), payload)

	return updated, nil
}

func (s *TeamService) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Team, error) {
	return s.teamRepo.ListByOrg(ctx, orgID)
}

func (s *TeamService) ListByOrgPaginated(ctx context.Context, orgID uuid.UUID, f repository.TeamFilter) ([]*domain.Team, int, error) {
	return s.teamRepo.ListByOrgPaginated(ctx, orgID, f)
}

func (s *TeamService) ListMembersPaginated(ctx context.Context, teamID uuid.UUID, f repository.MemberFilter) ([]*domain.TeamMember, int, error) {
	return s.teamMemberRepo.ListByTeamPaginated(ctx, teamID, f)
}

// --- Members ---

func (s *TeamService) AddMember(ctx context.Context, teamID, userID uuid.UUID, role string) error {
	if role == "" {
		role = domain.RoleTeamMember
	}
	if err := s.validateRole(ctx, teamID, role); err != nil {
		return err
	}
	m := &domain.TeamMember{TeamID: teamID, UserID: userID, Role: role}
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		if err := s.teamMemberRepo.Add(ctx, tx, m); err != nil {
			return err
		}
		// Sync: add user to all projects linked to this team as a team-inherited member.
		// Also remove any existing direct membership to avoid duplicates (auto-demote).
		if s.projectTeamRepo != nil && s.projectMemberRepo != nil {
			linkedProjects, lErr := s.projectTeamRepo.ListByTeam(ctx, teamID)
			if lErr != nil {
				log.Warn().Err(lErr).Msg("team-add-sync: failed to list linked projects")
			} else {
				projectRole := domain.DefaultTeamProjectRoleMap[role]
				if projectRole == "" {
					projectRole = domain.RoleProjectObserver
				}
				for _, pt := range linkedProjects {
					// Remove any direct membership first (auto-demote)
					_ = s.projectMemberRepo.Remove(ctx, tx, pt.ProjectID, userID)
					// Add as team-inherited member
					pm := &domain.ProjectMember{
						ProjectID:    pt.ProjectID,
						UserID:       userID,
						Role:         projectRole,
						Source:       "team",
						SourceTeamID: &teamID,
					}
					_ = s.projectMemberRepo.Add(ctx, tx, pm) // ON CONFLICT DO NOTHING
				}
			}
		}
		return nil
	})
	if err == nil {
		s.publishEvent(ctx, domain.EventTeamMemberAdded, "", teamID.String(), map[string]any{"user_id": userID.String(), "role": role, "scope": "team"})
	}
	return err
}

func (s *TeamService) RemoveMember(ctx context.Context, teamID, userID uuid.UUID) error {
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		if err := s.teamMemberRepo.Remove(ctx, tx, teamID, userID); err != nil {
			return err
		}
		// Remove team-inherited project memberships for this user.
		// If the user has assigned tasks, auto-promote to direct member instead of losing access.
		if s.projectTeamRepo != nil && s.projectMemberRepo != nil {
			linkedProjects, lErr := s.projectTeamRepo.ListByTeam(ctx, teamID)
			if lErr != nil {
				log.Warn().Err(lErr).Msg("team-remove-sync: failed to list linked projects")
			} else {
				for _, pt := range linkedProjects {
					// Remove team-inherited membership
					_ = s.projectMemberRepo.RemoveBySourceTeamAndUser(ctx, tx, pt.ProjectID, teamID, userID)

					// Auto-promote: if user has tasks, add as direct member
					if s.taskRepo != nil {
						counts, cErr := s.taskRepo.CountByAssigneesInProject(ctx, pt.ProjectID, []uuid.UUID{userID})
						if cErr != nil {
							log.Warn().Err(cErr).Msg("team-remove-sync: failed to count tasks")
							continue
						}
						if counts[userID] > 0 {
							dm := &domain.ProjectMember{
								ProjectID: pt.ProjectID,
								UserID:    userID,
								Role:      domain.RoleProjectContributor,
								Source:    "direct",
							}
							if aErr := s.projectMemberRepo.Add(ctx, tx, dm); aErr != nil {
								log.Warn().Err(aErr).Str("project_id", pt.ProjectID.String()).Msg("team-remove-sync: failed to auto-promote")
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
		}
		return nil
	})
	if err == nil {
		s.publishEvent(ctx, domain.EventTeamMemberRemoved, "", teamID.String(), map[string]any{"user_id": userID.String(), "scope": "team"})
	}
	return err
}

func (s *TeamService) UpdateMemberRole(ctx context.Context, teamID, userID uuid.UUID, role string) error {
	if role == "" {
		return fmt.Errorf("role is required")
	}
	if err := s.validateRole(ctx, teamID, role); err != nil {
		return err
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

// validateRole checks that a role slug is valid for the team scope.
func (s *TeamService) validateRole(ctx context.Context, teamID uuid.UUID, slug string) error {
	if s.roleRepo == nil {
		return nil
	}
	team, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil {
		return err
	}
	_, err = s.roleRepo.GetBySlug(ctx, team.OrgID, domain.ScopeTeam, slug)
	if err != nil {
		return domain.ErrBadRequest.WithDetail("invalid role: " + slug)
	}
	return nil
}

// publishEvent publishes a domain event for real-time propagation via SSE.
func (s *TeamService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
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
		// Log but don't fail the operation
		_ = err
	}
}
