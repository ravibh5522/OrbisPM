package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type customRoleRepo struct {
	pool *pgxpool.Pool
}

func NewCustomRoleRepo(pool *pgxpool.Pool) CustomRoleRepository {
	return &customRoleRepo{pool: pool}
}

func (r *customRoleRepo) Create(ctx context.Context, tx pgx.Tx, role *domain.CustomRole) (*domain.CustomRole, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO custom_roles (org_id, name, description, permissions)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, org_id, name, description, permissions, created_at`,
		role.OrgID, role.Name, nilStr(role.Description), role.Permissions)

	var cr domain.CustomRole
	var desc *string
	err := row.Scan(&cr.ID, &cr.OrgID, &cr.Name, &desc, &cr.Permissions, &cr.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create custom role: %w", err)
	}
	if desc != nil {
		cr.Description = *desc
	}
	return &cr, nil
}

func (r *customRoleRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.CustomRole, error) {
	var cr domain.CustomRole
	var desc *string
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, name, description, permissions, created_at FROM custom_roles WHERE id = $1`, id).
		Scan(&cr.ID, &cr.OrgID, &cr.Name, &desc, &cr.Permissions, &cr.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get custom role: %w", err)
	}
	if desc != nil {
		cr.Description = *desc
	}
	return &cr, nil
}

func (r *customRoleRepo) Update(ctx context.Context, tx pgx.Tx, role *domain.CustomRole) (*domain.CustomRole, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`UPDATE custom_roles SET name=$2, description=$3, permissions=$4 WHERE id=$1
		 RETURNING id, org_id, name, description, permissions, created_at`,
		role.ID, role.Name, nilStr(role.Description), role.Permissions)

	var cr domain.CustomRole
	var desc *string
	err := row.Scan(&cr.ID, &cr.OrgID, &cr.Name, &desc, &cr.Permissions, &cr.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("update custom role: %w", err)
	}
	if desc != nil {
		cr.Description = *desc
	}
	return &cr, nil
}

func (r *customRoleRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM custom_roles WHERE id = $1`, id)
	return err
}

func (r *customRoleRepo) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.CustomRole, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, name, description, permissions, created_at FROM custom_roles WHERE org_id = $1 ORDER BY name`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []*domain.CustomRole
	for rows.Next() {
		var cr domain.CustomRole
		var desc *string
		if err := rows.Scan(&cr.ID, &cr.OrgID, &cr.Name, &desc, &cr.Permissions, &cr.CreatedAt); err != nil {
			return nil, err
		}
		if desc != nil {
			cr.Description = *desc
		}
		roles = append(roles, &cr)
	}
	return roles, rows.Err()
}
