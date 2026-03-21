package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/messaging-service/internal/domain"
	"github.com/orbispm/messaging-service/internal/middleware"
	"github.com/orbispm/messaging-service/internal/repository"
)

// CategoryService handles channel category operations.
type CategoryService struct {
	txMgr   *repository.TxManager
	catRepo repository.CategoryRepository
}

// NewCategoryService creates a new CategoryService.
func NewCategoryService(txMgr *repository.TxManager, catRepo repository.CategoryRepository) *CategoryService {
	return &CategoryService{txMgr: txMgr, catRepo: catRepo}
}

// Create creates a new channel category.
func (s *CategoryService) Create(ctx context.Context, name string, position int) (*domain.ChannelCategory, error) {
	orgID := middleware.OrgIDFromCtx(ctx)
	cat := &domain.ChannelCategory{
		OrgID:    orgID,
		Name:     name,
		Position: position,
	}

	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		return s.catRepo.Create(ctx, tx, cat)
	})
	if err != nil {
		return nil, err
	}
	return cat, nil
}

// List lists all categories for the current org.
func (s *CategoryService) List(ctx context.Context) ([]domain.ChannelCategory, error) {
	var categories []domain.ChannelCategory
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		categories, err = s.catRepo.ListByOrg(ctx, tx)
		return err
	})
	if err != nil {
		return nil, err
	}
	if categories == nil {
		categories = []domain.ChannelCategory{}
	}
	return categories, nil
}

// Update updates a category's name and position.
func (s *CategoryService) Update(ctx context.Context, id uuid.UUID, name string, position int) error {
	return s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		cat, err := s.catRepo.GetByID(ctx, tx, id)
		if err != nil {
			return err
		}
		cat.Name = name
		cat.Position = position
		return s.catRepo.Update(ctx, tx, cat)
	})
}

// Delete deletes a category.
func (s *CategoryService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		return s.catRepo.Delete(ctx, tx, id)
	})
}

// SetChannelCategory assigns a channel to a category.
func (s *CategoryService) SetChannelCategory(ctx context.Context, channelID uuid.UUID, categoryID *uuid.UUID, position int) error {
	return s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		return s.catRepo.SetChannelCategory(ctx, tx, channelID, categoryID, position)
	})
}

// ToggleCollapsed toggles a user's collapsed state for a category.
func (s *CategoryService) ToggleCollapsed(ctx context.Context, categoryID uuid.UUID, collapsed bool) error {
	userID := middleware.UserIDFromCtx(ctx)
	return s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		return s.catRepo.SetUserCategoryCollapsed(ctx, tx, userID, categoryID, collapsed)
	})
}
