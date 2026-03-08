package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// WatcherService handles task watcher business logic.
type WatcherService struct {
	watcherRepo repository.TaskWatcherRepository
	txm         *repository.TxManager
}

// NewWatcherService creates a new WatcherService.
func NewWatcherService(watcherRepo repository.TaskWatcherRepository, txm *repository.TxManager) *WatcherService {
	return &WatcherService{watcherRepo: watcherRepo, txm: txm}
}

// Watch adds a user as a watcher of a task.
func (s *WatcherService) Watch(ctx context.Context, taskID, userID uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.watcherRepo.Add(ctx, tx, taskID, userID)
	})
}

// Unwatch removes a user as a watcher of a task.
func (s *WatcherService) Unwatch(ctx context.Context, taskID, userID uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.watcherRepo.Remove(ctx, tx, taskID, userID)
	})
}

// ListByTask returns all watchers for a task.
func (s *WatcherService) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskWatcher, error) {
	return s.watcherRepo.ListByTask(ctx, taskID)
}

// IsWatching checks if a user is watching a task.
func (s *WatcherService) IsWatching(ctx context.Context, taskID, userID uuid.UUID) (bool, error) {
	return s.watcherRepo.IsWatching(ctx, taskID, userID)
}
