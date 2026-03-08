package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type taskDependencyRepo struct {
	pool *pgxpool.Pool
}

func NewTaskDependencyRepo(pool *pgxpool.Pool) TaskDependencyRepository {
	return &taskDependencyRepo{pool: pool}
}

func (r *taskDependencyRepo) Add(ctx context.Context, tx pgx.Tx, dep *domain.TaskDependency) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO task_dependencies (task_id, depends_on_id, type) VALUES ($1, $2, $3)`,
		dep.TaskID, dep.DependsOnID, dep.Type)
	if err != nil {
		return fmt.Errorf("add dependency: %w", err)
	}
	return nil
}

func (r *taskDependencyRepo) Remove(ctx context.Context, tx pgx.Tx, taskID, dependsOnID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_id = $2`,
		taskID, dependsOnID)
	return err
}

func (r *taskDependencyRepo) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskDependency, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT task_id, depends_on_id, type FROM task_dependencies WHERE task_id = $1`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deps []*domain.TaskDependency
	for rows.Next() {
		var d domain.TaskDependency
		if err := rows.Scan(&d.TaskID, &d.DependsOnID, &d.Type); err != nil {
			return nil, err
		}
		deps = append(deps, &d)
	}
	return deps, rows.Err()
}

func (r *taskDependencyRepo) ListDependents(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskDependency, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT task_id, depends_on_id, type FROM task_dependencies WHERE depends_on_id = $1`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deps []*domain.TaskDependency
	for rows.Next() {
		var d domain.TaskDependency
		if err := rows.Scan(&d.TaskID, &d.DependsOnID, &d.Type); err != nil {
			return nil, err
		}
		deps = append(deps, &d)
	}
	return deps, rows.Err()
}

// HasCycle uses a recursive CTE to detect if adding a dependency would create a cycle.
func (r *taskDependencyRepo) HasCycle(ctx context.Context, taskID, dependsOnID uuid.UUID) (bool, error) {
	var hasCycle bool
	err := r.pool.QueryRow(ctx,
		`WITH RECURSIVE dep_chain AS (
			SELECT depends_on_id FROM task_dependencies WHERE task_id = $2
			UNION ALL
			SELECT td.depends_on_id FROM task_dependencies td
			JOIN dep_chain dc ON dc.depends_on_id = td.task_id
		)
		SELECT EXISTS (SELECT 1 FROM dep_chain WHERE depends_on_id = $1)`,
		taskID, dependsOnID).Scan(&hasCycle)
	return hasCycle, err
}
