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
		  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
		 RETURNING id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at`,
		task.OrgID, task.ProjectID, task.ParentTaskID, task.Title, nilStr(task.Description),
		task.Status, task.Priority, task.AssigneeID, task.AssigneeIDs, task.ReporterID,
		task.Depth, task.Position, task.DueDate, task.StartDate,
		task.EstimatedHours, task.ActualHours, task.Labels, task.Metadata, task.ReviewStatus,
		task.RecurrenceRule, task.RecurrenceParentID, task.NextOccurrence,
	)
	return scanTask(row)
}

func (r *taskRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at
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

func (r *taskRepo) GetByIDTx(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*domain.Task, error) {
	row := tx.QueryRow(ctx,
		`SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at
		 FROM tasks WHERE id = $1`, id)
	t, err := scanTask(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get task tx: %w", err)
	}
	return t, nil
}

func (r *taskRepo) GetTree(ctx context.Context, rootTaskID uuid.UUID) ([]*domain.Task, error) {
	rows, err := r.pool.Query(ctx, treeSQL, rootTaskID)
	if err != nil {
		return nil, fmt.Errorf("get task tree: %w", err)
	}
	defer rows.Close()
	return collectTasks(rows)
}

const treeSQL = `WITH RECURSIVE task_tree AS (
	SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
	  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
	  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at,
	  ARRAY[id] AS path, ARRAY[position] AS sort_path
	FROM tasks WHERE id = $1
	UNION ALL
	SELECT t.id, t.org_id, t.project_id, t.parent_task_id, t.title, t.description, t.status, t.priority,
	  t.assignee_id, t.assignee_ids, t.reporter_id, t.depth, t.position, t.due_date, t.start_date, t.estimated_hours, t.actual_hours,
	  t.labels, t.metadata, t.review_status, t.recurrence_rule, t.recurrence_parent_id, t.next_occurrence, t.version, t.created_at, t.updated_at,
	  tt.path || t.id, tt.sort_path || t.position
	FROM tasks t
	INNER JOIN task_tree tt ON t.parent_task_id = tt.id
	WHERE t.depth <= 3 AND NOT t.id = ANY(tt.path)
)
SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at
FROM task_tree ORDER BY sort_path`

func (r *taskRepo) GetTreeTx(ctx context.Context, tx pgx.Tx, rootTaskID uuid.UUID) ([]*domain.Task, error) {
	rows, err := tx.Query(ctx, treeSQL, rootTaskID)
	if err != nil {
		return nil, fmt.Errorf("get task tree tx: %w", err)
	}
	defer rows.Close()
	return collectTasks(rows)
}

func (r *taskRepo) ListTreeByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.Task, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at
		FROM tasks WHERE project_id = $1
		ORDER BY depth, position, created_at`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list tree by project: %w", err)
	}
	defer rows.Close()
	return collectTasks(rows)
}

func (r *taskRepo) List(ctx context.Context, projectID uuid.UUID, filter TaskFilter) ([]*domain.Task, int, error) {
	where := []string{"project_id = $1"}
	args := []any{projectID}
	argIdx := 2

	// Status: multi takes precedence over single
	if len(filter.Statuses) > 0 {
		placeholders := make([]string, len(filter.Statuses))
		for i, s := range filter.Statuses {
			placeholders[i] = fmt.Sprintf("$%d", argIdx)
			args = append(args, s)
			argIdx++
		}
		where = append(where, fmt.Sprintf("status IN (%s)", strings.Join(placeholders, ",")))
	} else if filter.Status != nil {
		where = append(where, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, *filter.Status)
		argIdx++
	}
	// Priority: multi takes precedence over single
	if len(filter.Priorities) > 0 {
		placeholders := make([]string, len(filter.Priorities))
		for i, p := range filter.Priorities {
			placeholders[i] = fmt.Sprintf("$%d", argIdx)
			args = append(args, p)
			argIdx++
		}
		where = append(where, fmt.Sprintf("priority IN (%s)", strings.Join(placeholders, ",")))
	} else if filter.Priority != nil {
		where = append(where, fmt.Sprintf("priority = $%d", argIdx))
		args = append(args, *filter.Priority)
		argIdx++
	}
	// Assignee: multi takes precedence over single
	if len(filter.AssigneeIDs) > 0 {
		placeholders := make([]string, len(filter.AssigneeIDs))
		for i, aid := range filter.AssigneeIDs {
			placeholders[i] = fmt.Sprintf("($%d = ANY(assignee_ids) OR assignee_id = $%d)", argIdx, argIdx)
			args = append(args, aid)
			argIdx++
			_ = i
		}
		where = append(where, "("+strings.Join(placeholders, " OR ")+")")
	} else if filter.AssigneeID != nil {
		where = append(where, fmt.Sprintf("($%d = ANY(assignee_ids) OR assignee_id = $%d)", argIdx, argIdx))
		args = append(args, *filter.AssigneeID)
		argIdx++
	}
	if filter.Search != nil && *filter.Search != "" {
		where = append(where, fmt.Sprintf("title ILIKE $%d", argIdx))
		args = append(args, "%"+*filter.Search+"%")
		argIdx++
	}
	if filter.ParentID != nil {
		if *filter.ParentID == "root" {
			where = append(where, "parent_task_id IS NULL")
		} else {
			where = append(where, fmt.Sprintf("parent_task_id = $%d", argIdx))
			args = append(args, *filter.ParentID)
			argIdx++
		}
	}
	if len(filter.Labels) > 0 {
		where = append(where, fmt.Sprintf("labels && $%d", argIdx))
		args = append(args, filter.Labels)
		argIdx++
	}
	if filter.DueDateFrom != nil && *filter.DueDateFrom != "" {
		where = append(where, fmt.Sprintf("due_date >= $%d", argIdx))
		args = append(args, *filter.DueDateFrom)
		argIdx++
	}
	if filter.DueDateTo != nil && *filter.DueDateTo != "" {
		where = append(where, fmt.Sprintf("due_date <= $%d", argIdx))
		args = append(args, *filter.DueDateTo)
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

	// Determine ORDER BY clause
	orderClause := "position, created_at"
	allowedSortCols := map[string]string{
		"title":      "title",
		"status":     "status",
		"priority":   "priority",
		"due_date":   "due_date",
		"created_at": "created_at",
		"updated_at": "updated_at",
		"position":   "position",
	}
	if filter.SortBy != "" {
		if col, ok := allowedSortCols[filter.SortBy]; ok {
			dir := "ASC"
			if filter.SortOrder == "desc" {
				dir = "DESC"
			}
			orderClause = fmt.Sprintf("%s %s, created_at", col, dir)
		}
	}

	query := fmt.Sprintf(
		`SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at
		 FROM tasks WHERE %s ORDER BY %s LIMIT %d OFFSET %d`,
		whereClause, orderClause, limit, offset)

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
		  assignee_id=$5, assignee_ids=$6, reporter_id=$7, depth=$8, position=$9, due_date=$10, start_date=$11,
		  estimated_hours=$12, actual_hours=$13, labels=$14, metadata=$15, review_status=$16,
		  parent_task_id=$17, recurrence_rule=$18, recurrence_parent_id=$19, next_occurrence=$20
		 WHERE id=$21
		 RETURNING id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at`,
		task.Title, nilStr(task.Description), task.Status, task.Priority,
		task.AssigneeID, task.AssigneeIDs, task.ReporterID, task.Depth, task.Position,
		task.DueDate, task.StartDate, task.EstimatedHours, task.ActualHours,
		task.Labels, task.Metadata, task.ReviewStatus, task.ParentTaskID,
		task.RecurrenceRule, task.RecurrenceParentID, task.NextOccurrence, task.ID,
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
		&t.Status, &t.Priority, &t.AssigneeID, &t.AssigneeIDs, &t.ReporterID,
		&t.Depth, &t.Position, &t.DueDate, &t.StartDate,
		&t.EstimatedHours, &t.ActualHours, &t.Labels, &t.Metadata,
		&t.ReviewStatus, &t.RecurrenceRule, &t.RecurrenceParentID, &t.NextOccurrence,
		&t.Version, &t.CreatedAt, &t.UpdatedAt,
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
	if t.AssigneeIDs == nil {
		t.AssigneeIDs = []uuid.UUID{}
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
			&t.Status, &t.Priority, &t.AssigneeID, &t.AssigneeIDs, &t.ReporterID,
			&t.Depth, &t.Position, &t.DueDate, &t.StartDate,
			&t.EstimatedHours, &t.ActualHours, &t.Labels, &t.Metadata,
			&t.ReviewStatus, &t.RecurrenceRule, &t.RecurrenceParentID, &t.NextOccurrence,
			&t.Version, &t.CreatedAt, &t.UpdatedAt,
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
		if t.AssigneeIDs == nil {
			t.AssigneeIDs = []uuid.UUID{}
		}
		if t.Metadata == nil {
			t.Metadata = map[string]any{}
		}
		tasks = append(tasks, &t)
	}
	return tasks, rows.Err()
}

// ListByOrgAndAssignee returns tasks assigned to a user across all projects in an org.
func (r *taskRepo) ListByOrgAndAssignee(ctx context.Context, orgID, assigneeID uuid.UUID, limit, offset int) ([]*domain.Task, int, error) {
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	var total int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks WHERE org_id = $1 AND ($2 = ANY(assignee_ids) OR assignee_id = $2)`, orgID, assigneeID,
	).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count assigned tasks: %w", err)
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at
		 FROM tasks WHERE org_id = $1 AND ($2 = ANY(assignee_ids) OR assignee_id = $2)
		 ORDER BY
		   CASE WHEN status = 'in_progress' THEN 0 WHEN status = 'todo' THEN 1 WHEN status = 'blocked' THEN 2 ELSE 3 END,
		   CASE WHEN due_date IS NOT NULL AND due_date < NOW() THEN 0 ELSE 1 END,
		   due_date NULLS LAST,
		   created_at DESC
		 LIMIT $3 OFFSET $4`,
		orgID, assigneeID, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list assigned tasks: %w", err)
	}
	defer rows.Close()

	tasks, err := collectTasks(rows)
	if err != nil {
		return nil, 0, err
	}
	return tasks, total, nil
}

// UpdatePosition updates the position of a task among its siblings.
func (r *taskRepo) UpdatePosition(ctx context.Context, tx pgx.Tx, id uuid.UUID, position int) error {
	_, err := tx.Exec(ctx, `UPDATE tasks SET position = $1, updated_at = NOW() WHERE id = $2`, position, id)
	if err != nil {
		return fmt.Errorf("update task position: %w", err)
	}
	return nil
}

// GetAncestors walks up the parent chain and returns all ancestors (immediate parent first).
func (r *taskRepo) GetAncestors(ctx context.Context, taskID uuid.UUID) ([]*domain.Task, error) {
	rows, err := r.pool.Query(ctx,
		`WITH RECURSIVE ancestors AS (
			SELECT parent_task_id FROM tasks WHERE id = $1
			UNION ALL
			SELECT t.parent_task_id FROM tasks t
			INNER JOIN ancestors a ON t.id = a.parent_task_id
		)
		SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at
		FROM tasks WHERE id IN (SELECT parent_task_id FROM ancestors WHERE parent_task_id IS NOT NULL)
		ORDER BY depth DESC`, taskID)
	if err != nil {
		return nil, fmt.Errorf("get ancestors: %w", err)
	}
	defer rows.Close()
	return collectTasks(rows)
}

// GetAncestorsTx is the transaction-aware version of GetAncestors.
func (r *taskRepo) GetAncestorsTx(ctx context.Context, tx pgx.Tx, taskID uuid.UUID) ([]*domain.Task, error) {
	rows, err := tx.Query(ctx,
		`WITH RECURSIVE ancestors AS (
			SELECT parent_task_id FROM tasks WHERE id = $1
			UNION ALL
			SELECT t.parent_task_id FROM tasks t
			INNER JOIN ancestors a ON t.id = a.parent_task_id
		)
		SELECT id, org_id, project_id, parent_task_id, title, description, status, priority,
		  assignee_id, assignee_ids, reporter_id, depth, position, due_date, start_date, estimated_hours, actual_hours,
		  labels, metadata, review_status, recurrence_rule, recurrence_parent_id, next_occurrence, version, created_at, updated_at
		FROM tasks WHERE id IN (SELECT parent_task_id FROM ancestors WHERE parent_task_id IS NOT NULL)
		ORDER BY depth DESC`, taskID)
	if err != nil {
		return nil, fmt.Errorf("get ancestors tx: %w", err)
	}
	defer rows.Close()
	return collectTasks(rows)
}

// Reparent moves a task under a new parent (or to root if newParentID is nil) and sets its position.
func (r *taskRepo) Reparent(ctx context.Context, tx pgx.Tx, id uuid.UUID, newParentID *uuid.UUID, position int) error {
	newDepth := 0
	if newParentID != nil {
		var parentDepth int
		err := tx.QueryRow(ctx, `SELECT depth FROM tasks WHERE id = $1`, *newParentID).Scan(&parentDepth)
		if err != nil {
			return fmt.Errorf("get parent depth: %w", err)
		}
		newDepth = parentDepth + 1
	}

	// Get current depth to compute delta for children
	var oldDepth int
	err := tx.QueryRow(ctx, `SELECT depth FROM tasks WHERE id = $1`, id).Scan(&oldDepth)
	if err != nil {
		return fmt.Errorf("get old depth: %w", err)
	}
	depthDelta := newDepth - oldDepth

	_, err = tx.Exec(ctx,
		`UPDATE tasks SET parent_task_id = $1, depth = $2, position = $3, updated_at = NOW() WHERE id = $4`,
		newParentID, newDepth, position, id,
	)
	if err != nil {
		return fmt.Errorf("reparent task: %w", err)
	}

	// Recursively update all descendant depths
	if depthDelta != 0 {
		_, err = tx.Exec(ctx,
			`WITH RECURSIVE descendants AS (
				SELECT id FROM tasks WHERE parent_task_id = $1
				UNION ALL
				SELECT t.id FROM tasks t JOIN descendants d ON t.parent_task_id = d.id
			)
			UPDATE tasks SET depth = depth + $2, updated_at = NOW()
			WHERE id IN (SELECT id FROM descendants)`,
			id, depthDelta,
		)
		if err != nil {
			return fmt.Errorf("update descendant depths: %w", err)
		}
	}
	return nil
}

// ReassignOrUnassignTasks bulk-reassigns tasks within a project from old users to a new user (or unassigns if newUserID is nil).
// It updates both the legacy assignee_id (single) and the assignee_ids (multi) array.
// Returns the total number of affected rows.
func (r *taskRepo) ReassignOrUnassignTasks(ctx context.Context, tx pgx.Tx, projectID uuid.UUID, oldUserIDs []uuid.UUID, newUserID *uuid.UUID) (int64, error) {
	q := conn(r.pool, tx)

	if newUserID != nil {
		// Replace old users in assignee_ids array with new user, update assignee_id if it matched
		tag, err := q.Exec(ctx,
			`UPDATE tasks
			 SET assignee_ids = (
			       SELECT COALESCE(array_agg(DISTINCT uid), ARRAY[$3::uuid]) FROM (
			         SELECT uid FROM unnest(assignee_ids) AS uid
			         WHERE uid != ALL($2::uuid[])
			         UNION
			         SELECT $3::uuid
			       ) sub
			     ),
			     assignee_id = CASE WHEN assignee_id = ANY($2::uuid[]) THEN $3 ELSE assignee_id END,
			     updated_at = NOW()
			 WHERE project_id = $1
			   AND (assignee_id = ANY($2::uuid[]) OR assignee_ids && $2::uuid[])`,
			projectID, oldUserIDs, *newUserID,
		)
		if err != nil {
			return 0, fmt.Errorf("reassign tasks: %w", err)
		}
		return tag.RowsAffected(), nil
	}

	// Unassign: remove old users from assignee_ids, clear assignee_id if it matched
	tag, err := q.Exec(ctx,
		`UPDATE tasks
		 SET assignee_ids = (
		       SELECT COALESCE(array_agg(x), '{}')
		       FROM unnest(assignee_ids) AS x
		       WHERE x != ALL($2::uuid[])
		     ),
		     assignee_id = CASE WHEN assignee_id = ANY($2::uuid[]) THEN NULL ELSE assignee_id END,
		     updated_at = NOW()
		 WHERE project_id = $1
		   AND (assignee_id = ANY($2::uuid[]) OR assignee_ids && $2::uuid[])`,
		projectID, oldUserIDs,
	)
	if err != nil {
		return 0, fmt.Errorf("unassign tasks: %w", err)
	}
	return tag.RowsAffected(), nil
}

// CountByAssigneesInProject returns a map of user_id → task count for the given user IDs within a project.
func (r *taskRepo) CountByAssigneesInProject(ctx context.Context, projectID uuid.UUID, userIDs []uuid.UUID) (map[uuid.UUID]int, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT u.uid, COUNT(*)
		 FROM unnest($2::uuid[]) AS u(uid)
		 JOIN tasks t ON t.project_id = $1 AND (t.assignee_id = u.uid OR u.uid = ANY(t.assignee_ids))
		 GROUP BY u.uid`,
		projectID, userIDs,
	)
	if err != nil {
		return nil, fmt.Errorf("count tasks by assignees: %w", err)
	}
	defer rows.Close()

	result := make(map[uuid.UUID]int, len(userIDs))
	for rows.Next() {
		var uid uuid.UUID
		var cnt int
		if err := rows.Scan(&uid, &cnt); err != nil {
			return nil, err
		}
		result[uid] = cnt
	}
	return result, rows.Err()
}
