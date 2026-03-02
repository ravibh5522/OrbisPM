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
	OrgID       uuid.UUID `json:"-"`
	TeamID      uuid.UUID `json:"team_id" validate:"required"`
	Name        string    `json:"name" validate:"required,min=2,max=100"`
	Description string    `json:"description,omitempty"`
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

func (s *ProjectService) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Project, error) {
	return s.projectRepo.ListByOrg(ctx, orgID)
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
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.projectMemberRepo.Remove(ctx, tx, projectID, userID)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, "member.removed", "", projectID.String(), map[string]any{"user_id": userID.String(), "scope": "project"})
	return nil
}

func (s *ProjectService) UpdateMemberRole(ctx context.Context, projectID, userID uuid.UUID, role string) error {
	if role == "" {
		return fmt.Errorf("role is required")
	}
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.projectMemberRepo.UpdateRole(ctx, tx, projectID, userID, role)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, "member.role_updated", "", projectID.String(), map[string]any{"user_id": userID.String(), "role": role, "scope": "project"})
	return nil
}

func (s *ProjectService) ListMembers(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectMember, error) {
	return s.projectMemberRepo.ListByProject(ctx, projectID)
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
