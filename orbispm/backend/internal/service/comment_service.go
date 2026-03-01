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

type CreateCommentParams struct {
	OrgID    uuid.UUID  `json:"-"`
	TaskID   uuid.UUID  `json:"-"`
	UserID   uuid.UUID  `json:"-"`
	Body     string     `json:"body" validate:"required,min=1"`
	ParentID *uuid.UUID `json:"parent_id,omitempty"`
}

type CommentService struct {
	commentRepo repository.CommentRepository
	txm         *repository.TxManager
	workerSrv   *worker.Server
}

func NewCommentService(commentRepo repository.CommentRepository, txm *repository.TxManager, workerSrv *worker.Server) *CommentService {
	return &CommentService{commentRepo: commentRepo, txm: txm, workerSrv: workerSrv}
}

func (s *CommentService) Create(ctx context.Context, params CreateCommentParams) (*domain.Comment, error) {
	comment := &domain.Comment{
		OrgID:    params.OrgID,
		TaskID:   params.TaskID,
		UserID:   params.UserID,
		Body:     params.Body,
		ParentID: params.ParentID,
	}

	var created *domain.Comment
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.commentRepo.Create(ctx, tx, comment)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("create comment: %w", err)
	}

	// Enqueue activity log
	s.enqueueActivity(created.OrgID.String(), "comment", created.ID.String(), "created", created.UserID.String())

	return created, nil
}

func (s *CommentService) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Comment, error) {
	return s.commentRepo.ListByTask(ctx, taskID)
}

func (s *CommentService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.commentRepo.Delete(ctx, tx, id)
	})
}

// --- Worker helper ---

func (s *CommentService) enqueueActivity(orgID, entityType, entityID, action, actorID string) {
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
