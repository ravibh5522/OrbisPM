package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type projectCanvasRepo struct {
	pool *pgxpool.Pool
}

// NewProjectCanvasRepo creates a ProjectCanvasRepository backed by pgxpool.
func NewProjectCanvasRepo(pool *pgxpool.Pool) ProjectCanvasRepository {
	return &projectCanvasRepo{pool: pool}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func scanProjectCanvas(row pgx.Row) (*domain.ProjectCanvas, error) {
	var c domain.ProjectCanvas
	var stateJSON []byte
	var createdBy *uuid.UUID

	err := row.Scan(
		&c.ID, &c.OrgID, &c.ProjectID, &c.Title, &c.Description,
		&stateJSON, &c.Version, &createdBy, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	if err := json.Unmarshal(stateJSON, &c.State); err != nil {
		return nil, fmt.Errorf("unmarshal canvas state: %w", err)
	}
	c.CreatedBy = createdBy
	return &c, nil
}

const canvasColumns = `id, org_id, project_id, title, description, state, version, created_by, created_at, updated_at`

// ── Create ────────────────────────────────────────────────────────────────────

func (r *projectCanvasRepo) Create(ctx context.Context, tx pgx.Tx, c *domain.ProjectCanvas) (*domain.ProjectCanvas, error) {
	q := conn(r.pool, tx)

	initState := domain.CanvasState{
		Version:    1,
		Shapes:     []domain.CanvasShape{},
		Connectors: []domain.CanvasConnector{},
	}
	stateJSON, err := json.Marshal(initState)
	if err != nil {
		return nil, fmt.Errorf("marshal canvas state: %w", err)
	}

	row := q.QueryRow(ctx,
		`INSERT INTO project_canvases (org_id, project_id, title, description, state, version, created_by)
		 VALUES ($1, $2, $3, $4, $5, 1, $6)
		 RETURNING `+canvasColumns,
		c.OrgID, c.ProjectID, c.Title, c.Description, stateJSON, c.CreatedBy,
	)
	return scanProjectCanvas(row)
}

// ── GetByID ───────────────────────────────────────────────────────────────────

func (r *projectCanvasRepo) GetByID(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*domain.ProjectCanvas, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`SELECT `+canvasColumns+` FROM project_canvases WHERE id = $1`, id)
	return scanProjectCanvas(row)
}

// ── UpdateMeta ────────────────────────────────────────────────────────────────

func (r *projectCanvasRepo) UpdateMeta(ctx context.Context, tx pgx.Tx, id uuid.UUID, title, description string) (*domain.ProjectCanvas, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`UPDATE project_canvases
		 SET title = $1, description = $2, updated_at = now()
		 WHERE id = $3
		 RETURNING `+canvasColumns,
		title, description, id,
	)
	return scanProjectCanvas(row)
}

// ── UpdateState ───────────────────────────────────────────────────────────────

func (r *projectCanvasRepo) UpdateState(ctx context.Context, tx pgx.Tx, id uuid.UUID, state domain.CanvasState, expectedVersion int) (*domain.ProjectCanvas, error) {
	q := conn(r.pool, tx)

	stateJSON, err := json.Marshal(state)
	if err != nil {
		return nil, fmt.Errorf("marshal canvas state: %w", err)
	}

	row := q.QueryRow(ctx,
		`UPDATE project_canvases
		 SET state = $1, version = version + 1, updated_at = now()
		 WHERE id = $2 AND version = $3
		 RETURNING `+canvasColumns,
		stateJSON, id, expectedVersion,
	)
	result, err := scanProjectCanvas(row)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.ErrConflict // optimistic-lock mismatch
		}
		return nil, err
	}
	return result, nil
}

// ── Delete ────────────────────────────────────────────────────────────────────

func (r *projectCanvasRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	tag, err := q.Exec(ctx, `DELETE FROM project_canvases WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// ── ListByProject ──────────────────────────────────────────────────────────────

func (r *projectCanvasRepo) ListByProject(ctx context.Context, tx pgx.Tx, projectID uuid.UUID, filter ListFilter) ([]*domain.ProjectCanvas, int, error) {
	q := conn(r.pool, tx)

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := filter.Offset

	var total int
	if err := q.QueryRow(ctx,
		`SELECT count(*) FROM project_canvases WHERE project_id = $1`, projectID,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := q.Query(ctx,
		`SELECT `+canvasColumns+`
		 FROM project_canvases
		 WHERE project_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		projectID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var canvases []*domain.ProjectCanvas
	for rows.Next() {
		c, err := scanProjectCanvas(rows)
		if err != nil {
			return nil, 0, err
		}
		canvases = append(canvases, c)
	}
	if rows.Err() != nil {
		return nil, 0, rows.Err()
	}
	return canvases, total, nil
}
