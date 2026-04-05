package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

type ActivityService struct {
	activityRepo repository.ActivityRepository
	txm          *repository.TxManager
}

func NewActivityService(activityRepo repository.ActivityRepository, txm *repository.TxManager) *ActivityService {
	return &ActivityService{activityRepo: activityRepo, txm: txm}
}

func (s *ActivityService) ListByEntity(ctx context.Context, entityType string, entityID uuid.UUID, limit, offset int) ([]*domain.ActivityLog, error) {
	return s.activityRepo.ListByEntity(ctx, entityType, entityID, repository.ListFilter{Limit: limit, Offset: offset})
}

func (s *ActivityService) ListByOrg(ctx context.Context, orgID uuid.UUID, filter repository.ActivityFilter) ([]*domain.ActivityLog, int, error) {
	return s.activityRepo.ListByOrg(ctx, orgID, filter)
}
