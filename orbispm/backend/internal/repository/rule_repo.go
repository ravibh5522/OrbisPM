package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type taskRuleRepo struct {
	pool *pgxpool.Pool
}

func NewTaskRuleRepo(pool *pgxpool.Pool) TaskRuleRepository {
	return &taskRuleRepo{pool: pool}
}

func (r *taskRuleRepo) Create(ctx context.Context, tx pgx.Tx, rule *domain.TaskRule) (*domain.TaskRule, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO task_rules (org_id, task_id, rule_type, rule_config, is_required)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, org_id, task_id, rule_type, rule_config, is_required, created_at`,
		rule.OrgID, rule.TaskID, rule.RuleType, rule.RuleConfig, rule.IsRequired)

	var tr domain.TaskRule
	err := row.Scan(&tr.ID, &tr.OrgID, &tr.TaskID, &tr.RuleType, &tr.RuleConfig, &tr.IsRequired, &tr.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create task rule: %w", err)
	}
	return &tr, nil
}

func (r *taskRuleRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM task_rules WHERE id = $1`, id)
	return err
}

func (r *taskRuleRepo) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskRule, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, task_id, rule_type, rule_config, is_required, created_at
		 FROM task_rules WHERE task_id = $1 ORDER BY created_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []*domain.TaskRule
	for rows.Next() {
		var tr domain.TaskRule
		if err := rows.Scan(&tr.ID, &tr.OrgID, &tr.TaskID, &tr.RuleType, &tr.RuleConfig, &tr.IsRequired, &tr.CreatedAt); err != nil {
			return nil, err
		}
		rules = append(rules, &tr)
	}
	return rules, rows.Err()
}
