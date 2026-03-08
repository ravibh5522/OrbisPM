package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type taskWatcherRepo struct {
	pool *pgxpool.Pool
}

func NewTaskWatcherRepo(pool *pgxpool.Pool) TaskWatcherRepository {
	return &taskWatcherRepo{pool: pool}
}

func (r *taskWatcherRepo) Add(ctx context.Context, tx pgx.Tx, taskID, userID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO task_watchers (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		taskID, userID)
	if err != nil {
		return fmt.Errorf("add watcher: %w", err)
	}
	return nil
}

func (r *taskWatcherRepo) Remove(ctx context.Context, tx pgx.Tx, taskID, userID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM task_watchers WHERE task_id = $1 AND user_id = $2`, taskID, userID)
	return err
}

func (r *taskWatcherRepo) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskWatcher, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT task_id, user_id FROM task_watchers WHERE task_id = $1`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var watchers []*domain.TaskWatcher
	for rows.Next() {
		var w domain.TaskWatcher
		if err := rows.Scan(&w.TaskID, &w.UserID); err != nil {
			return nil, err
		}
		watchers = append(watchers, &w)
	}
	return watchers, rows.Err()
}

func (r *taskWatcherRepo) IsWatching(ctx context.Context, taskID, userID uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM task_watchers WHERE task_id = $1 AND user_id = $2)`,
		taskID, userID).Scan(&exists)
	return exists, err
}
