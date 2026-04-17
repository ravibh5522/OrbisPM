package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/worker"
)

// AnnouncementService manages announcements.
type AnnouncementService struct {
	repo              repository.AnnouncementRepository
	memberRepo        repository.OrgMemberRepository
	projectMemberRepo repository.ProjectMemberRepository
	txm               *repository.TxManager
	workerSrv         *worker.Server
	publisher         EventPublisher
}

// NewAnnouncementService creates a new AnnouncementService.
func NewAnnouncementService(
	repo repository.AnnouncementRepository,
	memberRepo repository.OrgMemberRepository,
	projectMemberRepo repository.ProjectMemberRepository,
	txm *repository.TxManager,
	workerSrv *worker.Server,
	publisher ...EventPublisher,
) *AnnouncementService {
	s := &AnnouncementService{
		repo:              repo,
		memberRepo:        memberRepo,
		projectMemberRepo: projectMemberRepo,
		txm:               txm,
		workerSrv:         workerSrv,
	}
	if len(publisher) > 0 {
		s.publisher = publisher[0]
	}
	return s
}

// CreateAnnouncementParams holds input data for creating an announcement.
type CreateAnnouncementParams struct {
	OrgID       uuid.UUID
	ProjectID   *uuid.UUID
	AuthorID    uuid.UUID
	Title       string
	Body        string
	Priority    string
	Pinned      bool
	PublishedAt *string // ISO-8601 or nil
	ExpiresAt   *string // ISO-8601 or nil
}

// UpdateAnnouncementParams holds fields that can be updated.
type UpdateAnnouncementParams struct {
	Title       *string
	Body        *string
	Priority    *string
	Pinned      *bool
	PublishedAt *string
	ExpiresAt   *string
}

// Create creates a new announcement and publishes the domain event.
func (s *AnnouncementService) Create(ctx context.Context, params CreateAnnouncementParams) (*domain.Announcement, error) {
	priority := params.Priority
	if priority == "" {
		priority = domain.AnnouncementPriorityNormal
	}

	a := &domain.Announcement{
		OrgID:     params.OrgID,
		ProjectID: params.ProjectID,
		AuthorID:  params.AuthorID,
		Title:     params.Title,
		Body:      params.Body,
		Priority:  priority,
		Pinned:    params.Pinned,
	}

	if err := a.Validate(); err != nil {
		return nil, err
	}

	var created *domain.Announcement
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.repo.Create(ctx, tx, a)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("create announcement: %w", err)
	}

	s.publishEvent(ctx, domain.EventAnnouncementCreated, params.OrgID.String(), created.ID.String(), map[string]any{
		"title":     created.Title,
		"priority":  created.Priority,
		"author_id": params.AuthorID.String(),
	})

	s.enqueueActivity(params.OrgID.String(), "announcement", created.ID.String(), "created", params.AuthorID.String(), nil)

	// Notify only the relevant audience:
	// - project announcements → project members only
	// - org-wide announcements → all org members
	if params.ProjectID != nil {
		s.notifyProjectMembers(ctx, *params.ProjectID, params.OrgID, params.AuthorID, "announcement_created",
			created.Title,
			created.Body,
			map[string]any{
				"announcement_id": created.ID.String(),
				"priority":        created.Priority,
			},
		)
	} else {
		s.notifyOrgMembers(ctx, params.OrgID, params.AuthorID, "announcement_created",
			created.Title,
			created.Body,
			map[string]any{
				"announcement_id": created.ID.String(),
				"priority":        created.Priority,
			},
		)
	}

	return created, nil
}

// Get returns a single announcement by ID.
func (s *AnnouncementService) Get(ctx context.Context, id uuid.UUID) (*domain.Announcement, error) {
	return s.repo.GetByID(ctx, id)
}

// Update applies partial updates to an announcement.
func (s *AnnouncementService) Update(ctx context.Context, id uuid.UUID, params UpdateAnnouncementParams, actorID uuid.UUID) (*domain.Announcement, error) {
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if params.Title != nil {
		existing.Title = *params.Title
	}
	if params.Body != nil {
		existing.Body = *params.Body
	}
	if params.Priority != nil {
		existing.Priority = *params.Priority
	}
	if params.Pinned != nil {
		existing.Pinned = *params.Pinned
	}

	if err := existing.Validate(); err != nil {
		return nil, err
	}

	var updated *domain.Announcement
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		updated, err = s.repo.Update(ctx, tx, existing)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("update announcement: %w", err)
	}

	s.publishEvent(ctx, domain.EventAnnouncementUpdated, updated.OrgID.String(), updated.ID.String(), map[string]any{
		"title":    updated.Title,
		"priority": updated.Priority,
	})

	s.enqueueActivity(updated.OrgID.String(), "announcement", updated.ID.String(), "updated", actorID.String(), nil)

	return updated, nil
}

// Delete removes an announcement by ID.
func (s *AnnouncementService) Delete(ctx context.Context, id uuid.UUID, actorID uuid.UUID) error {
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.repo.Delete(ctx, tx, id)
	})
	if err != nil {
		return fmt.Errorf("delete announcement: %w", err)
	}

	s.publishEvent(ctx, domain.EventAnnouncementDeleted, existing.OrgID.String(), id.String(), map[string]any{
		"title": existing.Title,
	})

	s.enqueueActivity(existing.OrgID.String(), "announcement", id.String(), "deleted", actorID.String(), nil)

	return nil
}

// List returns paginated announcements with per-user unread status.
func (s *AnnouncementService) List(
	ctx context.Context,
	orgID uuid.UUID,
	projectID *uuid.UUID,
	userID uuid.UUID,
	limit, offset int,
) ([]*domain.Announcement, int, error) {
	if limit <= 0 {
		limit = 20
	}
	return s.repo.List(ctx, orgID, projectID, userID, limit, offset)
}

// MarkRead marks an announcement as read for the given user.
func (s *AnnouncementService) MarkRead(ctx context.Context, announcementID, userID uuid.UUID) error {
	// Verify the announcement exists before recording the read.
	if _, err := s.repo.GetByID(ctx, announcementID); err != nil {
		return err
	}
	return s.repo.MarkRead(ctx, announcementID, userID)
}

// CountUnread returns the number of unread announcements for a user in an org.
func (s *AnnouncementService) CountUnread(ctx context.Context, orgID, userID uuid.UUID) (int, error) {
	return s.repo.CountUnread(ctx, orgID, userID)
}

// --- helpers ---

func (s *AnnouncementService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
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
		log.Warn().Err(err).Str("type", eventType).Msg("failed to publish announcement event")
	}
}

func (s *AnnouncementService) enqueueNotification(userID, orgID, ntype, title, body string, payload map[string]any) {
	if s.workerSrv == nil {
		return
	}
	task, err := worker.NewNotificationTask(worker.NotificationPayload{
		UserID:  userID,
		OrgID:   orgID,
		Type:    ntype,
		Title:   title,
		Body:    body,
		Payload: payload,
	})
	if err != nil {
		log.Error().Err(err).Msg("build announcement notification task")
		return
	}
	// Delay announcement email by 2 minutes to batch with nearby announcements
	if err := s.workerSrv.Enqueue(task, asynq.ProcessIn(2*time.Minute)); err != nil {
		log.Error().Err(err).Msg("enqueue announcement notification task")
	}
}

func (s *AnnouncementService) notifyProjectMembers(ctx context.Context, projectID, orgID, authorID uuid.UUID, ntype, title, body string, payload map[string]any) {
	if s.projectMemberRepo == nil || s.workerSrv == nil {
		log.Warn().Bool("projectMemberRepo_nil", s.projectMemberRepo == nil).Bool("workerSrv_nil", s.workerSrv == nil).Msg("skipping project announcement notifications: missing dependency")
		return
	}
	members, err := s.projectMemberRepo.ListByProject(ctx, projectID)
	if err != nil {
		log.Error().Err(err).Msg("list project members for announcement notification")
		return
	}
	log.Debug().Int("member_count", len(members)).Str("author_id", authorID.String()).Msg("notifying project members about announcement")
	for _, m := range members {
		if m.UserID == authorID {
			continue // Don't notify the author
		}
		log.Debug().Str("user_id", m.UserID.String()).Str("type", ntype).Msg("enqueuing project announcement notification")
		s.enqueueNotification(m.UserID.String(), orgID.String(), ntype, title, body, payload)
	}
}

func (s *AnnouncementService) notifyOrgMembers(ctx context.Context, orgID, authorID uuid.UUID, ntype, title, body string, payload map[string]any) {
	if s.memberRepo == nil || s.workerSrv == nil {
		log.Warn().Bool("memberRepo_nil", s.memberRepo == nil).Bool("workerSrv_nil", s.workerSrv == nil).Msg("skipping announcement notifications: missing dependency")
		return
	}
	members, _, err := s.memberRepo.ListByOrg(ctx, orgID, repository.MemberFilter{ListFilter: repository.ListFilter{Limit: 10000}})
	if err != nil {
		log.Error().Err(err).Msg("list org members for announcement notification")
		return
	}
	log.Debug().Int("member_count", len(members)).Str("author_id", authorID.String()).Msg("notifying org members about announcement")
	for _, m := range members {
		if m.UserID == authorID {
			continue // Don't notify the author
		}
		log.Debug().Str("user_id", m.UserID.String()).Str("type", ntype).Msg("enqueuing announcement notification")
		s.enqueueNotification(m.UserID.String(), orgID.String(), ntype, title, body, payload)
	}
}

func (s *AnnouncementService) enqueueActivity(orgID, entityType, entityID, action, actorID string, changes map[string]any) {
	if s.workerSrv == nil {
		return
	}
	task, err := worker.NewActivityLogTask(worker.ActivityLogPayload{
		OrgID:      orgID,
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		ActorID:    actorID,
		Changes:    changes,
	})
	if err != nil {
		log.Error().Err(err).Msg("build announcement activity log task")
		return
	}
	if err := s.workerSrv.Enqueue(task); err != nil {
		log.Error().Err(err).Msg("enqueue announcement activity log task")
	}
}
