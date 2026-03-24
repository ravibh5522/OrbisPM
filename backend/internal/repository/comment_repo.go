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

type commentRepo struct {
	pool *pgxpool.Pool
}

func NewCommentRepo(pool *pgxpool.Pool) CommentRepository {
	return &commentRepo{pool: pool}
}

func (r *commentRepo) Create(ctx context.Context, tx pgx.Tx, comment *domain.Comment) (*domain.Comment, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO comments (org_id, task_id, user_id, body, parent_id)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, org_id, task_id, user_id, body, parent_id, created_at, updated_at`,
		comment.OrgID, comment.TaskID, comment.UserID, comment.Body, comment.ParentID)

	var c domain.Comment
	err := row.Scan(&c.ID, &c.OrgID, &c.TaskID, &c.UserID, &c.Body, &c.ParentID, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create comment: %w", err)
	}
	return &c, nil
}

func (r *commentRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Comment, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, org_id, task_id, user_id, body, parent_id, created_at, updated_at
		 FROM comments WHERE id = $1`, id)
	var c domain.Comment
	err := row.Scan(&c.ID, &c.OrgID, &c.TaskID, &c.UserID, &c.Body, &c.ParentID, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func (r *commentRepo) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Comment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, task_id, user_id, body, parent_id, created_at, updated_at
		 FROM comments WHERE task_id = $1 ORDER BY created_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*domain.Comment
	for rows.Next() {
		var c domain.Comment
		if err := rows.Scan(&c.ID, &c.OrgID, &c.TaskID, &c.UserID, &c.Body, &c.ParentID, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		comments = append(comments, &c)
	}
	return comments, rows.Err()
}

func (r *commentRepo) ListByTaskPaginated(ctx context.Context, taskID uuid.UUID, limit, offset int) ([]*domain.Comment, int, error) {
	var total int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM comments WHERE task_id = $1`, taskID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, task_id, user_id, body, parent_id, created_at, updated_at
		 FROM comments WHERE task_id = $1 ORDER BY created_at LIMIT $2 OFFSET $3`, taskID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var comments []*domain.Comment
	for rows.Next() {
		var c domain.Comment
		if err := rows.Scan(&c.ID, &c.OrgID, &c.TaskID, &c.UserID, &c.Body, &c.ParentID, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, 0, err
		}
		comments = append(comments, &c)
	}
	return comments, total, rows.Err()
}

func (r *commentRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM comments WHERE id = $1`, id)
	return err
}
