package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type checklistRepo struct {
	pool *pgxpool.Pool
}

func NewChecklistRepo(pool *pgxpool.Pool) ChecklistRepository {
	return &checklistRepo{pool: pool}
}

func (r *checklistRepo) Create(ctx context.Context, tx pgx.Tx, item *domain.Checklist) (*domain.Checklist, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO checklists (org_id, task_id, title, is_checked, position)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, org_id, task_id, title, is_checked, position, created_at`,
		item.OrgID, item.TaskID, item.Title, item.IsChecked, item.Position)
	return scanChecklist(row)
}

func (r *checklistRepo) Update(ctx context.Context, tx pgx.Tx, item *domain.Checklist) (*domain.Checklist, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`UPDATE checklists SET title=$1, is_checked=$2, position=$3 WHERE id=$4
		 RETURNING id, org_id, task_id, title, is_checked, position, created_at`,
		item.Title, item.IsChecked, item.Position, item.ID)
	return scanChecklist(row)
}

func (r *checklistRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM checklists WHERE id = $1`, id)
	return err
}

func (r *checklistRepo) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Checklist, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, task_id, title, is_checked, position, created_at
		 FROM checklists WHERE task_id = $1 ORDER BY position`, taskID)
	if err != nil {
		return nil, fmt.Errorf("list checklists: %w", err)
	}
	defer rows.Close()

	var items []*domain.Checklist
	for rows.Next() {
		var c domain.Checklist
		if err := rows.Scan(&c.ID, &c.OrgID, &c.TaskID, &c.Title, &c.IsChecked, &c.Position, &c.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, &c)
	}
	return items, rows.Err()
}

func (r *checklistRepo) CountChecked(ctx context.Context, taskID uuid.UUID) (int, int, error) {
	var checked, total int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FILTER (WHERE is_checked), COUNT(*) FROM checklists WHERE task_id = $1`, taskID).
		Scan(&checked, &total)
	return checked, total, err
}

func scanChecklist(row pgx.Row) (*domain.Checklist, error) {
	var c domain.Checklist
	err := row.Scan(&c.ID, &c.OrgID, &c.TaskID, &c.Title, &c.IsChecked, &c.Position, &c.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}
