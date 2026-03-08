package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

type CreateRuleParams struct {
	OrgID      uuid.UUID      `json:"-"`
	TaskID     uuid.UUID      `json:"-"`
	RuleType   string         `json:"rule_type" validate:"required,oneof=all_checklists_done all_subtasks_complete reviewer_approved ai_approved custom"`
	RuleConfig map[string]any `json:"rule_config,omitempty"`
	IsRequired bool           `json:"is_required"`
}

type RuleService struct {
	ruleRepo repository.TaskRuleRepository
	txm      *repository.TxManager
}

func NewRuleService(ruleRepo repository.TaskRuleRepository, txm *repository.TxManager) *RuleService {
	return &RuleService{ruleRepo: ruleRepo, txm: txm}
}

func (s *RuleService) Create(ctx context.Context, params CreateRuleParams) (*domain.TaskRule, error) {
	if params.RuleConfig == nil {
		params.RuleConfig = map[string]any{}
	}
	rule := &domain.TaskRule{
		OrgID:      params.OrgID,
		TaskID:     params.TaskID,
		RuleType:   params.RuleType,
		RuleConfig: params.RuleConfig,
		IsRequired: params.IsRequired,
	}

	var created *domain.TaskRule
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.ruleRepo.Create(ctx, tx, rule)
		return err
	})
	return created, err
}

func (s *RuleService) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskRule, error) {
	return s.ruleRepo.ListByTask(ctx, taskID)
}

func (s *RuleService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.ruleRepo.Delete(ctx, tx, id)
	})
}
