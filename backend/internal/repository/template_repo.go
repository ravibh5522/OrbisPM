package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type templateRepo struct {
	pool *pgxpool.Pool
}

func NewTemplateRepo(pool *pgxpool.Pool) TemplateRepository {
	return &templateRepo{pool: pool}
}

func (r *templateRepo) Create(ctx context.Context, tx pgx.Tx, t *domain.TaskTemplate) (*domain.TaskTemplate, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO task_templates (org_id, name, description, structure, is_shared, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, org_id, name, description, structure, is_shared, created_by, created_at, updated_at`,
		t.OrgID, t.Name, nilStr(t.Description), t.Structure, t.IsShared, t.CreatedBy)

	var tmpl domain.TaskTemplate
	var desc *string
	err := row.Scan(&tmpl.ID, &tmpl.OrgID, &tmpl.Name, &desc, &tmpl.Structure,
		&tmpl.IsShared, &tmpl.CreatedBy, &tmpl.CreatedAt, &tmpl.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create template: %w", err)
	}
	if desc != nil {
		tmpl.Description = *desc
	}
	return &tmpl, nil
}

func (r *templateRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.TaskTemplate, error) {
	var t domain.TaskTemplate
	var desc *string
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, name, description, structure, is_shared, created_by, created_at, updated_at
		 FROM task_templates WHERE id = $1`, id).
		Scan(&t.ID, &t.OrgID, &t.Name, &desc, &t.Structure, &t.IsShared, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get template: %w", err)
	}
	if desc != nil {
		t.Description = *desc
	}
	return &t, nil
}

func (r *templateRepo) Update(ctx context.Context, tx pgx.Tx, t *domain.TaskTemplate) (*domain.TaskTemplate, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`UPDATE task_templates SET name=$2, description=$3, structure=$4, is_shared=$5
		 WHERE id=$1
		 RETURNING id, org_id, name, description, structure, is_shared, created_by, created_at, updated_at`,
		t.ID, t.Name, nilStr(t.Description), t.Structure, t.IsShared)

	var tmpl domain.TaskTemplate
	var desc *string
	err := row.Scan(&tmpl.ID, &tmpl.OrgID, &tmpl.Name, &desc, &tmpl.Structure,
		&tmpl.IsShared, &tmpl.CreatedBy, &tmpl.CreatedAt, &tmpl.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update template: %w", err)
	}
	if desc != nil {
		tmpl.Description = *desc
	}
	return &tmpl, nil
}

func (r *templateRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM task_templates WHERE id = $1`, id)
	return err
}

func (r *templateRepo) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.TaskTemplate, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, name, description, structure, is_shared, created_by, created_at, updated_at
		 FROM task_templates WHERE org_id = $1 ORDER BY name`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []*domain.TaskTemplate
	for rows.Next() {
		var t domain.TaskTemplate
		var desc *string
		if err := rows.Scan(&t.ID, &t.OrgID, &t.Name, &desc, &t.Structure,
			&t.IsShared, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		if desc != nil {
			t.Description = *desc
		}
		templates = append(templates, &t)
	}
	return templates, rows.Err()
}
