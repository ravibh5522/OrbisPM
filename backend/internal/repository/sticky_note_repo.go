package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type stickyNoteRepo struct {
	pool *pgxpool.Pool
}

func NewStickyNoteRepo(pool *pgxpool.Pool) StickyNoteRepository {
	return &stickyNoteRepo{pool: pool}
}

func (r *stickyNoteRepo) Create(ctx context.Context, tx pgx.Tx, n *domain.StickyNote) (*domain.StickyNote, error) {
	q := conn(r.pool, tx)
	cpJSON, err := json.Marshal(n.Checkpoints)
	if err != nil {
		return nil, fmt.Errorf("marshal checkpoints: %w", err)
	}

	row := q.QueryRow(ctx,
		`INSERT INTO sticky_notes (user_id, title, description, color, priority, start_date, due_date, completed, checkpoints)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, user_id, title, description, color, priority, start_date, due_date, completed, checkpoints, created_at, updated_at`,
		n.UserID, n.Title, n.Description, n.Color, n.Priority, n.StartDate, n.DueDate, n.Completed, cpJSON)

	return scanStickyNote(row)
}

func (r *stickyNoteRepo) GetByID(ctx context.Context, id, userID uuid.UUID) (*domain.StickyNote, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, user_id, title, description, color, priority, start_date, due_date, completed, checkpoints, created_at, updated_at
		 FROM sticky_notes WHERE id = $1 AND user_id = $2`, id, userID)
	return scanStickyNote(row)
}

func (r *stickyNoteRepo) Update(ctx context.Context, tx pgx.Tx, n *domain.StickyNote) (*domain.StickyNote, error) {
	q := conn(r.pool, tx)
	cpJSON, err := json.Marshal(n.Checkpoints)
	if err != nil {
		return nil, fmt.Errorf("marshal checkpoints: %w", err)
	}

	row := q.QueryRow(ctx,
		`UPDATE sticky_notes
		 SET title = $1, description = $2, color = $3, priority = $4, start_date = $5, due_date = $6, completed = $7, checkpoints = $8, updated_at = now()
		 WHERE id = $9 AND user_id = $10
		 RETURNING id, user_id, title, description, color, priority, start_date, due_date, completed, checkpoints, created_at, updated_at`,
		n.Title, n.Description, n.Color, n.Priority, n.StartDate, n.DueDate, n.Completed, cpJSON, n.ID, n.UserID)

	return scanStickyNote(row)
}

func (r *stickyNoteRepo) Delete(ctx context.Context, tx pgx.Tx, id, userID uuid.UUID) error {
	q := conn(r.pool, tx)
	tag, err := q.Exec(ctx, `DELETE FROM sticky_notes WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *stickyNoteRepo) ListByUser(ctx context.Context, userID uuid.UUID, filter ListFilter) ([]*domain.StickyNote, int, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	var total int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM sticky_notes WHERE user_id = $1`, userID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, title, description, color, priority, start_date, due_date, completed, checkpoints, created_at, updated_at
		 FROM sticky_notes WHERE user_id = $1
		 ORDER BY completed ASC, due_date ASC NULLS LAST, created_at DESC
		 LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var notes []*domain.StickyNote
	for rows.Next() {
		n, err := scanStickyNoteRow(rows)
		if err != nil {
			return nil, 0, err
		}
		notes = append(notes, n)
	}
	return notes, total, rows.Err()
}

func (r *stickyNoteRepo) Stats(ctx context.Context, userID uuid.UUID) (*domain.StickyNoteStats, error) {
	var stats domain.StickyNoteStats
	err := r.pool.QueryRow(ctx,
		`SELECT
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE completed = true) AS completed,
			COUNT(*) FILTER (WHERE completed = false AND due_date IS NOT NULL AND due_date < now()) AS overdue,
			COUNT(*) FILTER (WHERE completed = false AND due_date IS NOT NULL AND due_date >= now()) AS upcoming
		 FROM sticky_notes WHERE user_id = $1`, userID).
		Scan(&stats.Total, &stats.Completed, &stats.Overdue, &stats.Upcoming)
	if err != nil {
		return nil, err
	}
	return &stats, nil
}

// scanStickyNote scans a single row from QueryRow.
func scanStickyNote(row pgx.Row) (*domain.StickyNote, error) {
	var n domain.StickyNote
	var cpJSON []byte
	var startDate, dueDate *time.Time

	err := row.Scan(&n.ID, &n.UserID, &n.Title, &n.Description, &n.Color, &n.Priority,
		&startDate, &dueDate, &n.Completed, &cpJSON, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		return nil, err
	}
	n.StartDate = startDate
	n.DueDate = dueDate
	if err := json.Unmarshal(cpJSON, &n.Checkpoints); err != nil {
		n.Checkpoints = []domain.Checkpoint{}
	}
	return &n, nil
}

// scanStickyNoteRow scans a row from Rows iteration.
func scanStickyNoteRow(rows pgx.Rows) (*domain.StickyNote, error) {
	var n domain.StickyNote
	var cpJSON []byte
	var startDate, dueDate *time.Time

	err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Description, &n.Color, &n.Priority,
		&startDate, &dueDate, &n.Completed, &cpJSON, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		return nil, err
	}
	n.StartDate = startDate
	n.DueDate = dueDate
	if err := json.Unmarshal(cpJSON, &n.Checkpoints); err != nil {
		n.Checkpoints = []domain.Checkpoint{}
	}
	return &n, nil
}
