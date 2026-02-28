package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
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
}

func NewCommentService(commentRepo repository.CommentRepository, txm *repository.TxManager) *CommentService {
	return &CommentService{commentRepo: commentRepo, txm: txm}
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
