package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type taskRepo struct {
	pool *pgxpool.Pool
}

func NewTaskRepo(pool *pgxpool.Pool) TaskRepository {
	return &taskRepo{pool: pool}
}

func (r *taskRepo) Create(ctx context.Context, tx pgx.Tx, task *domain.Task) (*domain.Task, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO tasks (org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		 RETURNING id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, created_at, updated_at`,
		task.OrgID, task.ProjectID, task.ParentTaskID, task.Title, nilStr(task.Description),
		task.Status, task.Priority, task.AssigneeID, task.ReporterID,
		task.Depth, task.Position, task.DueDate, task.StartDate,
		task.EstimatedHours, task.ActualHours, task.Labels, task.Metadata, task.ReviewStatus,
	)
	return scanTask(row)
}

func (r *taskRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, created_at, updated_at
		 FROM tasks WHERE id = $1`, id)
	t, err := scanTask(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get task: %w", err)
	}
	return t, nil
}

func (r *taskRepo) GetTree(ctx context.Context, rootTaskID uuid.UUID) ([]*domain.Task, error) {
	rows, err := r.pool.Query(ctx,
		`WITH RECURSIVE task_tree AS (
			SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
			  assignee_id, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
			  labels, metadata, review_status, created_at, updated_at,
			  ARRAY[id] AS path, ARRAY[position] AS sort_path
			FROM tasks WHERE id = $1
			UNION ALL
			SELECT t.id, t.org_id, t.project_id, t.parent_task_id, t.title, t.description, t.status, t.priority,
			  t.assignee_id, t.reporter_id, t.depth, t.position, t.due_date, t.start_date, t.estimated_hours, t.actual_hours,
			  t.labels, t.metadata, t.review_status, t.created_at, t.updated_at,
			  tt.path || t.id, tt.sort_path || t.position
			FROM tasks t
			INNER JOIN task_tree tt ON t.parent_task_id = tt.id
			WHERE t.depth <= 5 AND NOT t.id = ANY(tt.path)
		)
		SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, created_at, updated_at
		FROM task_tree ORDER BY sort_path`, rootTaskID)
	if err != nil {
		return nil, fmt.Errorf("get task tree: %w", err)
	}
	defer rows.Close()
	return collectTasks(rows)
}

func (r *taskRepo) List(ctx context.Context, projectID uuid.UUID, filter TaskFilter) ([]*domain.Task, int, error) {
	where := []string{"project_id = $1"}
	args := []any{projectID}
	argIdx := 2

	if filter.Status != nil {
		where = append(where, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, *filter.Status)
		argIdx++
	}
	if filter.Priority != nil {
		where = append(where, fmt.Sprintf("priority = $%d", argIdx))
		args = append(args, *filter.Priority)
		argIdx++
	}
	if filter.AssigneeID != nil {
		where = append(where, fmt.Sprintf("assignee_id = $%d", argIdx))
		args = append(args, *filter.AssigneeID)
		argIdx++
	}
	if filter.Search != nil && *filter.Search != "" {
		where = append(where, fmt.Sprintf("title ILIKE $%d", argIdx))
		args = append(args, "%"+*filter.Search+"%")
		argIdx++
	}

	whereClause := strings.Join(where, " AND ")

	// Count
	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM tasks WHERE %s`, whereClause)
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count tasks: %w", err)
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	query := fmt.Sprintf(
		`SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, created_at, updated_at
		 FROM tasks WHERE %s ORDER BY position, created_at LIMIT %d OFFSET %d`,
		whereClause, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()

	tasks, err := collectTasks(rows)
	if err != nil {
		return nil, 0, err
	}
	return tasks, total, nil
}

func (r *taskRepo) Update(ctx context.Context, tx pgx.Tx, task *domain.Task) (*domain.Task, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`UPDATE tasks SET title=$1, description=$2, status=$3, priority=$4,
		  assignee_id=$5, reporter_id=$6, depth=$7, position=$8, due_date=$9, start_date=$10,
		  estimated_hours=$11, actual_hours=$12, labels=$13, metadata=$14, review_status=$15,
		  parent_task_id=$16
		 WHERE id=$17
		 RETURNING id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, created_at, updated_at`,
		task.Title, nilStr(task.Description), task.Status, task.Priority,
		task.AssigneeID, task.ReporterID, task.Depth, task.Position,
		task.DueDate, task.StartDate, task.EstimatedHours, task.ActualHours,
		task.Labels, task.Metadata, task.ReviewStatus, task.ParentTaskID, task.ID,
	)
	return scanTask(row)
}

func (r *taskRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM tasks WHERE id = $1`, id)
	return err
}

func (r *taskRepo) CountByProject(ctx context.Context, projectID uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM tasks WHERE project_id = $1`, projectID).Scan(&count)
	return count, err
}

func scanTask(row pgx.Row) (*domain.Task, error) {
	var t domain.Task
	var desc *string
	err := row.Scan(
		&t.ID, &t.OrgID, &t.ProjectID, &t.ParentTaskID, &t.Title, &desc,
		&t.Status, &t.Priority, &t.AssigneeID, &t.ReporterID,
		&t.Depth, &t.Position, &t.DueDate, &t.StartDate,
		&t.EstimatedHours, &t.ActualHours, &t.Labels, &t.Metadata,
		&t.ReviewStatus, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if desc != nil {
		t.Description = *desc
	}
	if t.Labels == nil {
		t.Labels = []string{}
	}
	if t.Metadata == nil {
		t.Metadata = map[string]any{}
	}
	return &t, nil
}

func collectTasks(rows pgx.Rows) ([]*domain.Task, error) {
	var tasks []*domain.Task
	for rows.Next() {
		var t domain.Task
		var desc *string
		err := rows.Scan(
			&t.ID, &t.OrgID, &t.ProjectID, &t.ParentTaskID, &t.Title, &desc,
			&t.Status, &t.Priority, &t.AssigneeID, &t.ReporterID,
			&t.Depth, &t.Position, &t.DueDate, &t.StartDate,
			&t.EstimatedHours, &t.ActualHours, &t.Labels, &t.Metadata,
			&t.ReviewStatus, &t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		if desc != nil {
			t.Description = *desc
		}
		if t.Labels == nil {
			t.Labels = []string{}
		}
		if t.Metadata == nil {
			t.Metadata = map[string]any{}
		}
		tasks = append(tasks, &t)
	}
	return tasks, rows.Err()
}
