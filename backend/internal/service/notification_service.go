package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

type NotificationService struct {
	notifRepo repository.NotificationRepository
	txm       *repository.TxManager
}

func NewNotificationService(notifRepo repository.NotificationRepository, txm *repository.TxManager) *NotificationService {
	return &NotificationService{notifRepo: notifRepo, txm: txm}
}

func (s *NotificationService) List(ctx context.Context, userID uuid.UUID, limit, offset int) ([]*domain.Notification, int, error) {
	return s.notifRepo.ListByUser(ctx, userID, repository.ListFilter{Limit: limit, Offset: offset})
}

func (s *NotificationService) MarkRead(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.notifRepo.MarkRead(ctx, tx, id)
	})
}

func (s *NotificationService) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.notifRepo.MarkAllRead(ctx, tx, userID)
	})
}
