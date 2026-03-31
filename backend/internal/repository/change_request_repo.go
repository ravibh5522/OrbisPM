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

type changeRequestRepo struct {
	pool *pgxpool.Pool
}

func NewChangeRequestRepo(pool *pgxpool.Pool) TaskChangeRequestRepository {
	return &changeRequestRepo{pool: pool}
}

func (r *changeRequestRepo) Create(ctx context.Context, tx pgx.Tx, cr *domain.TaskChangeRequest) (*domain.TaskChangeRequest, error) {
	q := conn(r.pool, tx)
	var created domain.TaskChangeRequest
	var reason, reviewNote *string
	err := q.QueryRow(ctx,
		`INSERT INTO task_change_requests (org_id, task_id, proposer_id, status, changes, reason)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, org_id, task_id, proposer_id, reviewer_id, status, changes, reason, review_note, created_at, reviewed_at`,
		cr.OrgID, cr.TaskID, cr.ProposerID, domain.CRPending, cr.Changes, nilStr(cr.Reason)).Scan(
		&created.ID, &created.OrgID, &created.TaskID, &created.ProposerID,
		&created.ReviewerID, &created.Status, &created.Changes,
		&reason, &reviewNote, &created.CreatedAt, &created.ReviewedAt)
	if err != nil {
		return nil, fmt.Errorf("create change request: %w", err)
	}
	if reason != nil {
		created.Reason = *reason
	}
	if reviewNote != nil {
		created.ReviewNote = *reviewNote
	}
	return &created, nil
}

func (r *changeRequestRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.TaskChangeRequest, error) {
	var cr domain.TaskChangeRequest
	var reason, reviewNote *string
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, task_id, proposer_id, reviewer_id, status, changes, reason, review_note, created_at, reviewed_at
		 FROM task_change_requests WHERE id = $1`, id).Scan(
		&cr.ID, &cr.OrgID, &cr.TaskID, &cr.ProposerID,
		&cr.ReviewerID, &cr.Status, &cr.Changes,
		&reason, &reviewNote, &cr.CreatedAt, &cr.ReviewedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get change request: %w", err)
	}
	if reason != nil {
		cr.Reason = *reason
	}
	if reviewNote != nil {
		cr.ReviewNote = *reviewNote
	}
	return &cr, nil
}

func (r *changeRequestRepo) Update(ctx context.Context, tx pgx.Tx, cr *domain.TaskChangeRequest) (*domain.TaskChangeRequest, error) {
	q := conn(r.pool, tx)
	var updated domain.TaskChangeRequest
	var reason, reviewNote *string
	err := q.QueryRow(ctx,
		`UPDATE task_change_requests
		 SET reviewer_id=$1, status=$2, review_note=$3, reviewed_at=$4
		 WHERE id=$5
		 RETURNING id, org_id, task_id, proposer_id, reviewer_id, status, changes, reason, review_note, created_at, reviewed_at`,
		cr.ReviewerID, cr.Status, nilStr(cr.ReviewNote), cr.ReviewedAt, cr.ID).Scan(
		&updated.ID, &updated.OrgID, &updated.TaskID, &updated.ProposerID,
		&updated.ReviewerID, &updated.Status, &updated.Changes,
		&reason, &reviewNote, &updated.CreatedAt, &updated.ReviewedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("update change request: %w", err)
	}
	if reason != nil {
		updated.Reason = *reason
	}
	if reviewNote != nil {
		updated.ReviewNote = *reviewNote
	}
	return &updated, nil
}

func (r *changeRequestRepo) ListByTask(ctx context.Context, taskID uuid.UUID, status *string) ([]*domain.TaskChangeRequest, error) {
	var rows pgx.Rows
	var err error
	if status != nil {
		rows, err = r.pool.Query(ctx,
			`SELECT id, org_id, task_id, proposer_id, reviewer_id, status, changes, reason, review_note, created_at, reviewed_at
			 FROM task_change_requests WHERE task_id = $1 AND status = $2
			 ORDER BY created_at DESC`, taskID, *status)
	} else {
		rows, err = r.pool.Query(ctx,
			`SELECT id, org_id, task_id, proposer_id, reviewer_id, status, changes, reason, review_note, created_at, reviewed_at
			 FROM task_change_requests WHERE task_id = $1
			 ORDER BY created_at DESC`, taskID)
	}
	if err != nil {
		return nil, fmt.Errorf("list change requests by task: %w", err)
	}
	defer rows.Close()
	return scanChangeRequests(rows)
}

func (r *changeRequestRepo) ListByProject(ctx context.Context, projectID uuid.UUID, status *string, search *string, proposerID *uuid.UUID, limit, offset int) ([]*domain.TaskChangeRequest, int, error) {
	// Build dynamic WHERE conditions
	conds := []string{"t.project_id = $1"}
	args := []any{projectID}
	next := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	if status != nil {
		conds = append(conds, "cr.status = "+next(*status))
	}
	if proposerID != nil {
		conds = append(conds, "cr.proposer_id = "+next(*proposerID))
	}
	if search != nil && *search != "" {
		conds = append(conds, "(cr.reason ILIKE "+next("%"+*search+"%")+" OR t.title ILIKE "+next("%"+*search+"%")+")")
	}

	where := "WHERE " + strings.Join(conds, " AND ")

	// Count
	var total int
	countSQL := fmt.Sprintf(
		`SELECT COUNT(*) FROM task_change_requests cr JOIN tasks t ON t.id = cr.task_id %s`, where)
	if err := r.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count change requests: %w", err)
	}

	// Fetch
	limitArg := next(limit)
	offsetArg := next(offset)
	dataSQL := fmt.Sprintf(
		`SELECT cr.id, cr.org_id, cr.task_id, cr.proposer_id, cr.reviewer_id, cr.status, cr.changes, cr.reason, cr.review_note, cr.created_at, cr.reviewed_at
		 FROM task_change_requests cr
		 JOIN tasks t ON t.id = cr.task_id
		 %s
		 ORDER BY cr.created_at DESC
		 LIMIT %s OFFSET %s`, where, limitArg, offsetArg)

	rows, err := r.pool.Query(ctx, dataSQL, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list change requests by project: %w", err)
	}
	defer rows.Close()

	crs, err := scanChangeRequests(rows)
	if err != nil {
		return nil, 0, err
	}
	return crs, total, nil
}

func (r *changeRequestRepo) CountPendingByTask(ctx context.Context, taskID uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM task_change_requests WHERE task_id = $1 AND status = 'pending'`,
		taskID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count pending change requests: %w", err)
	}
	return count, nil
}

func scanChangeRequests(rows pgx.Rows) ([]*domain.TaskChangeRequest, error) {
	var results []*domain.TaskChangeRequest
	for rows.Next() {
		var cr domain.TaskChangeRequest
		var reason, reviewNote *string
		if err := rows.Scan(
			&cr.ID, &cr.OrgID, &cr.TaskID, &cr.ProposerID,
			&cr.ReviewerID, &cr.Status, &cr.Changes,
			&reason, &reviewNote, &cr.CreatedAt, &cr.ReviewedAt,
		); err != nil {
			return nil, err
		}
		if reason != nil {
			cr.Reason = *reason
		}
		if reviewNote != nil {
			cr.ReviewNote = *reviewNote
		}
		results = append(results, &cr)
	}
	return results, rows.Err()
}
