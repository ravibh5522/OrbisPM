package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

type StickyNoteService struct {
	repo repository.StickyNoteRepository
	txm  *repository.TxManager
}

func NewStickyNoteService(repo repository.StickyNoteRepository, txm *repository.TxManager) *StickyNoteService {
	return &StickyNoteService{repo: repo, txm: txm}
}

func (s *StickyNoteService) Create(ctx context.Context, note *domain.StickyNote) (*domain.StickyNote, error) {
	var result *domain.StickyNote
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		n, err := s.repo.Create(ctx, tx, note)
		if err != nil {
			return fmt.Errorf("create sticky note: %w", err)
		}
		result = n
		return nil
	})
	return result, err
}

func (s *StickyNoteService) GetByID(ctx context.Context, id, userID uuid.UUID) (*domain.StickyNote, error) {
	return s.repo.GetByID(ctx, id, userID)
}

func (s *StickyNoteService) Update(ctx context.Context, note *domain.StickyNote) (*domain.StickyNote, error) {
	var result *domain.StickyNote
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		n, err := s.repo.Update(ctx, tx, note)
		if err != nil {
			return fmt.Errorf("update sticky note: %w", err)
		}
		result = n
		return nil
	})
	return result, err
}

func (s *StickyNoteService) Delete(ctx context.Context, id, userID uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.repo.Delete(ctx, tx, id, userID)
	})
}

func (s *StickyNoteService) List(ctx context.Context, userID uuid.UUID, limit, offset int) ([]*domain.StickyNote, int, error) {
	return s.repo.ListByUser(ctx, userID, repository.ListFilter{Limit: limit, Offset: offset})
}

func (s *StickyNoteService) Stats(ctx context.Context, userID uuid.UUID) (*domain.StickyNoteStats, error) {
	return s.repo.Stats(ctx, userID)
}
